import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChefHat, Clock, MessageSquare, TriangleAlert, Undo2 } from 'lucide-react'
import { VentanaMensaje } from '../../components/Pedido'
import { Boton, Cargando, Chip, ErrorCarga, Modal, Vacio, useAhora } from '../../components/ui'
import { obtener } from '../../lib/api'
import { hace, hora } from '../../lib/formato'
import { MENSAJES_COCINA, useAccionPedido } from '../../lib/pedidos'

const COLUMNAS = [
  { estado: 'recibido', titulo: 'Nuevos' },
  { estado: 'en_preparacion', titulo: 'En preparación' },
  { estado: 'listo', titulo: 'Listos para servir' },
]
const MINUTOS = [5, 10, 15, 20]
const MOTIVOS = ['Se acabó', 'Falta un ingrediente', 'Se dañó o se quemó']

/**
 * 2C · Pedidos en cocina, con avance detallado: plato por plato, tiempo estimado,
 * platos que no se pueden preparar y mensajes a sala. Todo llega al mesero en vivo.
 */
export default function PedidosCocina() {
  const ahora = useAhora(20000)
  const [problema, setProblema] = useState(null) // { pedido, item }
  const [mensaje, setMensaje] = useState(null) // pedido
  const { data: pedidos, isLoading, error, refetch } = useQuery({
    queryKey: ['pedidos', 'activos'],
    queryFn: () => obtener('/pedidos/', { activos: 1 }),
  })

  const avanzar = useAccionPedido('avanzar', (p) =>
    p.estado === 'listo' ? [`${p.etiqueta} está listo`, 'exito', 'El mesero ya recibió el aviso.'] : null)
  const platoListo = useAccionPedido('plato_listo', (p) =>
    p.estado === 'listo' ? [`${p.etiqueta} está listo`, 'exito', 'Era el último plato: se avisó al mesero.'] : null)
  const estimado = useAccionPedido('estimado', (p) => ['Tiempo enviado a sala', 'exito', `${p.etiqueta} · sale aprox. ${hora(p.listo_estimado)}`])
  const regresar = useAccionPedido('regresar', (p) => ['Volvió a preparación', 'info', p.etiqueta])
  const reportar = useAccionPedido('problema', (p) => ['Se avisó a sala', 'info', `${p.etiqueta}: el mesero decidirá si lo cambia o lo quita.`])
  const enviarMensaje = useAccionPedido('mensaje', (p) => ['Mensaje enviado a sala', 'exito', p.etiqueta])

  if (isLoading) return <Cargando />
  if (error) return <ErrorCarga error={error} reintentar={refetch} />

  // Los más antiguos primero: se preparan en orden de llegada.
  const ordenados = [...pedidos].sort((a, b) => new Date(a.creado) - new Date(b.creado))

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-3">
        {COLUMNAS.map((col) => {
          const lista = ordenados.filter((p) => p.estado === col.estado)
          return (
            <section key={col.estado} className="min-w-0">
              <header className="mb-3 flex items-baseline justify-between">
                <h2>{col.titulo}</h2>
                <span className="text-pequeno text-texto-2">
                  {lista.length} pedido{lista.length === 1 ? '' : 's'}
                </span>
              </header>
              <div className="space-y-3">
                {lista.length === 0 && (
                  <div className="tarjeta border-dashed">
                    <Vacio icono={ChefHat} titulo="Sin pedidos" />
                  </div>
                )}
                {lista.map((p) => (
                  <TarjetaPedido
                    key={p.id}
                    p={p}
                    ahora={ahora}
                    ocupado={[avanzar, platoListo, estimado, regresar].some((m) => m.isPending && m.variables?.id === p.id)}
                    onAvanzar={() => avanzar.mutate({ id: p.id })}
                    onPlato={(i) => platoListo.mutate({ id: p.id, item: i.id, listo: i.estado !== 'listo' })}
                    onProblema={(i) => setProblema({ pedido: p, item: i })}
                    onEstimado={(m) => estimado.mutate({ id: p.id, minutos: m })}
                    onRegresar={() => regresar.mutate({ id: p.id })}
                    onMensaje={() => setMensaje(p)}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      <VentanaProblema
        key={problema ? `${problema.pedido.id}-${problema.item.id}` : 'cerrada'}
        datos={problema}
        enviando={reportar.isPending}
        onCerrar={() => setProblema(null)}
        onEnviar={(motivo, agotar) => {
          reportar.mutate({ id: problema.pedido.id, item: problema.item.id, motivo, agotar })
          setProblema(null)
        }}
      />
      <VentanaMensaje
        pedido={mensaje}
        abierto={!!mensaje}
        para="sala"
        sugerencias={MENSAJES_COCINA}
        enviando={enviarMensaje.isPending}
        onCerrar={() => setMensaje(null)}
        onEnviar={(texto) => {
          enviarMensaje.mutate({ id: mensaje.id, texto })
          setMensaje(null)
        }}
      />
    </>
  )
}

function TarjetaPedido({ p, ahora, ocupado, onAvanzar, onPlato, onProblema, onEstimado, onRegresar, onMensaje }) {
  const enCocina = p.estado === 'recibido' || p.estado === 'en_preparacion'
  const atrasado = p.listo_estimado && new Date(p.listo_estimado) < ahora && enCocina
  const conProblema = p.avance.problemas > 0
  const pct = p.avance.total ? Math.round((100 * p.avance.listos) / p.avance.total) : 0

  return (
    <article className={`tarjeta animate-entrar p-4 ${p.estado === 'recibido' ? 'border-2 border-texto' : ''} ${conProblema ? 'border-2 border-agotado' : ''}`}>
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3>{p.etiqueta}</h3>
          <p className="text-pequeno text-texto-2">
            #{p.id} · {hace(p.creado, ahora)} · {p.creado_por_nombre}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-full border border-borde-fuerte px-2.5 py-0.5 text-etiqueta font-semibold">
            {p.origen === 'whatsapp' ? 'WhatsApp' : p.tipo_nombre}
          </span>
          {p.listo_estimado && enCocina && (
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-etiqueta font-semibold ${atrasado ? 'bg-agotado-fondo text-agotado' : 'bg-marca-suave text-marca'}`}>
              <Clock size={12} /> {atrasado ? 'Atrasado · ' : 'Sale '}{hora(p.listo_estimado)}
            </span>
          )}
        </div>
      </header>

      {/* Platos: en cocina, un toque marca cada plato listo. */}
      <ul className="my-3 space-y-1.5">
        {p.items.map((i) => {
          const listo = i.estado === 'listo'
          if (i.estado === 'problema') {
            return (
              <li key={i.id} className="rounded-lg bg-agotado-fondo px-3 py-2">
                <p className="font-semibold text-agotado line-through decoration-1">
                  {i.cantidad} × {i.plato_nombre}
                </p>
                <p className="flex items-center gap-1 text-pequeno text-agotado">
                  <TriangleAlert size={14} /> {i.problema} · esperando a sala
                </p>
              </li>
            )
          }
          return (
            <li key={i.id} className="flex items-stretch gap-1.5">
              <button
                type="button"
                disabled={!enCocina || ocupado}
                onClick={() => onPlato(i)}
                aria-pressed={listo}
                className={`flex min-h-12 flex-1 items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                  listo ? 'border-disponible bg-disponible-fondo' : 'border-borde hover:border-borde-fuerte'
                } disabled:cursor-default`}
              >
                <span className={`grid size-7 shrink-0 place-items-center rounded-md border-2 ${listo ? 'border-disponible bg-disponible text-white' : 'border-borde-fuerte'}`}>
                  {listo && <Check size={16} strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <span className={`font-semibold ${listo ? 'text-texto-2' : ''}`}>{i.cantidad} ×</span> {i.plato_nombre}
                  {i.agregado && <span className="ml-2 rounded-full bg-acento px-2 py-0.5 text-etiqueta font-semibold text-white">Agregado</span>}
                  {i.nota && <span className="block text-pequeno text-texto-2">↳ {i.nota}</span>}
                </span>
              </button>
              {enCocina && !listo && (
                <button
                  type="button"
                  onClick={() => onProblema(i)}
                  title="No se puede preparar"
                  aria-label={`No se puede preparar ${i.plato_nombre}`}
                  className="grid w-11 shrink-0 place-items-center rounded-lg border border-borde text-texto-2 hover:border-agotado hover:bg-agotado-fondo hover:text-agotado"
                >
                  <TriangleAlert size={18} />
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {p.nota && <p className="mb-3 rounded-lg bg-pagina px-3 py-2 text-pequeno">Nota: {p.nota}</p>}

      {enCocina && (
        <>
          <div className="mb-3">
            <div className="mb-1 flex justify-between text-etiqueta text-texto-2">
              <span>{p.avance.listos} de {p.avance.total} platos listos</span>
              {conProblema && <span className="font-semibold text-agotado">{p.avance.problemas} con problema</span>}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-pagina">
              <div className="h-full rounded-full bg-disponible transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 flex items-center gap-1 text-pequeno text-texto-2" title="¿Cuánto falta para que esté listo?"><Clock size={14} /> Sale en</span>
            {MINUTOS.map((m) => (
              <Chip key={m} className="h-8 px-2.5" onClick={() => onEstimado(m)} disabled={ocupado} aria-label={`Sale en ${m} minutos`}>{m}′</Chip>
            ))}
          </div>
        </>
      )}

      {p.estado === 'recibido' && (
        <Boton variante="oscuro" tamano="lg" className="w-full" cargando={ocupado} onClick={onAvanzar}>
          Empezar a preparar
        </Boton>
      )}
      {p.estado === 'en_preparacion' && (
        <Boton tamano="lg" className="w-full" cargando={ocupado} disabled={conProblema} onClick={onAvanzar}
          title={conProblema ? 'Primero sala debe resolver el plato con problema' : undefined}>
          Marcar todo listo
        </Boton>
      )}
      {p.estado === 'listo' && (
        <p className="rounded-lg bg-disponible-fondo px-3 py-2 text-center text-pequeno font-semibold text-disponible">
          Esperando que lo recojan · {hace(p.listo_desde, ahora)}
        </p>
      )}

      <div className="mt-2 flex justify-between gap-2">
        <Boton variante="fantasma" tamano="sm" onClick={onMensaje}>
          <MessageSquare size={16} /> Mensaje a sala
        </Boton>
        {p.estado === 'listo' && (
          <Boton variante="fantasma" tamano="sm" cargando={ocupado} onClick={onRegresar}>
            <Undo2 size={16} /> Devolver a preparación
          </Boton>
        )}
      </div>
    </article>
  )
}

function VentanaProblema({ datos, onCerrar, onEnviar, enviando }) {
  const [motivo, setMotivo] = useState('Se acabó')
  const [agotar, setAgotar] = useState(true)
  if (!datos) return null
  const { item } = datos
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`No se puede preparar: ${item.plato_nombre}`}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>Volver</Boton>
          <Boton variante="peligro" cargando={enviando} disabled={!motivo.trim()} onClick={() => onEnviar(motivo.trim(), agotar)}>
            Avisar a sala
          </Boton>
        </>
      }
    >
      <p className="mb-3 text-pequeno text-texto-2">
        El mesero recibe el aviso al instante y decide con el cliente si lo cambia
        {item.alternativo ? ` (por ejemplo, por ${item.alternativo.nombre})` : ''} o lo quita.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {MOTIVOS.map((m) => (
          <Chip key={m} activo={motivo === m} onClick={() => { setMotivo(m); setAgotar(m === 'Se acabó') }}>{m}</Chip>
        ))}
      </div>
      <input className="campo" placeholder="Otro motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      <label className="mt-4 flex items-center gap-3 text-pequeno">
        <input type="checkbox" className="size-5 accent-marca" checked={agotar} onChange={(e) => setAgotar(e.target.checked)} />
        Marcar también {item.plato_nombre} como agotado en la carta
      </label>
    </Modal>
  )
}
