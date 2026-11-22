import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, X } from 'lucide-react'
import { ESTADOS } from '../lib/formato'

/* Componentes base del sistema de diseño de CartaSync (sección "Componentes" de Figma). */

const VARIANTES = {
  primario: 'bg-marca text-white hover:bg-marca-oscuro disabled:bg-borde-fuerte',
  oscuro: 'bg-texto text-white hover:bg-black disabled:bg-borde-fuerte',
  acento: 'bg-acento text-white hover:brightness-95 disabled:bg-borde-fuerte',
  secundario:
    'bg-superficie text-texto border border-borde-fuerte hover:bg-pagina disabled:text-tenue disabled:bg-pagina',
  peligro: 'bg-superficie text-agotado border border-agotado/40 hover:bg-agotado-fondo',
  fantasma: 'text-texto-2 hover:bg-pagina hover:text-texto',
}
const TAMANOS = {
  sm: 'h-9 px-3 text-pequeno gap-1.5 rounded-lg',
  md: 'h-11 px-4 text-cuerpo gap-2 rounded-lg',
  lg: 'h-14 px-5 text-cocina gap-2 rounded-xl',
}

export function Boton({ variante = 'primario', tamano = 'md', cargando, className = '', children, ...props }) {
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center justify-center font-semibold transition-colors ${VARIANTES[variante]} ${TAMANOS[tamano]} ${className}`}
      disabled={cargando || props.disabled}
      {...props}
    >
      {cargando && <LoaderCircle size={18} className="animate-spin" />}
      {children}
    </button>
  )
}

const ESTILO_ESTADO = {
  disponible: 'bg-disponible-fondo text-disponible',
  por_agotarse: 'bg-por-agotarse-fondo text-por-agotarse-texto',
  agotado: 'bg-agotado-fondo text-agotado',
}
const PUNTO = { disponible: 'bg-disponible', por_agotarse: 'bg-por-agotarse', agotado: 'bg-agotado' }

/** Etiqueta de estado del plato. */
export function EstadoBadge({ estado, texto, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-etiqueta font-semibold ${ESTILO_ESTADO[estado]} ${className}`}
    >
      <span className={`size-2 rounded-full ${PUNTO[estado]}`} />
      {texto ?? ESTADOS[estado]?.nombre}
    </span>
  )
}

const ACTIVO = {
  disponible: 'bg-disponible text-white border-disponible',
  por_agotarse: 'bg-por-agotarse text-texto border-por-agotarse',
  agotado: 'bg-agotado text-white border-agotado',
}

/** Selector de estado con botones grandes para la cocina: un toque cambia el estado. */
export function SelectorEstado({ estado, onCambiar, cargando, grande = true }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Estado del plato">
      {Object.entries(ESTADOS).map(([clave, { nombre }]) => {
        const activo = clave === estado
        return (
          <button
            key={clave}
            type="button"
            role="radio"
            aria-checked={activo}
            disabled={cargando}
            onClick={() => !activo && onCambiar(clave)}
            className={`rounded-lg border-2 px-1 font-semibold leading-tight transition-colors ${
              grande ? 'min-h-14 text-pequeno sm:text-cuerpo' : 'min-h-10 text-etiqueta'
            } ${activo ? ACTIVO[clave] : 'border-borde bg-superficie text-texto-2 hover:border-borde-fuerte hover:text-texto'}`}
          >
            {nombre}
          </button>
        )
      })}
    </div>
  )
}

