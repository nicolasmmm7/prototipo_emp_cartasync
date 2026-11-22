const pesos = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })

/** 24000 → "$24.000" */
export const dinero = (v) => `$${pesos.format(Number(v) || 0)}`

export const numero = (v) => pesos.format(Number(v) || 0)

/** "hace 3 min", "hace 2 h" */
export function hace(fecha, ahora = Date.now()) {
  if (!fecha) return ''
  const min = Math.max(0, Math.round((ahora - new Date(fecha)) / 60000))
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`
}

/** "12:41" */
export const hora = (fecha) =>
  fecha ? new Date(fecha).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''

/** "sábado 14 de noviembre" */
export const fechaLarga = (fecha = new Date()) =>
  new Date(fecha).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })

export const fechaCorta = (fecha) =>
  fecha ? new Date(`${fecha}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : ''

export function servicioActual(d = new Date()) {
  const h = d.getHours()
  return h < 11 ? 'desayuno' : h < 17 ? 'almuerzo' : 'cena'
}

export const ESTADOS = {
  disponible: { nombre: 'Disponible', corto: 'Disponible' },
  por_agotarse: { nombre: 'Por agotarse', corto: 'Por agotarse' },
  agotado: { nombre: 'Agotado', corto: 'Agotado' },
}

export const ROLES = {
  admin: 'Administrador',
  cocina: 'Cocina',
  mesero: 'Mesero',
  caja: 'Caja',
}

/** Ruta de inicio para cada rol. */
export const INICIO_ROL = {
  admin: '/admin',
  cocina: '/cocina',
  mesero: '/mesero',
  caja: '/caja',
}
