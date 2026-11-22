import { createContext, useCallback, useContext, useState } from 'react'
import { CircleAlert, CircleCheck, Info } from 'lucide-react'

/* Avisos breves de confirmación ("Cambios guardados", "Pedido enviado"...). */

const Ctx = createContext(() => {})

const ICONOS = { exito: CircleCheck, error: CircleAlert, info: Info }
const COLORES = {
  exito: 'bg-texto text-white',
  error: 'bg-agotado text-white',
  info: 'bg-marca text-white',
}

export function AvisosProvider({ children }) {
  const [lista, setLista] = useState([])

  const avisar = useCallback((texto, tipo = 'exito', detalle = '') => {
    const id = Math.random().toString(36).slice(2)
    setLista((l) => [...l.slice(-2), { id, texto, tipo, detalle }])
    setTimeout(() => setLista((l) => l.filter((a) => a.id !== id)), tipo === 'error' ? 5000 : 3200)
  }, [])

  return (
    <Ctx.Provider value={avisar}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {lista.map((a) => {
          const Icono = ICONOS[a.tipo]
          return (
            <div
              key={a.id}
              role="status"
              className={`animate-entrar flex max-w-md items-start gap-3 rounded-xl px-4 py-3 shadow-lg ${COLORES[a.tipo]}`}
            >
              <Icono size={20} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">{a.texto}</p>
                {a.detalle && <p className="text-pequeno opacity-85">{a.detalle}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}

export const useAvisar = () => useContext(Ctx)
