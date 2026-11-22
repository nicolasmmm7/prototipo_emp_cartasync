import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BellRing, Megaphone, OctagonX, TriangleAlert } from 'lucide-react'
import { EncabezadoMovil } from '../../components/Layouts'
import { Cargando, ErrorCarga, Vacio, useAhora } from '../../components/ui'
import { obtener } from '../../lib/api'
import { dinero, hace } from '../../lib/formato'

/** 2E · Mesero — avisos: qué está listo, qué dejar de ofrecer y qué promocionar. */
export default function Avisos() {
  const nav = useNavigate()
  const ahora = useAhora()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['avisos'], queryFn: () => obtener('/avisos/') })

  if (isLoading) return <Cargando />
  if (error) return <ErrorCarga error={error} reintentar={refetch} />

  const vacio = !data.listos.length && !data.agotados.length && !data.por_agotarse.length && !data.promocionar.length

  return (
    <>
      <EncabezadoMovil titulo="Avisos" subtitulo="Se actualizan solos mientras trabajas" />
      <div className="space-y-5 p-4">
        {vacio && <Vacio icono={BellRing} titulo="Todo en orden" texto="No hay avisos por ahora." />}

        <Seccion icono={BellRing} titulo="Listos para servir" color="text-disponible" items={data.listos}>
          {(p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => p.mesa && nav(`/mesero/mesa/${p.mesa}`)}
              className="tarjeta block w-full border-2 border-disponible p-4 text-left"
            >
              <p className="font-semibold">{p.etiqueta} · recoger en cocina</p>
              <p className="text-pequeno text-texto-2">
                Listo {hace(p.listo_desde, ahora)} · {p.items.map((i) => `${i.cantidad} × ${i.plato_nombre}`).join(', ')}
              </p>
            </button>
          )}
        </Seccion>

        <Seccion icono={OctagonX} titulo="Dejar de ofrecer" color="text-agotado" items={data.agotados}>
          {(p) => (
            <div key={p.id} className="tarjeta border-l-4 border-l-agotado p-4">
              <p className="font-semibold">{p.nombre} se agotó</p>
              <p className="text-pequeno text-texto-2">
                {hace(p.desde, ahora)}
                {p.vuelve_en_min ? ` · vuelve en ~${p.vuelve_en_min} min` : ''}
                {p.alternativo ? ` · ofrece ${p.alternativo}` : ''}
              </p>
            </div>
          )}
        </Seccion>

        <Seccion icono={TriangleAlert} titulo="Quedan pocas porciones" color="text-por-agotarse-texto" items={data.por_agotarse}>
          {(p) => (
            <div key={p.id} className="tarjeta border-l-4 border-l-por-agotarse p-4">
              <p className="font-semibold">{p.nombre}</p>
              <p className="text-pequeno text-texto-2">
                {p.porciones_restantes != null ? `Quedan ${p.porciones_restantes}` : 'Últimas porciones'} · confirma antes de ofrecerlo
              </p>
            </div>
          )}
        </Seccion>

        <Seccion icono={Megaphone} titulo="Promocionar hoy" color="text-acento" items={data.promocionar}>
          {(p) => (
            <div key={p.id} className="tarjeta border-l-4 border-l-acento p-4">
              <p className="font-semibold">{p.nombre}</p>
              <p className="text-pequeno text-texto-2">{dinero(p.precio)} · el dueño quiere que lo ofrezcas</p>
            </div>
          )}
        </Seccion>
      </div>
    </>
  )
}

function Seccion({ icono: I, titulo, color, items, children }) {
  if (!items.length) return null
  return (
    <section>
      <h3 className={`mb-2 flex items-center gap-2 text-cuerpo ${color}`}>
        <I size={18} /> {titulo} ({items.length})
      </h3>
      <div className="space-y-2">{items.map(children)}</div>
    </section>
  )
}
