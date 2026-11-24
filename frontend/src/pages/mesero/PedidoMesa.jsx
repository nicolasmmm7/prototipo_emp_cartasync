import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Plus, Store } from 'lucide-react'
import { EncabezadoMovil } from '../../components/Layouts'
import { EstadoPedido } from '../../components/Pedido'
import { Boton, Cargando, ErrorCarga, Vacio, useAhora } from '../../components/ui'
import { api, mensajeError, obtener } from '../../lib/api'
import { useAvisar } from '../../lib/avisos'
import { dinero, hace, hora } from '../../lib/formato'

/** 2B · Mesero — la cuenta de una mesa: todos los pedidos anexados a ella. */
export default function PedidoMesa() {
  const { mesaId } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const avisar = useAvisar()
  const ahora = useAhora()
  const { data: mesa } = useQuery({ queryKey: ['mesas', mesaId], queryFn: () => obtener(`/mesas/${mesaId}/`) })
  const { data: pedidos, isLoading, error, refetch } = useQuery({
    queryKey: ['pedidos', 'mesa', mesaId],
    queryFn: () => obtener('/pedidos/', { mesa: mesaId }),
  })

  const servir = useMutation({
    mutationFn: (id) => api.post(`/pedidos/${id}/avanzar/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['mesas'] })
      avisar('Pedido servido', 'exito')
    },
    onError: (e) => avisar('No se pudo marcar', 'error', mensajeError(e)),
  })
  const liberar = useMutation({
    mutationFn: () => api.post(`/mesas/${mesaId}/liberar/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mesas'] })
      avisar(`Mesa ${mesa?.numero} libre`, 'exito')
      nav('/mesero')
    },
    onError: (e) => avisar('No se pudo liberar', 'error', mensajeError(e)),
  })

  if (isLoading) return <Cargando />
  if (error) return <ErrorCarga error={error} reintentar={refetch} />

  const ordenados = [...pedidos].sort((a, b) => new Date(a.creado) - new Date(b.creado))
  const validos = ordenados.filter((p) => p.estado !== 'cancelado')
  const total = validos.reduce((s, p) => s + p.total, 0)
  const todoServido = validos.length > 0 && validos.every((p) => p.estado === 'entregado')

  return (
    <>
      <EncabezadoMovil
        titulo={`Mesa ${mesa?.numero ?? ''}`}
        subtitulo={mesa?.abierta_desde ? `Cuenta abierta a las ${hora(mesa.abierta_desde)} · ${validos.length} pedido${validos.length === 1 ? '' : 's'}` : 'Sin cuenta abierta'}
        atras="/mesero"
      />
      <div className="space-y-3 p-4 pb-36">
        {ordenados.length === 0 && (
          <div className="tarjeta">
            <Vacio titulo="Esta mesa no tiene pedidos" texto="Toma el pedido para enviarlo a cocina." />
          </div>
        )}
        {ordenados.map((p) => (
          <article key={p.id} className={`tarjeta overflow-hidden ${p.estado === 'listo' ? 'border-2 border-disponible' : ''} ${p.estado === 'cancelado' ? 'opacity-60' : ''}`}>
            <button type="button" onClick={() => nav(`/mesero/pedido/${p.id}`)} className="flex w-full items-start gap-3 p-4 text-left hover:bg-pagina">
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">
                    Pedido #{p.id}
                    {p.tipo === 'mostrador' && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-pagina px-2 py-0.5 text-etiqueta font-medium text-texto-2">
                        <Store size={12} /> Caja
                      </span>
                    )}
                  </p>
                  <EstadoPedido pedido={p} />
                </div>
                <p className="text-pequeno text-texto-2">
                  {hora(p.creado)} · {hace(p.creado, ahora)} · {p.creado_por_nombre} · {dinero(p.total)}
                </p>
                <ul className="mt-2 space-y-0.5 text-pequeno">
                  {p.items.map((i) => (
                    <li key={i.id}>
                      {i.cantidad} × {i.plato_nombre}
                      {i.agregado && <span className="ml-1.5 text-etiqueta font-semibold text-acento">· agregado</span>}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-etiqueta font-semibold text-marca">Ver detalle y registro de actualizaciones</p>
              </div>
              <ChevronRight size={18} className="mt-1 shrink-0 text-tenue" />
            </button>
            {p.estado === 'listo' && (
              <div className="border-t border-borde px-4 py-3">
                <Boton variante="oscuro" className="w-full" cargando={servir.isPending && servir.variables === p.id} onClick={() => servir.mutate(p.id)}>
                  Marcar servido
                </Boton>
              </div>
            )}
          </article>
        ))}
        {validos.length > 0 && (
          <div className="tarjeta flex justify-between px-4 py-3">
            <span className="text-h3 font-semibold">Total de la cuenta</span>
            <span className="text-h3 font-bold">{dinero(total)}</span>
          </div>
        )}
      </div>

      <footer className="fixed inset-x-0 bottom-16 z-20 mx-auto flex max-w-md gap-2 border-t border-borde bg-superficie px-4 py-3">
        <Boton variante={todoServido ? 'secundario' : 'oscuro'} className="flex-1" onClick={() => nav(`/mesero/nuevo/mesa/${mesaId}`)}>
          <Plus size={18} /> Nuevo pedido
        </Boton>
        {todoServido && (
          <Boton className="flex-1" cargando={liberar.isPending} onClick={() => liberar.mutate()}>
            Cobrar y liberar
          </Boton>
        )}
      </footer>
    </>
  )
}
