import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { LayoutDueno, LayoutEquipo, LayoutMesero } from './components/Layouts'
import { INICIO_ROL } from './lib/formato'
import { useSesion } from './lib/sesion'
import { TiempoRealProvider } from './lib/tiempoReal'

import Ingresar from './pages/Ingresar'
import CartaQR from './pages/comensal/CartaQR'
import Tablero from './pages/cocina/Tablero'
import Porciones from './pages/cocina/Porciones'
import PedidosCocina from './pages/cocina/PedidosCocina'
import Mesas from './pages/mesero/Mesas'
import TomarPedido from './pages/mesero/TomarPedido'
import PedidoMesa from './pages/mesero/PedidoMesa'
import MisPedidos from './pages/mesero/MisPedidos'
import Avisos from './pages/mesero/Avisos'
import Caja from './pages/caja/Caja'
import Estadisticas from './pages/admin/Estadisticas'
import CartaAdmin from './pages/admin/CartaAdmin'
import PlatoForm from './pages/admin/PlatoForm'
import Inventario from './pages/admin/Inventario'
import PedidosAdmin from './pages/admin/PedidosAdmin'
import Usuarios from './pages/admin/Usuarios'
import Plan from './pages/admin/Plan'

/** Exige sesión y uno de los roles; el administrador puede entrar a todas las vistas. */
function Protegida({ roles }) {
  const { usuario } = useSesion()
  if (!usuario) return <Navigate to="/ingresar" replace />
  if (usuario.rol !== 'admin' && !roles.includes(usuario.rol)) {
    return <Navigate to={INICIO_ROL[usuario.rol]} replace />
  }
  return (
    <TiempoRealProvider slug={usuario.restaurante.slug}>
      <Outlet />
    </TiempoRealProvider>
  )
}

function Inicio() {
  const { usuario } = useSesion()
  return <Navigate to={usuario ? INICIO_ROL[usuario.rol] : '/ingresar'} replace />
}

const PESTANAS_COCINA = [
  { a: '/cocina', texto: 'Disponibilidad' },
  { a: '/cocina/pedidos', texto: 'Pedidos' },
  { a: '/cocina/porciones', texto: 'Porciones del día' },
]

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Inicio />} />
      <Route path="/ingresar" element={<Ingresar />} />
      <Route path="/carta/:slug" element={<CartaQR />} />

      <Route element={<Protegida roles={['cocina']} />}>
        <Route path="/cocina" element={<LayoutEquipo etiqueta="Cocina" pestanas={PESTANAS_COCINA} />}>
          <Route index element={<Tablero />} />
          <Route path="pedidos" element={<PedidosCocina />} />
          <Route path="porciones" element={<Porciones />} />
        </Route>
      </Route>

      <Route element={<Protegida roles={['mesero']} />}>
        <Route path="/mesero" element={<LayoutMesero />}>
          <Route index element={<Mesas />} />
          <Route path="pedidos" element={<MisPedidos />} />
          <Route path="avisos" element={<Avisos />} />
          <Route path="mesa/:mesaId" element={<PedidoMesa />} />
        </Route>
        {/* Tomar pedido ocupa toda la pantalla, sin la barra inferior. */}
        <Route path="/mesero/nuevo/:tipo/:mesaId?" element={<TomarPedido />} />
      </Route>

      <Route element={<Protegida roles={['caja']} />}>
        <Route path="/caja" element={<LayoutEquipo etiqueta="Caja" />}>
          <Route index element={<Caja />} />
        </Route>
      </Route>

      <Route element={<Protegida roles={[]} />}>
        <Route path="/admin" element={<LayoutDueno />}>
          <Route index element={<Estadisticas />} />
          <Route path="carta" element={<CartaAdmin />} />
          <Route path="carta/nuevo" element={<PlatoForm />} />
          <Route path="carta/:id" element={<PlatoForm />} />
          <Route path="inventario" element={<Inventario />} />
          <Route path="pedidos" element={<PedidosAdmin />} />
          <Route path="usuarios" element={<Usuarios />} />
          <Route path="plan" element={<Plan />} />
        </Route>
      </Route>

      <Route path="*" element={<Inicio />} />
    </Routes>
  )
}
