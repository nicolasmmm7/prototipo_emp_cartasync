import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Minus, Plus } from 'lucide-react'
import { Boton, Cargando, ErrorCarga, EstadoBadge } from '../../components/ui'
import { api, mensajeError, obtener } from '../../lib/api'
import { useAvisar } from '../../lib/avisos'

/** 1D · Registrar porciones del día, con la sugerencia según el historial. */
export default function Porciones() {
  const qc = useQueryClient()
  const avisar = useAvisar()
  const { data: filas, isLoading, error, refetch } = useQuery({
    queryKey: ['porciones'],
    queryFn: () => obtener('/platos/porciones/'),
    refetchInterval: false,
  })
  const { data: restaurante } = useQuery({ queryKey: ['restaurante'], queryFn: () => obtener('/restaurante/') })
  const [valores, setValores] = useState({})
  const [editado, setEditado] = useState(false)

  // Se llena con lo registrado; si no hay nada, queda vacío para que la cocina lo escriba.
  useEffect(() => {
    if (filas && !editado) {
      setValores(Object.fromEntries(filas.map((f) => [f.plato, f.porciones_preparadas ?? ''])))
    }
  }, [filas, editado])

  const guardar = useMutation({
    mutationFn: (items) => api.post('/platos/porciones/', { items }),
    onSuccess: () => {
      setEditado(false)
      qc.invalidateQueries({ queryKey: ['porciones'] })
      avisar('Porciones guardadas', 'exito', 'Los meseros ya ven las porciones disponibles.')
    },
    onError: (e) => avisar('No se pudieron guardar', 'error', mensajeError(e)),
  })

  if (isLoading) return <Cargando />
  if (error) return <ErrorCarga error={error} reintentar={refetch} />

  const poner = (id, v) => {
    setEditado(true)
    setValores((s) => ({ ...s, [id]: v === '' ? '' : Math.max(0, Number(v) || 0) }))
  }
  const usarSugeridas = () => {
    setEditado(true)
    setValores((s) => {
      const n = { ...s }
      filas.forEach((f) => f.sugerido_max && (n[f.plato] = Math.round((f.sugerido_min + f.sugerido_max) / 2)))
      return n
    })
    avisar('Porciones copiadas', 'info', 'Se usó el punto medio de la sugerencia. Revisa y guarda.')
  }
  const enviar = () => {
    const items = filas
      .filter((f) => valores[f.plato] !== '' && valores[f.plato] !== (f.porciones_preparadas ?? ''))
      .map((f) => ({ plato: f.plato, porciones: Number(valores[f.plato]) }))
    if (!items.length) return avisar('No hay cambios para guardar', 'info')
    guardar.mutate(items)
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Porciones del día</h1>
          <p className="mt-1 max-w-2xl text-texto-2">
            Indica cuántas porciones preparaste de cada plato. Cada pedido las descuenta automáticamente y,
            con {restaurante?.umbral_por_agotarse ?? 3} o menos, el plato pasa solo a "Por agotarse".
          </p>
        </div>
        <Boton variante="secundario" onClick={usarSugeridas}>Usar las sugeridas</Boton>
      </div>

      <div className="tarjeta overflow-hidden">
        <div className="hidden grid-cols-[1fr_160px_120px_200px] gap-4 border-b border-borde bg-pagina px-5 py-3 text-pequeno font-semibold text-texto-2 md:grid">
          <span>Plato</span>
          <span>Sugerido según historial</span>
          <span>Quedan</span>
          <span className="text-right">Porciones preparadas</span>
        </div>
        <ul className="divide-y divide-borde">
          {filas.map((f) => (
            <li key={f.plato} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-4 md:grid-cols-[1fr_160px_120px_200px]">
              <div>
                <p className="font-semibold">{f.nombre}</p>
                <p className="text-pequeno text-texto-2">{f.categoria}</p>
              </div>
              <p className="order-3 text-pequeno text-texto-2 md:order-none md:text-cuerpo md:text-texto">
                <span className="md:hidden">Sugerido: </span>
                {f.sugerido_max ? `${f.sugerido_min} a ${f.sugerido_max}` : 'Sin historial'}
              </p>
              <div className="order-4 md:order-none">
                {f.porciones_restantes != null ? (
                  <EstadoBadge estado={f.estado} texto={`${f.porciones_restantes}`} />
                ) : (
                  <span className="text-pequeno text-tenue">—</span>
                )}
              </div>
              <div className="row-span-2 flex items-center justify-end gap-2 md:row-span-1">
                <button type="button" aria-label={`Menos ${f.nombre}`} onClick={() => poner(f.plato, (Number(valores[f.plato]) || 0) - 1)} className="grid size-11 place-items-center rounded-lg border border-borde-fuerte hover:bg-pagina">
                  <Minus size={18} />
                </button>
                <input
                  inputMode="numeric"
                  aria-label={`Porciones de ${f.nombre}`}
                  className="campo w-16 text-center text-h3 font-semibold"
                  value={valores[f.plato] ?? ''}
                  onChange={(e) => poner(f.plato, e.target.value.replace(/\D/g, ''))}
                />
                <button type="button" aria-label={`Más ${f.nombre}`} onClick={() => poner(f.plato, (Number(valores[f.plato]) || 0) + 1)} className="grid size-11 place-items-center rounded-lg border border-borde-fuerte hover:bg-pagina">
                  <Plus size={18} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="sticky bottom-0 mt-4 flex justify-end gap-2 bg-pagina py-3">
        <Boton tamano="lg" onClick={enviar} cargando={guardar.isPending} disabled={!editado}>
          Guardar porciones
        </Boton>
      </div>
    </div>
  )
}
