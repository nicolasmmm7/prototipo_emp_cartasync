import io
from datetime import timedelta

import qrcode
from django.conf import settings
from django.db import transaction
from django.db.models import Avg, Max, Q, Sum
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from config.tiempo_real import emitir
from cuentas.models import Restaurante
from cuentas.permisos import TODOS, DelRestaurante, Roles

from .models import CambioEstado, Calificacion, Categoria, Plato
from .serializers import (
    CambioEstadoSerializer, CategoriaSerializer, PlatoPublicoSerializer, PlatoSerializer,
)


def emitir_plato(plato, cambio=None):
    """Aviso en vivo de un cambio de disponibilidad (los datos son públicos: van a la carta QR)."""
    emitir(
        plato.restaurante, "platos",
        plato={"id": plato.id, "nombre": plato.nombre, "estado": plato.estado,
               "porciones_restantes": plato.porciones_restantes},
        alternativo=plato.alternativo.nombre if plato.alternativo else None,
        cambio=bool(cambio),
    )


def platos_con_calificacion(qs):
    return qs.select_related("categoria", "alternativo", "restaurante").annotate(
        calificacion=Avg("calificaciones__estrellas")
    )


class CategoriaViewSet(DelRestaurante, viewsets.ModelViewSet):
    queryset = Categoria.objects.all()
    serializer_class = CategoriaSerializer
    permission_classes = [Roles("admin", lectura=TODOS)]

    def perform_destroy(self, categoria):
        if categoria.platos.exists():
            raise serializers.ValidationError("La categoría todavía tiene platos.")
        categoria.delete()


class EstadoSerializer(serializers.Serializer):
    estado = serializers.ChoiceField(choices=Plato.Estado.choices)
    vuelve_en_min = serializers.IntegerField(required=False, allow_null=True, min_value=1)


class PorcionSerializer(serializers.Serializer):
    plato = serializers.IntegerField()
    porciones = serializers.IntegerField(min_value=0, allow_null=True)


class PlatoViewSet(DelRestaurante, viewsets.ModelViewSet):
    serializer_class = PlatoSerializer
    permission_classes = [Roles("admin", lectura=TODOS)]
    queryset = Plato.objects.all()

    def get_queryset(self):
        qs = platos_con_calificacion(super().get_queryset())
        if self.action == "list" and self.request.query_params.get("todos") != "1":
            qs = qs.filter(activo=True)
        return qs

    def perform_create(self, serializer):
        plato = serializer.save(restaurante=self.request.user.restaurante)
        emitir_plato(plato)

    def perform_update(self, serializer):
        emitir_plato(serializer.save())

    def perform_destroy(self, plato):
        # Si ya tiene ventas se desactiva para no perder las estadísticas.
        if plato.ventas.exists():
            plato.activo = False
            plato.save(update_fields=["activo"])
        else:
            plato.delete()
        emitir(self.request.user.restaurante, "platos")

    @action(detail=True, methods=["post"], permission_classes=[Roles("admin", "cocina", "caja")])
    def estado(self, request, pk=None):
        """Cambiar el estado de un plato con un toque."""
        plato = self.get_object()
        s = EstadoSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        nuevo = s.validated_data["estado"]
        with transaction.atomic():
            # Si la cocina lo reactiva sin porciones, deja de llevar la cuenta.
            if nuevo != Plato.Estado.AGOTADO and plato.porciones_restantes == 0:
                plato.porciones_restantes = None
                plato.porciones_preparadas = None
                plato.save(update_fields=["porciones_restantes", "porciones_preparadas"])
            cambio = plato.cambiar_estado(
                nuevo, origen=request.user.rol, usuario=request.user,
                vuelve_en_min=s.validated_data.get("vuelve_en_min"),
            )
            emitir_plato(plato, cambio)
        return Response(PlatoSerializer(plato, context={"request": request}).data)

    @action(detail=False, methods=["get", "post"], permission_classes=[Roles("admin", "cocina")])
    def porciones(self, request):
        """GET: porciones del día con la sugerencia según el historial. POST: registrarlas."""
        r = request.user.restaurante
        if request.method == "POST":
            s = PorcionSerializer(data=request.data.get("items", []), many=True)
            s.is_valid(raise_exception=True)
            ids = [i["plato"] for i in s.validated_data]
            platos = {p.id: p for p in Plato.objects.filter(restaurante=r, id__in=ids).select_related("restaurante")}
            with transaction.atomic():
                for item in s.validated_data:
                    plato = platos.get(item["plato"])
                    if not plato:
                        continue
                    n = item["porciones"]
                    plato.porciones_preparadas = n
                    plato.porciones_restantes = n
                    plato.save(update_fields=["porciones_preparadas", "porciones_restantes"])
                    nuevo = plato.estado_segun_porciones() or Plato.Estado.DISPONIBLE
                    cambio = plato.cambiar_estado(nuevo, origen=request.user.rol, usuario=request.user)
                    if cambio:
                        emitir_plato(plato, cambio)
                emitir(r, "platos")
            return Response({"ok": True, "guardados": len(platos)})

        hoy = timezone.localdate()
        # Mismo día de la semana en las últimas 4 semanas (sin contar hoy).
        fechas = [hoy - timedelta(weeks=k) for k in range(1, 5)]
        from pedidos.models import ItemPedido

        ventas = (
            ItemPedido.objects.filter(
                pedido__restaurante=r, pedido__creado__date__in=fechas,
            ).exclude(pedido__estado="cancelado")
            .values("plato").annotate(total=Sum("cantidad"))
        )
        promedio = {v["plato"]: v["total"] / len(fechas) for v in ventas}
        filas = []
        for p in Plato.objects.filter(restaurante=r, activo=True).select_related("categoria"):
            prom = promedio.get(p.id)
            filas.append({
                "plato": p.id, "nombre": p.nombre, "categoria": p.categoria.nombre,
                "porciones_preparadas": p.porciones_preparadas,
                "porciones_restantes": p.porciones_restantes, "estado": p.estado,
                "sugerido_min": round(prom * 0.9) if prom else None,
                "sugerido_max": round(prom * 1.1 + 0.5) if prom else None,
            })
        return Response(filas)


