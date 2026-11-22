import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, UserPlus } from 'lucide-react'
import { Boton, Campo, Cargando, Chip, ErrorCarga, Modal } from '../../components/ui'
import { api, mensajeError, obtener } from '../../lib/api'
import { useAvisar } from '../../lib/avisos'
import { ROLES, hace } from '../../lib/formato'
import { useSesion } from '../../lib/sesion'

const PERMISOS = {
  admin: 'Todo: carta, estadísticas, inventario, usuarios y plan.',
  cocina: 'Disponibilidad, porciones y pedidos entrantes.',
  mesero: 'Mesas, pedidos y avisos de agotados en su celular.',
  caja: 'Mostrador, para llevar, domicilios, WhatsApp e inventario.',
}

/** 4B · Dueño — usuarios, roles y sedes. */
export default function Usuarios() {
  const { usuario: yo } = useSesion()
  const [sede, setSede] = useState('todas')
  const [editar, setEditar] = useState(null)
  const [nuevaSede, setNuevaSede] = useState(false)
  const { data: usuarios, isLoading, error, refetch } = useQuery({ queryKey: ['usuarios'], queryFn: () => obtener('/usuarios/') })
  const { data: sedes = [] } = useQuery({ queryKey: ['sedes'], queryFn: () => obtener('/sedes/') })

  if (isLoading) return <Cargando />
  if (error) return <ErrorCarga error={error} reintentar={refetch} />

  const visibles = sede === 'todas' ? usuarios : usuarios.filter((u) => u.sede === sede)

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Usuarios y sedes</h1>
          <p className="mt-1 text-texto-2">Cada persona entra con su rol y solo ve lo que necesita.</p>
        </div>
        <Boton onClick={() => setEditar({})}>
          <UserPlus size={18} /> Agregar usuario
        </Boton>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-pequeno font-semibold">Sede:</span>
        <Chip activo={sede === 'todas'} onClick={() => setSede('todas')}>Todas</Chip>
        {sedes.map((s) => (
          <Chip key={s.id} activo={sede === s.id} onClick={() => setSede(s.id)}>{s.nombre}</Chip>
        ))}
        <Chip onClick={() => setNuevaSede(true)}>
          <Plus size={14} /> Agregar sede
        </Chip>
      </div>

      <div className="tarjeta overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead className="border-b border-borde bg-pagina text-pequeno text-texto-2">
            <tr>
              <th className="px-4 py-3 font-semibold">Nombre</th>
              <th className="px-4 py-3 font-semibold">Rol</th>
              <th className="px-4 py-3 font-semibold">Sede</th>
              <th className="px-4 py-3 font-semibold">Último ingreso</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {visibles.map((u) => (
              <tr key={u.id} className={u.is_active ? '' : 'opacity-50'}>
                <td className="px-4 py-3">
                  <p className="font-semibold">{u.nombre}{u.id === yo.id ? ' (tú)' : ''}</p>
                  <p className="text-etiqueta text-texto-2">@{u.username}{!u.is_active && ' · desactivado'}</p>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full border border-borde-fuerte px-2.5 py-0.5 text-etiqueta font-semibold">{u.rol_nombre}</span>
                </td>
                <td className="px-4 py-3 text-pequeno">{sedes.find((s) => s.id === u.sede)?.nombre ?? '—'}</td>
                <td className="px-4 py-3 text-pequeno text-texto-2">{u.last_login ? hace(u.last_login) : 'Nunca'}</td>
                <td className="px-4 py-3 text-right">
                  <Boton variante="fantasma" tamano="sm" onClick={() => setEditar(u)}>Editar</Boton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section>
        <h3 className="mb-3">Qué puede hacer cada rol</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(PERMISOS).map(([rol, texto]) => (
            <div key={rol} className="tarjeta p-4">
              <p className="font-semibold">{ROLES[rol]}</p>
              <p className="mt-1 text-pequeno text-texto-2">{texto}</p>
            </div>
          ))}
        </div>
      </section>

      <FormUsuario usuario={editar} sedes={sedes} yo={yo} onCerrar={() => setEditar(null)} />
      <FormSede abierto={nuevaSede} onCerrar={() => setNuevaSede(false)} />
    </div>
  )
}

function FormUsuario({ usuario, sedes, yo, onCerrar }) {
  const abierto = usuario !== null
  const nuevo = abierto && !usuario.id
  const qc = useQueryClient()
  const avisar = useAvisar()
  const [f, setF] = useState({})
  const [errores, setErrores] = useState({})
  const [clave, setClave] = useState(null)
  if (abierto && clave !== (usuario.id ?? 'nuevo')) {
    setClave(usuario.id ?? 'nuevo')
    setErrores({})
    setF({ first_name: '', last_name: '', username: '', rol: 'mesero', sede: sedes[0]?.id ?? null, is_active: true, password: '', ...usuario })
  }
  if (!abierto && clave !== null) setClave(null)

  const guardar = useMutation({
    mutationFn: () => {
      const { first_name, last_name, username, rol, sede, is_active, password } = f
      const datos = { first_name, last_name, username, rol, sede, is_active }
      if (password) datos.password = password
      return nuevo ? api.post('/usuarios/', datos) : api.patch(`/usuarios/${usuario.id}/`, datos)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      avisar(nuevo ? 'Usuario creado' : 'Usuario actualizado', 'exito', nuevo ? `Ya puede entrar como @${f.username}.` : '')
      onCerrar()
    },
    onError: (e) => {
      setErrores(e.response?.data || {})
      avisar('No se pudo guardar', 'error', mensajeError(e))
    },
  })
  const c = (k) => ({ value: f[k] ?? '', onChange: (e) => setF({ ...f, [k]: e.target.value }) })
  const err = (k) => errores[k]?.[0]
  const esYo = usuario?.id === yo.id
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={nuevo ? 'Agregar usuario' : `Editar ${usuario?.nombre ?? ''}`}
      pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton cargando={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre" error={err('first_name')}><input className="campo" {...c('first_name')} /></Campo>
        <Campo etiqueta="Apellido"><input className="campo" {...c('last_name')} /></Campo>
        <Campo etiqueta="Usuario para entrar" error={err('username')}><input className="campo" autoComplete="off" {...c('username')} /></Campo>
        <Campo etiqueta={nuevo ? 'Contraseña' : 'Nueva contraseña'} error={err('password')} ayuda={nuevo ? 'Mínimo 6 caracteres' : 'Déjala vacía para no cambiarla'}>
          <input className="campo" type="password" autoComplete="new-password" {...c('password')} />
        </Campo>
        <Campo etiqueta="Rol">
          <select className="campo" disabled={esYo} {...c('rol')}>
            {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Sede">
          <select className="campo" value={f.sede ?? ''} onChange={(e) => setF({ ...f, sede: e.target.value ? Number(e.target.value) : null })}>
            {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </Campo>
        {!nuevo && !esYo && (
          <label className="flex items-center gap-3 text-pequeno sm:col-span-2">
            <input type="checkbox" className="size-5 accent-marca" checked={!!f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />
            Puede ingresar (desmárcalo si la persona ya no trabaja aquí)
          </label>
        )}
      </div>
    </Modal>
  )
}

function FormSede({ abierto, onCerrar }) {
  const qc = useQueryClient()
  const avisar = useAvisar()
  const [f, setF] = useState({ nombre: '', direccion: '' })
  const guardar = useMutation({
    mutationFn: () => api.post('/sedes/', f),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sedes'] })
      avisar('Sede agregada', 'exito', f.nombre)
      setF({ nombre: '', direccion: '' })
      onCerrar()
    },
    onError: (e) => avisar('No se pudo agregar', 'error', mensajeError(e)),
  })
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Agregar sede"
      pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton disabled={!f.nombre} cargando={guardar.isPending} onClick={() => guardar.mutate()}>Agregar</Boton></>}
    >
      <div className="space-y-4">
        <Campo etiqueta="Nombre de la sede"><input className="campo" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Campo>
        <Campo etiqueta="Dirección"><input className="campo" value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })} /></Campo>
        <p className="rounded-lg bg-marca-suave px-3 py-2 text-pequeno text-marca">Manejar varias sedes requiere el plan para varias sedes.</p>
      </div>
    </Modal>
  )
}
