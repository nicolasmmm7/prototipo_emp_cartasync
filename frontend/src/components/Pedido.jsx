import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlarmClock, ArrowRightLeft, Ban, Check, ChefHat, CircleCheck, CirclePlus, CircleMinus, MessageSquare, PackageCheck,
  PenLine, Replace, Sparkles, StickyNote, TriangleAlert,
} from 'lucide-react'
import { obtener } from '../lib/api'
import { dinero, hace, hora } from '../lib/formato'
import { Boton, Cargando, Modal } from './ui'

/* Piezas compartidas para mostrar un pedido en sala, caja, cocina y el panel del dueño. */

const COLOR_ESTADO = {
  recibido: 'bg-marca-suave text-marca',
  en_preparacion: 'bg-por-agotarse-fondo text-por-agotarse-texto',
  listo: 'bg-disponible text-white',
  entregado: 'bg-pagina text-texto-2 border border-borde',
  cancelado: 'bg-agotado-fondo text-agotado',
}

export function EstadoPedido({ pedido, className = '' }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-etiqueta font-semibold whitespace-nowrap ${COLOR_ESTADO[pedido.estado]} ${className}`}>
      {pedido.estado_nombre}
    </span>
  )
}

const PASOS = [
  { estado: 'recibido', texto: 'Recibido por cocina', campo: 'creado' },
  { estado: 'en_preparacion', texto: 'En preparación', campo: 'en_preparacion_desde', prefijo: 'Desde las' },
  { estado: 'listo', texto: 'Listo para servir', campo: 'listo_desde', pendiente: 'Te avisaremos aquí' },
  { estado: 'entregado', texto: 'Servido', campo: 'entregado_desde' },
]
const ORDEN = PASOS.map((p) => p.estado)

/** Línea de tiempo del estado: recibido → en preparación → listo → servido. */
export function PasosPedido({ pedido }) {
  if (pedido.estado === 'cancelado') {
    return <p className="rounded-xl bg-agotado-fondo px-4 py-3 font-semibold text-agotado">Pedido cancelado</p>
  }
  const paso = ORDEN.indexOf(pedido.estado)
  return (
    <ol className="tarjeta p-4">
      {PASOS.map((s, i) => {
        const hecho = paso > i || (paso === i && (i === 0 || i === PASOS.length - 1))
        const actual = paso === i && !hecho
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
                {pedido[s.campo] ? `${s.prefijo ?? ''} ${hora(pedido[s.campo])}`.trim() : (paso < i && s.pendiente) || ''}
              </p>
              {s.estado === 'en_preparacion' && actual && (
                <p className="text-pequeno font-semibold text-marca">
                  {pedido.avance.listos} de {pedido.avance.total} platos listos
                  {pedido.listo_estimado ? ` · sale aprox. ${hora(pedido.listo_estimado)}` : ''}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

const ICONO_EVENTO = {
  item: CircleCheck,
  problema: TriangleAlert,
  cambio: Replace,
  mensaje: MessageSquare,
  estimado: AlarmClock,
  creado: Sparkles,
  platos: CirclePlus,
  quitado: CircleMinus,
  mesa: ArrowRightLeft,
  estado: ChefHat,
  nota: StickyNote,
  cancelado: Ban,
}

/** Registro de actualizaciones del pedido: qué pasó, quién y cuándo. */
export function HistorialPedido({ eventos = [], ahora }) {
  if (!eventos.length) return <p className="text-pequeno text-texto-2">Sin actualizaciones registradas.</p>
  return (
    <ol className="space-y-0">
      {eventos.map((e, i) => {
        const I = e.texto.startsWith('Servido') ? PackageCheck : ICONO_EVENTO[e.tipo] || PenLine
        const ultimo = i === eventos.length - 1
        return (
          <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
            {!ultimo && <span className="absolute top-8 left-[15px] h-[calc(100%-28px)] w-px bg-borde" />}
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-full ${
                e.tipo === 'cancelado' || e.tipo === 'problema' ? 'bg-agotado-fondo text-agotado'
                  : e.tipo === 'mensaje' ? 'bg-acento-suave text-texto'
                  : ultimo ? 'bg-marca text-white' : 'bg-marca-suave text-marca'
              }`}
            >
              <I size={16} />
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-pequeno font-medium leading-snug">{e.texto}</p>
              <p className="text-etiqueta text-texto-2" title={hace(e.creado, ahora)}>
                {hora(e.creado)}
                {e.usuario_nombre ? ` · ${e.usuario_nombre}${e.usuario_rol ? ` (${e.usuario_rol.toLowerCase()})` : ''}` : ''}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Platos del pedido con su avance en cocina.
 * - puedeQuitar(item): si se muestra el botón de quitar.
 * - onReemplazar(item): para un plato que la cocina no puede preparar, lo cambia por su alternativo.
 */
