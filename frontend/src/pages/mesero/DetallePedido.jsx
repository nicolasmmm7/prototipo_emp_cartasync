import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRightLeft, Ban, History, Plus } from 'lucide-react'
import { EncabezadoMovil } from '../../components/Layouts'
import { EstadoPedido, HistorialPedido, ItemsPedido, PasosPedido, SelectorMesa } from '../../components/Pedido'
import { Boton, Cargando, Chip, ErrorCarga, Modal, useAhora } from '../../components/ui'
import { api, mensajeError, obtener } from '../../lib/api'
import { useAvisar } from '../../lib/avisos'
import { hace, hora } from '../../lib/formato'
import { useSesion } from '../../lib/sesion'

/** Acción sobre un pedido (servir, quitar, mover, cancelar) que actualiza el detalle y las listas. */
function useAccionPedido(id, nombre, exito) {
  const qc = useQueryClient()
  const avisar = useAvisar()
  return useMutation({
    mutationFn: (datos) => api.post(`/pedidos/${id}/${nombre}/`, datos).then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(['pedidos', 'detalle', id], data)
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['mesas'] })
      avisar(...exito(data))
    },
    onError: (e) => avisar('No se pudo actualizar el pedido', 'error', mensajeError(e)),
  })
}

const MOTIVOS = ['El cliente se fue', 'Se tomó mal el pedido', 'El cliente cambió de opinión']

/** Mesero — un pedido: estado, platos, acciones y registro de actualizaciones. */
export default function DetallePedido() {
  const { id } = useParams()
  const nav = useNavigate()
  const ahora = useAhora()
  const { usuario } = useSesion()
  const [mesaAbierta, setMesaAbierta] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')

  const { data: p, isLoading, error, refetch } = useQuery({
    queryKey: ['pedidos', 'detalle', id],
    queryFn: () => obtener(`/pedidos/${id}/`),
  })

  const servir = useAccionPedido(id, 'avanzar', (d) => ['Pedido servido', 'exito', d.etiqueta])
  const quitar = useAccionPedido(id, 'quitar', () => ['Plato quitado', 'exito', 'Las porciones volvieron a estar disponibles.'])
  const mover = useAccionPedido(id, 'mover', (d) => ['Pedido cambiado de mesa', 'exito', `Ahora está en ${d.etiqueta}.`])
  const cancelar = useAccionPedido(id, 'cancelar', () => ['Pedido cancelado', 'exito', 'Se avisó a cocina.'])

  if (isLoading) return <Cargando />
  if (error) return <ErrorCarga error={error} reintentar={refetch} />

  const enCurso = ['recibido', 'en_preparacion'].includes(p.estado)
  const conMesa = ['mesa', 'mostrador'].includes(p.tipo)
  const puedeCancelar = p.estado === 'recibido' && p.creado_por === usuario.id
  const volver = p.mesa && p.estado !== 'cancelado' ? `/mesero/mesa/${p.mesa}` : '/mesero/pedidos'

  return (
    <>
      <EncabezadoMovil
        titulo={`${p.etiqueta} · Pedido #${p.id}`}
        subtitulo={`${p.creado_por_nombre ?? ''} · enviado a las ${hora(p.creado)} · ${hace(p.creado, ahora)}`}
        atras={volver}
        derecha={<EstadoPedido pedido={p} />}
      />
      <div className="space-y-4 p-4 pb-40">
        <PasosPedido pedido={p} />

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-cuerpo">Platos</h3>
            {p.estado === 'recibido' && <span className="text-etiqueta text-texto-2">Puedes quitar platos hasta que la cocina empiece</span>}
          </div>
          <ItemsPedido
            pedido={p}
            quitando={quitar.isPending}
            onQuitar={p.estado === 'recibido' ? (i) => quitar.mutate({ item: i.id }) : null}
          />
          {p.nota && <p className="mt-2 rounded-lg bg-superficie px-4 py-2 text-pequeno text-texto-2">Nota: {p.nota}</p>}
        </section>

        {(conMesa && p.estado !== 'cancelado') || puedeCancelar ? (
          <div className="flex flex-wrap gap-2">
            {conMesa && p.estado !== 'cancelado' && (
              <Boton variante="secundario" tamano="sm" onClick={() => setMesaAbierta(true)}>
                <ArrowRightLeft size={16} /> Cambiar de mesa
              </Boton>
            )}
            {puedeCancelar && (
              <Boton variante="peligro" tamano="sm" onClick={() => setCancelando(true)}>
                <Ban size={16} /> Cancelar pedido
              </Boton>
            )}
          </div>
        ) : null}

        <section className="tarjeta p-4">
          <h3 className="mb-3 flex items-center gap-2 text-cuerpo">
            <History size={18} className="text-marca" /> Registro de actualizaciones
          </h3>
          <HistorialPedido eventos={p.eventos} ahora={ahora} />
        </section>
      </div>

      {(enCurso || p.estado === 'listo') && (
        <footer className="fixed inset-x-0 bottom-16 z-20 mx-auto flex max-w-md gap-2 border-t border-borde bg-superficie px-4 py-3">
          {enCurso && (
            <Boton variante="secundario" className="flex-1" onClick={() => nav(`/mesero/pedido/${p.id}/agregar`)}>
              <Plus size={18} /> Agregar platos
            </Boton>
          )}
          {p.estado === 'listo' && (
            <Boton variante="oscuro" className="flex-1" cargando={servir.isPending} onClick={() => servir.mutate()}>
              Marcar servido
            </Boton>
          )}
        </footer>
      )}

      <SelectorMesa
        abierto={mesaAbierta}
        actual={p.mesa}
        titulo={`Pasar el pedido #${p.id} a otra mesa`}
        onCerrar={() => setMesaAbierta(false)}
        onElegir={(m) => {
          setMesaAbierta(false)
          if (m.id !== p.mesa) mover.mutate({ mesa: m.id })
        }}
      />

      <Modal
        abierto={cancelando}
        onCerrar={() => setCancelando(false)}
        titulo={`Cancelar el pedido #${p.id}`}
        pie={
          <>
            <Boton variante="secundario" onClick={() => setCancelando(false)}>Volver</Boton>
            <Boton
              variante="peligro"
              cargando={cancelar.isPending}
              onClick={() => {
                cancelar.mutate({ motivo })
                setCancelando(false)
              }}
            >
              Cancelar pedido
            </Boton>
          </>
        }
      >
        <p className="mb-3 text-pequeno text-texto-2">La cocina aún no lo empieza. Las porciones vuelven a quedar disponibles.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {MOTIVOS.map((m) => (
            <Chip key={m} activo={motivo === m} onClick={() => setMotivo(m)}>{m}</Chip>
          ))}
        </div>
        <input className="campo" placeholder="Otro motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </Modal>
    </>
  )
}
