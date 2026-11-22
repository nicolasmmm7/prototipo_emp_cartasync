from rest_framework import serializers

from .models import Movimiento, Producto


class ProductoSerializer(serializers.ModelSerializer):
    ubicacion_nombre = serializers.CharField(source="get_ubicacion_display", read_only=True)
    bajo_minimo = serializers.BooleanField(read_only=True)
    por_vencer = serializers.BooleanField(read_only=True)
    platos = serializers.SlugRelatedField(many=True, read_only=True, slug_field="nombre")

    class Meta:
        model = Producto
        fields = [
            "id", "nombre", "ubicacion", "ubicacion_nombre", "unidad", "existencias", "minimo",
            "vence", "es_insumo", "bajo_minimo", "por_vencer", "platos",
        ]


class MovimientoSerializer(serializers.ModelSerializer):
    producto_nombre = serializers.CharField(source="producto.nombre", read_only=True)
    tipo_nombre = serializers.CharField(source="get_tipo_display", read_only=True)

    class Meta:
        model = Movimiento
        fields = ["id", "producto", "producto_nombre", "tipo", "tipo_nombre", "cantidad", "nota", "creado"]
        read_only_fields = ["creado"]

    def validate_producto(self, p):
        if p.restaurante_id != self.context["request"].user.restaurante_id:
            raise serializers.ValidationError("Producto no válido.")
        return p

    def validate_cantidad(self, v):
        if v <= 0:
            raise serializers.ValidationError("La cantidad debe ser mayor que cero.")
        return v