export function ItemsPedido({ pedido, puedeQuitar, onQuitar, onReemplazar, ocupado }) {
  const enCocina = ['en_preparacion', 'listo'].includes(pedido.estado)
  return (
    <ul className="tarjeta divide-y divide-borde">
      {pedido.items.map((i) => {
        const problema = i.estado === 'problema'
        return (
          <li key={i.id} className={`px-4 py-3 ${problema ? 'bg-agotado-fondo' : ''}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className={`font-medium ${problema ? 'text-agotado line-through decoration-1' : ''}`}>
                  {i.plato_nombre} × {i.cantidad}
                  {i.agregado && (
                    <span className="ml-2 rounded-full bg-acento-suave px-2 py-0.5 text-etiqueta font-semibold text-texto no-underline">Agregado</span>
                  )}
                </p>
                {i.nota && <p className="text-pequeno text-texto-2">{i.nota}</p>}
                {enCocina && !problema && pedido.estado !== 'entregado' && (
                  <p className={`mt-0.5 flex items-center gap-1 text-etiqueta font-semibold ${i.estado === 'listo' ? 'text-disponible' : 'text-texto-2'}`}>
                    {i.estado === 'listo' ? <><Check size={13} strokeWidth={3} /> Listo{i.listo_en ? ` · ${hora(i.listo_en)}` : ''}</> : 'En preparación'}
                  </p>
                )}
                {problema && (
                  <p className="mt-0.5 text-pequeno font-semibold text-agotado">Cocina: {i.problema}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <p className={`font-semibold tabular-nums ${problema ? 'text-tenue line-through' : ''}`}>{dinero(i.subtotal)}</p>
                {onQuitar && puedeQuitar?.(i) && pedido.items.length > 1 && !problema && (
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => onQuitar(i)}
                    aria-label={`Quitar ${i.plato_nombre}`}
                    className="grid size-9 place-items-center rounded-lg border border-borde text-texto-2 hover:border-agotado hover:text-agotado"
                  >
                    <CircleMinus size={16} />
                  </button>
                )}
              </div>
            </div>
            {problema && (onReemplazar || onQuitar) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {onReemplazar && i.alternativo && (
                  <Boton tamano="sm" disabled={ocupado} onClick={() => onReemplazar(i)}>
                    Cambiar por {i.alternativo.nombre}
                  </Boton>
                )}
                {onQuitar && pedido.items.length > 1 && (
                  <Boton variante="secundario" tamano="sm" disabled={ocupado} onClick={() => onQuitar(i)}>
                    Quitar del pedido
                  </Boton>
                )}
              </div>
            )}
          </li>
        )
      })}
      <li className="flex justify-between px-4 py-3">
        <span className="font-semibold">Total</span>
        <span className="text-h3 font-bold tabular-nums">
          {dinero(pedido.total)}
        </span>
      </li>
    </ul>
  )
}

const ESTADO_MESA = {
  libre: { texto: 'Libre', clase: 'border-borde-fuerte' },
  en_cocina: { texto: 'En cocina', clase: 'border-marca bg-marca-suave' },
  listo: { texto: 'Listo', clase: 'border-disponible bg-disponible-fondo' },
  comiendo: { texto: 'Comiendo', clase: 'border-borde-fuerte bg-pagina' },
}

/** Ventana para elegir la mesa a la que se anexa un pedido. */
export function SelectorMesa({ abierto, onCerrar, onElegir, actual, titulo = 'Elige la mesa', extra }) {
  const { data: mesas, isLoading } = useQuery({ queryKey: ['mesas'], queryFn: () => obtener('/mesas/'), enabled: abierto })
  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={titulo}>
      {isLoading ? (
        <Cargando />
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {mesas?.map((m) => {
            const e = ESTADO_MESA[m.estado]
            const esActual = m.id === Number(actual)
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onElegir(m)}
                className={`flex flex-col items-start rounded-xl border-2 p-3 text-left ${e.clase} ${esActual ? 'ring-2 ring-marca ring-offset-2' : ''}`}
              >
                <span className="text-h3 font-semibold">Mesa {m.numero}</span>
                <span className="text-etiqueta text-texto-2">{esActual ? 'Actual' : e.texto}</span>
              </button>
            )
          })}
        </div>
      )}
      <p className="mt-3 text-etiqueta text-texto-2">Si la mesa ya tiene cuenta abierta, el pedido se suma a esa cuenta.</p>
      {extra}
    </Modal>
  )
}

/** Mensaje corto entre cocina y sala sobre un pedido (queda en el registro). */
export function VentanaMensaje({ pedido, abierto, onCerrar, para, sugerencias, onEnviar, enviando }) {
  const [texto, setTexto] = useState('')
  if (!pedido) return null
  const enviar = (t) => {
    const limpio = t.trim()
    if (!limpio) return
    onEnviar(limpio)
    setTexto('')
  }
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Mensaje a ${para} · ${pedido.etiqueta}`}
      pie={<Boton cargando={enviando} disabled={!texto.trim()} onClick={() => enviar(texto)}>Enviar</Boton>}
    >
      <p className="mb-3 text-pequeno text-texto-2">Un toque envía el mensaje. Queda en el registro del pedido #{pedido.id}.</p>
      <div className="mb-4 grid gap-2">
        {sugerencias.map((s) => (
          <button key={s} type="button" disabled={enviando} onClick={() => enviar(s)} className="rounded-lg border border-borde-fuerte px-3 py-2.5 text-left font-medium hover:border-marca hover:bg-marca-suave">
            {s}
          </button>
        ))}
      </div>
      <input className="campo" placeholder="O escribe otro mensaje" maxLength={150} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && enviar(texto)} />
    </Modal>
  )
}

/** Línea corta con el avance de cocina para las listas: problema, platos listos y hora estimada. */
export function AvancePedido({ p }) {
  if (p.avance?.problemas) {
    return (
      <p className="mt-1.5 flex items-center gap-1 text-pequeno font-semibold text-agotado">
        <TriangleAlert size={14} /> La cocina no puede preparar un plato: toca para resolver
      </p>
    )
  }
  if (p.estado !== 'en_preparacion') return null
  return (
    <p className="mt-1.5 text-pequeno font-medium text-marca">
      {p.avance.listos} de {p.avance.total} platos listos{p.listo_estimado ? ` · sale aprox. ${hora(p.listo_estimado)}` : ''}
    </p>
  )
}