/** Barra de porciones: "Quedan 14 de 20 porciones". */
export function BarraPorciones({ restantes, preparadas, estado }) {
  if (restantes == null || !preparadas) {
    return <p className="text-pequeno text-tenue">Sin conteo de porciones</p>
  }
  const pct = Math.min(100, Math.round((restantes / preparadas) * 100))
  return (
    <div>
      <p className="mb-1.5 text-pequeno text-texto-2">
        {restantes === 0 ? 'Sin porciones disponibles' : `Quedan ${restantes} de ${preparadas} porciones`}
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-pagina">
        <div className={`h-full rounded-full ${PUNTO[estado]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** Chip de filtro. */
export function Chip({ activo, children, className = '', ...props }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-pequeno font-medium transition-colors ${
        activo ? 'border-marca bg-marca text-white' : 'border-borde-fuerte bg-superficie text-texto hover:bg-pagina'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function Modal({ abierto, onCerrar, titulo, children, pie, ancho = 'max-w-lg' }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!abierto) return
    const esc = (e) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', esc)
    ref.current?.querySelector('input, select, textarea, button')?.focus()
    return () => window.removeEventListener('keydown', esc)
  }, [abierto, onCerrar])
  if (!abierto) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-texto/40 p-0 sm:items-center sm:p-4" onMouseDown={onCerrar}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onMouseDown={(e) => e.stopPropagation()}
        className={`animate-entrar flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-superficie shadow-xl sm:rounded-2xl ${ancho}`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-borde px-5 py-4">
          <h3>{titulo}</h3>
          <button type="button" onClick={onCerrar} className="rounded-lg p-1.5 text-texto-2 hover:bg-pagina" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {pie && <div className="flex justify-end gap-2 border-t border-borde px-5 py-3">{pie}</div>}
      </div>
    </div>
  )
}

export function Logo({ etiqueta, subtitulo, claro }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`grid size-9 shrink-0 place-items-center rounded-lg text-pequeno font-bold ${claro ? 'bg-white text-marca' : 'bg-marca text-white'}`}>
        CS
      </span>
      <div className="min-w-0 leading-tight">
        <p className="font-bold">CartaSync</p>
        {subtitulo && <p className="truncate text-etiqueta text-texto-2">{subtitulo}</p>}
      </div>
      {etiqueta && (
        <span className="rounded-full bg-marca-suave px-2.5 py-0.5 text-etiqueta font-semibold text-marca">{etiqueta}</span>
      )}
    </div>
  )
}

export function Cargando({ texto = 'Cargando…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-texto-2">
      <LoaderCircle className="animate-spin" size={20} /> {texto}
    </div>
  )
}

export function Vacio({ icono: Icono, titulo, texto, children }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {Icono && <Icono size={32} className="mb-3 text-tenue" />}
      <p className="font-semibold">{titulo}</p>
      {texto && <p className="mt-1 max-w-sm text-pequeno text-texto-2">{texto}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

export function ErrorCarga({ error, reintentar }) {
  return (
    <div className="tarjeta m-4 p-6 text-center">
      <p className="font-semibold text-agotado">No se pudo cargar la información</p>
      <p className="mt-1 text-pequeno text-texto-2">{error?.message}</p>
      {reintentar && (
        <Boton variante="secundario" tamano="sm" className="mt-3" onClick={reintentar}>
          Reintentar
        </Boton>
      )}
    </div>
  )
}

export function Campo({ etiqueta, error, ayuda, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {etiqueta && <span className="etiqueta-campo">{etiqueta}</span>}
      {children}
      {ayuda && !error && <span className="mt-1 block text-etiqueta text-texto-2">{ayuda}</span>}
      {error && <span className="mt-1 block text-etiqueta font-medium text-agotado">{error}</span>}
    </label>
  )
}

/** Fuerza un re-render periódico para que los "hace X min" se mantengan al día. */
export function useAhora(ms = 30000) {
  const [ahora, setAhora] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return ahora
}

export function Indicador({ conectado }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-pequeno font-medium ${conectado ? 'text-disponible' : 'text-agotado'}`}>
      <span className={`size-2 rounded-full ${conectado ? 'bg-disponible' : 'animate-pulse bg-agotado'}`} />
      {conectado ? 'En línea' : 'Reconectando…'}
    </span>
  )
}

export function Foto({ src, alt, className = '' }) {
  if (!src) {
    return (
      <div className={`grid place-items-center bg-marca-suave text-marca ${className}`} aria-hidden="true">
        <svg viewBox="0 0 24 24" className="size-1/2 max-h-8 max-w-8 opacity-60" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 11h18M5 11a7 7 0 0 1 14 0M12 4V3M4 15h16l-1 3H5z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )
  }
  return <img src={src} alt={alt} className={`object-cover ${className}`} loading="lazy" />
}
