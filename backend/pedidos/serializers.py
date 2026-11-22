from rest_framework import serializers

from carta.models import Plato

from .models import ItemPedido, Mesa, MensajeWhatsApp, Pedido


class ItemPedidoSerializer(serializers.ModelSerializer):
    plato_nombre = serializers.CharField(source="plato.nombre", read_only=True)
    subtotal = serializers.IntegerField(read_only=True)

    class Meta:
        model = ItemPedido
        fields = ["id", "plato", "plato_nombre", "cantidad", "precio_unitario", "subtotal", "nota"]


class PedidoSerializer(serializers.ModelSerializer):
    items = ItemPedidoSerializer(many=True, read_only=True)
    total = serializers.IntegerField(read_only=True)
    etiqueta = serializers.CharField(read_only=True)
    tipo_nombre = serializers.CharField(source="get_tipo_display", read_only=True)
    estado_nombre = serializers.CharField(source="get_estado_display", read_only=True)
    mesa_numero = serializers.IntegerField(source="mesa.numero", read_only=True, default=None)
    creado_por_nombre = serializers.CharField(source="creado_por.nombre_visible", read_only=True, default=None)

    class Meta:
        model = Pedido
        fields = [
            "id", "tipo", "tipo_nombre", "origen", "etiqueta", "mesa", "mesa_numero", "cliente",
            "telefono", "direccion", "nota", "estado", "estado_nombre", "creado",
            "en_preparacion_desde", "listo_desde", "entregado_desde", "total", "items",
            "creado_por_nombre",
        ]


class ItemNuevoSerializer(serializers.Serializer):
    plato = serializers.IntegerField()
    cantidad = serializers.IntegerField(min_value=1, max_value=99)
    nota = serializers.CharField(max_length=200, required=False, allow_blank=True)


class PedidoNuevoSerializer(serializers.Serializer):
    tipo = serializers.ChoiceField(choices=Pedido.Tipo.choices)
    mesa = serializers.IntegerField(required=False, allow_null=True)
    cliente = serializers.CharField(max_length=80, required=False, allow_blank=True)
    telefono = serializers.CharField(max_length=30, required=False, allow_blank=True)
    direccion = serializers.CharField(max_length=160, required=False, allow_blank=True)
    nota = serializers.CharField(max_length=300, required=False, allow_blank=True)
    whatsapp = serializers.IntegerField(required=False, allow_null=True)
    items = ItemNuevoSerializer(many=True)

    def validate(self, data):
        r = self.context["restaurante"]
        if not data["items"]:
            raise serializers.ValidationError({"items": "Agrega al menos un plato."})
        if data["tipo"] == Pedido.Tipo.MESA:
            mesa = Mesa.objects.filter(restaurante=r, pk=data.get("mesa")).first()
            if not mesa:
                raise serializers.ValidationError({"mesa": "Selecciona una mesa válida."})
            data["mesa"] = mesa
        else:
            data["mesa"] = None
        if data["tipo"] == Pedido.Tipo.DOMICILIO and not data.get("direccion"):
            raise serializers.ValidationError({"direccion": "El domicilio necesita una dirección."})
        if data.get("whatsapp"):
            msj = MensajeWhatsApp.objects.filter(restaurante=r, pk=data["whatsapp"], pedido__isnull=True).first()
            if not msj:
                raise serializers.ValidationError({"whatsapp": "Ese mensaje ya fue convertido."})
            data["whatsapp"] = msj

        # Bloquear lo agotado y advertir si no alcanzan las porciones.
        ids = [i["plato"] for i in data["items"]]
        platos = Plato.objects.filter(restaurante=r, activo=True, id__in=ids).select_related("alternativo")
        platos = {p.id: p for p in platos}
        pedidas = {}
        for i in data["items"]:
            pedidas[i["plato"]] = pedidas.get(i["plato"], 0) + i["cantidad"]
        errores = []
        for pid, cant in pedidas.items():
            p = platos.get(pid)
            if not p:
                errores.append("Un plato del pedido ya no está en la carta.")
            elif p.estado == Plato.Estado.AGOTADO:
                alt = f" Ofrece {p.alternativo.nombre}." if p.alternativo else ""
                errores.append(f"{p.nombre} está agotado.{alt}")
            elif p.porciones_restantes is not None and cant > p.porciones_restantes:
                errores.append(f"De {p.nombre} solo quedan {p.porciones_restantes}.")
        if errores:
            raise serializers.ValidationError({"items": errores})
        data["platos"] = platos
        return data


class MesaSerializer(serializers.ModelSerializer):
    estado = serializers.CharField(read_only=True)
    platos = serializers.IntegerField(read_only=True)
    total = serializers.IntegerField(read_only=True)
    ultimo_pedido = serializers.DateTimeField(read_only=True, allow_null=True)

    class Meta:
        model = Mesa
        fields = ["id", "numero", "abierta_desde", "estado", "platos", "total", "ultimo_pedido"]


class MensajeWhatsAppSerializer(serializers.ModelSerializer):
    class Meta:
        model = MensajeWhatsApp
        fields = ["id", "cliente", "telefono", "texto", "direccion", "recibido", "pedido"]
