from django.conf import settings
from django.core.management import call_command
from django.http import Http404
from rest_framework import generics, mixins, status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from config.tiempo_real import emitir

from .models import Sede, SolicitudSoporte, Usuario
from .permisos import TODOS, DelRestaurante, Roles
from .serializers import (
    PerfilSerializer, RegistroSerializer, RestauranteSerializer, SedeSerializer,
    SolicitudSerializer, TokenSerializer, UsuarioSerializer,
)


class LoginView(TokenObtainPairView):
    serializer_class = TokenSerializer


class YoView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(PerfilSerializer(request.user).data)


class RegistroView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        s = RegistroSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        s.save()
        return Response({"ok": True}, status=status.HTTP_201_CREATED)


class RestauranteView(generics.RetrieveUpdateAPIView):
    """Datos del restaurante: todos lo consultan, solo el administrador lo cambia."""

    serializer_class = RestauranteSerializer
    permission_classes = [Roles("admin", lectura=TODOS)]

    def get_object(self):
        return self.request.user.restaurante

    def perform_update(self, serializer):
        r = serializer.save()
        emitir(r, "restaurante")


class UsuarioViewSet(DelRestaurante, viewsets.ModelViewSet):
    queryset = Usuario.objects.select_related("sede").order_by("-rol", "first_name")
    serializer_class = UsuarioSerializer
    permission_classes = [Roles("admin")]

    def perform_destroy(self, usuario):
        # No se borra: se desactiva, para conservar el historial de pedidos.
        if usuario == self.request.user:
            return
        usuario.is_active = False
        usuario.save(update_fields=["is_active"])


class SedeViewSet(DelRestaurante, viewsets.ModelViewSet):
    queryset = Sede.objects.all()
    serializer_class = SedeSerializer
    permission_classes = [Roles("admin", lectura=TODOS)]


class SolicitudViewSet(
    DelRestaurante, mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet
):
    queryset = SolicitudSoporte.objects.all()
    serializer_class = SolicitudSerializer
    permission_classes = [Roles("admin")]


class ReiniciarDemoView(APIView):
    """Vuelve a cargar los datos de ejemplo desde el modo demostración. Solo en desarrollo."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        if not settings.DEBUG:
            raise Http404
        call_command("sembrar", verbosity=0)
        return Response({"ok": True})
