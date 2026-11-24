import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, mensajeError } from './api'
import { useAvisar } from './avisos'

/**
 * Acción sobre un pedido: POST /pedidos/:id/<nombre>/.
 * Se llama con mutate({ id, ...datos }). Actualiza el detalle en caché y refresca listas y mesas.
 * `exito(pedido)` devuelve los argumentos del aviso a mostrar, o null para no avisar.
 */
export function useAccionPedido(nombre, exito) {
  const qc = useQueryClient()
  const avisar = useAvisar()
  return useMutation({
    mutationFn: ({ id, ...datos }) => api.post(`/pedidos/${id}/${nombre}/`, datos).then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(['pedidos', 'detalle', String(data.id)], data)
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['mesas'] })
      const aviso = exito?.(data)
      if (aviso) avisar(...aviso)
    },
    onError: (e) => avisar('No se pudo actualizar el pedido', 'error', mensajeError(e)),
  })
}

export const MENSAJES_COCINA = [
  'Sale en 5 minutos',
  'Falta un plato, sale enseguida',
  'Confirmen la nota del pedido',
  'Ya pueden recoger',
]

export const MENSAJES_SALA = [
  'El cliente tiene prisa',
  'El cliente pregunta cuánto falta',
  'Confirmado: va como dice la nota',
  'Sin cebolla en todo el pedido',
]
