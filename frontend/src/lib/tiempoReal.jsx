import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/*
 * Sincronización en tiempo real.
 * El servidor avisa por WebSocket qué cambió ("platos", "pedidos"...) y aquí se
 * invalidan las consultas afectadas para que cada pantalla se actualice sola.
 */

const QUE_RECARGAR = {
  platos: [['platos'], ['cambios'], ['avisos'], ['porciones'], ['carta-publica']],
  pedidos: [['pedidos'], ['mesas'], ['avisos']],
  whatsapp: [['whatsapp']],
  inventario: [['productos'], ['movimientos'], ['platos']],
  restaurante: [['restaurante'], ['carta-publica']],
}

const Ctx = createContext({ conectado: false, escuchar: () => () => {} })

export function TiempoRealProvider({ slug, children }) {
  const qc = useQueryClient()
  const [conectado, setConectado] = useState(false)
  const oyentes = useRef(new Set())

  useEffect(() => {
    if (!slug) return
    let ws
    let reintento
    let ping
    let cerrado = false
    let espera = 1000

    const conectar = () => {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${window.location.host}/ws/${slug}/`)
      ws.onopen = () => {
        setConectado(true)
        espera = 1000
        // Al reconectar puede que se hayan perdido avisos: se recarga todo.
        qc.invalidateQueries()
        ping = setInterval(() => ws.readyState === 1 && ws.send('{"tipo":"ping"}'), 25000)
      }
      ws.onmessage = (e) => {
        let evento
        try {
          evento = JSON.parse(e.data)
        } catch {
          return
        }
        if (!evento.tema) return
        for (const clave of QUE_RECARGAR[evento.tema] || []) qc.invalidateQueries({ queryKey: clave })
        oyentes.current.forEach((fn) => fn(evento))
      }
      ws.onclose = () => {
        setConectado(false)
        clearInterval(ping)
        if (!cerrado) {
          reintento = setTimeout(conectar, espera)
          espera = Math.min(espera * 2, 15000)
        }
      }
    }
    conectar()
    return () => {
      cerrado = true
      clearTimeout(reintento)
      clearInterval(ping)
      ws?.close()
    }
  }, [slug, qc])

  const valor = useRef({
    escuchar: (fn) => {
      oyentes.current.add(fn)
      return () => oyentes.current.delete(fn)
    },
  }).current

  return <Ctx.Provider value={{ ...valor, conectado }}>{children}</Ctx.Provider>
}

export const useTiempoReal = () => useContext(Ctx)

/** Ejecuta `fn` con cada evento en vivo mientras el componente esté montado. */
export function useEventos(fn) {
  const { escuchar } = useTiempoReal()
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => escuchar((e) => ref.current(e)), [escuchar])
}
