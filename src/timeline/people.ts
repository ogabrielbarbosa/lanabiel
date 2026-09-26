import type { Person, PersonId } from './types'

export const PEOPLE: readonly [Person, Person] = [
  { id: 'gabriel', name: 'Gabriel', color: '#3b82f6' },
  { id: 'lana', name: 'Lana', color: '#ec4899' },
]

export function personById(id: PersonId): Person {
  const person = PEOPLE.find((p) => p.id === id)
  if (!person) throw new Error(`Pessoa desconhecida: ${id}`)
  return person
}
