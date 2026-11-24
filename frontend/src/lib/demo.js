import { ChefHat, QrCode, Smartphone, Store, UserCog } from 'lucide-react'

/** Usuarios de prueba que crea `python manage.py sembrar`. */
export const CLAVE_DEMO = 'cartasync123'

export const USUARIOS_DEMO = [
  { usuario: 'jorge', nombre: 'Jorge', rol: 'admin', rolTexto: 'Dueño', icono: UserCog, inicio: '/admin' },
  { usuario: 'rosa', nombre: 'Rosa', rol: 'cocina', rolTexto: 'Cocina', icono: ChefHat, inicio: '/cocina' },
  { usuario: 'andres', nombre: 'Andrés', rol: 'mesero', rolTexto: 'Mesero', icono: Smartphone, inicio: '/mesero' },
  { usuario: 'camila', nombre: 'Camila', rol: 'mesero', rolTexto: 'Mesero', icono: Smartphone, inicio: '/mesero' },
  { usuario: 'luis', nombre: 'Luis', rol: 'caja', rolTexto: 'Caja', icono: Store, inicio: '/caja' },
]

export const esUsuarioDemo = (u) => USUARIOS_DEMO.some((d) => d.usuario === u)

/** Vistas que se pueden poner en un panel de /demo. */
export const VISTAS_DEMO = {
  cocina: { texto: 'Cocina', usuario: 'rosa', ruta: '/cocina', ancho: 1280, icono: ChefHat },
  caja: { texto: 'Caja', usuario: 'luis', ruta: '/caja', ancho: 1280, icono: Store },
  dueno: { texto: 'Dueño', usuario: 'jorge', ruta: '/admin', ancho: 1280, icono: UserCog },
  mesero: { texto: 'Mesero · Andrés', usuario: 'andres', ruta: '/mesero', ancho: 390, icono: Smartphone },
  mesera: { texto: 'Mesera · Camila', usuario: 'camila', ruta: '/mesero', ancho: 390, icono: Smartphone },
  comensal: { texto: 'Comensal (QR)', usuario: null, ruta: '/carta/la-esquina', ancho: 390, icono: QrCode },
}
