import { todayISO } from '../lib/date'
import { PEOPLE } from './people'
import type { Stay } from './types'

export const EXPORT_VERSION = 1

export interface StaysExport {
  version: number
  /** Instante do export, ISO 8601 completo. */
  exportedAt: string
  people: typeof PEOPLE
  stays: Stay[]
}

/** Snapshot completo do calendário — o mesmo formato que o localStorage guarda,
 *  com metadados suficientes para reimportar depois. */
export function buildExport(stays: Stay[]): StaysExport {
  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    people: PEOPLE,
    stays,
  }
}

export function exportFileName(): string {
  return `lanabiel-${todayISO()}.json`
}

/** Baixa o snapshot como arquivo. Só lê o estado — não escreve nada. */
export function downloadExport(stays: Stay[]): void {
  const blob = new Blob([JSON.stringify(buildExport(stays), null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = exportFileName()
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
