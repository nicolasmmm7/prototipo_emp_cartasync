from rest_framework import serializers

from .models import CambioEstado, Categoria, Plato


class CategoriaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Categoria
        fields = ["id", "nombre", "orden"]


class PlatoSerializer(serializers.ModelSerializer):
    categoria_nombre = serializers.CharField(source="categoria.nombre", read_only=True)
    alternativo_nombre = serializers.CharField(source="alternativo.nombre", read_only=True, default=None)
    estado_nombre = serializers.CharField(source="get_estado_display", read_only=True)
    margen = serializers.IntegerField(read_only=True)
    calificacion = serializers.FloatField(read_only=True, default=None)
    foto = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = Plato
        fields = [
            "id", "categoria", "categoria_nombre", "nombre", "descripcion", "cobra_aparte", "precio",
            "costo", "margen", "foto", "en_desayuno", "en_almuerzo", "en_cena", "es_menu_del_dia",
            "destacado", "activo", "alternativo", "alternativo_nombre", "insumos", "estado",
            "estado_nombre", "porciones_preparadas", "porciones_restantes", "vuelve_en_min",
            "estado_cambiado", "calificacion",
        ]
        read_only_fields = [
            "estado", "porciones_preparadas", "porciones_restantes", "vuelve_en_min", "estado_cambiado",
        ]

    def validate(self, data):
        r = self.context["request"].user.restaurante
        cat = data.get("categoria")
        if cat and cat.restaurante_id != r.id:
            raise serializers.ValidationError({"categoria": "Categoría no válida."})
        alt = data.get("alternativo")
        if alt and (alt.restaurante_id != r.id or (self.instance and alt.pk == self.instance.pk)):
            raise serializers.ValidationError({"alternativo": "Plato alternativo no válido."})
        for p in data.get("insumos", []):
            if p.restaurante_id != r.id:
                raise serializers.ValidationError({"insumos": "Insumo no válido."})
        return data


class PlatoPublicoSerializer(serializers.ModelSerializer):
    """Lo que ve el comensal: sin costos ni datos internos."""

    calificacion = serializers.FloatField(read_only=True, default=None)

    class Meta:
        model = Plato
        fields = [
            "id", "nombre", "descripcion", "cobra_aparte", "precio", "foto", "estado",
            "es_menu_del_dia", "destacado", "porciones_restantes", "calificacion",
        ]


class CambioEstadoSerializer(serializers.ModelSerializer):
    plato_nombre = serializers.CharField(source="plato.nombre", read_only=True)
    origen_nombre = serializers.CharField(source="get_origen_display", read_only=True)
    usuario_nombre = serializers.CharField(source="usuario.nombre_visible", read_only=True, default=None)

    class Meta:
        model = CambioEstado
        fields = [
            "id", "plato", "plato_nombre", "anterior", "nuevo", "origen", "origen_nombre",
            "usuario_nombre", "porciones_restantes", "creado",
        ]
