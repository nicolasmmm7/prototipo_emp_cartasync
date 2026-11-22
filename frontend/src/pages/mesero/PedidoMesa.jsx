import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { EncabezadoMovil } from '../../components/Layouts'
import { Boton, Cargando, ErrorCarga, Vacio, useAhora } from '../../components/ui'
import { api, mensajeError, obtener } from '../../lib/api'
import { useAvisar } from '../../lib/avisos'
import { dinero, hace, hora } from '../../lib/formato'

const PASOS = [
  { estado: 'recibido', texto: 'Recibido por cocina', campo: 'creado' },
  { estado: 'en_preparacion', texto: 'En preparación', campo: 'en_preparacion_desde', prefijo: 'Desde las' },
  { estado: 'listo', texto: 'Listo para servir', campo: 'listo_desde', pendiente: 'Te avisaremos aquí' },
]
const ORDEN = ['recibido', 'en_preparacion', 'listo', 'entregado']

/** 2B · Mesero — estado del pedido de una mesa. */
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
      avisar('Mesa servida', 'exito')
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
  const total = ordenados.reduce((s, p) => s + p.total, 0)
  const listo = ordenados.find((p) => p.estado === 'listo')
  const todoServido = ordenados.length > 0 && ordenados.every((p) => p.estado === 'entregado' || p.estado === 'cancelado')
  const ultimo = ordenados.at(-1)

  return (
    <>
      <EncabezadoMovil
        titulo={`Mesa ${mesa?.numero ?? ''}${ultimo ? ` · Pedido #${ultimo.id}` : ''}`}
        subtitulo={ultimo ? `Enviado a las ${hora(ultimo.creado)} · ${hace(ultimo.creado, ahora)}` : ''}
        atras="/mesero"
      />
      <div className="space-y-4 p-4 pb-36">
        {ordenados.length === 0 && (
          <div className="tarjeta">
            <Vacio titulo="Esta mesa no tiene pedidos" texto="Toma el pedido para enviarlo a cocina." />
          </div>
        )}
        {ordenados.map((p) => {
          const paso = ORDEN.indexOf(p.estado)
          return (
            <section key={p.id} className="space-y-3">
              {ordenados.length > 1 && <p className="text-pequeno font-semibold text-texto-2">Pedido #{p.id}</p>}
              {p.estado === 'entregado' ? (
                <p className="rounded-xl bg-disponible-fondo px-4 py-3 text-pequeno font-semibold text-disponible">
                  Servido a las {hora(p.entregado_desde)}
                </p>
              ) : (
                <ol className="tarjeta space-y-0 p-4">
                  {PASOS.map((s, i) => {
                    const hecho = paso > i || (paso === i && i === 0)
                    const actual = paso === i && i > 0
                    return (
                      <li key={s.estado} className="relative flex gap-3 pb-4 last:pb-0">
                        {i < PASOS.length - 1 && (
                          <span className={`absolute top-7 left-[13px] h-[calc(100%-24px)] w-0.5 ${paso > i ? 'bg-texto' : 'bg-borde'}`} />
                        )}
                        <span
                          className={`relative z-10 grid size-7 shrink-0 place-items-center rounded-full border-2 ${
                            hecho ? 'border-texto bg-texto text-white' : actual ? 'border-texto bg-superficie' : 'border-dashed border-borde-fuerte bg-superficie'
                          }`}
                        >
                          {hecho ? <Check size={14} strokeWidth={3} /> : actual ? <span className="size-2.5 rounded-full bg-texto" /> : null}
                        </span>
                        <div>
                          <p className={`font-semibold ${!hecho && !actual ? 'text-tenue' : ''}`}>{s.texto}</p>
                          <p className="text-pequeno text-texto-2">
                            {p[s.campo] ? `${s.prefijo ?? ''} ${hora(p[s.campo])}`.trim() : s.pendiente ?? ''}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
              <ul className="tarjeta divide-y divide-borde">
                {p.items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="font-medium">
                        {i.plato_nombre} × {i.cantidad}
                      </p>
                      {i.nota && <p className="text-pequeno text-texto-2">{i.nota}</p>}
                    </div>
                    <p className="font-semibold">{dinero(i.subtotal)}</p>
                  </li>
                ))}
              </ul>
              {p.nota && <p className="rounded-lg bg-superficie px-4 py-2 text-pequeno text-texto-2">Nota: {p.nota}</p>}
            </section>
          )
        })}
        {ordenados.length > 0 && (
          <div className="tarjeta flex justify-between px-4 py-3">
            <span className="text-h3 font-semibold">Total</span>
            <span className="text-h3 font-bold">{dinero(total)}</span>
          </div>
        )}
      </div>

      <footer className="fixed inset-x-0 bottom-16 z-20 mx-auto flex max-w-md gap-2 border-t border-borde bg-superficie px-4 py-3">
        <Boton variante="secundario" className="flex-1" onClick={() => nav(`/mesero/nuevo/mesa/${mesaId}`)}>
          Agregar platos
        </Boton>
        {todoServido ? (
          <Boton className="flex-1" cargando={liberar.isPending} onClick={() => liberar.mutate()}>
            Liberar mesa
          </Boton>
        ) : (
          <Boton
            variante="oscuro"
            className="flex-1"
            disabled={!listo}
            cargando={servir.isPending}
            onClick={() => listo && servir.mutate(listo.id)}
          >
            Marcar servido
          </Boton>
        )}
      </footer>
    </>
  )
}
