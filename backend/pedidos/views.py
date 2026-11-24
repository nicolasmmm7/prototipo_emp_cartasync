import random
from datetime import timedelta

from django.db import transaction
from django.db.models import Prefetch, Q
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from carta.models import CambioEstado, Plato
from carta.views import emitir_plato
from config.tiempo_real import emitir
from cuentas.permisos import TODOS, DelRestaurante, Roles

from .models import EventoPedido, ItemPedido, Mesa, MensajeWhatsApp, Pedido
from .serializers import (
    CON_MESA, AgregarItemsSerializer, MensajeWhatsAppSerializer, MesaSerializer,
    PedidoDetalleSerializer, PedidoNuevoSerializer, PedidoSerializer, buscar_mesa, validar_items,
)

ACTIVOS = [Pedido.Estado.RECIBIDO, Pedido.Estado.EN_PREPARACION, Pedido.Estado.LISTO]
Evento = EventoPedido.Tipo

TEXTO_ESTADO = {
    Pedido.Estado.EN_PREPARACION: "La cocina empezó a prepararlo",
    Pedido.Estado.LISTO: "Listo para servir",
    Pedido.Estado.ENTREGADO: "Servido / entregado al cliente",
}


def pedidos_qs():
    return Pedido.objects.select_related("mesa", "creado_por").prefetch_related(
        Prefetch("items", queryset=ItemPedido.objects.select_related("plato", "plato__alternativo"))
    )


def resumen(items, platos):
    return ", ".join(f"{i['cantidad']} × {platos[i['plato']].nombre}" for i in items)


def anexar_items(pedido, items, usuario, agregado):
    """Crea los ítems y descuenta porciones bloqueando las filas de los platos."""
    platos = {p.id: p for p in Plato.objects.select_for_update().select_related(
        "restaurante", "alternativo").filter(id__in=[i["plato"] for i in items])}
    for i in items:
        p = platos[i["plato"]]
        if p.porciones_restantes is not None and i["cantidad"] > p.porciones_restantes:
            raise ValidationError({"items": [f"De {p.nombre} solo quedan {p.porciones_restantes}."]})
        ItemPedido.objects.create(
            pedido=pedido, plato=p, cantidad=i["cantidad"], precio_unitario=p.precio,
            costo_unitario=p.costo, nota=i.get("nota", ""), agregado=agregado,
        )
        emitir_plato(p, p.descontar(i["cantidad"]))
    return platos


def devolver_porciones(plato_id, cantidad):
    """Devuelve porciones de un plato quitado o cancelado.

    Si el plato pasó a "por agotarse" o "agotado" de forma automática, recupera el estado
    que le corresponde; si lo marcó la cocina a mano, se respeta su decisión.
    """
    p = Plato.objects.select_for_update().select_related("restaurante", "alternativo").get(pk=plato_id)
    if p.porciones_restantes is None:
        return
    p.porciones_restantes += cantidad
    p.save(update_fields=["porciones_restantes"])
    ultimo = p.cambios.first()
    cambio = None
    if p.estado != Plato.Estado.DISPONIBLE and ultimo and ultimo.origen == CambioEstado.Origen.AUTOMATICO:
        cambio = p.cambiar_estado(p.estado_segun_porciones(), CambioEstado.Origen.AUTOMATICO)
    emitir_plato(p, cambio)


def abrir_mesa(mesa, desde):
    """Abre la cuenta de la mesa (o la extiende para incluir un pedido más antiguo)."""
    if not mesa.abierta_desde or desde < mesa.abierta_desde:
        mesa.abierta_desde = desde
        mesa.save(update_fields=["abierta_desde"])


def cerrar_si_vacia(mesa):
    """Si a la mesa ya no le quedan pedidos en su cuenta, queda libre."""
    if not mesa or not mesa.abierta_desde:
        return
    quedan = Pedido.objects.filter(mesa=mesa, creado__gte=mesa.abierta_desde).exclude(estado=Pedido.Estado.CANCELADO)
    if not quedan.exists():
        mesa.abierta_desde = None
        mesa.save(update_fields=["abierta_desde"])


