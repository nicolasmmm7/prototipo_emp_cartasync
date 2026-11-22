from django.contrib import admin

from .models import CambioEstado, Calificacion, Categoria, Plato


@admin.register(Plato)
class PlatoAdmin(admin.ModelAdmin):
    list_display = ("nombre", "categoria", "precio", "estado", "porciones_restantes", "activo")
    list_filter = ("restaurante", "categoria", "estado")


admin.site.register(Categoria)
admin.site.register(CambioEstado)
admin.site.register(Calificacion)
