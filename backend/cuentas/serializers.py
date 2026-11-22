from datetime import timedelta

from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import Restaurante, Sede, SolicitudSoporte, Usuario


class RestauranteSerializer(serializers.ModelSerializer):
    plan_nombre = serializers.CharField(source="get_plan_display", read_only=True)

    class Meta:
        model = Restaurante
        fields = [
            "id", "nombre", "slug", "ciudad", "telefono", "umbral_por_agotarse", "menu_del_dia",
            "plan", "plan_nombre", "prueba_hasta", "temporada_baja",
        ]
        read_only_fields = ["slug", "prueba_hasta"]


class SedeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sede
        fields = ["id", "nombre", "direccion", "principal"]


class UsuarioSerializer(serializers.ModelSerializer):
    nombre = serializers.CharField(source="nombre_visible", read_only=True)
    rol_nombre = serializers.CharField(source="get_rol_display", read_only=True)
    password = serializers.CharField(write_only=True, required=False, min_length=6)

    class Meta:
        model = Usuario
        fields = [
            "id", "username", "first_name", "last_name", "email", "nombre", "rol", "rol_nombre",
            "sede", "is_active", "password", "last_login",
        ]
        read_only_fields = ["last_login"]

    def validate_sede(self, sede):
        restaurante = self.context["request"].user.restaurante
        if sede and sede.restaurante_id != restaurante.id:
            raise serializers.ValidationError("La sede no pertenece a tu restaurante.")
        return sede

    def create(self, data):
        password = data.pop("password", None)
        if not password:
            raise serializers.ValidationError({"password": "La contraseña es obligatoria."})
        usuario = Usuario(**data)
        usuario.set_password(password)
        usuario.save()
        return usuario

    def update(self, usuario, data):
        password = data.pop("password", None)
        for k, v in data.items():
            setattr(usuario, k, v)
        if password:
            usuario.set_password(password)
        usuario.save()
        return usuario


class PerfilSerializer(serializers.ModelSerializer):
    nombre = serializers.CharField(source="nombre_visible")
    restaurante = RestauranteSerializer()

    class Meta:
        model = Usuario
        fields = ["id", "username", "nombre", "rol", "restaurante"]


class TokenSerializer(TokenObtainPairSerializer):
    """Devuelve, junto con los tokens, el perfil del usuario para decidir a qué vista ir."""

    def validate(self, attrs):
        datos = super().validate(attrs)
        if not self.user.restaurante_id:
            raise serializers.ValidationError("Este usuario no pertenece a ningún restaurante.")
        datos["usuario"] = PerfilSerializer(self.user).data
        return datos


class SolicitudSerializer(serializers.ModelSerializer):
    tipo_nombre = serializers.CharField(source="get_tipo_display", read_only=True)
    estado_nombre = serializers.CharField(source="get_estado_display", read_only=True)

    class Meta:
        model = SolicitudSoporte
        fields = ["id", "tipo", "tipo_nombre", "descripcion", "estado", "estado_nombre", "creado"]
        read_only_fields = ["estado"]


class RegistroSerializer(serializers.Serializer):
    """Registrar restaurante: crea el negocio, su sede principal y el usuario administrador."""

    restaurante = serializers.CharField(max_length=120)
    ciudad = serializers.CharField(max_length=80, required=False, allow_blank=True)
    nombre = serializers.CharField(max_length=150)
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField(required=False, allow_blank=True)
    password = serializers.CharField(min_length=6, write_only=True)

    def validate_username(self, v):
        if Usuario.objects.filter(username__iexact=v).exists():
            raise serializers.ValidationError("Ese usuario ya existe.")
        return v

    def validate_password(self, v):
        validate_password(v)
        return v

    @transaction.atomic
    def create(self, data):
        r = Restaurante.objects.create(
            nombre=data["restaurante"], ciudad=data.get("ciudad", ""),
            prueba_hasta=timezone.localdate() + timedelta(days=30),
        )
        sede = Sede.objects.create(restaurante=r, nombre="Principal", principal=True)
        nombre, _, apellido = data["nombre"].partition(" ")
        u = Usuario(
            username=data["username"], email=data.get("email", ""), first_name=nombre,
            last_name=apellido, rol=Usuario.Rol.ADMIN, restaurante=r, sede=sede,
        )
        u.set_password(data["password"])
        u.save()
        return u