def revisar_completo(pedido, usuario):
    """Cuando la cocina termina el último plato, el pedido pasa solo a "listo"."""
    items = list(ItemPedido.objects.filter(pedido=pedido))
    if pedido.estado != Pedido.Estado.EN_PREPARACION or not items:
        return False
    if any(i.estado != ItemPedido.Estado.LISTO for i in items):
        return False
    pedido.avanzar()
    pedido.registrar(Evento.ESTADO, "Listo para servir: todos los platos están listos", usuario)
    avisar_pedido(pedido, "listo")
    return True


def hhmm(fecha):
    return timezone.localtime(fecha).strftime("%H:%M")


def avisar_pedido(pedido, accion, **extra):
    emitir(pedido.restaurante, "pedidos", accion=accion, pedido=pedido.id, etiqueta=pedido.etiqueta,
           mesero=pedido.creado_por_id, mesa=pedido.mesa.numero if pedido.mesa else None, **extra)


class PedidoViewSet(DelRestaurante, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                    mixins.CreateModelMixin, viewsets.GenericViewSet):
    serializer_class = PedidoSerializer
    permission_classes = [Roles(*TODOS)]

    def get_serializer_class(self):
        return PedidoDetalleSerializer if self.action == "retrieve" else PedidoSerializer

    def get_queryset(self):
        self.queryset = pedidos_qs()
        qs = super().get_queryset()
        q = self.request.query_params
        if self.action == "retrieve":
            return qs.prefetch_related(Prefetch("eventos", queryset=EventoPedido.objects.select_related("usuario")))
        if self.action != "list":
            return qs
        if q.get("activos") == "1":
            qs = qs.filter(estado__in=ACTIVOS)
        if q.get("estado"):
            qs = qs.filter(estado__in=q["estado"].split(","))
        if q.get("mios") == "1":
            qs = qs.filter(creado_por=self.request.user)
        if q.get("sala") == "1":
            # Lo que atiende sala: pedidos en mesa (los tome quien los tome) y los que tomó el mesero.
            qs = qs.filter(Q(mesa__isnull=False) | Q(creado_por=self.request.user))
        if q.get("mesa"):
            qs = qs.filter(mesa_id=q["mesa"])
            mesa = Mesa.objects.filter(pk=q["mesa"]).first()
            # Solo la cuenta abierta de la mesa.
            qs = qs.filter(creado__gte=mesa.abierta_desde) if mesa and mesa.abierta_desde else qs.none()
        if q.get("hoy") == "1":
            qs = qs.filter(creado__date=timezone.localdate())
        return qs[: int(q.get("limite", 100))]

    def responder(self, pedido, codigo=status.HTTP_200_OK):
        pedido = pedidos_qs().prefetch_related(
            Prefetch("eventos", queryset=EventoPedido.objects.select_related("usuario"))).get(pk=pedido.pk)
        return Response(PedidoDetalleSerializer(pedido).data, status=codigo)

    def pedido_editable(self, *estados):
        pedido = self.get_object()
        if self.request.user.rol == "cocina":
            raise PermissionDenied("La cocina no modifica pedidos.")
        if pedido.estado not in estados:
            raise ValidationError(f"El pedido ya está {pedido.get_estado_display().lower()}.")
        return pedido

    def pedido_cocina(self, *estados):
        pedido = self.get_object()
        if self.request.user.rol not in ("cocina", "admin"):
            raise PermissionDenied("Solo la cocina registra el avance de la preparación.")
        if pedido.estado not in estados:
            raise ValidationError(f"El pedido ya está {pedido.get_estado_display().lower()}.")
        return pedido

    def item_de(self, pedido):
        item = pedido.items.filter(pk=self.request.data.get("item")).select_related("plato", "plato__alternativo").first()
        if not item:
            raise ValidationError("Ese plato no está en el pedido.")
        return item

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
            platos = anexar_items(pedido, d["items"], request.user, agregado=False)
            if pedido.mesa:
                abrir_mesa(pedido.mesa, pedido.creado)
            desde = " desde WhatsApp" if msj else ""
            pedido.registrar(Evento.CREADO, f"Pedido creado para {pedido.etiqueta}{desde}: {resumen(d['items'], platos)}",
                             request.user)
            if d.get("nota"):
                pedido.registrar(Evento.NOTA, f"Nota para cocina: {d['nota']}", request.user)
            if msj:
                msj.pedido = pedido
                msj.save(update_fields=["pedido"])
                emitir(r, "whatsapp")
            avisar_pedido(pedido, "nuevo")
        return self.responder(pedido, status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def avanzar(self, request, pk=None):
        """Recibido → En preparación → Listo → Servido."""
        pedido = self.get_object()
        rol = request.user.rol
        if rol == "cocina" and pedido.estado == Pedido.Estado.LISTO:
            raise PermissionDenied("La entrega la marca sala o caja.")
        if rol == "mesero" and pedido.estado != Pedido.Estado.LISTO:
            raise PermissionDenied("La cocina marca la preparación.")
        if pedido.estado == Pedido.Estado.EN_PREPARACION and pedido.items.filter(estado=ItemPedido.Estado.PROBLEMA).exists():
            raise ValidationError("Hay un plato que no se puede preparar: espera a que sala lo cambie o lo quite.")
        with transaction.atomic():
            if not pedido.avanzar():
                raise ValidationError("Este pedido ya fue entregado.")
            if pedido.estado == Pedido.Estado.LISTO:
                pedido.items.filter(estado=ItemPedido.Estado.PENDIENTE).update(
                    estado=ItemPedido.Estado.LISTO, listo_en=timezone.now())
            pedido.registrar(Evento.ESTADO, TEXTO_ESTADO[pedido.estado], request.user)
            avisar_pedido(pedido, pedido.estado)
        return self.responder(pedido)

    # --- Avance detallado de la cocina ---

    @action(detail=True, methods=["post"])
    def plato_listo(self, request, pk=None):
        """Marca (o desmarca) un plato como listo. Con el último, el pedido queda listo."""
        pedido = self.pedido_cocina(Pedido.Estado.RECIBIDO, Pedido.Estado.EN_PREPARACION)
        item = self.item_de(pedido)
        listo = request.data.get("listo", True) is not False
        if item.estado == ItemPedido.Estado.PROBLEMA:
            raise ValidationError("Este plato tiene un problema: sala debe cambiarlo o quitarlo.")
        with transaction.atomic():
            if pedido.estado == Pedido.Estado.RECIBIDO:
                pedido.avanzar()
                pedido.registrar(Evento.ESTADO, TEXTO_ESTADO[pedido.estado], request.user)
            item.estado = ItemPedido.Estado.LISTO if listo else ItemPedido.Estado.PENDIENTE
            item.listo_en = timezone.now() if listo else None
            item.save(update_fields=["estado", "listo_en"])
            items = list(ItemPedido.objects.filter(pedido=pedido))
            hechos = sum(1 for i in items if i.estado == ItemPedido.Estado.LISTO)
            texto = (f"Plato listo: {item.cantidad} × {item.plato.nombre} ({hechos} de {len(items)})" if listo
                     else f"{item.plato.nombre} volvió a preparación")
            pedido.registrar(Evento.ITEM, texto, request.user)
            if not revisar_completo(pedido, request.user):
                avisar_pedido(pedido, "avance", texto=texto)
        return self.responder(pedido)

    @action(detail=True, methods=["post"])
    def problema(self, request, pk=None):
        """La cocina avisa que un plato no se puede preparar; sala decide si lo cambia o lo quita."""
        pedido = self.pedido_cocina(Pedido.Estado.RECIBIDO, Pedido.Estado.EN_PREPARACION)
        item = self.item_de(pedido)
        motivo = (request.data.get("motivo") or "No se puede preparar").strip()[:150]
        with transaction.atomic():
            item.estado = ItemPedido.Estado.PROBLEMA
            item.problema = motivo
            item.listo_en = None
            item.save(update_fields=["estado", "problema", "listo_en"])
            extra = ""
            plato = item.plato
            if request.data.get("agotar") and plato.estado != Plato.Estado.AGOTADO:
                cambio = plato.cambiar_estado(Plato.Estado.AGOTADO, CambioEstado.Origen.COCINA, request.user)
                emitir_plato(plato, cambio)
                extra = ". Se marcó agotado en la carta"
            texto = f"No se puede preparar {item.cantidad} × {plato.nombre}: {motivo}{extra}"
            pedido.registrar(Evento.PROBLEMA, texto, request.user)
            alt = plato.alternativo.nombre if plato.alternativo and plato.alternativo.estado != Plato.Estado.AGOTADO else None
            avisar_pedido(pedido, "problema", texto=texto, plato=plato.nombre, alternativo=alt)
        return self.responder(pedido)

    @action(detail=True, methods=["post"])
    def estimado(self, request, pk=None):
        """La cocina dice cuánto falta para que el pedido esté listo."""
        pedido = self.pedido_cocina(Pedido.Estado.RECIBIDO, Pedido.Estado.EN_PREPARACION)
        try:
            minutos = int(request.data.get("minutos"))
        except (TypeError, ValueError):
            raise ValidationError("Indica los minutos.")
        if not 1 <= minutos <= 120:
            raise ValidationError("El tiempo debe estar entre 1 y 120 minutos.")
        with transaction.atomic():
            if pedido.estado == Pedido.Estado.RECIBIDO:
                pedido.avanzar()
                pedido.registrar(Evento.ESTADO, TEXTO_ESTADO[pedido.estado], request.user)
            pedido.listo_estimado = timezone.now() + timedelta(minutes=minutos)
            pedido.save(update_fields=["listo_estimado"])
            texto = f"Sale en unos {minutos} min (aprox. {hhmm(pedido.listo_estimado)})"
            pedido.registrar(Evento.ESTIMADO, texto, request.user)
            avisar_pedido(pedido, "avance", texto=texto)
        return self.responder(pedido)

    @action(detail=True, methods=["post"])
    def regresar(self, request, pk=None):
        """Deshace un "listo" marcado por error: el pedido vuelve a preparación."""
        pedido = self.pedido_cocina(Pedido.Estado.LISTO)
        with transaction.atomic():
            pedido.estado = Pedido.Estado.EN_PREPARACION
            pedido.listo_desde = None
            pedido.save(update_fields=["estado", "listo_desde"])
            pedido.registrar(Evento.ESTADO, "Volvió a preparación (se había marcado listo por error)", request.user)
            avisar_pedido(pedido, "avance", texto="Volvió a preparación")
        return self.responder(pedido)

    @action(detail=True, methods=["post"])
    def mensaje(self, request, pk=None):
        """Mensaje corto entre cocina y sala sobre este pedido."""
        pedido = self.get_object()
        texto = (request.data.get("texto") or "").strip()[:150]
        if not texto:
            raise ValidationError("Escribe el mensaje.")
        if not pedido.activo:
            raise ValidationError("El pedido ya no está en curso.")
        de = "cocina" if request.user.rol == "cocina" else "sala"
        pedido.registrar(Evento.MENSAJE, f"Mensaje de {de}: {texto}", request.user)
        avisar_pedido(pedido, "mensaje", de=de, texto=texto)
        return self.responder(pedido)

    @action(detail=True, methods=["post"])
    def reemplazar(self, request, pk=None):
        """Cambia un plato (por ejemplo, el que la cocina no puede preparar) por otro."""
        pedido = self.pedido_editable(Pedido.Estado.RECIBIDO, Pedido.Estado.EN_PREPARACION)
        item = self.item_de(pedido)
        if pedido.estado != Pedido.Estado.RECIBIDO and item.estado != ItemPedido.Estado.PROBLEMA:
            raise ValidationError("La cocina ya empezó: solo se puede cambiar un plato que no se pueda preparar.")
        nuevo = [{"plato": int(request.data.get("plato") or 0), "cantidad": item.cantidad}]
        validar_items(pedido.restaurante, nuevo)
        with transaction.atomic():
            devolver_porciones(item.plato_id, item.cantidad)
            antes = f"{item.cantidad} × {item.plato.nombre}"
            item.delete()
            platos = anexar_items(pedido, nuevo, request.user, agregado=True)
            pedido.registrar(Evento.CAMBIO, f"Se cambió {antes} por {resumen(nuevo, platos)}", request.user)
            avisar_pedido(pedido, "actualizado")
        return self.responder(pedido)

    @action(detail=True, methods=["post"])
    def agregar(self, request, pk=None):
        """Anexa platos a un pedido que la cocina todavía no ha terminado."""
        pedido = self.pedido_editable(Pedido.Estado.RECIBIDO, Pedido.Estado.EN_PREPARACION)
        s = AgregarItemsSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        items = s.validated_data["items"]
        validar_items(pedido.restaurante, items)
        with transaction.atomic():
            platos = anexar_items(pedido, items, request.user, agregado=True)
            pedido.registrar(Evento.PLATOS, f"Se agregaron: {resumen(items, platos)}", request.user)
            avisar_pedido(pedido, "actualizado")
        return self.responder(pedido)

    @action(detail=True, methods=["post"])
    def quitar(self, request, pk=None):
        """Quita un plato mientras la cocina no haya empezado; devuelve las porciones."""
        pedido = self.pedido_editable(Pedido.Estado.RECIBIDO, Pedido.Estado.EN_PREPARACION)
        item = self.item_de(pedido)
        if pedido.estado != Pedido.Estado.RECIBIDO and item.estado != ItemPedido.Estado.PROBLEMA:
            raise ValidationError("La cocina ya empezó: solo se puede quitar un plato que no se pueda preparar.")
        if pedido.items.count() == 1:
            raise ValidationError("Es el único plato del pedido: cancela el pedido completo.")
        with transaction.atomic():
            devolver_porciones(item.plato_id, item.cantidad)
            texto = f"Se quitó: {item.cantidad} × {item.plato.nombre}"
            item.delete()
            pedido.registrar(Evento.QUITADO, texto, request.user)
            avisar_pedido(pedido, "actualizado")
            # Si lo que quedaba pendiente era justo ese plato, el pedido queda listo (cambio automático).
            revisar_completo(pedido, None)
        return self.responder(pedido)

    @action(detail=True, methods=["post"])
    def mover(self, request, pk=None):
        """Pasa el pedido a otra mesa (el cliente se cambió o se anotó en la mesa equivocada)."""
        pedido = self.pedido_editable(*ACTIVOS, Pedido.Estado.ENTREGADO)
        if pedido.tipo not in CON_MESA:
            raise ValidationError("Este pedido no es para comer en el local.")
        destino = buscar_mesa(pedido.restaurante, request.data.get("mesa"))
        anterior = pedido.mesa
        if destino == anterior:
            return self.responder(pedido)
        with transaction.atomic():
            pedido.mesa = destino
            pedido.save(update_fields=["mesa"])
            abrir_mesa(destino, pedido.creado)
            cerrar_si_vacia(anterior)
            origen = f"Mesa {anterior.numero}" if anterior else "sin mesa"
            pedido.registrar(Evento.MESA, f"Pasó de {origen} a Mesa {destino.numero}", request.user)
            avisar_pedido(pedido, "actualizado")
        return self.responder(pedido)

    @action(detail=True, methods=["post"])
    def cancelar(self, request, pk=None):
        pedido = self.get_object()
        rol = request.user.rol
        if rol == "cocina":
            raise PermissionDenied("La cocina no cancela pedidos.")
        if not pedido.activo:
            raise ValidationError("Un pedido entregado o cancelado no se puede cancelar.")
        # El mesero solo cancela lo suyo y antes de que la cocina empiece.
        if rol == "mesero" and (pedido.creado_por_id != request.user.id or pedido.estado != Pedido.Estado.RECIBIDO):
            raise PermissionDenied("Solo puedes cancelar tus pedidos antes de que la cocina empiece.")
        motivo = (request.data.get("motivo") or "").strip()[:150]
        with transaction.atomic():
            for item in pedido.items.all():
                devolver_porciones(item.plato_id, item.cantidad)
            pedido.estado = Pedido.Estado.CANCELADO
            pedido.save(update_fields=["estado"])
            cerrar_si_vacia(pedido.mesa)
            pedido.registrar(Evento.CANCELADO, f"Pedido cancelado{': ' + motivo if motivo else ''}", request.user)
            avisar_pedido(pedido, "cancelado")
        return self.responder(pedido)


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
            # Lo que está en una mesa lo sirve cualquier mesero; lo para llevar, quien lo tomó.
            listos = listos.filter(Q(mesa__isnull=False) | Q(creado_por=request.user))
        hace = timezone.now() - timedelta(hours=12)
        return Response({
            "agotados": [fila(p) for p in platos if p.estado == Plato.Estado.AGOTADO],
            "por_agotarse": [fila(p) for p in platos if p.estado == Plato.Estado.POR_AGOTARSE],
            "promocionar": [fila(p) for p in platos if p.destacado and p.estado == Plato.Estado.DISPONIBLE],
            "listos": PedidoSerializer(listos.filter(listo_desde__gte=hace), many=True).data,
        })
