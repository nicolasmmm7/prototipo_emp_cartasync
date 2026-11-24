import axios from 'axios'

/*
 * Una sesión por pestaña: se guarda en sessionStorage, así se pueden tener abiertos
 * cocina, mesero y caja a la vez en el mismo navegador sin que se pisen.
 * Los paneles de /demo son iframes que comparten el sessionStorage de la pestaña,
 * por eso cada uno usa su propia clave según el nombre de su ventana (window.name).
 */
const CLAVE = `cartasync.sesion${window.name ? `.${window.name}` : ''}`
let enMemoria = null // respaldo si el navegador bloquea el almacenamiento

export function leerSesion() {
  try {
    return JSON.parse(sessionStorage.getItem(CLAVE)) || null
  } catch {
    return enMemoria
  }
}

export function guardarSesion(sesion) {
  enMemoria = sesion
  try {
    if (sesion) sessionStorage.setItem(CLAVE, JSON.stringify(sesion))
    else sessionStorage.removeItem(CLAVE)
  } catch {
    /* almacenamiento bloqueado: queda solo en memoria */
  }
}

export const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const s = leerSesion()
  if (s?.access) config.headers.Authorization = `Bearer ${s.access}`
  return config
})

// Si el token venció, se renueva una vez con el refresh y se repite la petición.
let renovando = null
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config
    const s = leerSesion()
    if (error.response?.status === 401 && s?.refresh && !original._reintento) {
      original._reintento = true
      try {
        renovando ??= axios.post('/api/auth/refresh/', { refresh: s.refresh })
        const { data } = await renovando
        guardarSesion({ ...s, access: data.access })
        return api(original)
      } catch {
        guardarSesion(null)
        window.location.assign('/ingresar')
      } finally {
        renovando = null
      }
    }
    return Promise.reject(error)
  },
)

/** Convierte un error de la API en un texto para mostrar al usuario. */
export function mensajeError(error) {
  const d = error?.response?.data
  if (!d) return 'No hay conexión con el servidor. Intenta de nuevo.'
  if (typeof d === 'string') return 'Ocurrió un error en el servidor.'
  if (d.detail) return d.detail
  const primero = Object.values(d).flat()[0]
  return typeof primero === 'string' ? primero : 'Revisa los datos e intenta de nuevo.'
}

export const obtener = (url, params) => api.get(url, { params }).then((r) => r.data)
