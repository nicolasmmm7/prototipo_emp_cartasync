import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { ChefHat, Smartphone, Store, UserCog } from 'lucide-react'
import { Boton, Campo, Logo, Modal } from '../components/ui'
import { mensajeError } from '../lib/api'
import { useAvisar } from '../lib/avisos'
import { INICIO_ROL } from '../lib/formato'
import { useSesion } from '../lib/sesion'

const DEMO = [
  { usuario: 'jorge', nombre: 'Jorge', rol: 'Dueño', icono: UserCog },
  { usuario: 'rosa', nombre: 'Rosa', rol: 'Cocina', icono: ChefHat },
  { usuario: 'andres', nombre: 'Andrés', rol: 'Mesero', icono: Smartphone },
  { usuario: 'luis', nombre: 'Luis', rol: 'Caja', icono: Store },
]

export default function Ingresar() {
  const { usuario, ingresar } = useSesion()
  const nav = useNavigate()
  const avisar = useAvisar()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [modal, setModal] = useState(null)

  if (usuario) return <Navigate to={INICIO_ROL[usuario.rol]} replace />

  const entrar = async (username, password) => {
    setError('')
    setCargando(true)
    try {
      const u = await ingresar(username, password)
      nav(INICIO_ROL[u.rol])
    } catch (e) {
      setError(e.response?.status === 401 ? 'Usuario o contraseña incorrectos.' : mensajeError(e))
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-pagina px-4 py-10">
      <div className="w-full max-w-md">
        <form
          className="tarjeta p-6 shadow-sm sm:p-8"
          onSubmit={(e) => {
            e.preventDefault()
            entrar(form.username.trim(), form.password)
          }}
        >
          <Logo />
          <h1 className="mt-6 mb-6 text-h2 sm:text-h1">Ingresa a tu restaurante</h1>
          <div className="space-y-4">
            <Campo etiqueta="Correo o usuario">
              <input
                className="campo"
                autoComplete="username"
                placeholder="correo@restaurante.com"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </Campo>
            <Campo etiqueta="Contraseña">
              <input
                className="campo"
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </Campo>
            {error && (
              <p role="alert" className="rounded-lg bg-agotado-fondo px-3 py-2 text-pequeno font-medium text-agotado">
                {error}
              </p>
            )}
            <Boton type="submit" className="w-full" cargando={cargando}>
              Ingresar
            </Boton>
            <button type="button" onClick={() => setModal('recuperar')} className="block w-full text-center text-pequeno text-texto-2 underline hover:text-texto">
              ¿Olvidaste tu contraseña?
            </button>
          </div>
          <p className="mt-6 border-t border-borde pt-5 text-center text-pequeno text-texto-2">
            ¿Aún no usas CartaSync?{' '}
            <button type="button" onClick={() => setModal('registro')} className="font-semibold text-marca underline">
              Registra tu restaurante y empieza la prueba
            </button>
          </p>
        </form>

        <div className="mt-6">
          <p className="mb-2 text-center text-etiqueta font-semibold tracking-wide text-tenue uppercase">
            Prototipo · entra como
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DEMO.map(({ usuario: u, nombre, rol, icono: I }) => (
              <button
                key={u}
                type="button"
                disabled={cargando}
                onClick={() => entrar(u, 'cartasync123')}
                className="tarjeta flex flex-col items-center gap-1 px-2 py-3 hover:border-marca"
              >
                <I size={20} className="text-marca" />
                <span className="text-pequeno font-semibold">{nombre}</span>
                <span className="text-etiqueta text-texto-2">{rol}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <Recuperar abierto={modal === 'recuperar'} onCerrar={() => setModal(null)} avisar={avisar} />
      <Registro
        abierto={modal === 'registro'}
        onCerrar={() => setModal(null)}
        onListo={(u, p) => {
          setModal(null)
          avisar('Cuenta creada', 'exito', 'Tienes 30 días de prueba gratis.')
          entrar(u, p)
        }}
      />
    </div>
  )
}

function Recuperar({ abierto, onCerrar, avisar }) {
  const [correo, setCorreo] = useState('')
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Recuperar contraseña"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
          <Boton
            disabled={!correo.includes('@')}
            onClick={() => {
              onCerrar()
              avisar('Enlace enviado', 'exito', `Revisa ${correo} para crear una nueva contraseña.`)
            }}
          >
            Enviar enlace
          </Boton>
        </>
      }
    >
      <p className="mb-4 text-pequeno text-texto-2">
        Te enviaremos un enlace para crear una nueva contraseña. Si eres cocina, mesero o caja, pídele al
        administrador que la cambie desde Usuarios y sedes.
      </p>
      <Campo etiqueta="Correo">
        <input className="campo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
      </Campo>
    </Modal>
  )
}

function Registro({ abierto, onCerrar, onListo }) {
  const [f, setF] = useState({ restaurante: '', ciudad: '', nombre: '', email: '', username: '', password: '' })
  const [errores, setErrores] = useState({})
  const [cargando, setCargando] = useState(false)
  const campo = (k) => ({ value: f[k], onChange: (e) => setF({ ...f, [k]: e.target.value }) })

  const enviar = async () => {
    setCargando(true)
    setErrores({})
    try {
      await axios.post('/api/auth/registro/', f)
      onListo(f.username, f.password)
    } catch (e) {
      setErrores(e.response?.data || { general: mensajeError(e) })
    } finally {
      setCargando(false)
    }
  }
  const err = (k) => errores[k]?.[0]
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Registrar restaurante"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
          <Boton cargando={cargando} onClick={enviar}>Crear cuenta</Boton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre del restaurante" error={err('restaurante')} className="sm:col-span-2">
          <input className="campo" {...campo('restaurante')} />
        </Campo>
        <Campo etiqueta="Ciudad" error={err('ciudad')}>
          <input className="campo" {...campo('ciudad')} />
        </Campo>
        <Campo etiqueta="Tu nombre" error={err('nombre')}>
          <input className="campo" {...campo('nombre')} />
        </Campo>
        <Campo etiqueta="Correo" error={err('email')} className="sm:col-span-2">
          <input className="campo" type="email" {...campo('email')} />
        </Campo>
        <Campo etiqueta="Usuario" error={err('username')}>
          <input className="campo" autoComplete="username" {...campo('username')} />
        </Campo>
        <Campo etiqueta="Contraseña" error={err('password')} ayuda="Mínimo 8 caracteres">
          <input className="campo" type="password" autoComplete="new-password" {...campo('password')} />
        </Campo>
      </div>
      {errores.general && <p className="mt-3 text-pequeno text-agotado">{errores.general}</p>}
      <p className="mt-4 rounded-lg bg-marca-suave px-3 py-2 text-pequeno text-marca">
        Empiezas con 30 días de prueba. Después puedes crear los usuarios de cocina, sala y caja.
      </p>
    </Modal>
  )
}
