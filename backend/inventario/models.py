from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

from cuentas.models import Restaurante


class Producto(models.Model):
    """Módulo 5: productos de mostrador e insumos clave."""

    class Ubicacion(models.TextChoices):
        NEVERA = "nevera", "Nevera mostrador"
        REPISA = "repisa", "Repisa"
        VITRINA = "vitrina", "Vitrina"
        TANQUE = "tanque", "Tanque"
        BODEGA = "bodega", "Bodega (insumo)"

    restaurante = models.ForeignKey(Restaurante, on_delete=models.CASCADE, related_name="productos")
    nombre = models.CharField(max_length=100)
    ubicacion = models.CharField(max_length=10, choices=Ubicacion.choices, default=Ubicacion.NEVERA)
    unidad = models.CharField(max_length=10, default="und")
    existencias = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    minimo = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    vence = models.DateField(null=True, blank=True)
    es_insumo = models.BooleanField(default=False, help_text="Insumo de cocina ligado a platos")

    class Meta:
        ordering = ["nombre"]

    def __str__(self):
        return self.nombre

    @property
    def bajo_minimo(self):
        return self.existencias <= self.minimo

    @property
    def por_vencer(self):
        return bool(self.vence) and self.vence <= timezone.localdate() + timedelta(days=2)


class Movimiento(models.Model):
    class Tipo(models.TextChoices):
        ENTRADA = "entrada", "Entrada"
        SALIDA = "salida", "Salida / venta"
        SOBRANTE = "sobrante", "Sobrante al cierre"
        DESPERDICIO = "desperdicio", "Desperdicio"

    producto = models.ForeignKey(Producto, on_delete=models.CASCADE, related_name="movimientos")
    tipo = models.CharField(max_length=12, choices=Tipo.choices)
    cantidad = models.DecimalField(max_digits=10, decimal_places=2)
    nota = models.CharField(max_length=200, blank=True)
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    creado = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-creado"]

    def aplicar(self):
        """Ajusta las existencias del producto según el movimiento."""
        p = self.producto
        if self.tipo == self.Tipo.ENTRADA:
            p.existencias += self.cantidad
        elif self.tipo in (self.Tipo.SALIDA, self.Tipo.DESPERDICIO):
            p.existencias = max(Decimal(0), p.existencias - self.cantidad)
        # Un sobrante solo se registra para estadísticas; no cambia existencias.
        p.save(update_fields=["existencias"])
