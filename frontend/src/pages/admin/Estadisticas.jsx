import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download, Mail, TrendingDown, TrendingUp } from 'lucide-react'
import { Boton, Cargando, Chip, ErrorCarga } from '../../components/ui'
import { api, mensajeError, obtener } from '../../lib/api'
import { useAvisar } from '../../lib/avisos'
import { dinero, fechaCorta, numero } from '../../lib/formato'

const PERIODOS = [
  { clave: 'dia', texto: 'Hoy' },
  { clave: 'semana', texto: 'Últimos 7 días' },
  { clave: 'mes', texto: 'Últimos 30 días' },
]
// Una sola serie: un tono de la marca. La barra más alta va en el tono oscuro.
const BARRA = '#6F96A4'
const BARRA_PICO = '#1F4E5F'

const horaTexto = (h) => (h === 12 ? '12 m.' : h < 12 ? `${h} a.m.` : `${h - 12} p.m.`)
const compacto = (v) => (v >= 1e6 ? `${Number((v / 1e6).toFixed(2))}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : v)

/** 3A · Dueño — panel de estadísticas. */
export default function Estadisticas() {
  const [periodo, setPeriodo] = useState('semana')
  const avisar = useAvisar()
  const { data: d, isLoading, error, refetch } = useQuery({
    queryKey: ['estadisticas', periodo],
    queryFn: () => obtener('/estadisticas/', { periodo }),
  })

  const resumen = useMutation({
    mutationFn: () => api.post('/estadisticas/resumen/').then((r) => r.data),
    onSuccess: (r) => avisar('Resumen enviado', 'exito', `Se envió a ${r.enviado_a}`),
    onError: (e) => avisar('No se pudo enviar', 'error', mensajeError(e)),
  })
  const exportar = async () => {
    try {
      const r = await api.get('/estadisticas/exportar/', { params: { periodo }, responseType: 'blob' })
      const url = URL.createObjectURL(r.data)
      const a = Object.assign(document.createElement('a'), { href: url, download: `cartasync-${periodo}.csv` })
      a.click()
      URL.revokeObjectURL(url)
      avisar('Reporte descargado', 'exito', 'Ábrelo con Excel.')
    } catch (e) {
      avisar('No se pudo descargar', 'error', mensajeError(e))
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Estadísticas</h1>
          <p className="mt-1 text-texto-2">
            {d ? `Del ${fechaCorta(d.desde)} al ${fechaCorta(d.hasta)}` : '…'} · pedidos registrados por sala y caja
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PERIODOS.map((p) => (
            <Chip key={p.clave} activo={periodo === p.clave} onClick={() => setPeriodo(p.clave)}>
              {p.texto}
            </Chip>
          ))}
          <Boton variante="secundario" tamano="sm" onClick={exportar}>
            <Download size={16} /> Exportar a Excel
          </Boton>
        </div>
      </div>

      {isLoading ? (
        <Cargando />
      ) : error ? (
        <ErrorCarga error={error} reintentar={refetch} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador titulo="Ventas" valor={dinero(d.ventas)} actual={d.ventas} previo={d.ventas_previas} />
            <Indicador titulo="Pedidos" valor={numero(d.pedidos)} actual={d.pedidos} previo={d.pedidos_previos} />
            <Indicador titulo="Ticket promedio" valor={dinero(d.ticket_promedio)} />
            <Indicador titulo="Ganancia estimada" valor={dinero(d.ganancia)} nota={d.ventas ? `${Math.round((100 * d.ganancia) / d.ventas)}% de las ventas` : ''} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
            <section className="tarjeta p-5">
              <h3>Ventas por franja horaria</h3>
              <p className="mb-4 text-pequeno text-texto-2">La barra oscura marca la hora de más ventas. Pasa el cursor para ver el valor.</p>
              <GraficoBarras datos={d.por_hora.map((x) => ({ etiqueta: horaTexto(x.hora), ventas: x.ventas }))} />
            </section>
            <section className="tarjeta p-5">
              <h3>Ventas por día</h3>
              <p className="mb-4 text-pequeno text-texto-2">Para planear compras y turnos.</p>
              <GraficoBarras datos={d.por_dia.map((x) => ({ etiqueta: x.dia, ventas: x.ventas }))} alto={240} />
            </section>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Ranking titulo="Más vendidos" items={d.mas_vendidos} />
            <Ranking titulo="Menos vendidos" items={d.menos_vendidos} tenue />
            <section className="tarjeta p-5">
              <h3>Agotamientos</h3>
              <p className="mb-3 text-pequeno text-texto-2">Cuántas veces y a qué hora se acabó cada plato.</p>
              {d.agotamientos.length === 0 ? (
                <p className="text-pequeno text-texto-2">Ningún plato se agotó en este periodo.</p>
              ) : (
                <ul className="divide-y divide-borde">
                  {d.agotamientos.slice(0, 6).map((a) => (
                    <li key={a.plato} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="font-medium">{a.plato}</span>
                      <span className="text-right text-pequeno text-texto-2">
                        <strong className="text-texto">{a.veces}</strong> {a.veces === 1 ? 'vez' : 'veces'} · cerca de las {a.hora_frecuente}:00
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {d.agotamientos[0] && (
                <p className="mt-3 rounded-lg bg-acento-suave px-3 py-2 text-pequeno">
                  Sugerencia: prepara más {d.agotamientos[0].plato.toLowerCase()} o define un alternativo antes de las {d.agotamientos[0].hora_frecuente}:00.
                </p>
              )}
            </section>
          </div>

          <section className="tarjeta overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-3">
              <div>
                <h3>Margen e ingreso por plato</h3>
                <p className="text-pequeno text-texto-2">Ordenado por la ganancia que deja en el periodo.</p>
              </div>
              <Boton variante="secundario" tamano="sm" cargando={resumen.isPending} onClick={() => resumen.mutate()}>
                <Mail size={16} /> Enviar resumen semanal
              </Boton>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-pequeno">
                <thead className="border-y border-borde bg-pagina text-texto-2">
                  <tr>
                    {['Plato', 'Precio', 'Costo', 'Margen', 'Vendidos', 'Ingreso', 'Ganancia', 'Calificación'].map((h, i) => (
                      <th key={h} className={`px-5 py-2.5 font-semibold ${i > 0 ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde tabular-nums">
                  {d.platos.map((p) => (
                    <tr key={p.id} className="hover:bg-pagina">
                      <td className="px-5 py-2.5">
                        <p className="font-medium">{p.nombre}</p>
                        <p className="text-etiqueta text-texto-2">{p.categoria}</p>
                      </td>
                      <td className="px-5 py-2.5 text-right">{dinero(p.precio)}</td>
                      <td className="px-5 py-2.5 text-right">{dinero(p.costo)}</td>
                      <td className={`px-5 py-2.5 text-right font-semibold ${p.margen_pct < 50 ? 'text-por-agotarse-texto' : ''}`}>{p.margen_pct}%</td>
                      <td className="px-5 py-2.5 text-right">{numero(p.cantidad)}</td>
                      <td className="px-5 py-2.5 text-right">{dinero(p.ingreso)}</td>
                      <td className="px-5 py-2.5 text-right font-semibold">{dinero(p.ganancia)}</td>
                      <td className="px-5 py-2.5 text-right">{p.calificacion ? `★ ${p.calificacion}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function Indicador({ titulo, valor, actual, previo, nota }) {
  const cambio = previo ? Math.round(((actual - previo) / previo) * 100) : null
  const sube = cambio > 0
  return (
    <div className="tarjeta p-4">
      <p className="text-pequeno text-texto-2">{titulo}</p>
      <p className="mt-1 text-h2 font-bold tabular-nums sm:text-h1">{valor}</p>
      {cambio != null ? (
        <p className={`mt-1 flex items-center gap-1 text-etiqueta font-semibold ${sube ? 'text-disponible' : cambio < 0 ? 'text-agotado' : 'text-texto-2'}`}>
          {sube ? <TrendingUp size={14} /> : cambio < 0 ? <TrendingDown size={14} /> : null}
          {sube ? '+' : ''}
          {cambio}% <span className="font-normal text-texto-2">vs. periodo anterior</span>
        </p>
      ) : (
        nota && <p className="mt-1 text-etiqueta text-texto-2">{nota}</p>
      )}
    </div>
  )
}

function GraficoBarras({ datos, alto = 260 }) {
  const max = Math.max(...datos.map((d) => d.ventas))
  return (
    <div style={{ height: alto }} role="img" aria-label="Gráfico de ventas">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 22, right: 4, left: 0, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="#EEF0F2" />
          <XAxis dataKey="etiqueta" tickLine={false} axisLine={{ stroke: '#DCE0E4' }} tick={{ fontSize: 12, fill: '#5C636B' }} interval="preserveStartEnd" />
          <YAxis tickCount={5} tickFormatter={compacto} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#5C636B' }} width={44} />
          <Tooltip
            cursor={{ fill: '#F4F5F7' }}
            formatter={(v) => [dinero(v), 'Ventas']}
            contentStyle={{ borderRadius: 8, border: '1px solid #DCE0E4', fontSize: 14 }}
          />
          <Bar dataKey="ventas" radius={[4, 4, 0, 0]} maxBarSize={24}>
            {datos.map((d) => (
              <Cell key={d.etiqueta} fill={d.ventas === max ? BARRA_PICO : BARRA} />
            ))}
            <LabelList
              dataKey="ventas"
              position="top"
              content={({ x, y, width, value }) =>
                value === max && value > 0 ? (
                  <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={12} fontWeight={600} fill="#1A1D21">
                    {compacto(value)}
                  </text>
                ) : null
              }
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function Ranking({ titulo, items, tenue }) {
  const max = Math.max(1, ...items.map((i) => i.cantidad))
  return (
    <section className="tarjeta p-5">
      <h3 className="mb-3">{titulo}</h3>
      {items.length === 0 ? (
        <p className="text-pequeno text-texto-2">Sin datos suficientes.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((p) => (
            <li key={p.id}>
              <div className="mb-1 flex justify-between gap-2 text-pequeno">
                <span className="font-medium">{p.nombre}</span>
                <span className="tabular-nums text-texto-2">{numero(p.cantidad)} und</span>
              </div>
              <div className="h-2 rounded-full bg-pagina">
                <div className="h-full rounded-full" style={{ width: `${(100 * p.cantidad) / max}%`, background: tenue ? BARRA : BARRA_PICO }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
