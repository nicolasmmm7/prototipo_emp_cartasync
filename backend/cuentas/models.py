from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils.text import slugify


class Restaurante(models.Model):
    """Módulo 7: el negocio que se suscribe a CartaSync."""

    class Plan(models.TextChoices):
        UN_LOCAL = "un_local", "Plan para un local"
        VARIAS_SEDES = "varias_sedes", "Plan para varias sedes"

    nombre = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True)
    ciudad = models.CharField(max_length=80, blank=True)
    telefono = models.CharField(max_length=30, blank=True)
    # Con estas porciones o menos, el plato pasa solo a "por agotarse".
    umbral_por_agotarse = models.PositiveIntegerField(default=3)
    menu_del_dia = models.TextField(blank=True)
    plan = models.CharField(max_length=20, choices=Plan.choices, default=Plan.UN_LOCAL)
    prueba_hasta = models.DateField(null=True, blank=True)
    temporada_baja = models.BooleanField(default=False)
    creado = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.nombre) or "restaurante"
            slug, n = base, 2
            while Restaurante.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug, n = f"{base}-{n}", n + 1
            self.slug = slug
        super().save(*args, **kwargs)

    def __str__(self):
        return self.nombre


class Sede(models.Model):
    restaurante = models.ForeignKey(Restaurante, on_delete=models.CASCADE, related_name="sedes")
    nombre = models.CharField(max_length=80)
    direccion = models.CharField(max_length=160, blank=True)
    principal = models.BooleanField(default=False)

    class Meta:
        ordering = ["-principal", "nombre"]

    def __str__(self):
        return f"{self.restaurante} · {self.nombre}"


class Usuario(AbstractUser):
    """Cada persona entra con su rol y solo ve lo que necesita."""

    class Rol(models.TextChoices):
        ADMIN = "admin", "Administrador"
        COCINA = "cocina", "Cocina"
        MESERO = "mesero", "Mesero"
        CAJA = "caja", "Caja"

    rol = models.CharField(max_length=10, choices=Rol.choices, default=Rol.MESERO)
    restaurante = models.ForeignKey(
        Restaurante, on_delete=models.CASCADE, related_name="usuarios", null=True, blank=True
    )
    sede = models.ForeignKey(Sede, on_delete=models.SET_NULL, null=True, blank=True)

    @property
    def nombre_visible(self):
        return self.get_full_name() or self.username


class SolicitudSoporte(models.Model):
    class Tipo(models.TextChoices):
        CAPACITACION = "capacitacion", "Capacitación"
        SOPORTE = "soporte", "Soporte"

    class Estado(models.TextChoices):
        PENDIENTE = "pendiente", "Pendiente"
        AGENDADA = "agendada", "Agendada"
        RESUELTA = "resuelta", "Resuelta"

    restaurante = models.ForeignKey(Restaurante, on_delete=models.CASCADE, related_name="solicitudes")
    tipo = models.CharField(max_length=15, choices=Tipo.choices)
    descripcion = models.TextField()
    estado = models.CharField(max_length=10, choices=Estado.choices, default=Estado.PENDIENTE)
    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-creado"]
