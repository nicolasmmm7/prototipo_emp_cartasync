import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, PackageMinus, Plus } from 'lucide-react'
import { Boton, Campo, Cargando, ErrorCarga, Modal } from '../../components/ui'
import { api, mensajeError, obtener } from '../../lib/api'
import { useAvisar } from '../../lib/avisos'
import { fechaCorta, hace } from '../../lib/formato'

const UBICACIONES = { nevera: 'Nevera mostrador', repisa: 'Repisa', vitrina: 'Vitrina', tanque: 'Tanque', bodega: 'Bodega (insumo)' }
const cant = (v) => Number(v).toLocaleString('es-CO', { maximumFractionDigits: 2 })

/** 3D · Dueño — inventario de mostrador e insumos. */
export default function Inventario() {
  const [producto, setProducto] = useState(null) // null: cerrado, {}: nuevo, {...}: editar
  const [movimiento, setMovimiento] = useState(null)
  const [cierre, setCierre] = useState(false)
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['productos'], queryFn: () => obtener('/productos/') })
  const { data: movs = [] } = useQuery({ queryKey: ['movimientos'], queryFn: () => obtener('/movimientos/') })

  if (isLoading) return <Cargando />
  if (error) return <ErrorCarga error={error} reintentar={refetch} />

  const porVencer = data.filter((p) => p.por_vencer)
  const bajos = data.filter((p) => p.bajo_minimo)

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Inventario de mostrador</h1>
          <p className="mt-1 text-texto-2">Productos en mostrador, tanques y repisas, con sus fechas de vencimiento.</p>
        </div>
        <Boton onClick={() => setProducto({})}>
          <Plus size={18} /> Registrar producto
        </Boton>
      </div>

      {(porVencer.length > 0 || bajos.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          {porVencer.length > 0 && (
            <div className="tarjeta border-2 border-texto p-4">
              <p className="flex items-center gap-2 font-semibold">
                <CalendarClock size={18} /> {porVencer.length} producto{porVencer.length > 1 ? 's vencen' : ' vence'} en los próximos 2 días
              </p>
              <p className="mt-1 text-pequeno text-texto-2">
                {porVencer.map((p) => p.nombre).join(', ')}. Sugerencia: promociónalos hoy en la carta.
              </p>
            </div>
          )}
          {bajos.length > 0 && (
            <div className="tarjeta border-l-4 border-l-por-agotarse p-4">
              <p className="flex items-center gap-2 font-semibold">
                <PackageMinus size={18} /> {bajos.length} en el mínimo o por debajo
              </p>
              <p className="mt-1 text-pequeno text-texto-2">{bajos.map((p) => p.nombre).join(', ')}. Inclúyelos en la próxima compra.</p>
            </div>
          )}
        </div>
      )}

      <div className="tarjeta overflow-x-auto">
        <table className="w-full min-w-[820px] text-left">
          <thead className="border-b border-borde bg-pagina text-pequeno text-texto-2">
            <tr>
              <th className="px-4 py-3 font-semibold">Producto</th>
              <th className="px-4 py-3 font-semibold">Ubicación</th>
              <th className="px-4 py-3 text-right font-semibold">Existencias</th>
              <th className="px-4 py-3 text-right font-semibold">Mínimo</th>
              <th className="px-4 py-3 font-semibold">Vence</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {data.map((p) => (
              <tr key={p.id} className="hover:bg-pagina">
                <td className="px-4 py-3">
                  <p className="font-semibold">{p.nombre}</p>
                  {p.es_insumo && <p className="text-etiqueta text-texto-2">Insumo de: {p.platos.join(', ') || 'sin platos'}</p>}
                </td>
                <td className="px-4 py-3 text-pequeno">{p.ubicacion_nombre}</td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">{cant(p.existencias)} {p.unidad}</td>
                <td className="px-4 py-3 text-right text-pequeno tabular-nums text-texto-2">{cant(p.minimo)}</td>
                <td className={`px-4 py-3 text-pequeno ${p.por_vencer ? 'font-semibold text-agotado' : ''}`}>{p.vence ? fechaCorta(p.vence) : '—'}</td>
                <td className="px-4 py-3">
                  {Number(p.existencias) === 0 ? (
                    <Etiqueta clase="bg-agotado-fondo text-agotado">Agotado</Etiqueta>
                  ) : p.bajo_minimo ? (
                    <Etiqueta clase="bg-por-agotarse-fondo text-por-agotarse-texto">Bajo mínimo</Etiqueta>
                  ) : p.por_vencer ? (
                    <Etiqueta clase="bg-acento-suave text-texto">Por vencer</Etiqueta>
                  ) : (
                    <Etiqueta clase="bg-disponible-fondo text-disponible">Bien</Etiqueta>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Boton variante="secundario" tamano="sm" onClick={() => setMovimiento(p)}>Movimiento</Boton>
                    <Boton variante="fantasma" tamano="sm" onClick={() => setProducto(p)}>Editar</Boton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="tarjeta p-5">
          <h3>Sobrantes y desperdicio del día</h3>
          <p className="mt-1 mb-4 text-pequeno text-texto-2">
            Al cerrar, registra lo que sobró o se perdió. Alimenta las estadísticas y ayuda a preparar mejor mañana.
          </p>
          <Boton variante="secundario" onClick={() => setCierre(true)}>Registrar cierre del día</Boton>
        </section>
        <section className="tarjeta p-5">
          <h3 className="mb-3">Últimos movimientos</h3>
          {movs.length === 0 ? (
            <p className="text-pequeno text-texto-2">Aún no hay movimientos.</p>
          ) : (
            <ul className="divide-y divide-borde">
              {movs.slice(0, 6).map((m) => (
                <li key={m.id} className="flex justify-between gap-3 py-2 text-pequeno">
                  <span><strong>{m.tipo_nombre}</strong> · {m.producto_nombre} × {cant(m.cantidad)}</span>
                  <span className="text-texto-2">{hace(m.creado)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <FormProducto producto={producto} onCerrar={() => setProducto(null)} />
      <FormMovimiento producto={movimiento} onCerrar={() => setMovimiento(null)} />
      <FormCierre abierto={cierre} productos={data} onCerrar={() => setCierre(false)} />
    </div>
  )
}

function Etiqueta({ clase, children }) {
  return <span className={`rounded-full px-2.5 py-1 text-etiqueta font-semibold ${clase}`}>{children}</span>
}

function FormProducto({ producto, onCerrar }) {
  const abierto = producto !== null
  const nuevo = abierto && !producto.id
  const qc = useQueryClient()
  const avisar = useAvisar()
  const [f, setF] = useState({})
  const [clave, setClave] = useState(null)
  // Reinicia el formulario cada vez que se abre con otro producto.
  if (abierto && clave !== (producto.id ?? 'nuevo')) {
    setClave(producto.id ?? 'nuevo')
    setF({ nombre: '', ubicacion: 'nevera', unidad: 'und', existencias: '', minimo: '', vence: '', es_insumo: false, ...producto })
  }
  if (!abierto && clave !== null) setClave(null)

  const guardar = useMutation({
    mutationFn: () => {
      const datos = { ...f, vence: f.vence || null, existencias: f.existencias || 0, minimo: f.minimo || 0 }
      return nuevo ? api.post('/productos/', datos) : api.patch(`/productos/${producto.id}/`, datos)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos'] })
      avisar(nuevo ? (f.es_insumo ? 'Insumo agregado' : 'Producto registrado') : 'Cambios guardados', 'exito', f.nombre)
      onCerrar()
    },
    onError: (e) => avisar('No se pudo guardar', 'error', mensajeError(e)),
  })
  const c = (k) => ({ value: f[k] ?? '', onChange: (e) => setF({ ...f, [k]: e.target.value }) })
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={nuevo ? 'Registrar producto' : `Editar ${producto?.nombre ?? ''}`}
      pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton cargando={guardar.isPending} disabled={!f.nombre} onClick={() => guardar.mutate()}>Guardar</Boton></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre" className="sm:col-span-2"><input className="campo" {...c('nombre')} /></Campo>
        <Campo etiqueta="Ubicación">
          <select className="campo" {...c('ubicacion')}>
            {Object.entries(UBICACIONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Unidad"><input className="campo" placeholder="und, L, kg" {...c('unidad')} /></Campo>
        <Campo etiqueta="Existencias"><input className="campo" inputMode="decimal" {...c('existencias')} /></Campo>
        <Campo etiqueta="Avisar cuando llegue a" ayuda="Mínimo de existencias"><input className="campo" inputMode="decimal" {...c('minimo')} /></Campo>
        <Campo etiqueta="Fecha de vencimiento"><input className="campo" type="date" {...c('vence')} /></Campo>
        <label className="flex items-center gap-3 self-end pb-3 text-pequeno">
          <input type="checkbox" className="size-5 accent-marca" checked={!!f.es_insumo} onChange={(e) => setF({ ...f, es_insumo: e.target.checked })} />
          Es insumo de cocina
        </label>
      </div>
    </Modal>
  )
}

function FormMovimiento({ producto, onCerrar }) {
  const qc = useQueryClient()
  const avisar = useAvisar()
  const [tipo, setTipo] = useState('entrada')
  const [cantidad, setCantidad] = useState('')
  const [nota, setNota] = useState('')
  const guardar = useMutation({
    mutationFn: () => api.post('/movimientos/', { producto: producto.id, tipo, cantidad, nota }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos'] })
      qc.invalidateQueries({ queryKey: ['movimientos'] })
      avisar('Movimiento registrado', 'exito', `${producto.nombre}: ${tipo} de ${cantidad}`)
      setCantidad('')
      setNota('')
      onCerrar()
    },
    onError: (e) => avisar('No se pudo registrar', 'error', mensajeError(e)),
  })
  return (
    <Modal
      abierto={!!producto}
      onCerrar={onCerrar}
      titulo={`Movimiento · ${producto?.nombre ?? ''}`}
      pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton cargando={guardar.isPending} disabled={!(Number(cantidad) > 0)} onClick={() => guardar.mutate()}>Registrar</Boton></>}
    >
      <p className="mb-4 text-pequeno text-texto-2">Existencias actuales: {producto && `${cant(producto.existencias)} ${producto.unidad}`}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Tipo">
          <select className="campo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="entrada">Entrada (compra)</option>
            <option value="salida">Salida / venta</option>
            <option value="desperdicio">Desperdicio</option>
          </select>
        </Campo>
        <Campo etiqueta="Cantidad"><input className="campo" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} /></Campo>
        <Campo etiqueta="Nota (opcional)" className="sm:col-span-2"><input className="campo" value={nota} onChange={(e) => setNota(e.target.value)} /></Campo>
      </div>
    </Modal>
  )
}

function FormCierre({ abierto, productos, onCerrar }) {
  const qc = useQueryClient()
  const avisar = useAvisar()
  const [valores, setValores] = useState({})
  const guardar = useMutation({
    mutationFn: async () => {
      const envios = []
      for (const [id, v] of Object.entries(valores)) {
        if (Number(v.sobrante) > 0) envios.push(api.post('/movimientos/', { producto: id, tipo: 'sobrante', cantidad: v.sobrante, nota: 'Cierre del día' }))
        if (Number(v.desperdicio) > 0) envios.push(api.post('/movimientos/', { producto: id, tipo: 'desperdicio', cantidad: v.desperdicio, nota: 'Cierre del día' }))
      }
      await Promise.all(envios)
      return envios.length
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ['productos'] })
      qc.invalidateQueries({ queryKey: ['movimientos'] })
      avisar('Cierre registrado', 'exito', `${n} registro${n === 1 ? '' : 's'} guardado${n === 1 ? '' : 's'}.`)
      setValores({})
      onCerrar()
    },
    onError: (e) => avisar('No se pudo registrar', 'error', mensajeError(e)),
  })
  const poner = (id, k, v) => setValores((s) => ({ ...s, [id]: { ...s[id], [k]: v } }))
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="max-w-2xl"
      titulo="Cierre del día"
      pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton cargando={guardar.isPending} onClick={() => guardar.mutate()}>Registrar cierre</Boton></>}
    >
      <table className="w-full text-left text-pequeno">
        <thead className="text-texto-2">
          <tr><th className="py-2">Producto</th><th className="py-2">Sobró</th><th className="py-2">Se perdió</th></tr>
        </thead>
        <tbody className="divide-y divide-borde">
          {productos.map((p) => (
            <tr key={p.id}>
              <td className="py-2 pr-3 font-medium">{p.nombre} <span className="text-texto-2">({p.unidad})</span></td>
              <td className="py-2 pr-2"><input className="campo w-24 py-1.5" inputMode="decimal" aria-label={`Sobrante de ${p.nombre}`} value={valores[p.id]?.sobrante ?? ''} onChange={(e) => poner(p.id, 'sobrante', e.target.value)} /></td>
              <td className="py-2"><input className="campo w-24 py-1.5" inputMode="decimal" aria-label={`Desperdicio de ${p.nombre}`} value={valores[p.id]?.desperdicio ?? ''} onChange={(e) => poner(p.id, 'desperdicio', e.target.value)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  )
}
