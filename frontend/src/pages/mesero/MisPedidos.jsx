import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList } from 'lucide-react'
import { EncabezadoMovil } from '../../components/Layouts'
import { Boton, Cargando, ErrorCarga, Vacio, useAhora } from '../../components/ui'
import { api, mensajeError, obtener } from '../../lib/api'
import { useAvisar } from '../../lib/avisos'
import { dinero, hace } from '../../lib/formato'

const COLOR = {
  recibido: 'bg-marca-suave text-marca',
  en_preparacion: 'bg-por-agotarse-fondo text-por-agotarse-texto',
  listo: 'bg-disponible text-white',
}

/** Pedidos activos del turno (mesas y para llevar). */
export default function MisPedidos() {
  const nav = useNavigate()
  const ahora = useAhora()
  const qc = useQueryClient()
  const avisar = useAvisar()
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['pedidos', 'activos'],
    queryFn: () => obtener('/pedidos/', { activos: 1 }),
  })
  const entregar = useMutation({
    mutationFn: (id) => api.post(`/pedidos/${id}/avanzar/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      avisar('Pedido entregado', 'exito')
    },
    onError: (e) => avisar('No se pudo marcar', 'error', mensajeError(e)),
  })

  return (
    <>
      <EncabezadoMovil titulo="Pedidos activos" subtitulo="Mesas y para llevar del turno" />
      {isLoading ? (
        <Cargando />
      ) : error ? (
        <ErrorCarga error={error} reintentar={refetch} />
      ) : data.length === 0 ? (
        <Vacio icono={ClipboardList} titulo="No hay pedidos activos" texto="Los pedidos que envíes a cocina aparecen aquí." />
      ) : (
        <ul className="space-y-3 p-4">
          {data
            .filter((p) => p.tipo === 'mesa' || p.origen === 'sala')
            .map((p) => (
              <li key={p.id} className="tarjeta p-4">
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => p.mesa && nav(`/mesero/mesa/${p.mesa}`)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{p.etiqueta}</p>
                      <p className="text-pequeno text-texto-2">
                        #{p.id} · {hace(p.creado, ahora)} · {dinero(p.total)}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-etiqueta font-semibold ${COLOR[p.estado]}`}>{p.estado_nombre}</span>
                  </div>
                  <p className="mt-2 text-pequeno text-texto-2">
                    {p.items.map((i) => `${i.cantidad} × ${i.plato_nombre}`).join(' · ')}
                  </p>
                </button>
                {p.estado === 'listo' && !p.mesa && (
                  <Boton variante="oscuro" className="mt-3 w-full" onClick={() => entregar.mutate(p.id)}>
                    Marcar entregado
                  </Boton>
                )}
              </li>
            ))}
        </ul>
      )}
    </>
  )
}
