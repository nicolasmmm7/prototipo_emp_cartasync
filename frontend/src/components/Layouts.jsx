import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3, Bell, BookOpen, ChefHat, ClipboardList, CreditCard, LayoutGrid, LogOut, Menu,
  Package, Repeat, Smartphone, Store, Users, X,
} from 'lucide-react'
import { obtener } from '../lib/api'
import { fechaLarga, servicioActual } from '../lib/formato'
import { useSesion } from '../lib/sesion'
import { useAvisar } from '../lib/avisos'
import { useEventos, useTiempoReal } from '../lib/tiempoReal'
import { BotonCambiarRol, useCambiarRol } from './CambiarRol'
import { Indicador, Logo } from './ui'

/** Avisos emergentes con lo que pasa en vivo, según quién está mirando. */
function AvisosEnVivo({ para }) {
  const avisar = useAvisar()
  const { usuario } = useSesion()
  useEventos((e) => {
    if (para === 'sala' && e.tema === 'platos' && e.cambio && e.plato?.estado === 'agotado') {
      avisar(`Se agotó ${e.plato.nombre}`, 'error', e.alternativo ? `Ofrece ${e.alternativo}.` : 'Deja de ofrecerlo.')
    }
    // Lo que va a una mesa lo puede servir cualquier mesero; lo para llevar, quien lo tomó.
    if (para === 'sala' && e.tema === 'pedidos' && e.accion === 'listo' && (e.mesa || e.mesero === usuario?.id)) {
      avisar(`${e.etiqueta} está listo`, 'info', 'Recoger en cocina.')
    }
    if (para === 'cocina' && e.tema === 'pedidos' && e.accion === 'nuevo') {
      avisar(`Nuevo pedido · ${e.etiqueta}`, 'info')
    }
    if (para === 'cocina' && e.tema === 'pedidos' && e.accion === 'actualizado') {
      avisar(`${e.etiqueta} actualizó su pedido #${e.pedido}`, 'info', 'Revisa los platos agregados o quitados.')
    }
    if (para === 'cocina' && e.tema === 'pedidos' && e.accion === 'cancelado') {
      avisar(`Se canceló el pedido #${e.pedido}`, 'error', e.etiqueta)
    }
    if (para === 'caja' && e.tema === 'whatsapp' && e.accion === 'nuevo') {
      avisar('Llegó un pedido por WhatsApp', 'info', 'Revísalo en la bandeja.')
    }
  })
  return null
}

function useSalir() {
  const { salir } = useSesion()
  const nav = useNavigate()
  return () => {
    salir()
    nav('/ingresar')
  }
}

