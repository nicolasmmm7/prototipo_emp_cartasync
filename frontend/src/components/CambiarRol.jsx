import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, LayoutPanelLeft, LogOut, Repeat } from 'lucide-react'
import { mensajeError } from '../lib/api'
import { useAvisar } from '../lib/avisos'
import { CLAVE_DEMO, USUARIOS_DEMO } from '../lib/demo'
import { useSesion } from '../lib/sesion'
import { Boton, Modal } from './ui'

/**
 * Cambia de rol sin pasar por la pantalla de ingreso (prototipo).
 * Solo afecta a esta pestaña: las demás siguen con su propio rol.
 */
export function useCambiarRol() {
  const [abierto, setAbierto] = useState(false)
  const ventana = (
    <VentanaCambiarRol abierto={abierto} onCerrar={() => setAbierto(false)} />
  )
  return { abrir: () => setAbierto(true), ventana }
}

export function BotonCambiarRol({ className = '' }) {
  const { abrir, ventana } = useCambiarRol()
  return (
    <>
      <Boton variante="secundario" tamano="sm" className={className} onClick={abrir}>
        <Repeat size={16} /> Cambiar de rol
      </Boton>
      {ventana}
    </>
  )
}

function VentanaCambiarRol({ abierto, onCerrar }) {
  const { usuario, ingresar, salir } = useSesion()
  const nav = useNavigate()
  const avisar = useAvisar()
  const [cargando, setCargando] = useState(null)

  const cambiar = async (d) => {
    if (d.usuario === usuario?.username) return onCerrar()
    setCargando(d.usuario)
    try {
      await ingresar(d.usuario, CLAVE_DEMO)
      onCerrar()
      nav(d.inicio)
    } catch (e) {
      avisar('No se pudo cambiar de rol', 'error', mensajeError(e))
    } finally {
      setCargando(null)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Cambiar de rol">
      <p className="mb-4 text-pequeno text-texto-2">
        Solo cambia esta pestaña. Para ver varios roles a la vez, abre otra pestaña o usa el modo demostración.
      </p>
      <ul className="space-y-2">
        {USUARIOS_DEMO.map((d) => {
          const actual = d.usuario === usuario?.username
          const I = d.icono
          return (
            <li key={d.usuario}>
              <button
                type="button"
                disabled={!!cargando}
                onClick={() => cambiar(d)}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                  actual ? 'border-marca bg-marca-suave' : 'border-borde hover:border-borde-fuerte hover:bg-pagina'
                }`}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-superficie text-marca">
                  <I size={20} />
                </span>
                <span className="flex-1">
                  <span className="block font-semibold">{d.nombre}</span>
                  <span className="text-pequeno text-texto-2">{d.rolTexto}</span>
                </span>
                {actual && <Check size={18} className="text-marca" />}
                {cargando === d.usuario && <span className="text-pequeno text-texto-2">Entrando…</span>}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-borde pt-4">
        <Link to="/demo" target="_blank" className="flex-1">
          <Boton variante="secundario" className="w-full">
            <LayoutPanelLeft size={18} /> Modo demostración
          </Boton>
        </Link>
        <Boton
          variante="fantasma"
          onClick={() => {
            salir()
            onCerrar()
            nav('/ingresar')
          }}
        >
          <LogOut size={18} /> Salir
        </Boton>
      </div>
    </Modal>
  )
}
