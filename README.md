# CartaSync · prototipo

Prototipo funcional de **CartaSync**: la cocina marca qué hay, qué está por agotarse y qué se acabó, y ese cambio llega **al instante** a los meseros, a la caja y a la carta QR del cliente. Con los pedidos se arman las estadísticas del dueño.

Se basa en el documento *Módulos y funciones principales (v1)*, en los wireframes y en los mockups de Figma (paleta C · Servicio).

## Stack

| Parte | Tecnología |
|---|---|
| Backend | Python 3.11+, Django 5, Django REST Framework, SimpleJWT (sesión por rol) |
| Tiempo real | Django Channels + Daphne (WebSockets, con capa en memoria: no necesita Redis) |
| Base de datos | SQLite |
| Frontend | React 19 + Vite, React Router, TanStack Query, Tailwind CSS 4, Recharts, lucide-react |

## Cómo correrlo

Necesitas **Python 3.11 o superior** y **Node 20 o superior**. Usa dos terminales.

### 1. Backend (terminal 1)

```bash
cd backend
python -m venv .venv
```

Activa el entorno virtual. En Windows:

```bash
.venv\Scripts\activate
```

En macOS o Linux:

```bash
source .venv/bin/activate
```

Instala, crea la base de datos con los datos de ejemplo y arranca el servidor:

```bash
pip install -r requirements.txt
```

```bash
python manage.py migrate
```

```bash
python manage.py sembrar
```

```bash
python manage.py runserver
```

`runserver` usa Daphne, así que los WebSockets funcionan. La API queda en `http://127.0.0.1:8000/api/`.

### 2. Frontend (terminal 2)

```bash
cd frontend
npm install
```

```bash
npm run dev
```

Abre **http://localhost:5173**. Vite reenvía `/api`, `/media` y `/ws` al backend.

## Usuarios de prueba

Todos con la contraseña `cartasync123`. En la pantalla de ingreso también hay botones para entrar con un toque.

| Usuario | Rol | Entra a |
|---|---|---|
| `jorge` | Dueño / administrador | `/admin` (y puede abrir todas las vistas) |
| `rosa` | Cocina | `/cocina` |
| `andres`, `camila` | Mesero | `/mesero` (pensado para celular) |
| `luis` | Caja | `/caja` |

La carta del comensal es pública: **http://localhost:5173/carta/la-esquina** (es la misma a la que lleva el QR).

`python manage.py sembrar` borra y vuelve a crear los datos de *Restaurante La Esquina*: 13 platos, 8 mesas, inventario y unas 5 semanas de ventas para que las estadísticas tengan contenido.

## Para mostrar el tiempo real

**Cada pestaña del navegador tiene su propia sesión.** Puedes tener cocina, mesero y caja abiertos a la vez sin que se pisen. Desde cualquier vista, el botón **Cambiar de rol** te pasa a otro usuario en esa pestaña sin volver a escribir la contraseña.

### Modo demostración (recomendado para presentar)

Abre **http://localhost:5173/demo**. En una sola pantalla verás cuatro paneles, cada uno con su propia sesión: **Cocina** y **Caja** a la izquierda, el **celular del mesero** y la **carta QR del comensal** a la derecha.

- En cada panel puedes elegir otra vista (dueño, la mesera Camila…), recargarlo o abrirlo en una pestaña aparte.
- **Reiniciar datos** vuelve a cargar los datos de ejemplo para empezar la presentación desde cero. Solo funciona con `DJANGO_DEBUG=1`, que es lo predeterminado.

Recorrido sugerido:

1. En **Cocina**, marca un plato como **Agotado**. Al mesero le aparece *"Se agotó… ofrece…"*, y la caja y la carta QR lo tachan al instante.
2. En el **mesero**, toca una mesa libre y envía un pedido. A la cocina le llega *"Nuevo pedido"*.
3. En **Cocina → Pedidos**, márcalo listo. La mesa se ilumina en el celular del mesero.
4. En **Caja**, toca *Simular mensaje entrante* para recibir un pedido de WhatsApp.

