// O contrato entre a tela da Lista e os componentes sobrepostos (modal de
// adicionar/editar, detalhe do item, marcar como feito). A `ListScreen` lê
// tudo e publica ESTE objeto; os filhos leem daqui com `useList()` em vez de
// buscar de novo, e chamam `reload()` depois de cada escrita própria (ADR 0015).
//
// Spec: .agent/Tasks/fase-4-lista.md, seções 5 e 7 · R28
//
// Mudar um campo aqui é mudar o contrato de três componentes: acrescente, não
// renomeie.

import { createContext, useContext } from 'react'
import type { ListFailure } from '../data/list'
import type { ListItem, ListMemory, ListPhoto, WhereWeAre } from '../domain/list'
import type { ListApi } from './api'

/** Um integrante do casal, como a Lista o mostra. */
export interface ListMember {
  profileId: string
  /** `display_name` — "Gabriel". */
  name: string
  /** Cor da pessoa (dado, não tema): avatar sem foto e marcas de autoria. */
  color: string
  /** URL assinada do avatar, ou `null` (iniciais sobre a cor). */
  avatarUrl: string | null
  /** A cidade-casa — só como viés da busca de lugar (R13), nunca como "onde está". */
  homeCity: { id: string; name: string; lat: number; lng: number }
}

export interface ListContextValue {
  api: ListApi
  /** O casal de quem está vendo: vai como DADO no insert (a policy confere). */
  coupleId: string
  /** Quem está vendo. */
  me: ListMember
  /** Os integrantes por `profileId` (os dois, na ordem do slot). */
  members: ReadonlyMap<string, ListMember>
  /** Todos os itens lidos, SEM o corte das categorias ocultas (o detalhe abre qualquer um). */
  items: readonly ListItem[]
  memories: readonly ListMemory[]
  photos: readonly ListPhoto[]
  /** Caminho no Storage → URL assinada (1 h). Caminho ausente = sem URL: mostre o fundo da categoria. */
  urls: ReadonlyMap<string, string>
  /** Onde o casal está hoje (I9, I11). Distância só com `kind === 'together'`. */
  where: WhereWeAre
  /** `YYYY-MM-DD`, do relógio injetado. */
  today: string
  /**
   * Relê itens, memórias, fotos e URLs. Nunca rejeita: uma releitura que
   * falha mantém o que está na tela e mostra o aviso da própria tela.
   */
  reload: () => Promise<void>
}

export const ListContext = createContext<ListContextValue | null>(null)

/** Para os componentes dentro da `ListScreen`. Fora dela é erro de montagem. */
export function useList(): ListContextValue {
  const value = useContext(ListContext)
  if (!value) throw new Error('useList() fora da ListScreen')
  return value
}

/** Nome de quem fez algo, ou "Alguém" para quem já saiu do casal. */
export function memberName(members: ReadonlyMap<string, ListMember>, profileId: string | null): string {
  return (profileId && members.get(profileId)?.name) || 'Alguém'
}

/**
 * Mensagem de uma escrita que não deu `ok`, para mostrar junto do controle.
 * `invalid` mostra a causa do banco: o cliente já valida, então chegar aqui é
 * divergência, e ela precisa aparecer (seção 7).
 */
export function failureMessage(result: ListFailure): string {
  switch (result.status) {
    case 'invalid':
      return result.cause
    case 'photo_limit':
      return 'Esse item já tem 10 fotos'
    case 'not_found':
      return 'Este item não está mais na lista.'
    case 'unauthenticated':
      return 'Sua sessão expirou. Entre de novo.'
    case 'error':
      return result.cause
  }
}
