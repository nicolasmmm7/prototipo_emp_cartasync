import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { ExternalLink, Lightbulb, RotateCcw, RotateCw } from 'lucide-react'
import { Boton, Logo } from '../components/ui'
import { useAvisar } from '../lib/avisos'
import { VISTAS_DEMO } from '../lib/demo'

/*
 * Modo demostración: varios roles a la vez, cada uno en un panel con su propia sesión.
 * Cada panel es un iframe con un nombre distinto; ese nombre separa su sesión (ver lib/api.js).
 */

const INICIAL = ['cocina', 'caja', 'mesero', 'comensal']

const PASOS = [
  'En Cocina, marca un plato como "Agotado": el mesero recibe el aviso y la carta QR lo tacha al instante.',
  'En el celular del mesero, toca una mesa libre y envía un pedido: aparece en Cocina como "Nuevo".',
  'En Cocina, ve a Pedidos y márcalo listo: la mesa se ilumina en el celular del mesero.',
  'En Caja, toca "Simular mensaje entrante" para un pedido de WhatsApp.',
]

export default function Demo() {
  const [vistas, setVistas] = useState(() => {
    try {
      const v = JSON.parse(sessionStorage.getItem('cartasync.demo.vistas'))
      return Array.isArray(v) && v.length === 4 && v.every((x) => VISTAS_DEMO[x]) ? v : INICIAL
    } catch {
      return INICIAL
    }
  })
  const [recarga, setRecarga] = useState(0)
  const [reiniciando, setReiniciando] = useState(false)
  const [guia, setGuia] = useState(true)
  const avisar = useAvisar()

  const cambiar = (i, v) => {
    const n = vistas.map((x, k) => (k === i ? v : x))
    setVistas(n)
    try {
      sessionStorage.setItem('cartasync.demo.vistas', JSON.stringify(n))
    } catch {
      /* no se recuerda la elección */
    }
  }

  const reiniciar = async () => {
    if (!confirm('¿Volver a cargar los datos de ejemplo? Se pierde lo que hayas hecho en la demostración.')) return
    setReiniciando(true)
    try {
      await axios.post('/api/demo/reiniciar/')
      setRecarga((r) => r + 1)
      avisar('Datos reiniciados', 'exito', 'Todos los paneles volvieron a entrar.')
    } catch {
      avisar('No se pudo reiniciar', 'error', 'El reinicio solo funciona con el servidor en modo de desarrollo.')
    } finally {
      setReiniciando(false)
    }
  }

  const panel = (i, tipo) => (
    <Panel key={i} nombre={`demo-${i}`} vista={vistas[i]} recarga={recarga} tipo={tipo} onCambiar={(v) => cambiar(i, v)} />
  )

  return (
    <div className="flex min-h-screen flex-col bg-texto/95 lg:h-screen">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 text-white">
        <Logo claro />
        <p className="text-pequeno font-semibold">Demostración en tiempo real</p>
        <p className="hidden text-pequeno text-white/70 xl:block">Cada panel tiene su propia sesión: lo que hagas en uno aparece en los demás.</p>
        <div className="ml-auto flex gap-2">
          <Boton variante="fantasma" tamano="sm" className="text-white/80 hover:bg-white/10 hover:text-white" onClick={() => setGuia((g) => !g)}>
            <Lightbulb size={16} /> {guia ? 'Ocultar guía' : 'Guía'}
          </Boton>
          <Boton variante="fantasma" tamano="sm" className="text-white/80 hover:bg-white/10 hover:text-white" cargando={reiniciando} onClick={reiniciar}>
            <RotateCcw size={16} /> Reiniciar datos
          </Boton>
          <Link to="/ingresar">
            <Boton variante="secundario" tamano="sm">Salir del modo demostración</Boton>
          </Link>
        </div>
      </header>

      {guia && (
        <ol className="mx-4 mb-2 grid gap-x-4 gap-y-1 rounded-xl bg-white/10 px-4 py-2.5 text-etiqueta text-white/90 md:grid-cols-2 2xl:grid-cols-4">
          {PASOS.map((p, i) => (
            <li key={i} className="flex gap-2">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-acento font-bold text-white">{i + 1}</span>
              {p}
            </li>
          ))}
        </ol>
      )}

      {/* Escritorio: dos paneles apilados a la izquierda y dos celulares a la derecha. */}
      <main className="grid min-h-0 flex-1 gap-3 px-4 pb-4 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="grid min-h-0 gap-3 lg:grid-rows-2">
          {panel(0, 'escritorio')}
          {panel(1, 'escritorio')}
        </div>
        {panel(2, 'celular')}
        {panel(3, 'celular')}
      </main>
    </div>
  )
}

function Panel({ nombre, vista, recarga, tipo, onCambiar }) {
  const v = VISTAS_DEMO[vista]
  const caja = useRef(null)
  const [medida, setMedida] = useState({ w: 0, h: 0 })
  const [propia, setPropia] = useState(0)

  useEffect(() => {
    const el = caja.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setMedida({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Se dibuja la vista a su ancho real (1280 en escritorio, 390 en celular) y se escala para que quepa.
  const escala = medida.w ? Math.min(1, medida.w / v.ancho) : 1
  const src = v.usuario ? `/ingresar?como=${v.usuario}&ir=${encodeURIComponent(v.ruta)}` : v.ruta
  const opciones = Object.entries(VISTAS_DEMO).filter(([, x]) => (tipo === 'celular' ? x.ancho < 600 : true))

  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden rounded-xl bg-superficie shadow-lg ${
        tipo === 'celular' ? 'h-[720px] lg:aspect-[390/900] lg:h-full' : 'h-[560px] lg:h-auto'
      }`}
    >
      <div className="flex items-center gap-2 border-b border-borde bg-pagina px-2 py-1.5">
        <v.icono size={16} className="shrink-0 text-marca" />
        <select
          aria-label="Vista del panel"
          className="min-w-0 flex-1 truncate rounded-md bg-transparent py-0.5 text-pequeno font-semibold focus:outline-none"
          value={vista}
          onChange={(e) => onCambiar(e.target.value)}
        >
          {opciones.map(([k, x]) => (
            <option key={k} value={k}>{x.texto}</option>
          ))}
        </select>
        <button type="button" title="Recargar panel" aria-label="Recargar panel" onClick={() => setPropia((p) => p + 1)} className="rounded p-1 text-texto-2 hover:bg-borde hover:text-texto">
          <RotateCw size={15} />
        </button>
        <a href={src} target="_blank" rel="noreferrer" title="Abrir en una pestaña" aria-label="Abrir en una pestaña" className="rounded p-1 text-texto-2 hover:bg-borde hover:text-texto">
          <ExternalLink size={15} />
        </a>
      </div>
      <div ref={caja} className="relative min-h-0 flex-1 overflow-hidden">
        {medida.w > 0 && (
          <iframe
            key={`${vista}-${recarga}-${propia}`}
            name={nombre}
            title={v.texto}
            src={src}
            className="absolute top-0 left-0 origin-top-left border-0"
            style={{ width: v.ancho, height: medida.h / escala, transform: `scale(${escala})` }}
          />
        )}
      </div>
    </section>
  )
}
