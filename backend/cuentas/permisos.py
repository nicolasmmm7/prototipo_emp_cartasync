from rest_framework.permissions import SAFE_METHODS, BasePermission


def Roles(*roles, lectura=None):
    """Permiso por rol. `lectura` define roles extra que solo pueden consultar (GET)."""
    lectura = lectura or ()

    class _Roles(BasePermission):
        def has_permission(self, request, view):
            u = request.user
            if not (u and u.is_authenticated and u.restaurante_id):
                return False
            if u.rol in roles:
                return True
            return request.method in SAFE_METHODS and u.rol in lectura

    return _Roles


TODOS = ("admin", "cocina", "mesero", "caja")


class DelRestaurante:
    """Limita el queryset al restaurante del usuario y lo asigna al crear."""

    campo_restaurante = "restaurante"

    def get_queryset(self):
        qs = super().get_queryset()
        return qs.filter(**{self.campo_restaurante: self.request.user.restaurante})

    def perform_create(self, serializer):
        serializer.save(restaurante=self.request.user.restaurante)
