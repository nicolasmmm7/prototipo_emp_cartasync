from django.conf import settings
from django.db import models
from django.utils import timezone

from carta.models import Plato
from cuentas.models import Restaurante


class Mesa(models.Model):
    restaurante = models.ForeignKey(Restaurante, on_delete=models.CASCADE, related_name="mesas")
    numero = models.PositiveIntegerField()
    # Se abre con el primer pedido y se cierra cuando el mesero libera la mesa.
    abierta_desde = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["numero"]
        unique_together = [("restaurante", "numero")]

    def __str__(self):
        return f"Mesa {self.numero}"


class Pedido(models.Model):
    """Módulo 4: cada pedido es también el registro de venta que alimenta las estadísticas."""

    class Tipo(models.TextChoices):
        MESA = "mesa", "Mesa"
        MOSTRADOR = "mostrador", "Mostrador"
        LLEVAR = "llevar", "Para llevar"
        DOMICILIO = "domicilio", "Domicilio"

    class Origen(models.TextChoices):
        SALA = "sala", "Sala"
        CAJA = "caja", "Caja"
        WHATSAPP = "whatsapp", "WhatsApp"

    class Estado(models.TextChoices):
        RECIBIDO = "recibido", "Recibido por cocina"
        EN_PREPARACION = "en_preparacion", "En preparación"
        LISTO = "listo", "Listo para servir"
        ENTREGADO = "entregado", "Servido / entregado"
        CANCELADO = "cancelado", "Cancelado"

    SIGUIENTE = {
        Estado.RECIBIDO: Estado.EN_PREPARACION,
        Estado.EN_PREPARACION: Estado.LISTO,
        Estado.LISTO: Estado.ENTREGADO,
    }

    restaurante = models.ForeignKey(Restaurante, on_delete=models.CASCADE, related_name="pedidos")
    tipo = models.CharField(max_length=10, choices=Tipo.choices, default=Tipo.MESA)
    origen = models.CharField(max_length=10, choices=Origen.choices, default=Origen.SALA)
    mesa = models.ForeignKey(Mesa, on_delete=models.SET_NULL, null=True, blank=True, related_name="pedidos")
    cliente = models.CharField(max_length=80, blank=True)
    telefono = models.CharField(max_length=30, blank=True)
    direccion = models.CharField(max_length=160, blank=True)
    nota = models.CharField(max_length=300, blank=True)
    estado = models.CharField(max_length=15, choices=Estado.choices, default=Estado.RECIBIDO)
    creado_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    creado = models.DateTimeField(default=timezone.now, db_index=True)
    en_preparacion_desde = models.DateTimeField(null=True, blank=True)
    listo_desde = models.DateTimeField(null=True, blank=True)
    entregado_desde = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-creado"]

    @property
    def total(self):
        return sum(i.subtotal for i in self.items.all())

    @property
    def etiqueta(self):
        if self.tipo == self.Tipo.MESA and self.mesa:
            return f"Mesa {self.mesa.numero}"
        if self.tipo == self.Tipo.DOMICILIO:
            return f"Domicilio · {self.direccion}" if self.direccion else "Domicilio"
        if self.tipo == self.Tipo.LLEVAR:
            return f"Para llevar · {self.cliente}" if self.cliente else "Para llevar"
        return f"Mostrador · {self.cliente}" if self.cliente else "Mostrador"

    def avanzar(self):
        siguiente = self.SIGUIENTE.get(self.estado)
        if not siguiente:
            return False
        self.estado = siguiente
        campo = {
            self.Estado.EN_PREPARACION: "en_preparacion_desde",
            self.Estado.LISTO: "listo_desde",
            self.Estado.ENTREGADO: "entregado_desde",
        }[siguiente]
        setattr(self, campo, timezone.now())
        self.save(update_fields=["estado", campo])
        return True


class ItemPedido(models.Model):
    pedido = models.ForeignKey(Pedido, on_delete=models.CASCADE, related_name="items")
    plato = models.ForeignKey(Plato, on_delete=models.PROTECT, related_name="ventas")
    cantidad = models.PositiveIntegerField(default=1)
    precio_unitario = models.PositiveIntegerField()
    costo_unitario = models.PositiveIntegerField(default=0)
    nota = models.CharField(max_length=200, blank=True)

    @property
    def subtotal(self):
        return self.cantidad * self.precio_unitario


class MensajeWhatsApp(models.Model):
    """Pedido que llega por WhatsApp y espera que la caja lo confirme (simulado en el prototipo)."""

    restaurante = models.ForeignKey(Restaurante, on_delete=models.CASCADE, related_name="mensajes_whatsapp")
    cliente = models.CharField(max_length=80)
    telefono = models.CharField(max_length=30)
    texto = models.TextField()
    direccion = models.CharField(max_length=160, blank=True)
    recibido = models.DateTimeField(default=timezone.now)
    pedido = models.OneToOneField(Pedido, on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        ordering = ["-recibido"]
