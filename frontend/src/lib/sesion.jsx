import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { guardarSesion, leerSesion } from './api'

const Ctx = createContext(null)

export function SesionProvider({ children }) {
  const [sesion, setSesion] = useState(leerSesion)
  const qc = useQueryClient()

  // Entrar con otro usuario reemplaza la sesión de esta pestaña y limpia los datos del anterior.
  const ingresar = useCallback(
    async (username, password) => {
      const { data } = await axios.post('/api/auth/login/', { username, password })
      qc.clear()
      guardarSesion(data)
      setSesion(data)
      return data.usuario
    },
    [qc],
  )

  const salir = useCallback(() => {
    guardarSesion(null)
    setSesion(null)
    qc.clear()
  }, [qc])

  const valor = useMemo(
    () => ({ usuario: sesion?.usuario ?? null, ingresar, salir }),
    [sesion, ingresar, salir],
  )
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export const useSesion = () => useContext(Ctx)
