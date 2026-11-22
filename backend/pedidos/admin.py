from django.contrib import admin

from .models import ItemPedido, Mesa, MensajeWhatsApp, Pedido


class ItemInline(admin.TabularInline):
    model = ItemPedido
    extra = 0


@admin.register(Pedido)
class PedidoAdmin(admin.ModelAdmin):
    list_display = ("id", "tipo", "estado", "creado", "restaurante")
    list_filter = ("estado", "tipo", "restaurante")
    inlines = [ItemInline]


admin.site.register(Mesa)
admin.site.register(MensajeWhatsApp)
