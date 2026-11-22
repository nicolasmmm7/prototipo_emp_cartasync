from django.db import transaction
from rest_framework import mixins, viewsets

from carta.models import CambioEstado, Plato
from carta.views import emitir_plato
from config.tiempo_real import emitir
from cuentas.permisos import DelRestaurante, Roles

from .models import Movimiento, Producto
from .serializers import MovimientoSerializer, ProductoSerializer


def revisar_insumo(producto, usuario=None):
    """Si un insumo clave se acaba, los platos que lo usan pasan a agotado."""
    if not producto.es_insumo or producto.existencias > 0:
        return
    for plato in producto.platos.filter(activo=True).exclude(estado=Plato.Estado.AGOTADO):
        cambio = plato.cambiar_estado(Plato.Estado.AGOTADO, CambioEstado.Origen.INVENTARIO, usuario)
        emitir_plato(plato, cambio)


class ProductoViewSet(DelRestaurante, viewsets.ModelViewSet):
    queryset = Producto.objects.prefetch_related("platos")
    serializer_class = ProductoSerializer
    permission_classes = [Roles("admin", "caja", lectura=("cocina",))]

    def perform_create(self, serializer):
        p = serializer.save(restaurante=self.request.user.restaurante)
        emitir(p.restaurante, "inventario")

    def perform_update(self, serializer):
        with transaction.atomic():
            p = serializer.save()
            revisar_insumo(p, self.request.user)
            emitir(p.restaurante, "inventario")

    def perform_destroy(self, p):
        r = p.restaurante
        p.delete()
        emitir(r, "inventario")


class MovimientoViewSet(DelRestaurante, mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    """Entradas, salidas, sobrantes y desperdicios (el cierre del día se registra aquí)."""

    queryset = Movimiento.objects.select_related("producto")
    serializer_class = MovimientoSerializer
    permission_classes = [Roles("admin", "caja", "cocina")]
    campo_restaurante = "producto__restaurante"

    def get_queryset(self):
        return super().get_queryset()[:50]

    def perform_create(self, serializer):
        with transaction.atomic():
            m = serializer.save(usuario=self.request.user)
            m.aplicar()
            revisar_insumo(m.producto, self.request.user)
            emitir(m.producto.restaurante, "inventario")
