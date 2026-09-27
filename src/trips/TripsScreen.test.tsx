// A10, A11 e A17 — .agent/Tasks/fase-6-viagens.md, seção 10: a Grade (números,
// herói com e sem próxima, planejadas, filtros de _Já fizemos_), a Linha do
// tempo (ordem e o "Hoje" no lugar certo) e a leitura que falha.
// ADR 0005: comportamento de tela se prova renderizando.
//
// Acervo (`test/fixtures.ts`): hoje 25/9/2026, Gabriel vê de SJC. Feitas:
// Paraty (set 2025) e Ilhabela (jul 2026); herói Lisboa (1–9 out, em 6 dias);
// planejadas depois: Gramado (dez) e Japão (abr 2027).

import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { distanceKm } from '../domain/onboarding'
import type { TripsApi } from './api'
import { seededTripsApi } from './test/fakeApi'
import {
  ALL_TRIPS,
  CITY_ILHABELA,
  CITY_PARATY,
  CITY_SJC,
  TRIP_GRAMADO,
  TRIP_ILHABELA,
  TRIP_ILHABELA_ID,
  TRIP_JAPAO,
  TRIP_LISBOA,
  TRIP_LISBOA_ID,
  TRIP_PARATY,
  TRIP_PARATY_ID,
  trip,
} from './test/fixtures'
import { renderTripsRoute } from './test/renderInTrips'

afterEach(() => window.history.replaceState(null, '', '/'))

async function renderGrid(options: Parameters<typeof seededTripsApi>[0] = {}, overrides: Partial<TripsApi> = {}) {
  const result = renderTripsRoute(seededTripsApi(options, overrides))
  await screen.findByRole('heading', { name: 'Nossas viagens', level: 1 })
  return result
}

const stat = (label: string) =>
  within(screen.getByRole('list', { name: 'Números das viagens feitas' }))
    .getByText(label)
    .closest('li') as HTMLElement

