import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ShoppingBag } from 'lucide-react'
import { EncabezadoMovil } from '../../components/Layouts'
import { Boton, Cargando, ErrorCarga, useAhora } from '../../components/ui'
import { obtener } from '../../lib/api'
import { dinero, hace } from '../../lib/formato'
import { useSesion } from '../../lib/sesion'

const ESTADO_MESA = {
  libre: { texto: 'Libre', chip: 'border-borde-fuerte text-texto-2', tarjeta: '' },
  en_cocina: { texto: 'En cocina', chip: 'border-marca bg-marca-suave text-marca', tarjeta: '' },
  listo: { texto: 'Listo', chip: 'border-disponible bg-disponible text-white', tarjeta: 'border-2 border-disponible animate-destello' },
  comiendo: { texto: 'Comiendo', chip: 'border-borde-fuerte bg-pagina text-texto', tarjeta: '' },
}

/** 2A · Mesero — mis mesas. */
export default function Mesas() {
  const { usuario } = useSesion()
  const nav = useNavigate()
  const ahora = useAhora()
  const { data: mesas, isLoading, error, refetch } = useQuery({ queryKey: ['mesas'], queryFn: () => obtener('/mesas/') })

  const n = (e) => mesas?.filter((m) => m.estado === e).length || 0
  const ocupadas = (mesas?.length || 0) - n('libre')

  return (
    <>
      <EncabezadoMovil
        titulo="Mis mesas"
        subtitulo={`${usuario.nombre} · Salón principal`}
        derecha={<span className="rounded-full bg-marca-suave px-2.5 py-1 text-etiqueta font-semibold text-marca">Mesero</span>}
      />
      {isLoading ? (
        <Cargando />
      ) : error ? (
        <ErrorCarga error={error} reintentar={refetch} />
      ) : (
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              [ocupadas, 'Ocupadas'],
              [n('listo'), 'Pedido listo'],
              [n('libre'), 'Libres'],
            ].map(([v, t]) => (
              <div key={t} className="tarjeta px-3 py-2.5">
                <p className="text-h2 font-bold">{v}</p>
                <p className="text-etiqueta text-texto-2">{t}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {mesas.map((m) => {
              const e = ESTADO_MESA[m.estado]
              const detalle =
                m.estado === 'libre'
                  ? 'Toca para abrir pedido'
                  : m.estado === 'listo'
                    ? 'Recoger en cocina'
                    : `${m.platos} plato${m.platos === 1 ? '' : 's'} · ${hace(m.ultimo_pedido, ahora)}`
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => nav(m.estado === 'libre' ? `/mesero/nuevo/mesa/${m.id}` : `/mesero/mesa/${m.id}`)}
                  className={`tarjeta flex min-h-28 flex-col p-3.5 text-left hover:border-borde-fuerte ${e.tarjeta}`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-h3 font-semibold whitespace-nowrap">Mesa {m.numero}</span>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-etiqueta font-semibold whitespace-nowrap ${e.chip}`}>{e.texto}</span>
                  </div>
                  <span className="mt-auto pt-3 text-pequeno text-texto-2">{detalle}</span>
                  {m.total > 0 && <span className="text-pequeno font-semibold">{dinero(m.total)}</span>}
                </button>
              )
            })}
          </div>

          <Boton variante="secundario" tamano="lg" className="w-full" onClick={() => nav('/mesero/nuevo/llevar')}>
            <ShoppingBag size={20} /> Pedido para llevar
          </Boton>
        </div>
      )}
    </>
  )
}
