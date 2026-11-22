from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from carta import views as carta
from cuentas import views as cuentas
from inventario import views as inventario
from pedidos import views as pedidos
from reportes import views as reportes

router = DefaultRouter()
router.register("usuarios", cuentas.UsuarioViewSet, basename="usuario")
router.register("sedes", cuentas.SedeViewSet, basename="sede")
router.register("soporte", cuentas.SolicitudViewSet, basename="soporte")
router.register("categorias", carta.CategoriaViewSet, basename="categoria")
router.register("platos", carta.PlatoViewSet, basename="plato")
router.register("cambios", carta.CambioEstadoViewSet, basename="cambio")
router.register("pedidos", pedidos.PedidoViewSet, basename="pedido")
router.register("mesas", pedidos.MesaViewSet, basename="mesa")
router.register("whatsapp", pedidos.WhatsAppViewSet, basename="whatsapp")
router.register("productos", inventario.ProductoViewSet, basename="producto")
router.register("movimientos", inventario.MovimientoViewSet, basename="movimiento")

api = [
    path("auth/login/", cuentas.LoginView.as_view()),
    path("auth/refresh/", TokenRefreshView.as_view()),
    path("auth/yo/", cuentas.YoView.as_view()),
    path("auth/registro/", cuentas.RegistroView.as_view()),
    path("restaurante/", cuentas.RestauranteView.as_view()),
    path("avisos/", pedidos.AvisosView.as_view()),
    path("estadisticas/", reportes.EstadisticasView.as_view()),
    path("estadisticas/exportar/", reportes.ExportarView.as_view()),
    path("estadisticas/resumen/", reportes.ResumenSemanalView.as_view()),
    path("publico/<slug:slug>/carta/", carta.CartaPublicaView.as_view()),
    path("publico/<slug:slug>/calificar/", carta.CalificarView.as_view()),
    path("publico/<slug:slug>/qr.png", carta.QRView.as_view()),
    path("", include(router.urls)),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(api)),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
