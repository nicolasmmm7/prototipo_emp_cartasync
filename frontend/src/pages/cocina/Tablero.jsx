import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, History } from 'lucide-react'
import {
  BarraPorciones, Boton, Cargando, Chip, ErrorCarga, EstadoBadge, SelectorEstado, Vacio, useAhora,
} from '../../components/ui'
import { api, mensajeError, obtener } from '../../lib/api'
import { useAvisar } from '../../lib/avisos'
import { ESTADOS, hace, hora } from '../../lib/formato'

const FILTROS = [
  { clave: 'todos', texto: 'Todos' },
  { clave: 'disponible', texto: 'Disponibles' },
  { clave: 'por_agotarse', texto: 'Por agotarse' },
  { clave: 'agotado', texto: 'Agotados' },
]

/** Mutación compartida: cambia el estado con actualización optimista. */
function useCambiarEstado() {
  const qc = useQueryClient()
  const avisar = useAvisar()
  return useMutation({
    mutationFn: ({ id, estado, vuelve_en_min }) =>
      api.post(`/platos/${id}/estado/`, { estado, vuelve_en_min }).then((r) => r.data),
    onMutate: async ({ id, estado }) => {
      await qc.cancelQueries({ queryKey: ['platos'] })
      const previo = qc.getQueryData(['platos'])
      qc.setQueryData(['platos'], (l) => l?.map((p) => (p.id === id ? { ...p, estado } : p)))
      return { previo }
    },
    onError: (e, _v, ctx) => {
      qc.setQueryData(['platos'], ctx.previo)
      avisar('No se pudo cambiar el estado', 'error', mensajeError(e))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['platos'] }),
  })
}

export default function Tablero() {
  const [filtro, setFiltro] = useState('todos')
  const { data: platos, isLoading, error, refetch } = useQuery({ queryKey: ['platos'], queryFn: () => obtener('/platos/') })
  const cambiar = useCambiarEstado()

  const conteo = useMemo(() => {
    const c = { todos: platos?.length || 0, disponible: 0, por_agotarse: 0, agotado: 0 }
    platos?.forEach((p) => c[p.estado]++)
    return c
  }, [platos])

  if (isLoading) return <Cargando />
  if (error) return <ErrorCarga error={error} reintentar={refetch} />

  const visibles = filtro === 'todos' ? platos : platos.filter((p) => p.estado === filtro)

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <section>
        <h1>Platos de hoy</h1>
        <p className="mt-1 text-texto-2">
          Toca un estado para cambiarlo. Los meseros y la carta del cliente se actualizan al instante.
        </p>
        <div className="mt-4 mb-5 flex gap-2 overflow-x-auto pb-1">
          {FILTROS.map((f) => (
            <Chip key={f.clave} activo={filtro === f.clave} onClick={() => setFiltro(f.clave)}>
              {f.texto} ({conteo[f.clave]})
            </Chip>
          ))}
        </div>
        {visibles.length === 0 ? (
          <div className="tarjeta">
            <Vacio titulo="No hay platos con este estado" texto="Prueba con otro filtro." />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {visibles.map((p) => (
              <TarjetaCocina key={p.id} plato={p} cambiar={cambiar} />
            ))}
          </div>
        )}
      </section>

      <aside className="space-y-4">
        <CambiosRecientes />
        <div className="tarjeta p-5">
          <h3>Registrar porciones</h3>
          <p className="mt-1 mb-4 text-pequeno text-texto-2">
            Al iniciar el servicio, la cocina indica cuántas porciones preparó de cada plato. Cada pedido las
            descuenta y, con pocas porciones, el plato pasa solo a "Por agotarse".
          </p>
          <Link to="/cocina/porciones">
            <Boton variante="secundario" className="w-full">Editar porciones del día</Boton>
          </Link>
        </div>
      </aside>
    </div>
  )
}

function TarjetaCocina({ plato: p, cambiar }) {
  const ocupado = cambiar.isPending && cambiar.variables?.id === p.id
  return (
    <article
      className={`tarjeta flex flex-col gap-4 p-4 transition-colors ${p.estado === 'agotado' ? 'bg-pagina' : ''}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="leading-snug">{p.nombre}</h3>
          <p className="text-pequeno text-texto-2">{p.categoria_nombre}</p>
        </div>
        <EstadoBadge estado={p.estado} />
      </header>
      <BarraPorciones restantes={p.porciones_restantes} preparadas={p.porciones_preparadas} estado={p.estado} />
      <div className="mt-auto space-y-3">
        <SelectorEstado
          estado={p.estado}
          cargando={ocupado}
          onCambiar={(estado) => cambiar.mutate({ id: p.id, estado })}
        />
        {p.estado === 'agotado' && <VuelveEn plato={p} cambiar={cambiar} />}
      </div>
    </article>
  )
}

/** Tiempo estimado para que el plato vuelva a estar disponible (opcional, un toque). */
function VuelveEn({ plato, cambiar }) {
  const opciones = [15, 30, 60]
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-pequeno">
      <Clock size={16} className="text-texto-2" />
      <span className="text-texto-2">¿Vuelve?</span>
      {opciones.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => cambiar.mutate({ id: plato.id, estado: 'agotado', vuelve_en_min: m })}
          className={`rounded-full border px-2.5 py-1 font-medium ${
            plato.vuelve_en_min === m ? 'border-marca bg-marca-suave text-marca' : 'border-borde bg-superficie hover:border-borde-fuerte'
          }`}
        >
          {m < 60 ? `${m} min` : '1 h'}
        </button>
      ))}
    </div>
  )
}

function CambiosRecientes() {
  const ahora = useAhora()
  const { data = [] } = useQuery({ queryKey: ['cambios'], queryFn: () => obtener('/cambios/') })
  return (
    <div className="tarjeta p-5">
      <h3 className="mb-3">Cambios recientes</h3>
      {data.length === 0 ? (
        <p className="text-pequeno text-texto-2">Aún no hay cambios hoy.</p>
      ) : (
        <ul className="divide-y divide-borde">
          {data.slice(0, 8).map((c) => (
            <li key={c.id} className="py-2.5 first:pt-0 last:pb-0">
              <p className="text-pequeno">
                <span className="font-semibold">{c.plato_nombre}</span> → {ESTADOS[c.nuevo].nombre}
              </p>
              <p className="flex items-center gap-1 text-etiqueta text-texto-2" title={hace(c.creado, ahora)}>
                <History size={12} />
                {hora(c.creado)} · {c.origen === 'automatico' ? `Automático (quedan ${c.porciones_restantes ?? 0})` : c.usuario_nombre || c.origen_nombre}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
