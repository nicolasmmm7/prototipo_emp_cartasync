import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Camera } from 'lucide-react'
import { Boton, Campo, Cargando, Chip, Foto } from '../../components/ui'
import { api, mensajeError, obtener } from '../../lib/api'
import { useAvisar } from '../../lib/avisos'
import { dinero } from '../../lib/formato'

const VACIO = {
  nombre: '', categoria: '', descripcion: '', cobra_aparte: '', precio: '', costo: '',
  en_desayuno: false, en_almuerzo: true, en_cena: false, es_menu_del_dia: false, destacado: false,
  activo: true, alternativo: null, insumos: [],
}

/** 3C · Dueño — crear o editar plato. */
export default function PlatoForm() {
  const { id } = useParams()
  const nuevo = !id
  const nav = useNavigate()
  const qc = useQueryClient()
  const avisar = useAvisar()
  const archivo = useRef(null)
  const [f, setF] = useState(VACIO)
  const [errores, setErrores] = useState({})
  const [fotoNueva, setFotoNueva] = useState(null)

  const { data: plato, isLoading } = useQuery({ queryKey: ['platos', id], queryFn: () => obtener(`/platos/${id}/`), enabled: !nuevo })
  const { data: categorias = [] } = useQuery({ queryKey: ['categorias'], queryFn: () => obtener('/categorias/') })
  const { data: platos = [] } = useQuery({ queryKey: ['platos'], queryFn: () => obtener('/platos/') })
  const { data: productos = [] } = useQuery({ queryKey: ['productos'], queryFn: () => obtener('/productos/') })

  useEffect(() => {
    if (plato) setF({ ...VACIO, ...plato })
    else if (nuevo && categorias[0]) setF((s) => (s.categoria ? s : { ...s, categoria: categorias[0].id }))
  }, [plato, nuevo, categorias])

  const campo = (k) => ({ value: f[k] ?? '', onChange: (e) => setF({ ...f, [k]: e.target.value }) })
  const check = (k) => ({ checked: !!f[k], onChange: (e) => setF({ ...f, [k]: e.target.checked }) })

  const guardar = useMutation({
    mutationFn: async () => {
      const datos = {
        nombre: f.nombre, categoria: f.categoria, descripcion: f.descripcion, cobra_aparte: f.cobra_aparte,
        precio: Number(f.precio) || 0, costo: Number(f.costo) || 0, en_desayuno: f.en_desayuno,
        en_almuerzo: f.en_almuerzo, en_cena: f.en_cena, es_menu_del_dia: f.es_menu_del_dia,
        destacado: f.destacado, activo: f.activo, alternativo: f.alternativo || null, insumos: f.insumos,
      }
      const { data } = nuevo ? await api.post('/platos/', datos) : await api.patch(`/platos/${id}/`, datos)
      if (fotoNueva) {
        const fd = new FormData()
        fd.append('foto', fotoNueva)
        await api.patch(`/platos/${data.id}/`, fd)
      }
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['platos'] })
      avisar(nuevo ? 'Plato creado' : 'Cambios guardados', 'exito', `${data.nombre} ya está en la carta.`)
      nav('/admin/carta')
    },
    onError: (e) => {
      setErrores(e.response?.data || {})
      avisar('Revisa los datos del plato', 'error', mensajeError(e))
    },
  })
  const retirar = useMutation({
    mutationFn: () => api.delete(`/platos/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platos'] })
      avisar('Plato retirado de la carta', 'exito')
      nav('/admin/carta')
    },
  })

  if (!nuevo && isLoading) return <Cargando />

  const precio = Number(f.precio) || 0
  const margen = precio - (Number(f.costo) || 0)
  const pct = precio ? Math.round((100 * margen) / precio) : 0
  const fotoVista = fotoNueva ? URL.createObjectURL(fotoNueva) : f.foto
  const err = (k) => errores[k]?.[0]

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/admin/carta" className="mb-2 inline-flex items-center gap-1 text-pequeno text-texto-2 hover:text-texto">
        <ArrowLeft size={16} /> Volver a la carta
      </Link>
      <h1 className="mb-5">{nuevo ? 'Nuevo plato' : `Editar plato: ${plato?.nombre}`}</h1>

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); guardar.mutate() }}>
          <Seccion titulo="Datos del plato">
            <div className="mb-4 flex items-center gap-4">
              <Foto src={fotoVista} alt="" className="size-20 rounded-xl" />
              <input ref={archivo} type="file" accept="image/*" hidden onChange={(e) => {
                const a = e.target.files?.[0]
                if (a) { setFotoNueva(a); avisar('Foto actualizada', 'info', 'Se guarda al guardar los cambios.') }
              }} />
              <Boton variante="secundario" tamano="sm" onClick={() => archivo.current?.click()}>
                <Camera size={16} /> Cambiar foto
              </Boton>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Nombre" error={err('nombre')}>
                <input className="campo" required {...campo('nombre')} />
              </Campo>
              <Campo etiqueta="Categoría" error={err('categoria')}>
                <select className="campo" {...campo('categoria')}>
                  {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </Campo>
              <Campo etiqueta="Qué incluye" className="sm:col-span-2">
                <textarea className="campo min-h-20" placeholder="Arroz, papas a la francesa y ensalada." {...campo('descripcion')} />
              </Campo>
              <Campo etiqueta="Qué se cobra aparte" className="sm:col-span-2" ayuda="Así el cliente no se lleva sorpresas en la cuenta.">
                <input className="campo" placeholder="La bebida no está incluida" {...campo('cobra_aparte')} />
              </Campo>
            </div>
          </Seccion>

          <Seccion titulo="Precio y costo">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Precio de venta" error={err('precio')}>
                <input className="campo" inputMode="numeric" required {...campo('precio')} />
              </Campo>
              <Campo etiqueta="Costo de preparación" ayuda="Ingredientes y empaque por porción.">
                <input className="campo" inputMode="numeric" {...campo('costo')} />
              </Campo>
            </div>
            {precio > 0 && (
              <p className={`mt-3 rounded-lg px-3 py-2 text-pequeno font-medium ${pct < 50 ? 'bg-por-agotarse-fondo text-por-agotarse-texto' : 'bg-pagina'}`}>
                Este plato deja {dinero(margen)} ({pct}%) por cada venta.
              </p>
            )}
          </Seccion>

          <Seccion titulo="Disponibilidad">
            <p className="etiqueta-campo">Horario de servicio</p>
            <div className="mb-4 flex flex-wrap gap-2">
              {[['en_desayuno', 'Desayuno'], ['en_almuerzo', 'Almuerzo'], ['en_cena', 'Cena']].map(([k, t]) => (
                <Chip key={k} activo={f[k]} onClick={() => setF({ ...f, [k]: !f[k] })}>{t}</Chip>
              ))}
            </div>
            <p className="etiqueta-campo">Insumos clave</p>
            <p className="mb-2 text-etiqueta text-texto-2">Si un insumo se acaba en el inventario, el plato se marca agotado solo.</p>
            <div className="mb-4 flex flex-wrap gap-2">
              {productos.filter((p) => p.es_insumo).map((p) => {
                const sel = f.insumos.includes(p.id)
                return (
                  <Chip key={p.id} activo={sel} onClick={() => setF({ ...f, insumos: sel ? f.insumos.filter((x) => x !== p.id) : [...f.insumos, p.id] })}>
                    {p.nombre}
                  </Chip>
                )
              })}
              {!productos.some((p) => p.es_insumo) && <span className="text-pequeno text-tenue">Registra insumos en Inventario.</span>}
            </div>
            <Campo etiqueta="Plato alternativo si se agota" ayuda="Los meseros lo verán como sugerencia.">
              <select className="campo" value={f.alternativo ?? ''} onChange={(e) => setF({ ...f, alternativo: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Ninguno</option>
                {platos.filter((p) => String(p.id) !== String(id)).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </Campo>
          </Seccion>

          <Seccion titulo="Promoción (opcional)">
            <label className="flex items-center gap-3 py-1">
              <input type="checkbox" className="size-5 accent-marca" {...check('destacado')} />
              Destacar este plato para que los meseros lo ofrezcan
            </label>
            <label className="flex items-center gap-3 py-1">
              <input type="checkbox" className="size-5 accent-marca" {...check('es_menu_del_dia')} />
              Es parte del menú del día
            </label>
            {!nuevo && (
              <label className="flex items-center gap-3 py-1">
                <input type="checkbox" className="size-5 accent-marca" {...check('activo')} />
                Visible en la carta
              </label>
            )}
          </Seccion>

          <div className="flex flex-wrap justify-between gap-2 pb-6">
            {!nuevo ? (
              <Boton variante="peligro" cargando={retirar.isPending} onClick={() => confirm('¿Retirar este plato de la carta?') && retirar.mutate()}>
                Retirar de la carta
              </Boton>
            ) : <span />}
            <div className="flex gap-2">
              <Boton variante="secundario" onClick={() => nav('/admin/carta')}>Cancelar</Boton>
              <Boton type="submit" variante="oscuro" cargando={guardar.isPending}>Guardar cambios</Boton>
            </div>
          </div>
        </form>

        <aside className="tarjeta sticky top-6 p-5">
          <p className="mb-3 text-pequeno font-semibold text-texto-2">Así lo verá el cliente</p>
          <div className="flex gap-3">
            <Foto src={fotoVista} alt="" className="size-16 shrink-0 rounded-lg" />
            <div className="min-w-0">
              <p className="font-semibold">{f.nombre || 'Nombre del plato'}</p>
              <p className="text-pequeno text-texto-2">{f.descripcion || 'Qué incluye el plato.'}</p>
              {f.cobra_aparte && <p className="text-pequeno text-texto-2 italic">{f.cobra_aparte}</p>}
              <p className="mt-1 font-bold">{dinero(precio)}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Seccion({ titulo, children }) {
  return (
    <section className="tarjeta p-5">
      <h3 className="mb-4">{titulo}</h3>
      {children}
    </section>
  )
}