/** Barra superior para las vistas de escritorio de cocina y caja. */
export function LayoutEquipo({ etiqueta, pestanas = [] }) {
  const { conectado } = useTiempoReal()
  const { usuario } = useSesion()
  return (
    <div className="min-h-screen">
      <AvisosEnVivo para={etiqueta === 'Cocina' ? 'cocina' : 'caja'} />
      <header className="sticky top-0 z-30 border-b border-borde bg-superficie">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 lg:px-6">
          <Logo etiqueta={etiqueta} />
          <p className="hidden text-pequeno text-texto-2 xl:block">
            Servicio de {servicioActual()} · {fechaLarga()}
          </p>
          <nav className="order-last flex w-full gap-1 overflow-x-auto md:order-none md:ml-auto md:w-auto">
            {pestanas.map((p) => (
              <NavLink
                key={p.a}
                to={p.a}
                end
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-full px-4 py-2 text-pequeno font-semibold ${
                    isActive ? 'bg-texto text-white' : 'text-texto-2 hover:bg-pagina hover:text-texto'
                  }`
                }
              >
                {p.texto}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 md:ml-0">
            <Indicador conectado={conectado} />
            {usuario?.rol === 'admin' && (
              <NavLink to="/admin" className="hidden text-pequeno font-medium text-marca hover:underline sm:inline">
                Panel del dueño
              </NavLink>
            )}
            <span className="hidden text-pequeno text-texto-2 lg:inline">{usuario?.nombre}</span>
            <BotonCambiarRol />
          </div>
        </div>
      </header>
      <main className="px-4 py-5 lg:px-6">
        <Outlet />
      </main>
    </div>
  )
}

const MENU_DUENO = [
  { a: '/admin', texto: 'Estadísticas', icono: BarChart3, end: true },
  { a: '/admin/carta', texto: 'Carta', icono: BookOpen },
  { a: '/admin/inventario', texto: 'Inventario', icono: Package },
  { a: '/admin/pedidos', texto: 'Pedidos y ventas', icono: ClipboardList },
  { a: '/admin/usuarios', texto: 'Usuarios y sedes', icono: Users },
  { a: '/admin/plan', texto: 'Plan y soporte', icono: CreditCard },
]
const VISTAS_EQUIPO = [
  { a: '/cocina', texto: 'Vista de cocina', icono: ChefHat },
  { a: '/caja', texto: 'Vista de caja', icono: Store },
  { a: '/mesero', texto: 'Vista de mesero', icono: Smartphone },
]

/** Menú lateral del dueño. */
export function LayoutDueno() {
  const { usuario } = useSesion()
  const { conectado } = useTiempoReal()
  const salir = useSalir()
  const [abierto, setAbierto] = useState(false)
  const cambiarRol = useCambiarRol()

  const enlace = ({ isActive }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-pequeno font-medium ${
      isActive ? 'bg-marca text-white' : 'text-texto-2 hover:bg-pagina hover:text-texto'
    }`

  const menu = (
    <nav className="flex h-full flex-col gap-1 p-4" onClick={() => setAbierto(false)}>
      <div className="mb-5 px-1">
        <Logo subtitulo={usuario?.restaurante?.nombre} />
      </div>
      {MENU_DUENO.map(({ a, texto, icono: I, end }) => (
        <NavLink key={a} to={a} end={end} className={enlace}>
          <I size={18} /> {texto}
        </NavLink>
      ))}
      <p className="mt-6 mb-1 px-3 text-etiqueta font-semibold tracking-wide text-tenue uppercase">Vistas del equipo</p>
      {VISTAS_EQUIPO.map(({ a, texto, icono: I }) => (
        <NavLink key={a} to={a} className={enlace}>
          <I size={18} /> {texto}
        </NavLink>
      ))}
      <div className="mt-auto space-y-3 border-t border-borde pt-4">
        <div className="px-3">
          <p className="text-pequeno font-semibold">{usuario?.nombre}</p>
          <Indicador conectado={conectado} />
        </div>
        <button type="button" onClick={cambiarRol.abrir} className={enlace({ isActive: false }) + ' w-full'}>
          <Repeat size={18} /> Cambiar de rol
        </button>
        <button type="button" onClick={salir} className={enlace({ isActive: false }) + ' w-full'}>
          <LogOut size={18} /> Salir
        </button>
      </div>
    </nav>
  )

  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-borde bg-superficie lg:block">{menu}</aside>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-borde bg-superficie px-4 py-3 lg:hidden">
        <Logo subtitulo={usuario?.restaurante?.nombre} />
        <button type="button" onClick={() => setAbierto(true)} className="rounded-lg p-2 hover:bg-pagina" aria-label="Abrir menú">
          <Menu />
        </button>
      </header>
      {abierto && (
        <div className="fixed inset-0 z-40 bg-texto/40 lg:hidden" onClick={() => setAbierto(false)}>
          <aside className="animate-entrar relative h-full w-72 bg-superficie" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="absolute top-4 left-60 rounded-lg p-2 text-texto-2 hover:bg-pagina" onClick={() => setAbierto(false)} aria-label="Cerrar menú">
              <X />
            </button>
            {menu}
          </aside>
        </div>
      )}
      <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">
        <Outlet />
      </main>
      {cambiarRol.ventana}
    </div>
  )
}

/** Vista de celular del mesero, con navegación inferior. */
export function LayoutMesero() {
  const { data: avisos } = useQuery({ queryKey: ['avisos'], queryFn: () => obtener('/avisos/') })
  const pendientes = (avisos?.agotados?.length || 0) + (avisos?.listos?.length || 0)
  const cambiarRol = useCambiarRol()
  const item = ({ isActive }) =>
    `flex flex-1 flex-col items-center gap-0.5 py-2 text-etiqueta font-medium ${isActive ? 'text-marca' : 'text-texto-2'}`
  return (
    <div className="mx-auto min-h-screen max-w-md bg-pagina pb-20 md:border-x md:border-borde">
      <AvisosEnVivo para="sala" />
      <Outlet />
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md border-t border-borde bg-superficie pb-[env(safe-area-inset-bottom)]">
        <NavLink to="/mesero" end className={item}>
          <LayoutGrid size={22} /> Mesas
        </NavLink>
        <NavLink to="/mesero/pedidos" className={item}>
          <ClipboardList size={22} /> Pedidos
        </NavLink>
        <NavLink to="/mesero/avisos" className={item}>
          <span className="relative">
            <Bell size={22} />
            {pendientes > 0 && (
              <span className="absolute -top-1.5 -right-2.5 grid min-w-5 place-items-center rounded-full bg-acento px-1 text-[11px] font-bold text-white">
                {pendientes}
              </span>
            )}
          </span>
          Avisos{pendientes > 0 ? ` (${pendientes})` : ''}
        </NavLink>
        <button type="button" onClick={cambiarRol.abrir} className={item({ isActive: false })}>
          <Repeat size={22} /> Cambiar rol
        </button>
      </nav>
      {cambiarRol.ventana}
    </div>
  )
}

export function EncabezadoMovil({ titulo, subtitulo, atras, derecha }) {
  const nav = useNavigate()
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-borde bg-superficie px-4 py-3">
      {atras && (
        <button type="button" onClick={() => nav(atras)} className="-ml-1 rounded-lg border border-borde p-2 hover:bg-pagina" aria-label="Volver">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h3 className="truncate">{titulo}</h3>
        {subtitulo && <p className="truncate text-pequeno text-texto-2">{subtitulo}</p>}
      </div>
      {derecha}
    </header>
  )
}
