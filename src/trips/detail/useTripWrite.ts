// R27 num hook só: grava, e só depois do `ok` relê; enquanto grava,
// `pending`; na falha, `failure` com a causa e quem chamou continua aberto.

import { useCallback, useState } from 'react'
import type { TripFailure } from '../api'
import { tripFailureMessage, useTrips } from '../context'

/**
 * R27: grava, e só depois do `ok` relê; enquanto grava, `pending`; na falha,
 * `failure` com a causa e o chamador continua aberto. `run` devolve se deu certo.
 */
export function useTripWrite() {
  const { reload } = useTrips()
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const run = useCallback(
    async (write: () => Promise<{ status: 'ok' } | TripFailure>, prefix = 'Não deu pra salvar'): Promise<boolean> => {
      setPending(true)
      setFailure(null)
      const result = await write()
      if (result.status !== 'ok') {
        setFailure(`${prefix}: ${tripFailureMessage(result)}`)
        setPending(false)
        return false
      }
      await reload()
      setPending(false)
      return true
    },
    [reload],
  )
  return { pending, failure, setFailure, run }
}
