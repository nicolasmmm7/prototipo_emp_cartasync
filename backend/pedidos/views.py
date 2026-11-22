import random
from datetime import timedelta

from django.db import transaction
from django.db.models import Prefetch
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from carta.models import Plato
from carta.views import emitir_plato
from config.tiempo_real import emitir
from cuentas.permisos import TODOS, DelRestaurante, Roles

from .models import ItemPedido, Mesa, MensajeWhatsApp, Pedido
from .serializers import (
    MensajeWhatsAppSerializer, MesaSerializer, PedidoNuevoSerializer, PedidoSerializer,
)

ACTIVOS = [Pedido.Estado.RECIBIDO, Pedido.Estado.EN_PREPARACION, Pedido.Estado.LISTO]


def pedidos_qs():
    return Pedido.objects.select_related("mesa", "creado_por").prefetch_related(
        Prefetch("items", queryset=ItemPedido.objects.select_related("plato"))
    )


class PedidoViewSet(DelRestaurante, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                    mixins.CreateModelMixin, viewsets.GenericViewSet):
    serializer_class = PedidoSerializer
    permission_classes = [Roles(*TODOS)]

    def get_queryset(self):
        self.queryset = pedidos_qs()
        qs = super().get_queryset()
        q = self.request.query_params
        if self.action != "list":
            return qs
        if q.get("activos") == "1":
            qs = qs.filter(estado__in=ACTIVOS)
        if q.get("estado"):
            qs = qs.filter(estado__in=q["estado"].split(","))
        if q.get("mesa"):
            qs = qs.filter(mesa_id=q["mesa"])
            mesa = Mesa.objects.filter(pk=q["mesa"]).first()
            # Solo la cuenta abierta de la mesa.
            qs = qs.filter(creado__gte=mesa.abierta_desde) if mesa and mesa.abierta_desde else qs.none()
        if q.get("hoy") == "1":
            qs = qs.filter(creado__date=timezone.localdate())
        return qs[: int(q.get("limite", 100))]

    def create(self, request, *args, **kwargs):
        if request.user.rol == "cocina":
            raise PermissionDenied("La cocina no toma pedidos.")
        r = request.user.restaurante
        s = PedidoNuevoSerializer(data=request.data, context={"restaurante": r})
        s.is_valid(raise_exception=True)
        d = s.validated_data
        with transaction.atomic():
            msj = d.get("whatsapp")
            origen = (Pedido.Origen.WHATSAPP if msj else
                      Pedido.Origen.SALA if request.user.rol == "mesero" else Pedido.Origen.CAJA)
            pedido = Pedido.objects.create(
                restaurante=r, tipo=d["tipo"], origen=origen, mesa=d["mesa"],
                cliente=d.get("cliente", ""), telefono=d.get("telefono", ""),
                direccion=d.get("direccion", ""), nota=d.get("nota", ""), creado_por=request.user,
            )
            # Bloqueamos las filas de los platos para no vender la misma última porción dos veces.
            platos = {p.id: p for p in Plato.objects.select_for_update().select_related(
                "restaurante", "alternativo").filter(id__in=d["platos"].keys())}
            for i in d["items"]:
                p = platos[i["plato"]]
                if p.porciones_restantes is not None and i["cantidad"] > p.porciones_restantes:
                    raise ValidationError({"items": [f"De {p.nombre} solo quedan {p.porciones_restantes}."]})
                ItemPedido.objects.create(
                    pedido=pedido, plato=p, cantidad=i["cantidad"], precio_unitario=p.precio,
                    costo_unitario=p.costo, nota=i.get("nota", ""),
                )
                cambio = p.descontar(i["cantidad"])
                emitir_plato(p, cambio)
            if pedido.mesa and not pedido.mesa.abierta_desde:
                pedido.mesa.abierta_desde = pedido.creado
                pedido.mesa.save(update_fields=["abierta_desde"])
            if msj:
                msj.pedido = pedido
                msj.save(update_fields=["pedido"])
                emitir(r, "whatsapp")
            emitir(r, "pedidos", accion="nuevo", pedido=pedido.id, etiqueta=pedido.etiqueta)
        pedido = pedidos_qs().get(pk=pedido.pk)
        return Response(PedidoSerializer(pedido).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def avanzar(self, request, pk=None):
        """Recibido → En preparación → Listo → Servido."""
        pedido = self.get_object()
        rol = request.user.rol
        if rol == "cocina" and pedido.estado == Pedido.Estado.LISTO:
            raise PermissionDenied("La entrega la marca sala o caja.")
        if rol in ("mesero",) and pedido.estado != Pedido.Estado.LISTO:
            raise PermissionDenied("La cocina marca la preparación.")
        if not pedido.avanzar():
            raise ValidationError("Este pedido ya fue entregado.")
        emitir(pedido.restaurante, "pedidos", accion=pedido.estado, pedido=pedido.id,
               etiqueta=pedido.etiqueta, mesero=pedido.creado_por_id)
        return Response(PedidoSerializer(pedidos_qs().get(pk=pedido.pk)).data)

    @action(detail=True, methods=["post"], permission_classes=[Roles("admin", "caja")])
    def cancelar(self, request, pk=None):
        pedido = self.get_object()
        if pedido.estado == Pedido.Estado.ENTREGADO:
            raise ValidationError("Un pedido entregado no se puede cancelar.")
        pedido.estado = Pedido.Estado.CANCELADO
        pedido.save(update_fields=["estado"])
        emitir(pedido.restaurante, "pedidos", accion="cancelado", pedido=pedido.id)
        return Response(PedidoSerializer(pedidos_qs().get(pk=pedido.pk)).data)


class MesaViewSet(DelRestaurante, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = MesaSerializer
    permission_classes = [Roles(*TODOS)]
    queryset = Mesa.objects.all()

    def anotar(self, mesas):
        """Calcula el estado de cada mesa a partir de los pedidos de su cuenta abierta."""
        abiertas = [m for m in mesas if m.abierta_desde]
        pedidos = {}
        if abiertas:
            desde = min(m.abierta_desde for m in abiertas)
            for p in pedidos_qs().filter(mesa__in=abiertas, creado__gte=desde).exclude(estado="cancelado"):
                if p.creado >= p.mesa.abierta_desde:
                    pedidos.setdefault(p.mesa_id, []).append(p)
        for m in mesas:
            ps = pedidos.get(m.id, [])
            estados = {p.estado for p in ps}
            if not m.abierta_desde:
                m.estado = "libre"
            elif Pedido.Estado.LISTO in estados:
                m.estado = "listo"
            elif estados & {Pedido.Estado.RECIBIDO, Pedido.Estado.EN_PREPARACION}:
                m.estado = "en_cocina"
            else:
                m.estado = "comiendo"
            m.platos = sum(i.cantidad for p in ps for i in p.items.all())
            m.total = sum(p.total for p in ps)
            m.ultimo_pedido = max((p.creado for p in ps), default=None)
        return mesas

    def list(self, request, *args, **kwargs):
        mesas = self.anotar(list(self.get_queryset()))
        return Response(MesaSerializer(mesas, many=True).data)

    def retrieve(self, request, *args, **kwargs):
        mesa = self.anotar([self.get_object()])[0]
        return Response(MesaSerializer(mesa).data)

    @action(detail=True, methods=["post"], permission_classes=[Roles("admin", "mesero", "caja")])
    def liberar(self, request, pk=None):
        """Cierra la cuenta de la mesa (ya pagó y se fue)."""
        mesa = self.get_object()
        pendientes = Pedido.objects.filter(mesa=mesa, estado__in=ACTIVOS)
        if mesa.abierta_desde:
            pendientes = pendientes.filter(creado__gte=mesa.abierta_desde)
        if pendientes.exists():
            raise ValidationError("La mesa todavía tiene pedidos sin servir.")
        mesa.abierta_desde = None
        mesa.save(update_fields=["abierta_desde"])
        emitir(mesa.restaurante, "pedidos", accion="mesa_libre", mesa=mesa.numero)
        return Response({"ok": True})


EJEMPLOS_WHATSAPP = [
    ("Laura", "315 000 0000", "Hola, me envían una bandeja paisa y una limonada a la Calle 10 #4-32", "Calle 10 #4-32"),
    ("Jhon", "300 000 0000", "Dos corrientazos para recoger a la 1", ""),
    ("Marta", "310 555 1234", "Buenas, una mojarra frita sin cebolla para la Av. 5 #12-40", "Av. 5 #12-40"),
    ("Carlos", "318 222 3344", "Me regala 3 almuerzos del día para la oficina, Cra 3 #8-15 piso 2", "Cra 3 #8-15 piso 2"),
    ("Diana", "301 777 8899", "Una pechuga a la plancha y un caldo, paso a recoger", ""),
]


class WhatsAppViewSet(DelRestaurante, mixins.ListModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Bandeja de pedidos de WhatsApp por confirmar (en el prototipo, los mensajes se simulan)."""

    serializer_class = MensajeWhatsAppSerializer
    permission_classes = [Roles("admin", "caja")]
    queryset = MensajeWhatsApp.objects.filter(pedido__isnull=True)

    def perform_destroy(self, msj):
        msj.delete()
        emitir(self.request.user.restaurante, "whatsapp")

    @action(detail=False, methods=["post"])
    def simular(self, request):
        cliente, tel, texto, dire = random.choice(EJEMPLOS_WHATSAPP)
        msj = MensajeWhatsApp.objects.create(
            restaurante=request.user.restaurante, cliente=cliente, telefono=tel, texto=texto, direccion=dire,
        )
        emitir(request.user.restaurante, "whatsapp", accion="nuevo")
        return Response(MensajeWhatsAppSerializer(msj).data, status=status.HTTP_201_CREATED)


class AvisosView(APIView):
    """Avisos para sala: qué dejar de ofrecer, qué está por acabarse, qué promocionar y qué está listo."""

    permission_classes = [Roles(*TODOS)]

    def get(self, request):
        r = request.user.restaurante
        platos = Plato.objects.filter(restaurante=r, activo=True).select_related("alternativo")
        def fila(p):
            return {
                "id": p.id, "nombre": p.nombre, "precio": p.precio, "estado": p.estado,
                "porciones_restantes": p.porciones_restantes, "desde": p.estado_cambiado,
                "vuelve_en_min": p.vuelve_en_min,
                "alternativo": p.alternativo.nombre if p.alternativo else None,
            }
        listos = pedidos_qs().filter(restaurante=r, estado=Pedido.Estado.LISTO)
        if request.user.rol == "mesero":
            listos = listos.filter(creado_por=request.user)
        hace = timezone.now() - timedelta(hours=12)
        return Response({
            "agotados": [fila(p) for p in platos if p.estado == Plato.Estado.AGOTADO],
            "por_agotarse": [fila(p) for p in platos if p.estado == Plato.Estado.POR_AGOTARSE],
            "promocionar": [fila(p) for p in platos if p.destacado and p.estado == Plato.Estado.DISPONIBLE],
            "listos": PedidoSerializer(listos.filter(listo_desde__gte=hace), many=True).data,
        })
