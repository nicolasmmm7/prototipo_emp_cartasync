import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { Radio, Star, UtensilsCrossed } from 'lucide-react'
import { Boton, Cargando, Chip, Foto, Modal, Vacio, useAhora } from '../../components/ui'
import { useAvisar } from '../../lib/avisos'
import { dinero, hace } from '../../lib/formato'
import { TiempoRealProvider, useTiempoReal } from '../../lib/tiempoReal'

/** 1C · Comensal — carta por código QR, actualizada en tiempo real. Sin sesión. */
export default function CartaQR() {
  const { slug } = useParams()
  return (
    <TiempoRealProvider slug={slug}>
      <Carta slug={slug} />
    </TiempoRealProvider>
  )
}

function Carta({ slug }) {
  const ahora = useAhora()
  const { conectado } = useTiempoReal()
  const [calificar, setCalificar] = useState(null)
  const [activa, setActiva] = useState(null)
  const { data, isLoading, error } = useQuery({
    queryKey: ['carta-publica', slug],
    queryFn: () => axios.get(`/api/publico/${slug}/carta/`).then((r) => r.data),
  })

  if (isLoading) return <Cargando texto="Cargando la carta…" />
  if (error) {
    return <Vacio icono={UtensilsCrossed} titulo="No encontramos esta carta" texto="Revisa el código QR o pregunta a tu mesero." />
  }

  const ir = (id) => {
    setActiva(id)
    document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="mx-auto min-h-screen max-w-md bg-superficie md:border-x md:border-borde">
      <header className="sticky top-0 z-10 border-b border-borde bg-superficie/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-marca text-h3 font-bold text-white">
            {data.restaurante.nombre.replace(/^Restaurante\s+/i, '').slice(0, 1)}
          </span>
          <div className="min-w-0">
            <h2 className="truncate">{data.restaurante.nombre}</h2>
            <p className="text-pequeno text-texto-2">
              Carta actualizada {hace(data.actualizado, ahora)} · {data.servicio}
            </p>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 pb-3">
          {data.categorias.map((c) => (
            <Chip key={c.id} activo={activa === c.id} onClick={() => ir(c.id)}>
              {c.nombre}
            </Chip>
          ))}
        </div>
      </header>

      {data.restaurante.menu_del_dia && (
        <div className="mx-4 mt-4 rounded-xl bg-marca-suave p-4">
          <p className="text-etiqueta font-semibold tracking-wide text-marca uppercase">Menú del día</p>
          <p className="mt-1 font-medium">{data.restaurante.menu_del_dia}</p>
        </div>
      )}

      <main className="px-4 pb-24">
        {data.categorias.map((c) => (
          <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-32 pt-5">
            <h3 className="mb-3">{c.nombre}</h3>
            <ul className="space-y-3">
              {c.platos.map((p) => {
                const agotado = p.estado === 'agotado'
                return (
                  <li key={p.id} className={`flex gap-3 rounded-xl p-2 transition-colors ${agotado ? 'bg-pagina' : ''}`}>
                    <Foto src={p.foto} alt={p.nombre} className={`size-20 shrink-0 rounded-lg ${agotado ? 'opacity-50 grayscale' : ''}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`font-semibold ${agotado ? 'text-tenue line-through' : ''}`}>{p.nombre}</p>
                        {agotado && (
                          <span className="rounded-full bg-texto px-2 py-0.5 text-etiqueta font-semibold text-white">Agotado hoy</span>
                        )}
                        {p.estado === 'por_agotarse' && (
                          <span className="rounded-full border border-dashed border-por-agotarse-texto px-2 py-0.5 text-etiqueta font-semibold text-por-agotarse-texto">
                            Últimas porciones
                          </span>
                        )}
                      </div>
                      {p.descripcion && <p className="mt-0.5 text-pequeno text-texto-2">{p.descripcion}</p>}
                      {p.cobra_aparte && <p className="text-pequeno text-texto-2 italic">{p.cobra_aparte}</p>}
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <p className={`font-bold ${agotado ? 'text-tenue' : ''}`}>{dinero(p.precio)}</p>
                        {!agotado && (
                          <button type="button" onClick={() => setCalificar(p)} className="flex items-center gap-1 text-pequeno text-texto-2 hover:text-texto">
                            <Star size={14} className={p.calificacion ? 'fill-por-agotarse text-por-agotarse' : ''} />
                            {p.calificacion ? p.calificacion.toFixed(1) : 'Calificar'}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </main>

      <footer className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md items-center gap-2 border-t border-borde bg-superficie px-4 py-3 text-pequeno text-texto-2">
        <Radio size={16} className={conectado ? 'text-disponible' : 'text-tenue'} />
        La disponibilidad se actualiza en tiempo real · Para pedir, llama a tu mesero
      </footer>

      <Calificar slug={slug} plato={calificar} onCerrar={() => setCalificar(null)} />
    </div>
  )
}

function Calificar({ slug, plato, onCerrar }) {
  const avisar = useAvisar()
  const [estrellas, setEstrellas] = useState(0)
  const [comentario, setComentario] = useState('')
  const enviar = useMutation({
    mutationFn: () => axios.post(`/api/publico/${slug}/calificar/`, { plato: plato.id, estrellas, comentario }),
    onSuccess: () => {
      avisar('Calificación enviada', 'exito', '¡Gracias por contarnos!')
      setEstrellas(0)
      setComentario('')
      onCerrar()
    },
    onError: () => avisar('No se pudo enviar', 'error'),
  })
  return (
    <Modal
      abierto={!!plato}
      onCerrar={onCerrar}
      titulo={`¿Qué tal ${plato?.nombre ?? ''}?`}
      pie={
        <Boton disabled={!estrellas} cargando={enviar.isPending} onClick={() => enviar.mutate()}>
          Enviar calificación
        </Boton>
      }
    >
      <div className="flex justify-center gap-2 py-2" role="radiogroup" aria-label="Estrellas">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={estrellas === n} aria-label={`${n} estrellas`} onClick={() => setEstrellas(n)} className="p-1">
            <Star size={36} className={n <= estrellas ? 'fill-por-agotarse text-por-agotarse' : 'text-borde-fuerte'} />
          </button>
        ))}
      </div>
      <textarea className="campo mt-3 min-h-20" placeholder="Comentario (opcional)" value={comentario} onChange={(e) => setComentario(e.target.value)} />
    </Modal>
  )
}
