import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRightLeft, Ban, History, MessageSquare, Plus, TriangleAlert } from 'lucide-react'
import { EncabezadoMovil } from '../../components/Layouts'
import {
  EstadoPedido, HistorialPedido, ItemsPedido, PasosPedido, SelectorMesa, VentanaMensaje,
} from '../../components/Pedido'
import { Boton, Cargando, Chip, ErrorCarga, Modal, useAhora } from '../../components/ui'
import { obtener } from '../../lib/api'
import { hace, hora } from '../../lib/formato'
import { MENSAJES_SALA, useAccionPedido } from '../../lib/pedidos'
import { useSesion } from '../../lib/sesion'

const MOTIVOS = ['El cliente se fue', 'Se tomó mal el pedido', 'El cliente cambió de opinión']

/** Mesero — un pedido: estado, avance de cocina, acciones y registro de actualizaciones. */
export default function DetallePedido() {
  const { id } = useParams()
  const nav = useNavigate()
  const ahora = useAhora()
  const { usuario } = useSesion()
  const [mesaAbierta, setMesaAbierta] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [mensajeAbierto, setMensajeAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')

  const { data: p, isLoading, error, refetch } = useQuery({
    queryKey: ['pedidos', 'detalle', id],
    queryFn: () => obtener(`/pedidos/${id}/`),
  })

  const servir = useAccionPedido('avanzar', (d) => ['Pedido servido', 'exito', d.etiqueta])
  const quitar = useAccionPedido('quitar', (d) =>
    ['Plato quitado', 'exito', d.estado === 'listo' ? 'El resto del pedido ya está listo.' : 'Se avisó a cocina.'])
  const reemplazar = useAccionPedido('reemplazar', () => ['Plato cambiado', 'exito', 'La cocina ya ve el nuevo plato.'])
  const mover = useAccionPedido('mover', (d) => ['Pedido cambiado de mesa', 'exito', `Ahora está en ${d.etiqueta}.`])
  const cancelar = useAccionPedido('cancelar', () => ['Pedido cancelado', 'exito', 'Se avisó a cocina.'])
  const mensaje = useAccionPedido('mensaje', () => ['Mensaje enviado a cocina', 'exito'])

  if (isLoading) return <Cargando />
  if (error) return <ErrorCarga error={error} reintentar={refetch} />

  const enCurso = ['recibido', 'en_preparacion'].includes(p.estado)
  const activo = enCurso || p.estado === 'listo'
  const conMesa = ['mesa', 'mostrador'].includes(p.tipo)
  const puedeCancelar = p.estado === 'recibido' && p.creado_por === usuario.id
  const volver = p.mesa && p.estado !== 'cancelado' ? `/mesero/mesa/${p.mesa}` : '/mesero/pedidos'
  const ocupado = quitar.isPending || reemplazar.isPending

  return (
    <>
      <EncabezadoMovil
        titulo={`${p.etiqueta} · Pedido #${p.id}`}
        subtitulo={`${p.creado_por_nombre ?? ''} · enviado a las ${hora(p.creado)} · ${hace(p.creado, ahora)}`}
        atras={volver}
        derecha={<EstadoPedido pedido={p} />}
      />
      <div className="space-y-4 p-4 pb-40">
        {p.avance.problemas > 0 && (
          <div role="alert" className="flex gap-3 rounded-xl bg-agotado px-4 py-3 text-white">
            <TriangleAlert size={20} className="mt-0.5 shrink-0" />
            <p className="text-pequeno">
              <strong>La cocina no puede preparar un plato.</strong> Habla con el cliente y cámbialo o quítalo abajo; la cocina
              espera tu respuesta para terminar el pedido.
            </p>
          </div>
        )}

        <PasosPedido pedido={p} />

        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-cuerpo">Platos</h3>
            {p.estado === 'recibido' && <span className="text-right text-etiqueta text-texto-2">Puedes quitar platos hasta que la cocina empiece</span>}
          </div>
          <ItemsPedido
            pedido={p}
            ocupado={ocupado}
            puedeQuitar={() => p.estado === 'recibido'}
            onQuitar={enCurso ? (i) => quitar.mutate({ id: p.id, item: i.id }) : null}
            onReemplazar={enCurso ? (i) => reemplazar.mutate({ id: p.id, item: i.id, plato: i.alternativo.id }) : null}
          />
          {p.nota && <p className="mt-2 rounded-lg bg-superficie px-4 py-2 text-pequeno text-texto-2">Nota: {p.nota}</p>}
        </section>

        <div className="flex flex-wrap gap-2">
          {activo && (
            <Boton variante="secundario" tamano="sm" onClick={() => setMensajeAbierto(true)}>
              <MessageSquare size={16} /> Mensaje a cocina
            </Boton>
          )}
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

        <section className="tarjeta p-4">
          <h3 className="mb-3 flex items-center gap-2 text-cuerpo">
            <History size={18} className="text-marca" /> Registro de actualizaciones
          </h3>
          <HistorialPedido eventos={p.eventos} ahora={ahora} />
        </section>
      </div>

      {activo && (
        <footer className="fixed inset-x-0 bottom-16 z-20 mx-auto flex max-w-md gap-2 border-t border-borde bg-superficie px-4 py-3">
          {enCurso && (
            <Boton variante="secundario" className="flex-1" onClick={() => nav(`/mesero/pedido/${p.id}/agregar`)}>
              <Plus size={18} /> Agregar platos
            </Boton>
          )}
          {p.estado === 'listo' && (
            <Boton variante="oscuro" className="flex-1" cargando={servir.isPending} onClick={() => servir.mutate({ id: p.id })}>
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
          if (m.id !== p.mesa) mover.mutate({ id: p.id, mesa: m.id })
        }}
      />

      <VentanaMensaje
        pedido={p}
        abierto={mensajeAbierto}
        para="cocina"
        sugerencias={MENSAJES_SALA}
        enviando={mensaje.isPending}
        onCerrar={() => setMensajeAbierto(false)}
        onEnviar={(texto) => {
          mensaje.mutate({ id: p.id, texto })
          setMensajeAbierto(false)
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
                cancelar.mutate({ id: p.id, motivo })
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
