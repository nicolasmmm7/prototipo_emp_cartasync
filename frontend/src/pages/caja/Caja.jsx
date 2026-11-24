import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRightLeft, MessageCircle, Minus, Plus, Trash2 } from 'lucide-react'
import { SelectorMesa } from '../../components/Pedido'
import { Boton, Campo, Cargando, Chip, Vacio, useAhora } from '../../components/ui'
import { api, mensajeError, obtener } from '../../lib/api'
import { useAvisar } from '../../lib/avisos'
import { dinero, hace, hora } from '../../lib/formato'

// El pedido de mostrador se come en el local: siempre queda ligado a una mesa.
const TIPOS = [
  { clave: 'mostrador', texto: 'Mostrador (come aquí)' },
  { clave: 'llevar', texto: 'Para llevar' },
  { clave: 'domicilio', texto: 'Domicilio' },
]
const VACIO = { tipo: 'mostrador', mesa: null, cliente: '', telefono: '', direccion: '', nota: '', whatsapp: null }

/** 2D · Caja — mostrador, para llevar y domicilios. */
export default function Caja() {
  const [form, setForm] = useState(VACIO)
  const [carrito, setCarrito] = useState({})
  const [mesa, setMesa] = useState(null) // { id, numero } elegida para el pedido de mostrador
  const [eligiendoMesa, setEligiendoMesa] = useState(false)
  const avisar = useAvisar()
  const qc = useQueryClient()
  const { data: platos } = useQuery({ queryKey: ['platos'], queryFn: () => obtener('/platos/') })
  const porId = useMemo(() => Object.fromEntries((platos || []).map((p) => [p.id, p])), [platos])

  const items = Object.entries(carrito).filter(([, c]) => c > 0)
  const total = items.reduce((s, [id, c]) => s + (porId[id]?.precio || 0) * c, 0)

  const agregar = (p, delta = 1) => {
    if (p.estado === 'agotado') {
      avisar(`${p.nombre} está agotado`, 'error', p.alternativo_nombre ? `Ofrece ${p.alternativo_nombre}.` : '')
      return
    }
    const actual = carrito[p.id] || 0
    const n = Math.max(0, actual + delta)
    if (p.porciones_restantes != null && n > p.porciones_restantes) {
      avisar(`Solo quedan ${p.porciones_restantes} de ${p.nombre}`, 'error')
      return
    }
    if (delta > 0 && actual === 0) avisar('Plato agregado', 'exito', p.nombre)
    setCarrito((c) => ({ ...c, [p.id]: n }))
  }

  const registrar = useMutation({
    mutationFn: () =>
      api.post('/pedidos/', {
        ...form,
        mesa: form.tipo === 'mostrador' ? mesa?.id : null,
        items: items.map(([plato, cantidad]) => ({ plato: Number(plato), cantidad })),
      }),
    onSuccess: ({ data }) => {
      avisar('Venta registrada', 'exito', `${data.etiqueta} · #${data.id} · ${dinero(data.total)} · enviado a cocina`)
      setForm(VACIO)
      setCarrito({})
      setMesa(null)
      qc.invalidateQueries({ queryKey: ['whatsapp'] })
    },
    onError: (e) => {
      qc.invalidateQueries({ queryKey: ['platos'] })
      avisar('No se pudo registrar', 'error', mensajeError(e))
    },
  })

  const convertir = (m) => {
    setForm({
      ...VACIO,
      tipo: m.direccion ? 'domicilio' : 'llevar',
      cliente: m.cliente,
      telefono: m.telefono,
      direccion: m.direccion,
      nota: `WhatsApp: "${m.texto}"`,
      whatsapp: m.id,
    })
    setCarrito({})
    avisar('Pedido de WhatsApp cargado', 'info', 'Agrega los platos que pidió y registra la venta.')
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[340px_1fr_340px]">
      <BandejaWhatsApp platos={platos} onConvertir={convertir} activo={form.whatsapp} />

      <section className="tarjeta p-5">
        <h2 className="mb-4">Nuevo pedido</h2>
        <div className="mb-4 flex flex-wrap gap-2">
          {TIPOS.map((t) => (
            <Chip key={t.clave} activo={form.tipo === t.clave} onClick={() => setForm({ ...form, tipo: t.clave })}>
              {t.texto}
            </Chip>
          ))}
          {form.whatsapp && (
            <span className="inline-flex items-center gap-1 rounded-full bg-disponible-fondo px-3 text-pequeno font-medium text-disponible">
              <MessageCircle size={14} /> Desde WhatsApp
            </span>
          )}
        </div>
        {form.tipo === 'mostrador' && (
          <button
            type="button"
            onClick={() => setEligiendoMesa(true)}
            className={`mb-4 flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left ${
              mesa ? 'border-marca bg-marca-suave' : 'border-dashed border-acento bg-acento-suave'
            }`}
          >
            <span className="text-h3 font-bold">{mesa ? `Mesa ${mesa.numero}` : 'Elige la mesa'}</span>
            <span className="flex-1 text-pequeno text-texto-2">
              {mesa
                ? mesa.estado === 'libre' ? 'Se abre la cuenta de la mesa' : 'Se suma a la cuenta abierta de la mesa'
                : 'Obligatorio: ¿en qué mesa se sienta el cliente?'}
            </span>
            <span className="flex items-center gap-1 text-pequeno font-semibold text-marca">
              <ArrowRightLeft size={16} /> {mesa ? 'Cambiar' : 'Elegir'}
            </span>
          </button>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Cliente">
            <input className="campo" value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} />
          </Campo>
          <Campo etiqueta="Teléfono">
            <input className="campo" inputMode="tel" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
          </Campo>
          {form.tipo === 'domicilio' && (
            <Campo etiqueta="Dirección" className="sm:col-span-2">
              <input className="campo" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
            </Campo>
          )}
        </div>

        <p className="mt-5 mb-2 text-pequeno font-semibold">Agregar platos</p>
        {!platos ? (
          <Cargando />
        ) : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {platos.map((p) => {
              const agotado = p.estado === 'agotado'
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => agregar(p)}
                  aria-disabled={agotado}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    agotado
                      ? 'border-borde bg-pagina text-tenue'
                      : p.estado === 'por_agotarse'
                        ? 'border-dashed border-por-agotarse-texto hover:bg-por-agotarse-fondo'
                        : 'border-borde-fuerte hover:border-marca hover:bg-marca-suave'
                  } ${carrito[p.id] ? 'ring-2 ring-marca' : ''}`}
                >
                  <p className={`text-pequeno font-semibold leading-tight ${agotado ? 'line-through' : ''}`}>{p.nombre}</p>
                  <p className="mt-1 text-etiqueta text-texto-2">
                    {dinero(p.precio)}
                    {agotado ? ' · Agotado' : p.porciones_restantes != null && p.estado === 'por_agotarse' ? ` · Quedan ${p.porciones_restantes}` : ''}
                  </p>
                </button>
              )
            })}
          </div>
        )}

        <div className="mt-5 border-t border-borde pt-4">
          {items.length === 0 ? (
            <p className="text-center text-pequeno text-texto-2">Toca un plato para agregarlo.</p>
          ) : (
            <ul className="space-y-2">
              {items.map(([id, c]) => (
                <li key={id} className="flex items-center gap-3">
                  <span className="flex-1 font-medium">{porId[id]?.nombre}</span>
                  <button type="button" aria-label="Menos" onClick={() => agregar(porId[id], -1)} className="grid size-9 place-items-center rounded-lg border border-borde-fuerte">
                    <Minus size={16} />
                  </button>
                  <span className="w-6 text-center font-semibold">{c}</span>
                  <button type="button" aria-label="Más" onClick={() => agregar(porId[id], 1)} className="grid size-9 place-items-center rounded-lg border border-borde-fuerte">
                    <Plus size={16} />
                  </button>
                  <span className="w-24 text-right font-semibold">{dinero((porId[id]?.precio || 0) * c)}</span>
                </li>
              ))}
            </ul>
          )}
          <Campo className="mt-4">
            <input className="campo" placeholder="Nota para cocina (opcional)" value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })} />
          </Campo>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-pequeno text-texto-2">Total</p>
              <p className="text-h1 font-bold">{dinero(total)}</p>
            </div>
            <div className="flex gap-2">
              {(items.length > 0 || form.whatsapp) && (
                <Boton variante="secundario" onClick={() => { setForm(VACIO); setCarrito({}); setMesa(null) }}>
                  Limpiar
                </Boton>
              )}
              <Boton
                tamano="lg"
                disabled={!items.length || (form.tipo === 'mostrador' && !mesa)}
                title={form.tipo === 'mostrador' && !mesa ? 'Elige la mesa del cliente' : undefined}
                cargando={registrar.isPending}
                onClick={() => registrar.mutate()}
              >
                Registrar venta
              </Boton>
            </div>
          </div>
        </div>
        <SelectorMesa
          abierto={eligiendoMesa}
          actual={mesa?.id}
          titulo="¿En qué mesa se sienta el cliente?"
          onCerrar={() => setEligiendoMesa(false)}
          onElegir={(m) => {
            setMesa(m)
            setEligiendoMesa(false)
          }}
        />
      </section>

      <PedidosEnCurso />
    </div>
  )
}

function BandejaWhatsApp({ platos, onConvertir, activo }) {
  const ahora = useAhora()
  const avisar = useAvisar()
  const qc = useQueryClient()
  const { data: mensajes = [] } = useQuery({ queryKey: ['whatsapp'], queryFn: () => obtener('/whatsapp/') })
  const simular = useMutation({
    mutationFn: () => api.post('/whatsapp/simular/'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp'] }),
  })
  const descartar = useMutation({
    mutationFn: (id) => api.delete(`/whatsapp/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp'] })
      avisar('Mensaje descartado', 'info')
    },
  })
  // Advierte si el mensaje pide algo que está agotado.
  const agotados = (platos || []).filter((p) => p.estado === 'agotado')
  const advertencia = (texto) => {
    const t = texto.toLowerCase()
    return agotados.filter((p) => t.includes(p.nombre.toLowerCase().split(' ')[0])).map((p) => p.nombre)
  }

  return (
    <section className="tarjeta self-start p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3>Pedidos por WhatsApp</h3>
        {mensajes.length > 0 && (
          <span className="shrink-0 rounded-full bg-texto px-2.5 py-0.5 text-etiqueta font-semibold whitespace-nowrap text-white">{mensajes.length} por confirmar</span>
        )}
      </div>
      {mensajes.length === 0 ? (
        <Vacio icono={MessageCircle} titulo="Sin mensajes nuevos" texto="Aquí llegan los pedidos de WhatsApp para que no los copies uno por uno." />
      ) : (
        <ul className="space-y-3">
          {mensajes.map((m) => {
            const malos = advertencia(m.texto)
            return (
              <li key={m.id} className={`rounded-lg border p-3 ${activo === m.id ? 'border-marca bg-marca-suave' : 'border-borde'}`}>
                <div className="flex justify-between text-etiqueta text-texto-2">
                  <span>{m.cliente} · {m.telefono}</span>
                  <span title={hace(m.recibido, ahora)}>{hora(m.recibido)}</span>
                </div>
                <p className="mt-1.5 text-pequeno italic">"{m.texto}"</p>
                {malos.length > 0 && (
                  <p className="mt-2 rounded bg-agotado-fondo px-2 py-1 text-etiqueta font-medium text-agotado">
                    {malos.join(' y ')} {malos.length > 1 ? 'están agotados' : 'está agotado'}
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <Boton variante="secundario" tamano="sm" className="flex-1" onClick={() => onConvertir(m)}>
                    Convertir en pedido
                  </Boton>
                  <Boton variante="fantasma" tamano="sm" aria-label="Descartar" onClick={() => descartar.mutate(m.id)}>
                    <Trash2 size={16} />
                  </Boton>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <Boton variante="fantasma" tamano="sm" className="mt-3 w-full" cargando={simular.isPending} onClick={() => simular.mutate()}>
        Simular mensaje entrante
      </Boton>
    </section>
  )
}

const COLOR = {
  recibido: 'bg-marca-suave text-marca',
  en_preparacion: 'bg-por-agotarse-fondo text-por-agotarse-texto',
  listo: 'bg-disponible text-white',
}

function PedidosEnCurso() {
  const ahora = useAhora()
  const avisar = useAvisar()
  const qc = useQueryClient()
  const { data = [] } = useQuery({ queryKey: ['pedidos', 'activos'], queryFn: () => obtener('/pedidos/', { activos: 1 }) })
  const entregar = useMutation({
    mutationFn: (id) => api.post(`/pedidos/${id}/avanzar/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      avisar('Pedido entregado', 'exito')
    },
    onError: (e) => avisar('No se pudo entregar', 'error', mensajeError(e)),
  })
  const propios = data.filter((p) => p.tipo !== 'mesa')
  return (
    <section className="tarjeta self-start p-5">
      <h3 className="mb-4">En curso ({propios.length})</h3>
      {propios.length === 0 ? (
        <p className="text-pequeno text-texto-2">No hay pedidos de caja en curso.</p>
      ) : (
        <ul className="space-y-3">
          {propios.map((p) => (
            <li key={p.id} className="rounded-lg border border-borde p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.etiqueta}</p>
                  <p className="text-etiqueta text-texto-2">
                    #{p.id} · {hace(p.creado, ahora)} · {dinero(p.total)}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-etiqueta font-semibold ${COLOR[p.estado]}`}>{p.estado_nombre}</span>
              </div>
              {p.estado === 'listo' && (
                <Boton variante="oscuro" tamano="sm" className="mt-2 w-full" onClick={() => entregar.mutate(p.id)}>
                  Entregar
                </Boton>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