describe('A10 — cabeçalho e números (R3, R4)', () => {
  it('kicker com todas as viagens e o ano da primeira; os cinco números só das feitas', async () => {
    await renderGrid()
    expect(screen.getByText('5 viagens juntos desde 2025')).toBeInTheDocument()
    expect(stat('viagens feitas')).toHaveTextContent('2')
    expect(stat('país')).toHaveTextContent('1')
    expect(stat('cidades')).toHaveTextContent('2')
    const km = Math.round(2 * distanceKm(CITY_SJC, CITY_PARATY) + 2 * distanceKm(CITY_SJC, CITY_ILHABELA))
    expect(stat('viajados juntos')).toHaveTextContent(`${km.toLocaleString('pt-BR')}km`)
    expect(stat('viajando juntos')).toHaveTextContent('16dias')
  })

  it('sem viagens: "Nenhuma viagem ainda", números zerados e o convite da próxima', async () => {
    await renderGrid({ trips: [] })
    expect(screen.getByText('Nenhuma viagem ainda')).toBeInTheDocument()
    expect(stat('viagens feitas')).toHaveTextContent('0')
    expect(screen.getByRole('heading', { name: 'Para onde vai a próxima?' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Já fizemos' })).not.toBeInTheDocument()
  })

  it('Nova viagem abre o modal', async () => {
    await renderGrid()
    await userEvent.click(screen.getAllByRole('button', { name: 'Nova viagem' })[0])
    expect(screen.getByRole('dialog', { name: 'Nova viagem' })).toBeInTheDocument()
  })
})

describe('A10 — Próxima viagem (R5)', () => {
  it('a próxima planejada: datas, dias, rota de quem vê, as saídas, a contagem e as prontidões', async () => {
    await renderGrid()
    const hero = screen.getByRole('link', { name: 'Próxima viagem: Lisboa, Portugal' })
    expect(hero).toHaveTextContent('1–9 out 2026')
    expect(hero).toHaveTextContent('9 dias')
    expect(hero).toHaveTextContent('GRU → Lisboa')
    expect(hero).toHaveTextContent('Gabriel sai de GRU · Lana sai de POA')
    expect(hero).toHaveTextContent('em6dias')
    expect(hero).toHaveTextContent('2 de 3 prontos')
    const lines = within(hero).getAllByRole('listitem')
    expect(lines.map((l) => l.textContent)).toEqual(['PassagensTAP · GRU → LIS', 'HospedagemCasa do Largo · Alfama', 'Roteiro22% montado'])
    expect(within(lines[0]).getByLabelText('pronto')).toBeInTheDocument()
    expect(within(lines[2]).getByLabelText('falta')).toBeInTheDocument()
    expect(hero).toHaveAttribute('href', `/viagens/${TRIP_LISBOA_ID}`)
  })

  it('tocar no cartão abre o detalhe', async () => {
    await renderGrid()
    fireEvent.click(screen.getByRole('link', { name: 'Próxima viagem: Lisboa, Portugal' }))
    expect(window.location.pathname).toBe(`/viagens/${TRIP_LISBOA_ID}`)
  })

  it('em andamento: "Viajando agora · dia k de N" e a contagem some', async () => {
    const now = trip({ id: 'a0000000-0000-4000-8000-0000000000aa', title: 'Serra', cityId: CITY_PARATY.id, startsOn: '2026-09-23', endsOn: '2026-09-27' })
    await renderGrid({ trips: [...ALL_TRIPS, now] })
    const hero = screen.getByRole('link', { name: 'Viajando agora: Serra' })
    expect(hero).toHaveTextContent('Viajando agora · dia 3 de 5')
    expect(hero).not.toHaveTextContent(/em\d+dias/)
  })

  it('sem próxima nem em andamento: "Para onde vai a próxima?" com Nova viagem', async () => {
    await renderGrid({ trips: [TRIP_PARATY, TRIP_ILHABELA] })
    const empty = screen.getByRole('region', { name: 'Próxima viagem' })
    expect(empty).toHaveTextContent('Para onde vai a próxima?')
    await userEvent.click(within(empty).getByRole('button', { name: 'Nova viagem' }))
    expect(screen.getByRole('dialog', { name: 'Nova viagem' })).toBeInTheDocument()
  })
})

describe('A10 — Planejadas (R6)', () => {
  it('as outras planejadas, em ordem de data, com a nota e a contagem', async () => {
    await renderGrid()
    const section = screen.getByRole('region', { name: 'Planejadas' })
    expect(section).toHaveTextContent('2 mais pra frente')
    const cards = within(section).getAllByRole('link')
    expect(cards.map((c) => c.getAttribute('href'))).toEqual([`/viagens/${TRIP_GRAMADO.id}`, `/viagens/${TRIP_JAPAO.id}`])
    expect(cards[0]).toHaveTextContent('Planejada · Natal na serra')
    expect(cards[0]).toHaveTextContent('18–22 dez 2026 · 5 dias')
    expect(cards[0]).toHaveTextContent('em84dias')
    expect(cards[1]).toHaveTextContent(/^Planejada/)
    expect(cards[1]).not.toHaveTextContent('Planejada ·')
  })

  it('some quando só há a do herói', async () => {
    await renderGrid({ trips: [TRIP_PARATY, TRIP_LISBOA] })
    expect(screen.queryByRole('region', { name: 'Planejadas' })).not.toBeInTheDocument()
  })

  it('mais de duas: a fileira rola', async () => {
    const extra = trip({ id: 'a0000000-0000-4000-8000-0000000000bb', title: 'Bonito, MS', cityId: CITY_PARATY.id, startsOn: '2027-07-01', endsOn: '2027-07-05' })
    await renderGrid({ trips: [...ALL_TRIPS, extra] })
    expect(within(screen.getByRole('region', { name: 'Planejadas' })).getByRole('list')).toHaveClass('tr-planned--scroll')
  })
})

describe('A10 — Já fizemos e os filtros (R7)', () => {
  it('as feitas da mais recente, com país, datas, fotos, memórias e corações', async () => {
    await renderGrid()
    const section = screen.getByRole('region', { name: 'Já fizemos' })
    expect(section).toHaveTextContent('2 viagens')
    const cards = within(within(section).getByRole('list')).getAllByRole('link')
    expect(cards.map((c) => c.getAttribute('href'))).toEqual([`/viagens/${TRIP_ILHABELA_ID}`, `/viagens/${TRIP_PARATY_ID}`])
    expect(cards[0]).toHaveTextContent('Brasil')
    expect(cards[0]).toHaveTextContent('12–19 jul 2026 · 8 dias')
    expect(cards[0]).toHaveTextContent('12 fotos')
    expect(cards[0]).toHaveTextContent('2 memórias')
    expect(within(cards[0]).getByRole('img', { name: 'nota 5 de 5' })).toBeInTheDocument()
    expect(cards[1]).toHaveTextContent('1 memória')
    expect(within(cards[1]).getByRole('img', { name: 'nota 4 de 5' })).toBeInTheDocument()
  })

  it('chips: Todas, os anos do mais recente, Brasil (Exterior só com viagem fora); um só ativo', async () => {
    await renderGrid()
    const group = screen.getByRole('group', { name: 'Filtrar viagens feitas' })
    const chips = within(group).getAllByRole('button')
    expect(chips.map((c) => c.textContent)).toEqual(['Todas', '2026', '2025', 'Brasil'])
    expect(chips.filter((c) => c.getAttribute('aria-pressed') === 'true')).toEqual([chips[0]])

    await userEvent.click(chips[2])
    const section = screen.getByRole('region', { name: 'Já fizemos' })
    expect(within(within(section).getByRole('list')).getAllByRole('link').map((c) => c.getAttribute('href'))).toEqual([
      `/viagens/${TRIP_PARATY_ID}`,
    ])
    expect(within(group).getAllByRole('button').filter((c) => c.getAttribute('aria-pressed') === 'true').map((c) => c.textContent)).toEqual([
      '2025',
    ])
  })

  it('Exterior aparece com uma feita fora do Brasil, e filtra só ela', async () => {
    const lisboaDone = { ...TRIP_LISBOA, id: 'a0000000-0000-4000-8000-0000000000cc', startsOn: '2026-05-01', endsOn: '2026-05-05' }
    await renderGrid({ trips: [TRIP_PARATY, TRIP_ILHABELA, lisboaDone] })
    await userEvent.click(screen.getByRole('button', { name: 'Exterior' }))
    const section = screen.getByRole('region', { name: 'Já fizemos' })
    const cards = within(within(section).getByRole('list')).getAllByRole('link')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toHaveTextContent('Portugal')
  })
})

describe('A11 — Linha do tempo (R8)', () => {
  it('da mais distante no futuro à mais antiga, com o "Hoje · 25 set" entre futuras e passadas', async () => {
    await renderGrid()
    await userEvent.click(screen.getByRole('button', { name: 'Linha do tempo' }))
    expect(screen.getByRole('button', { name: 'Linha do tempo' })).toHaveAttribute('aria-pressed', 'true')
    const tl = screen.getByRole('region', { name: 'Linha do tempo' })
    const rows = [...tl.querySelectorAll('[data-trip]')]
    expect(rows.map((r) => r.getAttribute('data-trip'))).toEqual([TRIP_JAPAO.id, TRIP_GRAMADO.id, TRIP_LISBOA_ID, TRIP_ILHABELA_ID, TRIP_PARATY_ID])
    const today = within(tl).getByText('Hoje · 25 set')
    expect(rows[2].compareDocumentPosition(today) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(rows[3].compareDocumentPosition(today) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    // A Grade saiu da tela.
    expect(screen.queryByRole('region', { name: 'Já fizemos' })).not.toBeInTheDocument()
  })

  it('o texto de cada tipo: planejada, próxima e já fomos', async () => {
    await renderGrid()
    await userEvent.click(screen.getByRole('button', { name: 'Linha do tempo' }))
    const row = (id: string) => screen.getByRole('region', { name: 'Linha do tempo' }).querySelector(`[data-trip="${id}"]`) as HTMLElement
    expect(row(TRIP_JAPAO.id)).toHaveTextContent('abr2027')
    expect(row(TRIP_JAPAO.id)).toHaveTextContent('Planejada')
    expect(row(TRIP_JAPAO.id)).toHaveTextContent('3–17 abr · 15 dias · SJC → Tóquio')
    expect(row(TRIP_GRAMADO.id)).toHaveTextContent('18–22 dez · 5 dias · Natal na serra')
    expect(row(TRIP_LISBOA_ID)).toHaveTextContent('Próxima viagem')
    expect(row(TRIP_LISBOA_ID)).toHaveTextContent('em 6 dias')
    expect(row(TRIP_LISBOA_ID)).toHaveTextContent('2 de 3 prontos')
    expect(row(TRIP_ILHABELA_ID)).toHaveTextContent('Já fomos')
    expect(row(TRIP_ILHABELA_ID)).toHaveTextContent('12–19 jul · 8 dias')
    expect(row(TRIP_ILHABELA_ID)).toHaveTextContent('12 fotos · 2 memórias')
    expect(row(TRIP_ILHABELA_ID)).not.toHaveTextContent('Férias de inverno')
    fireEvent.click(within(row(TRIP_PARATY_ID)).getByRole('link'))
    expect(window.location.pathname).toBe(`/viagens/${TRIP_PARATY_ID}`)
  })

  it('só passadas: o "Hoje" fica no topo', async () => {
    await renderGrid({ trips: [TRIP_PARATY, TRIP_ILHABELA] })
    await userEvent.click(screen.getByRole('button', { name: 'Linha do tempo' }))
    const tl = screen.getByRole('region', { name: 'Linha do tempo' })
    const today = within(tl).getByText('Hoje · 25 set')
    const first = tl.querySelector('[data-trip]') as HTMLElement
    expect(first.compareDocumentPosition(today) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
  })
})

describe('A17 — leitura com falha', () => {
  it('mostra o erro, nunca a Grade vazia', async () => {
    renderTripsRoute(seededTripsApi({}, { loadTrips: vi.fn(async () => ({ status: 'error' as const, cause: 'pausado' })) }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para carregar as viagens.')
    expect(screen.queryByText('Nenhuma viagem ainda')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Para onde vai a próxima?' })).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Números das viagens feitas' })).not.toBeInTheDocument()
  })
})

describe('seção 8 — capas num lote', () => {
  it('um pedido de URLs com as capas (e as fotos dos sonhos), não um por cartão', async () => {
    const { api } = await renderGrid()
    await vi.waitFor(() => expect(api.signedUrls).toHaveBeenCalled())
    expect(api.signedUrls).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api.signedUrls).mock.calls[0][0]).toContain(TRIP_ILHABELA.photos[0].path)
  })
})
