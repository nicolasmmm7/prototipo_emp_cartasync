import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EstadoPedido, HistorialPedido, ItemsPedido } from '../../components/Pedido'
import { Boton, Cargando, Chip, ErrorCarga, Modal, useAhora } from '../../components/ui'
import { api, mensajeError, obtener } from '../../lib/api'
import { useAvisar } from '../../lib/avisos'
import { dinero, hace, hora } from '../../lib/formato'

const FILTROS = [
  { clave: 'activos', texto: 'En curso' },
  { clave: 'hoy', texto: 'Todos los de hoy' },
]
const COLOR = {
  recibido: 'bg-marca-suave text-marca',
  en_preparacion: 'bg-por-agotarse-fondo text-por-agotarse-texto',
  listo: 'bg-disponible text-white',
  entregado: 'bg-pagina text-texto-2',
  cancelado: 'bg-agotado-fondo text-agotado',
}

/** Dueño — pedidos y ventas del día. */
export default function PedidosAdmin() {
  const [filtro, setFiltro] = useState('activos')
  const ahora = useAhora()
  const qc = useQueryClient()
  const avisar = useAvisar()
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['pedidos', filtro],
    queryFn: () => obtener('/pedidos/', filtro === 'activos' ? { activos: 1 } : { hoy: 1, limite: 300 }),
  })
  const [detalle, setDetalle] = useState(null)
  const cancelar = useMutation({
    mutationFn: (id) => api.post(`/pedidos/${id}/cancelar/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      avisar('Pedido cancelado', 'exito')
    },
    onError: (e) => avisar('No se pudo cancelar', 'error', mensajeError(e)),
  })

  const validos = data?.filter((p) => p.estado !== 'cancelado') || []
  const total = validos.reduce((s, p) => s + p.total, 0)

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Pedidos y ventas</h1>
          <p className="mt-1 text-texto-2">Cada pedido queda registrado como venta, con plato, cantidad, hora y valor.</p>
        </div>
        <div className="flex gap-2">
          {FILTROS.map((f) => (
            <Chip key={f.clave} activo={filtro === f.clave} onClick={() => setFiltro(f.clave)}>{f.texto}</Chip>
          ))}
        </div>
      </div>
      {isLoading ? (
        <Cargando />
      ) : error ? (
        <ErrorCarga error={error} reintentar={refetch} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="tarjeta p-4"><p className="text-pequeno text-texto-2">Pedidos</p><p className="text-h1 font-bold">{validos.length}</p></div>
            <div className="tarjeta p-4"><p className="text-pequeno text-texto-2">Valor</p><p className="text-h1 font-bold">{dinero(total)}</p></div>
            <div className="tarjeta col-span-2 p-4 sm:col-span-1"><p className="text-pequeno text-texto-2">Por WhatsApp</p><p className="text-h1 font-bold">{validos.filter((p) => p.origen === 'whatsapp').length}</p></div>
          </div>
          <div className="tarjeta overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-pequeno">
              <thead className="border-b border-borde bg-pagina text-texto-2">
                <tr>
                  {['#', 'Pedido', 'Platos', 'Hora', 'Estado', 'Valor', ''].map((h, i) => (
                    <th key={i} className={`px-4 py-3 font-semibold ${h === 'Valor' ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {data.map((p) => (
                  <tr key={p.id} className="cursor-pointer hover:bg-pagina" onClick={() => setDetalle(p.id)} title="Ver detalle e historial">
                    <td className="px-4 py-3 text-texto-2">{p.id}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{p.etiqueta}</p>
                      <p className="text-etiqueta text-texto-2">{p.creado_por_nombre} · {p.origen === 'whatsapp' ? 'WhatsApp' : p.tipo_nombre}</p>
                    </td>
                    <td className="max-w-xs px-4 py-3">{p.items.map((i) => `${i.cantidad} × ${i.plato_nombre}`).join(', ')}</td>
                    <td className="px-4 py-3 whitespace-nowrap" title={hace(p.creado, ahora)}>{hora(p.creado)}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-etiqueta font-semibold whitespace-nowrap ${COLOR[p.estado]}`}>{p.estado_nombre}</span></td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{dinero(p.total)}</td>
                    <td className="px-4 py-3 text-right">
                      {['recibido', 'en_preparacion', 'listo'].includes(p.estado) && (
                        <Boton variante="fantasma" tamano="sm" onClick={(e) => { e.stopPropagation(); confirm(`¿Cancelar el pedido #${p.id}?`) && cancelar.mutate(p.id) }}>Cancelar</Boton>
                      )}
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-texto-2">No hay pedidos en esta vista.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      <DetallePedidoModal id={detalle} onCerrar={() => setDetalle(null)} ahora={ahora} />
    </div>
  )
}

function DetallePedidoModal({ id, onCerrar, ahora }) {
  const { data: p, isLoading } = useQuery({
    queryKey: ['pedidos', 'detalle', String(id)],
    queryFn: () => obtener(`/pedidos/${id}/`),
    enabled: !!id,
  })
  return (
    <Modal abierto={!!id} onCerrar={onCerrar} ancho="max-w-2xl" titulo={p ? `Pedido #${p.id} · ${p.etiqueta}` : 'Pedido'}>
      {isLoading || !p ? (
        <Cargando />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-pequeno text-texto-2">
              <EstadoPedido pedido={p} />
              <span>{p.origen === 'whatsapp' ? 'WhatsApp' : p.tipo_nombre} · {p.creado_por_nombre}</span>
            </div>
            <ItemsPedido pedido={p} />
            {p.nota && <p className="rounded-lg bg-pagina px-3 py-2 text-pequeno">Nota: {p.nota}</p>}
          </div>
          <div>
            <h3 className="mb-3 text-cuerpo">Registro de actualizaciones</h3>
            <HistorialPedido eventos={p.eventos} ahora={ahora} />
          </div>
        </div>
      )}
    </Modal>
  )
}
