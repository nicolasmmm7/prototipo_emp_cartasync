import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, GraduationCap, LifeBuoy } from 'lucide-react'
import { Boton, Campo, Cargando, Modal } from '../../components/ui'
import { api, mensajeError, obtener } from '../../lib/api'
import { useAvisar } from '../../lib/avisos'
import { dinero, fechaCorta } from '../../lib/formato'

// Precios de ejemplo: el precio mensual sigue siendo una pregunta abierta del proyecto.
const PLANES = {
  un_local: { nombre: 'Plan para un local', precio: 79000, texto: 'Un local, usuarios de cocina, sala y caja.' },
  varias_sedes: { nombre: 'Plan para varias sedes', precio: 129000, texto: 'Varios locales de un mismo dueño, con estadísticas por sede.' },
}
const DESCUENTO_TEMPORADA = 0.3

/** 4C · Dueño — plan, capacitación y soporte. */
export default function Plan() {
  const qc = useQueryClient()
  const avisar = useAvisar()
  const [solicitud, setSolicitud] = useState(null)
  const [historial, setHistorial] = useState(false)
  const { data: r } = useQuery({ queryKey: ['restaurante'], queryFn: () => obtener('/restaurante/') })
  const { data: solicitudes = [] } = useQuery({ queryKey: ['soporte'], queryFn: () => obtener('/soporte/') })

  const actualizar = useMutation({
    mutationFn: (datos) => api.patch('/restaurante/', datos).then((x) => x.data),
    onSuccess: (d, datos) => {
      qc.invalidateQueries({ queryKey: ['restaurante'] })
      if ('temporada_baja' in datos) {
        avisar(datos.temporada_baja ? 'Temporada baja activada' : 'Temporada baja desactivada', 'exito',
          datos.temporada_baja ? `Pagas ${Math.round(DESCUENTO_TEMPORADA * 100)}% menos en los meses de menos movimiento.` : '')
      } else avisar('Plan actualizado', 'exito', d.plan_nombre)
    },
    onError: (e) => avisar('No se pudo actualizar', 'error', mensajeError(e)),
  })

  if (!r) return <Cargando />
  const plan = PLANES[r.plan]
  const precio = Math.round(plan.precio * (r.temporada_baja ? 1 - DESCUENTO_TEMPORADA : 1))
  const diasPrueba = r.prueba_hasta ? Math.max(0, Math.ceil((new Date(`${r.prueba_hasta}T23:59:59`) - Date.now()) / 864e5)) : 0

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h1>Plan y soporte</h1>

      <section className="tarjeta flex flex-wrap items-center justify-between gap-4 border-2 border-texto p-5">
        <div>
          <p className="text-pequeno text-texto-2">Tu plan actual</p>
          <p className="text-h2 font-bold">{plan.nombre} · {dinero(precio)} al mes</p>
          <p className="text-pequeno text-texto-2">
            {diasPrueba > 0 ? `Periodo de prueba: quedan ${diasPrueba} días · primer cobro el ${fechaCorta(r.prueba_hasta)}` : 'Suscripción activa'}
          </p>
        </div>
        <Boton variante="secundario" onClick={() => setHistorial(true)}>Ver historial de pagos</Boton>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        {Object.entries(PLANES).map(([clave, p]) => {
          const actual = r.plan === clave
          return (
            <section key={clave} className={`tarjeta flex flex-col p-5 ${actual ? 'border-marca ring-2 ring-marca-suave' : ''}`}>
              <p className="font-semibold">{p.nombre}</p>
              <p className="text-h2 font-bold">{dinero(p.precio)} <span className="text-pequeno font-normal text-texto-2">/ mes</span></p>
              <p className="mt-1 mb-4 text-pequeno text-texto-2">{p.texto}</p>
              {actual ? (
                <p className="mt-auto flex items-center gap-1.5 text-pequeno font-semibold text-marca"><Check size={16} /> Tu plan</p>
              ) : (
                <Boton variante="oscuro" className="mt-auto" cargando={actualizar.isPending} onClick={() => actualizar.mutate({ plan: clave })}>
                  Cambiar a este plan
                </Boton>
              )}
            </section>
          )
        })}
        <section className="tarjeta p-5">
          <p className="font-semibold">Temporada baja</p>
          <p className="mt-1 mb-4 text-pequeno text-texto-2">Ajusta tu plan en los meses de menos movimiento: pagas {Math.round(DESCUENTO_TEMPORADA * 100)}% menos.</p>
          <label className="flex items-center gap-3 text-pequeno">
            <input type="checkbox" className="size-5 accent-marca" checked={r.temporada_baja} onChange={(e) => actualizar.mutate({ temporada_baja: e.target.checked })} />
            Activar ajuste de temporada baja
          </label>
        </section>
      </div>
      <p className="text-etiqueta text-tenue">Precios de ejemplo para el prototipo; el valor final está por definir.</p>

      <section className="tarjeta p-5">
        <h3>Capacitación y soporte</h3>
        <p className="mt-1 mb-4 text-pequeno text-texto-2">Solicita una capacitación para tu equipo o ayuda con la plataforma.</p>
        <div className="flex flex-wrap gap-2">
          <Boton variante="oscuro" onClick={() => setSolicitud('capacitacion')}><GraduationCap size={18} /> Solicitar capacitación</Boton>
          <Boton variante="secundario" onClick={() => setSolicitud('soporte')}><LifeBuoy size={18} /> Solicitar soporte</Boton>
        </div>
        <p className="mt-5 mb-2 text-pequeno font-semibold">Solicitudes recientes</p>
        <ul className="divide-y divide-borde">
          {solicitudes.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
              <span>{s.descripcion}</span>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-etiqueta font-semibold ${s.estado === 'resuelta' ? 'bg-texto text-white' : 'border border-borde-fuerte'}`}>
                {s.estado_nombre} · {fechaCorta(s.creado.slice(0, 10))}
              </span>
            </li>
          ))}
          {solicitudes.length === 0 && <li className="py-2 text-pequeno text-texto-2">Sin solicitudes.</li>}
        </ul>
      </section>

      <FormSolicitud tipo={solicitud} onCerrar={() => setSolicitud(null)} />
      <Modal abierto={historial} onCerrar={() => setHistorial(false)} titulo="Historial de pagos">
        <p className="text-pequeno text-texto-2">
          {diasPrueba > 0 ? 'Aún estás en el periodo de prueba: no se ha hecho ningún cobro.' : 'Los pagos aparecerán aquí cuando se conecte la pasarela de pagos.'}
        </p>
      </Modal>
    </div>
  )
}

function FormSolicitud({ tipo, onCerrar }) {
  const qc = useQueryClient()
  const avisar = useAvisar()
  const [texto, setTexto] = useState('')
  const guardar = useMutation({
    mutationFn: () => api.post('/soporte/', { tipo, descripcion: texto }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['soporte'] })
      avisar(tipo === 'capacitacion' ? 'Capacitación solicitada' : 'Soporte solicitado', 'exito', 'Te contactaremos en menos de 24 horas.')
      setTexto('')
      onCerrar()
    },
    onError: (e) => avisar('No se pudo enviar', 'error', mensajeError(e)),
  })
  return (
    <Modal
      abierto={!!tipo}
      onCerrar={onCerrar}
      titulo={tipo === 'capacitacion' ? 'Solicitar capacitación' : 'Solicitar soporte'}
      pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton disabled={!texto.trim()} cargando={guardar.isPending} onClick={() => guardar.mutate()}>Enviar</Boton></>}
    >
      <Campo etiqueta={tipo === 'capacitacion' ? '¿Para quién y sobre qué?' : '¿Qué está pasando?'}>
        <textarea
          className="campo min-h-28"
          placeholder={tipo === 'capacitacion' ? 'Capacitación para los meseros nuevos del turno de la tarde' : 'La pantalla de cocina no actualizó un plato'}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
      </Campo>
    </Modal>
  )
}
