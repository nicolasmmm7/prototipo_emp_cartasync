import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Minus, Plus, Star, TriangleAlert, X } from 'lucide-react'
import { EncabezadoMovil } from '../../components/Layouts'
import { Boton, Cargando, Chip, ErrorCarga, EstadoBadge } from '../../components/ui'
import { api, mensajeError, obtener } from '../../lib/api'
import { useAvisar } from '../../lib/avisos'
import { dinero, hace } from '../../lib/formato'
import { useSesion } from '../../lib/sesion'
import { useEventos } from '../../lib/tiempoReal'

/** 1B · Mesero — carta para tomar el pedido, con aviso de agotado en vivo. */
export default function TomarPedido() {
  const { tipo, mesaId } = useParams()
  const { usuario } = useSesion()
  const nav = useNavigate()
  const qc = useQueryClient()
  const avisar = useAvisar()
  const [categoria, setCategoria] = useState(null)
  const [carrito, setCarrito] = useState({})
  const [nota, setNota] = useState('')
  const [cliente, setCliente] = useState('')
  const [aviso, setAviso] = useState(null)

  const { data: platos, isLoading, error, refetch } = useQuery({ queryKey: ['platos'], queryFn: () => obtener('/platos/') })
  const { data: mesa } = useQuery({
    queryKey: ['mesas', mesaId],
    queryFn: () => obtener(`/mesas/${mesaId}/`),
    enabled: !!mesaId,
  })

  // Aviso en vivo cuando la cocina marca un plato como agotado.
  useEventos((e) => {
    if (e.tema === 'platos' && e.cambio && e.plato?.estado === 'agotado') {
      setAviso({ nombre: e.plato.nombre, alternativo: e.alternativo, cuando: new Date().toISOString() })
    }
  })

  const categorias = useMemo(() => {
    const vistas = new Map()
    platos?.forEach((p) => vistas.set(p.categoria, p.categoria_nombre))
    return [...vistas]
  }, [platos])
  const catActiva = categoria ?? categorias[0]?.[0]
  const porId = useMemo(() => Object.fromEntries((platos || []).map((p) => [p.id, p])), [platos])
  const ofrecer = platos?.filter((p) => p.destacado && p.estado === 'disponible') || []

  const items = Object.entries(carrito).filter(([, c]) => c > 0)
  const total = items.reduce((s, [id, c]) => s + (porId[id]?.precio || 0) * c, 0)
  const cantidad = items.reduce((s, [, c]) => s + c, 0)
  const conProblema = items.filter(([id, c]) => {
    const p = porId[id]
    return !p || p.estado === 'agotado' || (p.porciones_restantes != null && c > p.porciones_restantes)
  })

  const cambiar = (p, delta) =>
    setCarrito((c) => {
      const actual = c[p.id] || 0
      let n = Math.max(0, actual + delta)
      if (p.porciones_restantes != null) n = Math.min(n, Math.max(p.porciones_restantes, actual))
      return { ...c, [p.id]: n }
    })

  const enviar = useMutation({
    mutationFn: () =>
      api.post('/pedidos/', {
        tipo: tipo === 'mesa' ? 'mesa' : 'llevar',
        mesa: mesaId ? Number(mesaId) : null,
        cliente,
        nota,
        items: items.map(([plato, c]) => ({ plato: Number(plato), cantidad: c })),
      }),
    onSuccess: ({ data }) => {
      qc.invalidateQueries({ queryKey: ['mesas'] })
      avisar('Pedido enviado', 'exito', `${data.etiqueta} · la cocina ya lo está viendo.`)
      nav(mesaId ? `/mesero/mesa/${mesaId}` : '/mesero/pedidos', { replace: true })
    },
    onError: (e) => {
      qc.invalidateQueries({ queryKey: ['platos'] })
      avisar('No se pudo enviar', 'error', mensajeError(e))
    },
  })

  const titulo = tipo === 'mesa' ? `Mesa ${mesa?.numero ?? ''} · Nuevo pedido` : 'Para llevar · Nuevo pedido'

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-pagina md:border-x md:border-borde">
      <EncabezadoMovil titulo={titulo} subtitulo={`Mesero: ${usuario.nombre}`} atras="/mesero" />

      {aviso && (
        <div role="alert" className="animate-entrar mx-4 mt-3 flex items-start gap-3 rounded-xl bg-texto p-4 text-white">
          <TriangleAlert size={20} className="mt-0.5 shrink-0 text-acento" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Se agotó {aviso.nombre}</p>
            <p className="text-pequeno opacity-80">
              {hace(aviso.cuando)}
              {aviso.alternativo ? ` · ofrece ${aviso.alternativo}` : ''}
            </p>
          </div>
          <button type="button" onClick={() => setAviso(null)} className="rounded-lg border border-white/30 px-3 py-1.5 text-pequeno font-semibold hover:bg-white/10">
            Entendido
          </button>
        </div>
      )}

      {isLoading ? (
        <Cargando />
      ) : error ? (
        <ErrorCarga error={error} reintentar={refetch} />
      ) : (
        <div className="flex-1 space-y-4 p-4 pb-40">
          {tipo !== 'mesa' && (
            <input className="campo" placeholder="Nombre del cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} />
          )}

          {ofrecer.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-pequeno font-semibold">
                <Star size={16} className="text-acento" /> Ofrecer hoy
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {ofrecer.map((p) => (
                  <button key={p.id} type="button" onClick={() => cambiar(p, 1)} className="shrink-0 rounded-full border border-acento bg-acento-suave px-3 py-1.5 text-pequeno font-medium">
                    {p.nombre}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {categorias.map(([id, nombre]) => (
              <Chip key={id} activo={id === catActiva} onClick={() => setCategoria(id)}>
                {nombre}
              </Chip>
            ))}
          </div>

          <ul className="space-y-2">
            {platos
              .filter((p) => p.categoria === catActiva)
              .map((p) => {
                const c = carrito[p.id] || 0
                const agotado = p.estado === 'agotado'
                return (
                  <li key={p.id} className={`tarjeta flex items-center gap-3 p-3.5 ${agotado ? 'bg-pagina' : ''} ${c ? 'border-marca' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <p className={`font-semibold ${agotado ? 'text-tenue line-through' : ''}`}>{p.nombre}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-pequeno text-texto-2">
                        <span>{dinero(p.precio)}</span>
                        {agotado ? (
                          <EstadoBadge estado="agotado" texto={p.vuelve_en_min ? `Agotado · vuelve en ~${p.vuelve_en_min} min` : 'Agotado'} />
                        ) : p.estado === 'por_agotarse' ? (
                          <span className="rounded-full border border-dashed border-por-agotarse-texto px-2 py-0.5 text-etiqueta font-semibold text-por-agotarse-texto">
                            {p.porciones_restantes != null ? `Quedan ${p.porciones_restantes}` : 'Últimas porciones'}
                          </span>
                        ) : (
                          <span>· Disponible</span>
                        )}
                      </div>
                      {agotado && p.alternativo_nombre && (
                        <p className="mt-1 text-etiqueta text-texto-2">Ofrece: {p.alternativo_nombre}</p>
                      )}
                    </div>
                    {agotado ? (
                      <span className="grid size-11 place-items-center rounded-lg border border-borde text-tenue" aria-label="No disponible">
                        <X size={18} />
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        {c > 0 && (
                          <>
                            <button type="button" aria-label={`Quitar ${p.nombre}`} onClick={() => cambiar(p, -1)} className="grid size-11 place-items-center rounded-lg border border-borde-fuerte">
                              <Minus size={18} />
                            </button>
                            <span className="w-6 text-center font-semibold">×{c}</span>
                          </>
                        )}
                        <button
                          type="button"
                          aria-label={`Agregar ${p.nombre}`}
                          onClick={() => cambiar(p, 1)}
                          disabled={p.porciones_restantes != null && c >= p.porciones_restantes}
                          className={`grid size-11 place-items-center rounded-lg ${c ? 'bg-texto text-white' : 'border border-borde-fuerte'} disabled:opacity-40`}
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
          </ul>

          <textarea
            className="campo min-h-20"
            placeholder="Nota para cocina (opcional): una sin chicharrón, sin cebolla…"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />
        </div>
      )}

      <footer className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-borde bg-superficie px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {conProblema.length > 0 && (
          <p className="mb-2 rounded-lg bg-agotado-fondo px-3 py-2 text-pequeno font-medium text-agotado">
            {conProblema.map(([id]) => porId[id]?.nombre).join(', ')} ya no está disponible. Quítalo del pedido.
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-pequeno text-texto-2">
              {cantidad} plato{cantidad === 1 ? '' : 's'}
            </p>
            <p className="text-h2 font-bold">{dinero(total)}</p>
          </div>
          <Boton
            variante="oscuro"
            tamano="lg"
            disabled={!cantidad || conProblema.length > 0}
            cargando={enviar.isPending}
            onClick={() => enviar.mutate()}
          >
            Enviar a cocina
          </Boton>
        </div>
      </footer>
    </div>
  )
}
