import axios from 'axios'

const CLAVE = 'cartasync.sesion'

export function leerSesion() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE)) || null
  } catch {
    return null
  }
}

export function guardarSesion(sesion) {
  try {
    if (sesion) localStorage.setItem(CLAVE, JSON.stringify(sesion))
    else localStorage.removeItem(CLAVE)
  } catch {
    /* almacenamiento bloqueado: la sesión dura lo que dure la pestaña */
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
