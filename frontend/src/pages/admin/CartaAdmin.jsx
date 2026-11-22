import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Plus, Search, Star } from 'lucide-react'
import { Boton, Campo, Cargando, ErrorCarga, EstadoBadge, Foto, Modal } from '../../components/ui'
import { api, mensajeError, obtener } from '../../lib/api'
import { useAvisar } from '../../lib/avisos'
import { dinero, fechaLarga } from '../../lib/formato'

const horario = (p) =>
  [p.en_desayuno && 'Desayuno', p.en_almuerzo && 'Almuerzo', p.en_cena && 'Cena'].filter(Boolean).join(', ') || '—'

/** 3B · Dueño — gestión de la carta. */
export default function CartaAdmin() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const avisar = useAvisar()
  const [buscar, setBuscar] = useState('')
  const [verInactivos, setVerInactivos] = useState(false)
  const [categoriasAbierto, setCategoriasAbierto] = useState(false)
  const { data: platos, isLoading, error, refetch } = useQuery({
    queryKey: ['platos', 'todos'],
    queryFn: () => obtener('/platos/', { todos: 1 }),
  })
  const { data: restaurante } = useQuery({ queryKey: ['restaurante'], queryFn: () => obtener('/restaurante/') })

  const destacar = useMutation({
    mutationFn: (p) => api.patch(`/platos/${p.id}/`, { destacado: !p.destacado }),
    onSuccess: (_r, p) => {
      qc.invalidateQueries({ queryKey: ['platos'] })
      avisar(p.destacado ? 'Ya no se promociona' : 'Sugerencia enviada', 'exito', p.destacado ? p.nombre : `Los meseros verán ${p.nombre} en "Ofrecer hoy".`)
    },
  })

  if (isLoading) return <Cargando />
  if (error) return <ErrorCarga error={error} reintentar={refetch} />

  const categorias = new Set(platos.filter((p) => p.activo).map((p) => p.categoria))
  const q = buscar.trim().toLowerCase()
  const visibles = platos.filter((p) => (verInactivos || p.activo) && (!q || p.nombre.toLowerCase().includes(q) || p.categoria_nombre.toLowerCase().includes(q)))

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Carta</h1>
          <p className="mt-1 text-texto-2">
            {platos.filter((p) => p.activo).length} platos en {categorias.size} categorías · lo que cambies aquí se ve al instante en la carta del cliente
          </p>
        </div>
        <div className="flex gap-2">
          <Boton variante="secundario" onClick={() => setCategoriasAbierto(true)}>Categorías</Boton>
          <Link to="/admin/carta/nuevo">
            <Boton>
              <Plus size={18} /> Nuevo plato
            </Boton>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <MenuDelDia restaurante={restaurante} />
        <CodigoQR restaurante={restaurante} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-tenue" />
          <input className="campo pl-10" placeholder="Buscar plato" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-pequeno text-texto-2">
          <input type="checkbox" className="size-4 accent-marca" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
          Mostrar platos retirados
        </label>
      </div>

      <div className="tarjeta overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead className="border-b border-borde bg-pagina text-pequeno text-texto-2">
            <tr>
              <th className="px-4 py-3 font-semibold">Plato</th>
              <th className="px-4 py-3 font-semibold">Categoría</th>
              <th className="px-4 py-3 font-semibold">Horario</th>
              <th className="px-4 py-3 text-right font-semibold">Precio</th>
              <th className="px-4 py-3 font-semibold">Estado hoy</th>
              <th className="px-4 py-3 text-center font-semibold">Promocionar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {visibles.map((p) => (
              <tr key={p.id} onClick={() => nav(`/admin/carta/${p.id}`)} className={`cursor-pointer hover:bg-pagina ${p.activo ? '' : 'opacity-50'}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Foto src={p.foto} alt="" className="size-10 shrink-0 rounded-lg" />
                    <div>
                      <p className="font-semibold">{p.nombre}</p>
                      {p.es_menu_del_dia && <p className="text-etiqueta text-marca">Menú del día</p>}
                      {!p.activo && <p className="text-etiqueta text-texto-2">Retirado de la carta</p>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-pequeno">{p.categoria_nombre}</td>
                <td className="px-4 py-3 text-pequeno">{horario(p)}</td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">{dinero(p.precio)}</td>
                <td className="px-4 py-3"><EstadoBadge estado={p.estado} /></td>
                <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    aria-pressed={p.destacado}
                    aria-label={`Promocionar ${p.nombre}`}
                    onClick={() => destacar.mutate(p)}
                    className="rounded-lg p-2 hover:bg-acento-suave"
                  >
                    <Star size={20} className={p.destacado ? 'fill-acento text-acento' : 'text-borde-fuerte'} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Categorias abierto={categoriasAbierto} onCerrar={() => setCategoriasAbierto(false)} />
    </div>
  )
}

function MenuDelDia({ restaurante }) {
  const qc = useQueryClient()
  const avisar = useAvisar()
  const [texto, setTexto] = useState('')
  const [umbral, setUmbral] = useState(3)
  useEffect(() => {
    if (restaurante) {
      setTexto(restaurante.menu_del_dia)
      setUmbral(restaurante.umbral_por_agotarse)
    }
  }, [restaurante])
  const guardar = useMutation({
    mutationFn: () => api.patch('/restaurante/', { menu_del_dia: texto, umbral_por_agotarse: umbral }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restaurante'] })
      avisar('Menú del día actualizado', 'exito', 'Ya aparece en la carta del cliente.')
    },
    onError: (e) => avisar('No se pudo guardar', 'error', mensajeError(e)),
  })
  const cambiado = restaurante && (texto !== restaurante.menu_del_dia || Number(umbral) !== restaurante.umbral_por_agotarse)
  return (
    <div className="tarjeta border-2 border-texto p-5">
      <p className="text-pequeno text-texto-2 first-letter:uppercase">Menú del día · {fechaLarga()}</p>
      <textarea className="campo mt-2 min-h-16 font-semibold" value={texto} onChange={(e) => setTexto(e.target.value)} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-pequeno text-texto-2">
          Pasa a "por agotarse" con
          <input type="number" min={0} max={50} className="campo w-16 px-2 py-1 text-center" value={umbral} onChange={(e) => setUmbral(e.target.value)} />
          porciones o menos
        </label>
        <Boton tamano="sm" disabled={!cambiado} cargando={guardar.isPending} onClick={() => guardar.mutate()}>
          Guardar
        </Boton>
      </div>
    </div>
  )
}

function CodigoQR({ restaurante }) {
  const avisar = useAvisar()
  if (!restaurante) return null
  const url = `/api/publico/${restaurante.slug}/qr.png`
  return (
    <div className="tarjeta flex items-center gap-4 p-5">
      <img src={url} alt="Código QR de la carta" className="size-24 shrink-0 rounded-lg border border-borde" />
      <div className="min-w-0">
        <p className="font-semibold">Carta digital por QR</p>
        <a href={`/carta/${restaurante.slug}`} target="_blank" rel="noreferrer" className="block truncate text-pequeno text-marca underline">
          Ver como cliente
        </a>
        <a href={`${url}?descargar=1`} download onClick={() => avisar('QR descargado', 'exito', 'Imprímelo y ponlo en las mesas.')}>
          <Boton variante="secundario" tamano="sm" className="mt-2">
            <Download size={16} /> Descargar QR
          </Boton>
        </a>
      </div>
    </div>
  )
}

function Categorias({ abierto, onCerrar }) {
  const qc = useQueryClient()
  const avisar = useAvisar()
  const [nombre, setNombre] = useState('')
  const { data = [] } = useQuery({ queryKey: ['categorias'], queryFn: () => obtener('/categorias/'), enabled: abierto })
  const crear = useMutation({
    mutationFn: () => api.post('/categorias/', { nombre, orden: data.length }),
    onSuccess: () => {
      setNombre('')
      qc.invalidateQueries({ queryKey: ['categorias'] })
      avisar('Categoría creada', 'exito')
    },
    onError: (e) => avisar('No se pudo crear', 'error', mensajeError(e)),
  })
  const borrar = useMutation({
    mutationFn: (id) => api.delete(`/categorias/${id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categorias'] }),
    onError: () => avisar('No se puede borrar', 'error', 'La categoría todavía tiene platos.'),
  })
  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Categorías de la carta">
      <ul className="mb-4 divide-y divide-borde">
        {data.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-2">
            <span>{c.nombre}</span>
            <Boton variante="fantasma" tamano="sm" onClick={() => borrar.mutate(c.id)}>Quitar</Boton>
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); nombre.trim() && crear.mutate() }}>
        <Campo className="flex-1">
          <input className="campo" placeholder="Nueva categoría, p. ej. Postres" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </Campo>
        <Boton type="submit" cargando={crear.isPending}>Agregar</Boton>
      </form>
    </Modal>
  )
}
