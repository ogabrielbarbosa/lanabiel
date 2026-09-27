// Monta um componente sobreposto da Lista (detalhe, Marcar como feito) dentro
// do `ListContext`, sem a tela inteira: o valor do contexto é o mesmo formato
// que a `ListScreen` publica, com o acervo de `fixtures.ts`.

import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { vi } from 'vitest'
import type { ListItem, ListMemory, ListPhoto, WhereWeAre } from '../../domain/list'
import { SJC } from '../../settings/test/fixtures'
import type { ListApi } from '../api'
import { ListContext } from '../context'
import type { ListContextValue, ListMember } from '../context'
import { GABRIEL, LANA, fakeListApi, listItems } from './fixtures'

export const MEMBER_GABRIEL: ListMember = {
  profileId: GABRIEL,
  name: 'Gabriel',
  color: '#7FD8C4',
  avatarUrl: null,
  homeCity: { id: SJC.id, name: SJC.name, lat: SJC.lat, lng: SJC.lng },
}

export const MEMBER_LANA: ListMember = {
  profileId: LANA,
  name: 'Lana',
  color: '#F4A3B4',
  avatarUrl: null,
  homeCity: { id: 'c-marau', name: 'Marau', lat: -28.4498, lng: -52.2 },
}

export const TOGETHER_SJC: WhereWeAre = {
  kind: 'together',
  city: { id: SJC.id, name: SJC.name, lat: SJC.lat, lng: SJC.lng },
  until: null,
}

export function listValue(overrides: Partial<ListContextValue> & { api?: ListApi } = {}): ListContextValue {
  return {
    api: fakeListApi(),
    coupleId: 'couple-1',
    me: MEMBER_GABRIEL,
    members: new Map([
      [GABRIEL, MEMBER_GABRIEL],
      [LANA, MEMBER_LANA],
    ]),
    items: listItems(),
    memories: [] as ListMemory[],
    photos: [] as ListPhoto[],
    urls: new Map(),
    where: { kind: 'unknown' },
    today: '2026-09-26',
    reload: vi.fn(async () => {}),
    ...overrides,
  }
}

export function renderInList(ui: ReactElement, value: ListContextValue) {
  const result = render(<ListContext.Provider value={value}>{ui}</ListContext.Provider>)
  return {
    ...result,
    rerenderWith: (next: ListContextValue) =>
      result.rerender(<ListContext.Provider value={next}>{ui}</ListContext.Provider>),
  }
}

export function itemById(id: string, items: ListItem[] = listItems()): ListItem {
  const item = items.find((i) => i.id === id)
  if (!item) throw new Error(`item ${id} fora do acervo`)
  return item
}
