from django.conf import settings
from django.db import models
from django.utils import timezone

from cuentas.models import Restaurante


class Categoria(models.Model):
    restaurante = models.ForeignKey(Restaurante, on_delete=models.CASCADE, related_name="categorias")
    nombre = models.CharField(max_length=60)
    orden = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["orden", "nombre"]

    def __str__(self):
        return self.nombre


class Plato(models.Model):
    """Módulos 1 y 2: el plato de la carta y su disponibilidad en tiempo real."""

    class Estado(models.TextChoices):
        DISPONIBLE = "disponible", "Disponible"
        POR_AGOTARSE = "por_agotarse", "Por agotarse"
        AGOTADO = "agotado", "Agotado"

    restaurante = models.ForeignKey(Restaurante, on_delete=models.CASCADE, related_name="platos")
    categoria = models.ForeignKey(Categoria, on_delete=models.PROTECT, related_name="platos")
    nombre = models.CharField(max_length=100)
    descripcion = models.TextField("qué incluye", blank=True)
    cobra_aparte = models.CharField("qué se cobra aparte", max_length=200, blank=True)
    precio = models.PositiveIntegerField(help_text="Precio de venta en pesos")
    costo = models.PositiveIntegerField(default=0, help_text="Costo de preparación en pesos")
    foto = models.ImageField(upload_to="platos/", null=True, blank=True)

    en_desayuno = models.BooleanField(default=False)
    en_almuerzo = models.BooleanField(default=True)
    en_cena = models.BooleanField(default=False)
    es_menu_del_dia = models.BooleanField(default=False)
    destacado = models.BooleanField(default=False, help_text="Los meseros lo ven como plato a ofrecer")
    activo = models.BooleanField(default=True)

    alternativo = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
        help_text="Plato que se sugiere cuando este se agota",
    )
    insumos = models.ManyToManyField("inventario.Producto", blank=True, related_name="platos")

    # Disponibilidad
    estado = models.CharField(max_length=15, choices=Estado.choices, default=Estado.DISPONIBLE)
    porciones_preparadas = models.PositiveIntegerField(null=True, blank=True)
    porciones_restantes = models.PositiveIntegerField(null=True, blank=True)
    vuelve_en_min = models.PositiveIntegerField(null=True, blank=True)
    estado_cambiado = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["categoria__orden", "nombre"]

    def __str__(self):
        return self.nombre

    @property
    def margen(self):
        return self.precio - self.costo

    def cambiar_estado(self, nuevo, origen, usuario=None, vuelve_en_min=None):
        """Cambia el estado y deja el registro en el historial. No guarda si no cambia."""
        if nuevo == self.estado:
            if vuelve_en_min is not None:
                self.vuelve_en_min = vuelve_en_min
                self.save(update_fields=["vuelve_en_min"])
            return None
        cambio = CambioEstado.objects.create(
            plato=self, anterior=self.estado, nuevo=nuevo, origen=origen, usuario=usuario,
            porciones_restantes=self.porciones_restantes,
        )
        self.estado = nuevo
        self.estado_cambiado = timezone.now()
        self.vuelve_en_min = vuelve_en_min if nuevo == self.Estado.AGOTADO else None
        self.save(update_fields=["estado", "estado_cambiado", "vuelve_en_min", "porciones_restantes"])
        return cambio

    def estado_segun_porciones(self):
        """Estado que corresponde a las porciones que quedan (None si no se llevan porciones)."""
        if self.porciones_restantes is None:
            return None
        if self.porciones_restantes == 0:
            return self.Estado.AGOTADO
        if self.porciones_restantes <= self.restaurante.umbral_por_agotarse:
            return self.Estado.POR_AGOTARSE
        return self.Estado.DISPONIBLE

    def descontar(self, cantidad):
        """Descuenta porciones vendidas y ajusta el estado de forma automática."""
        if self.porciones_restantes is None:
            return None
        self.porciones_restantes = max(0, self.porciones_restantes - cantidad)
        self.save(update_fields=["porciones_restantes"])
        nuevo = self.estado_segun_porciones()
        # Solo empeora el estado: si la cocina lo marcó agotado a mano, no lo reactiva.
        orden = [self.Estado.DISPONIBLE, self.Estado.POR_AGOTARSE, self.Estado.AGOTADO]
        if orden.index(nuevo) > orden.index(self.estado):
            return self.cambiar_estado(nuevo, CambioEstado.Origen.AUTOMATICO)
        return None


class CambioEstado(models.Model):
    """Historial de disponibilidad: alimenta "Cambios recientes", avisos y estadísticas."""

    class Origen(models.TextChoices):
        COCINA = "cocina", "Cocina"
        CAJA = "caja", "Caja"
        ADMIN = "admin", "Administrador"
        AUTOMATICO = "automatico", "Automático"
        INVENTARIO = "inventario", "Inventario"

    plato = models.ForeignKey(Plato, on_delete=models.CASCADE, related_name="cambios")
    anterior = models.CharField(max_length=15, choices=Plato.Estado.choices)
    nuevo = models.CharField(max_length=15, choices=Plato.Estado.choices)
    origen = models.CharField(max_length=15, choices=Origen.choices)
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    porciones_restantes = models.PositiveIntegerField(null=True, blank=True)
    creado = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-creado"]


class Calificacion(models.Model):
    """Módulo 3: el comensal califica lo que consumió."""

    plato = models.ForeignKey(Plato, on_delete=models.CASCADE, related_name="calificaciones")
    estrellas = models.PositiveSmallIntegerField()
    comentario = models.CharField(max_length=300, blank=True)
    creado = models.DateTimeField(auto_now_add=True)
