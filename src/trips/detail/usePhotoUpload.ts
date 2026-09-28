// _Adicionar fotos_ (spec R21): até `TRIP_LIMITS.photosPerUpload` por vez, o
// progresso "Enviando {k} de {n}" e, no fim, "{x} fotos não subiram". A
// redução, o bucket e a linha em `trip_photos` são da fronteira de dados
// (`uploadTripPhotos`); aqui é o estado que a tela mostra.

import { useCallback, useState } from 'react'
import { TRIP_LIMITS } from '../../domain/trips'
import type { Trip } from '../../domain/trips'
import { useTrips } from '../context'

export type UploadState =
  | { phase: 'idle' }
  | { phase: 'sending'; done: number; total: number }
  | { phase: 'done'; message: string; failed: boolean }

/** "1 foto não subiu" · "3 fotos não subiram". */
export function notUploadedLabel(n: number): string {
  return n === 1 ? '1 foto não subiu' : `${n.toLocaleString('pt-BR')} fotos não subiram`
}

export function usePhotoUpload(trip: Trip) {
  const { api, coupleId, reload } = useTrips()
  const [state, setState] = useState<UploadState>({ phase: 'idle' })

  const upload = useCallback(
    async (list: FileList | readonly File[] | null) => {
      const files = list ? Array.from(list) : []
      if (files.length === 0) return
      if (files.length > TRIP_LIMITS.photosPerUpload) {
        setState({ phase: 'done', failed: true, message: `Escolha até ${TRIP_LIMITS.photosPerUpload} fotos por vez.` })
        return
      }
      setState({ phase: 'sending', done: 0, total: files.length })
      const result = await api.uploadPhotos(coupleId, trip, files, (done, total) => setState({ phase: 'sending', done, total }))
      if (result.status === 'unauthenticated') {
        setState({ phase: 'done', failed: true, message: 'Sua sessão expirou. Entre de novo.' })
        return
      }
      if (result.status === 'rejected') {
        setState({ phase: 'done', failed: true, message: result.reason })
        return
      }
      if (result.added.length > 0) await reload()
      const failed = result.failed.length
      setState(
        failed > 0
          ? { phase: 'done', failed: true, message: notUploadedLabel(failed) }
          : {
              phase: 'done',
              failed: false,
              message: result.added.length === 1 ? '1 foto adicionada' : `${result.added.length} fotos adicionadas`,
            },
      )
    },
    [api, coupleId, reload, trip],
  )

  const dismiss = useCallback(() => setState({ phase: 'idle' }), [])
  return { state, upload, dismiss }
}
