import { useEffect, useState } from 'react'
import type { Stay } from './types'
import { loadEntries, saveEntries } from './storage'

function sortByStart(entries: Stay[]): Stay[] {
  return [...entries].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
}

export function useTimeline() {
  const [entries, setEntries] = useState<Stay[]>(() => sortByStart(loadEntries()))

  useEffect(() => {
    saveEntries(entries)
  }, [entries])

  function addEntry(entry: Omit<Stay, 'id'>) {
    const id = crypto.randomUUID()
    setEntries((prev) => sortByStart([...prev, { ...entry, id }]))
  }

  function updateEntry(id: string, patch: Partial<Omit<Stay, 'id'>>) {
    setEntries((prev) =>
      sortByStart(prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))),
    )
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((entry) => entry.id !== id))
  }

  return { entries, addEntry, updateEntry, removeEntry }
}
