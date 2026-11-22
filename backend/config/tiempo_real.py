"""Sincronización en tiempo real.

Cada restaurante tiene un grupo de WebSocket. Cuando algo cambia (un plato, un pedido,
el inventario), el servidor avisa a todos los dispositivos conectados de ese restaurante
y cada uno vuelve a pedir lo que necesita a la API. Así el WebSocket nunca lleva datos
privados: solo dice "cambió esto".
"""

from asgiref.sync import async_to_sync
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.layers import get_channel_layer
from django.db import transaction


def nombre_grupo(slug):
    return f"rt.{slug}"


def emitir(restaurante, tema, **datos):
    """Avisa a los dispositivos del restaurante cuando la transacción se confirme.

    tema: "platos", "pedidos", "inventario", "whatsapp", "restaurante".
    """
    evento = {"tema": tema, **datos}
    grupo = nombre_grupo(restaurante.slug)

    def enviar():
        capa = get_channel_layer()
        if capa is not None:
            async_to_sync(capa.group_send)(grupo, {"type": "evento", "evento": evento})

    transaction.on_commit(enviar)


class RestauranteConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.grupo = nombre_grupo(self.scope["url_route"]["kwargs"]["slug"])
        await self.channel_layer.group_add(self.grupo, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        await self.channel_layer.group_discard(self.grupo, self.channel_name)

    async def receive_json(self, content, **kwargs):
        # El cliente solo usa el socket para escuchar; respondemos al ping para mantenerlo vivo.
        if content.get("tipo") == "ping":
            await self.send_json({"tipo": "pong"})

    async def evento(self, mensaje):
        await self.send_json(mensaje["evento"])