class CambioEstadoViewSet(DelRestaurante, mixins.ListModelMixin, viewsets.GenericViewSet):
    """Cambios recientes de disponibilidad (los del día)."""

    serializer_class = CambioEstadoSerializer
    permission_classes = [Roles(*TODOS)]
    queryset = CambioEstado.objects.select_related("plato", "usuario")
    campo_restaurante = "plato__restaurante"

    def get_queryset(self):
        return super().get_queryset().filter(creado__date=timezone.localdate())[:30]


# --- Carta pública para el comensal (sin autenticación) ---


class CartaPublicaView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, slug):
        r = get_object_or_404(Restaurante, slug=slug)
        platos = platos_con_calificacion(Plato.objects.filter(restaurante=r, activo=True))
        hora = timezone.localtime().hour
        servicio = "desayuno" if hora < 11 else "almuerzo" if hora < 17 else "cena"
        if request.query_params.get("servicio") != "todos":
            platos = platos.filter(Q(**{f"en_{servicio}": True}) | Q(es_menu_del_dia=True))
        por_categoria = {}
        for p in platos.distinct():
            por_categoria.setdefault(p.categoria, []).append(p)
        ctx = {"request": request}
        return Response({
            "restaurante": {"nombre": r.nombre, "slug": r.slug, "menu_del_dia": r.menu_del_dia},
            "servicio": servicio,
            "actualizado": Plato.objects.filter(restaurante=r).aggregate(m=Max("estado_cambiado"))["m"],
            "categorias": [
                {"id": c.id, "nombre": c.nombre,
                 "platos": PlatoPublicoSerializer(ps, many=True, context=ctx).data}
                for c, ps in sorted(por_categoria.items(), key=lambda kv: (kv[0].orden, kv[0].nombre))
            ],
        })


class CalificacionSerializer(serializers.Serializer):
    plato = serializers.IntegerField()
    estrellas = serializers.IntegerField(min_value=1, max_value=5)
    comentario = serializers.CharField(max_length=300, required=False, allow_blank=True)


class CalificarView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, slug):
        r = get_object_or_404(Restaurante, slug=slug)
        s = CalificacionSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        plato = get_object_or_404(Plato, pk=s.validated_data["plato"], restaurante=r)
        Calificacion.objects.create(
            plato=plato, estrellas=s.validated_data["estrellas"],
            comentario=s.validated_data.get("comentario", ""),
        )
        return Response({"ok": True}, status=status.HTTP_201_CREATED)


class QRView(APIView):
    """Código QR que lleva a la carta digital del restaurante."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, slug):
        r = get_object_or_404(Restaurante, slug=slug)
        url = f"{settings.FRONTEND_URL.rstrip('/')}/carta/{r.slug}"
        img = qrcode.make(url, box_size=10, border=2)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        resp = HttpResponse(buf.getvalue(), content_type="image/png")
        if request.query_params.get("descargar"):
            resp["Content-Disposition"] = f'attachment; filename="qr-{r.slug}.png"'
        return resp
