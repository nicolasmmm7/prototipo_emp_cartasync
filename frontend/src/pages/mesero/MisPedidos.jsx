import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ClipboardList, Plus, ShoppingBag } from 'lucide-react'
import { EncabezadoMovil } from '../../components/Layouts'
import { AvancePedido, EstadoPedido, SelectorMesa } from '../../components/Pedido'
import { Boton, Cargando, Chip, ErrorCarga, Vacio, useAhora } from '../../components/ui'
import { obtener } from '../../lib/api'
import { dinero, hace } from '../../lib/formato'

const FILTROS = [
  { clave: 'curso', texto: 'En curso', params: { activos: 1 } },
  { clave: 'servidos', texto: 'Servidos hoy', params: { estado: 'entregado', hoy: 1 } },
  { clave: 'cancelados', texto: 'Cancelados', params: { estado: 'cancelado', hoy: 1 } },
]

/** Mesero — pedidos del turno: crear uno nuevo y seguir cada pedido. */
export default function MisPedidos() {
  const nav = useNavigate()
  const ahora = useAhora()
  const [filtro, setFiltro] = useState('curso')
  const [mios, setMios] = useState(false)
  const [eligiendo, setEligiendo] = useState(false)
  const f = FILTROS.find((x) => x.clave === filtro)
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['pedidos', 'sala', filtro, mios],
    queryFn: () => obtener('/pedidos/', { ...f.params, ...(mios ? { mios: 1 } : { sala: 1 }) }),
  })

  return (
    <>
      <EncabezadoMovil
        titulo="Pedidos"
        subtitulo="Crea pedidos y sigue cada actualización"
        derecha={
          <Boton tamano="sm" onClick={() => setEligiendo(true)}>
            <Plus size={16} /> Nuevo pedido
          </Boton>
        }
      />
      <div className="space-y-3 p-4">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {FILTROS.map((x) => (
            <Chip key={x.clave} activo={filtro === x.clave} onClick={() => setFiltro(x.clave)}>{x.texto}</Chip>
          ))}
        </div>
        <label className="flex items-center gap-2 text-pequeno text-texto-2">
          <input type="checkbox" className="size-4 accent-marca" checked={mios} onChange={(e) => setMios(e.target.checked)} />
          Solo los que tomé yo
        </label>

        {isLoading ? (
          <Cargando />
        ) : error ? (
          <ErrorCarga error={error} reintentar={refetch} />
        ) : data.length === 0 ? (
          <div className="tarjeta">
            <Vacio icono={ClipboardList} titulo="No hay pedidos aquí" texto="Toca “Nuevo pedido” para tomar uno y anexarlo a una mesa.">
              <Boton onClick={() => setEligiendo(true)}><Plus size={18} /> Nuevo pedido</Boton>
            </Vacio>
          </div>
        ) : (
          <ul className="space-y-3">
            {data.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => nav(`/mesero/pedido/${p.id}`)}
                  className={`tarjeta flex w-full items-center gap-3 p-4 text-left hover:border-borde-fuerte ${p.estado === 'listo' ? 'border-2 border-disponible' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{p.etiqueta}</p>
                      <EstadoPedido pedido={p} />
                    </div>
                    <p className="text-pequeno text-texto-2">
                      #{p.id} · {hace(p.creado, ahora)} · {dinero(p.total)} · {p.creado_por_nombre}
                    </p>
                    <p className="mt-1.5 truncate text-pequeno">
                      {p.items.map((i) => `${i.cantidad} × ${i.plato_nombre}`).join(' · ')}
                    </p>
                    <AvancePedido p={p} />
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-tenue" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SelectorMesa
        abierto={eligiendo}
        titulo="Nuevo pedido · ¿para qué mesa?"
        onCerrar={() => setEligiendo(false)}
        onElegir={(m) => nav(`/mesero/nuevo/mesa/${m.id}`)}
        extra={
          <Boton variante="secundario" className="mt-4 w-full" onClick={() => nav('/mesero/nuevo/llevar')}>
            <ShoppingBag size={18} /> Es para llevar
          </Boton>
        }
      />
    </>
  )
}
