from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Restaurante, Sede, SolicitudSoporte, Usuario


@admin.register(Usuario)
class UsuarioAdmin(UserAdmin):
    list_display = ("username", "first_name", "rol", "restaurante", "is_active")
    list_filter = ("rol", "restaurante")
    fieldsets = UserAdmin.fieldsets + (("CartaSync", {"fields": ("rol", "restaurante", "sede")}),)


admin.site.register(Restaurante)
admin.site.register(Sede)
admin.site.register(SolicitudSoporte)
