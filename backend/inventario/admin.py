from django.contrib import admin

from .models import Movimiento, Producto

admin.site.register(Producto)
admin.site.register(Movimiento)