También puedes usar varios dispositivos de verdad, por ejemplo el celular como mesero. Abre `http://<IP-de-tu-computador>:5173` en la misma red wifi; Vite ya acepta conexiones externas.

## Qué incluye

| Módulo | Pantallas (código de Figma) | Estado |
|---|---|---|
| 2 · Disponibilidad | 1A tablero de cocina con filtros, 1D porciones del día con sugerencia según historial | ✅ Completo: estado con un toque, descuento automático de porciones, paso solo a "por agotarse" (umbral configurable), tiempo estimado de regreso, plato alternativo |
| 3 · Carta del comensal | 1C carta QR | ✅ Sin instalar nada, en vivo, con calificación de platos |
| 4 · Pedidos y sala | 1B tomar pedido, 2A mesas, 2B cuenta de la mesa, detalle del pedido, 2E avisos, 2C pedidos en cocina, 2D caja | ✅ Bloquea lo agotado y lo que no alcanza. Estados recibido → en preparación → listo → servido. El mesero crea pedidos desde Mesas o Pedidos, elige o cambia la mesa, agrega platos (la cocina los ve como *Agregado*), quita platos antes de que la cocina empiece, pasa el pedido a otra mesa y cancela los suyos. Cada pedido guarda un **registro de actualizaciones**: quién hizo qué y cuándo. La venta de mostrador en caja siempre queda ligada a una mesa. |
| 1 · Gestión de la carta | 3B carta, 3C crear o editar plato | ✅ CRUD con foto, qué incluye y qué se cobra aparte, horarios, costo y margen, menú del día, promocionar, QR descargable |
| 6 · Estadísticas | 3A panel | ✅ Ventas por hora y día, más y menos vendidos, agotamientos, margen por plato, exportar a Excel (CSV) |
| 5 · Inventario | 3D inventario | ✅ Básico: existencias, mínimo, vencimientos, movimientos, cierre del día; un insumo en 0 agota sus platos |
| 7 · Administración | 4A ingreso, 4B usuarios y sedes, 4C plan y soporte | ✅ Básico: registro de restaurante, usuarios por rol, sedes, solicitudes de soporte |

### Simulado o pendiente (fuera del alcance de esta primera versión)

- **WhatsApp:** los mensajes se simulan con el botón *Simular mensaje entrante* de la caja. La caja los convierte en pedido sin copiarlos a mano.
- **Pagos y suscripción:** los precios son de ejemplo y no hay pasarela de pagos.
- **Resumen semanal por correo:** solo simula el envío.
- **Conexión con sistemas de caja**, **uso sin conexión** y **exportar a PDF:** no están.
- **Recuperar contraseña:** muestra el aviso, pero no envía correo.

## Estructura

```
backend/
  config/          settings, urls, asgi y tiempo_real.py (WebSocket + emitir eventos)
  cuentas/         Restaurante, Sede, Usuario (rol), soporte, comando `sembrar`
  carta/           Categoría, Plato (estado y porciones), historial de cambios, calificaciones, carta pública y QR
  pedidos/         Mesa, Pedido, ItemPedido, mensajes de WhatsApp, avisos de sala
  inventario/      Producto, Movimiento
  reportes/        estadísticas y exportación
frontend/src/
  lib/             api (JWT), sesión, tiempo real, avisos, formato
  components/      ui (botones, etiqueta de estado, selector, barra de porciones…) y layouts por rol
  pages/           cocina/, mesero/, comensal/, caja/, admin/
```

### Cómo funciona el tiempo real

Cuando algo cambia, el backend manda por WebSocket solo el tema que cambió (`platos`, `pedidos`, `inventario`…) al grupo del restaurante. Cada pantalla vuelve a pedir esos datos a la API. Así el socket no lleva información privada y la carta pública puede escucharlo. Si se cae la conexión, el cliente reintenta y recarga todo al volver. Además, cada minuto se actualiza por si acaso.
