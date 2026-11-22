import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChefHat } from 'lucide-react'
import { Boton, Cargando, ErrorCarga, Vacio, useAhora } from '../../components/ui'
import { api, mensajeError, obtener } from '../../lib/api'
import { useAvisar } from '../../lib/avisos'
import { hace } from '../../lib/formato'

const COLUMNAS = [
  { estado: 'recibido', titulo: 'Nuevos', accion: 'Empezar a preparar', variante: 'oscuro' },
  { estado: 'en_preparacion', titulo: 'En preparación', accion: 'Marcar listo', variante: 'primario' },
  { estado: 'listo', titulo: 'Listos para servir', accion: null },
]

const ORIGEN = { whatsapp: 'WhatsApp', sala: 'Mesa', caja: 'Caja' }

/** 2C · Pedidos entrantes en cocina. */
export default function PedidosCocina() {
  const ahora = useAhora(20000)
  const qc = useQueryClient()
  const avisar = useAvisar()
  const { data: pedidos, isLoading, error, refetch } = useQuery({
    queryKey: ['pedidos', 'activos'],
    queryFn: () => obtener('/pedidos/', { activos: 1 }),
  })
  const avanzar = useMutation({
    mutationFn: (id) => api.post(`/pedidos/${id}/avanzar/`).then((r) => r.data),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      if (p.estado === 'listo') avisar(`${p.etiqueta} está listo`, 'exito', 'El mesero ya recibió el aviso.')
    },
    onError: (e) => avisar('No se pudo actualizar', 'error', mensajeError(e)),
  })

  if (isLoading) return <Cargando />
  if (error) return <ErrorCarga error={error} reintentar={refetch} />

  // Los más antiguos primero: se preparan en orden de llegada.
  const ordenados = [...pedidos].sort((a, b) => new Date(a.creado) - new Date(b.creado))

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {COLUMNAS.map((col) => {
        const lista = ordenados.filter((p) => p.estado === col.estado)
        return (
          <section key={col.estado} className="min-w-0">
            <header className="mb-3 flex items-baseline justify-between">
              <h2>{col.titulo}</h2>
              <span className="text-pequeno text-texto-2">
                {lista.length} pedido{lista.length === 1 ? '' : 's'}
              </span>
            </header>
            <div className="space-y-3">
              {lista.length === 0 && (
                <div className="tarjeta border-dashed">
                  <Vacio icono={ChefHat} titulo="Sin pedidos" />
                </div>
              )}
              {lista.map((p) => (
                <article
                  key={p.id}
                  className={`tarjeta animate-entrar p-4 ${col.estado === 'recibido' ? 'border-2 border-texto' : ''}`}
                >
                  <header className="flex items-start justify-between gap-2">
                    <div>
                      <h3>{p.etiqueta}</h3>
                      <p className="text-pequeno text-texto-2">
                        #{p.id} · {hace(p.creado, ahora)}
                      </p>
                    </div>
                    <span className="rounded-full border border-borde-fuerte px-2.5 py-0.5 text-etiqueta font-semibold">
                      {p.tipo === 'mesa' ? 'Mesa' : ORIGEN[p.origen] === 'WhatsApp' ? 'WhatsApp' : p.tipo_nombre}
                    </span>
                  </header>
                  <ul className="my-3 space-y-1">
                    {p.items.map((i) => (
                      <li key={i.id} className="text-cuerpo">
                        <span className="font-semibold">{i.cantidad} ×</span> {i.plato_nombre}
                        {i.nota && <span className="block text-pequeno text-texto-2">↳ {i.nota}</span>}
                      </li>
                    ))}
                  </ul>
                  {p.nota && <p className="mb-3 rounded-lg bg-pagina px-3 py-2 text-pequeno">Nota: {p.nota}</p>}
                  {col.accion ? (
                    <Boton
                      variante={col.variante}
                      tamano="lg"
                      className="w-full"
                      cargando={avanzar.isPending && avanzar.variables === p.id}
                      onClick={() => avanzar.mutate(p.id)}
                    >
                      {col.accion}
                    </Boton>
                  ) : (
                    <p className="rounded-lg bg-disponible-fondo px-3 py-2 text-center text-pequeno font-semibold text-disponible">
                      Esperando que lo recojan · {hace(p.listo_desde, ahora)}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
