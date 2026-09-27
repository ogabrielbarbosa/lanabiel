// A12 — .agent/Tasks/fase-6-viagens.md (R9–R13) · ADR 0021: o painel _Pelo
// mundo, juntos_ — pins projetados (lat/lng → %), arcos, legenda, destinos dos
// sonhos com _Planejar_, recordes e "Há um ano".
// ADR 0005: comportamento de tela se prova renderizando.

import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { distanceKm } from '../domain/onboarding'
import { project } from '../domain/tripDerive'
import { TripsPanel } from './TripsPanel'
import {
  ALL_TRIPS,
  CITY_ILHABELA,
  CITY_LISBOA,
  CITY_PARATY,
  CITY_SJC,
  CITY_TOQUIO,
  ITEM_BUENOS_AIRES,
  ITEM_FILME,
  ITEM_JAPAO,
  TRIP_GRAMADO,
  TRIP_ILHABELA,
  TRIP_LISBOA,
  TRIP_PARATY,
  TRIP_PARATY_ID,
  trip,
} from './test/fixtures'
import { renderInTrips, tripsValue } from './test/renderInTrips'
import type { TripsValueOptions } from './test/renderInTrips'

afterEach(() => window.history.replaceState(null, '', '/'))

function renderPanel(options: TripsValueOptions = {}) {
  const onPlan = vi.fn()
  renderInTrips(<TripsPanel onPlan={onPlan} />, tripsValue(options))
  return { onPlan }
}

const card = (name: string) => screen.getByRole('region', { name })

describe('R9 — cabeçalho', () => {
  it('a data de hoje por extenso e o título', () => {
    renderPanel()
    expect(screen.getByText('Sexta, 25 de setembro')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Pelo mundo, juntos' })).toBeInTheDocument()
  })
})

describe('A12 — Onde já estivemos (R10, ADR 0021)', () => {
  it('um pin por destino, verde nas feitas e vazado nas planejadas, e a casa de quem vê', () => {
    renderPanel()
    const map = within(card('Onde já estivemos')).getByRole('img', { name: /Mapa/ })
    const pins = [...map.querySelectorAll('[data-pin]')].map((p) => `${p.getAttribute('data-pin')}:${p.getAttribute('data-city')}`)
    expect(pins.sort()).toEqual(
      ['done:Paraty', 'done:Ilhabela', 'planned:Lisboa', 'planned:Gramado', 'planned:Tóquio', 'home:São José dos Campos'].sort(),
    )
  })

  it('a posição é a projeção equiretangular, em % da caixa', () => {
    renderPanel()
    const map = within(card('Onde já estivemos')).getByRole('img', { name: /Mapa/ })
    for (const city of [CITY_LISBOA, CITY_TOQUIO, CITY_ILHABELA, CITY_SJC]) {
      const pin = map.querySelector(`[data-city="${city.name}"]`) as HTMLElement
      const p = project(city.lat, city.lng)
      expect(parseFloat(pin.style.left)).toBeCloseTo(p.x * 100, 3)
      expect(parseFloat(pin.style.top)).toBeCloseTo(p.y * 100, 3)
    }
    // Lisboa (lng −9) cai à direita do meio; Tóquio perto da borda direita.
    expect(project(CITY_LISBOA.lat, CITY_LISBOA.lng).x).toBeCloseTo(0.4746, 3)
    expect(project(CITY_TOQUIO.lat, CITY_TOQUIO.lng).x).toBeCloseTo(0.8879, 3)
  })

  it('um arco por destino até a casa: contínuo nas feitas, tracejado nas planejadas', () => {
    renderPanel()
    const arcs = [...card('Onde já estivemos').querySelectorAll('[data-arc]')].map((a) => a.getAttribute('data-arc'))
    expect(arcs.filter((a) => a === 'done')).toHaveLength(2)
    expect(arcs.filter((a) => a === 'planned')).toHaveLength(3)
  })

  it('cidade feita E planejada fica verde (um pin só)', () => {
    const again = trip({ id: 'a0000000-0000-4000-8000-0000000000dd', title: 'Paraty de novo', cityId: CITY_PARATY.id, startsOn: '2027-02-01', endsOn: '2027-02-03' })
    renderPanel({ trips: [...ALL_TRIPS, again] })
    const pins = card('Onde já estivemos').querySelectorAll('[data-city="Paraty"]')
    expect(pins).toHaveLength(1)
    expect(pins[0]).toHaveAttribute('data-pin', 'done')
  })

  it('legenda com a casa abreviada e os países e cidades das feitas', () => {
    renderPanel()
    const c = card('Onde já estivemos')
    expect(c).toHaveTextContent('feitas')
    expect(c).toHaveTextContent('planejadas')
    expect(c).toHaveTextContent('casa (SJC)')
    expect(c).toHaveTextContent('1 país · 2 cidades')
    expect(c).not.toHaveTextContent('Abrir globo')
  })

  it('quem vê é a Lana: a casa é Marau', () => {
    renderPanel({ viewer: 2 })
    expect(card('Onde já estivemos')).toHaveTextContent('casa (Marau)')
  })
})

describe('A12 — Destinos dos sonhos (R11)', () => {
  it('até 3 itens País/Cidade a fazer, os mais recentes, com tag e a segunda linha', () => {
    renderPanel()
    const c = card('Destinos dos sonhos')
    const rows = within(c).getAllByRole('listitem')
    expect(rows.map((r) => r.querySelector('.tr-dream-name')?.textContent)).toEqual(['Japão', 'Buenos Aires', 'Islândia'])
    expect(rows[0]).toHaveTextContent('País')
    expect(rows[0]).toHaveTextContent('Tóquio e Kyoto')
    expect(rows[1]).toHaveTextContent('Cidade')
    expect(rows[1]).toHaveTextContent('Palermo')
    expect(c).not.toHaveTextContent(ITEM_FILME.name)
  })

  it('Planejar abre a Nova viagem buscando o país (item País) ou a cidade (item Cidade)', () => {
    const { onPlan } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Planejar Japão' }))
    expect(onPlan).toHaveBeenLastCalledWith('Japão')
    fireEvent.click(screen.getByRole('button', { name: 'Planejar Buenos Aires' }))
    expect(onPlan).toHaveBeenLastCalledWith('Buenos Aires')
  })

  it('Ver na lista navega para /lista', () => {
    renderPanel()
    fireEvent.click(within(card('Destinos dos sonhos')).getByRole('button', { name: 'Ver na lista' }))
    expect(window.location.pathname).toBe('/lista')
  })

  it('sem itens: o bloco some', () => {
    renderPanel({ listItems: [ITEM_FILME, { ...ITEM_JAPAO, status: 'done' }, { ...ITEM_BUENOS_AIRES, status: 'done' }] })
    expect(screen.queryByRole('region', { name: 'Destinos dos sonhos' })).not.toBeInTheDocument()
  })
})

describe('A12 — Recordes (R12)', () => {
  it('mais longa (empate → a mais recente), mais distante da casa de quem vê; repetido só com 2+', () => {
    renderPanel()
    const c = card('Recordes')
    const longest = c.querySelector('[data-record="longest"]') as HTMLElement
    expect(longest).toHaveTextContent('Viagem mais longa')
    expect(longest).toHaveTextContent('Ilhabela, SP')
    expect(longest).toHaveTextContent('8 dias · jul 2026')
    const far = [TRIP_PARATY, TRIP_ILHABELA]
      .map((t) => ({ t, km: distanceKm(CITY_SJC, t.cityId === CITY_PARATY.id ? CITY_PARATY : CITY_ILHABELA) }))
      .sort((a, b) => b.km - a.km)[0]
    const farthest = c.querySelector('[data-record="farthest"]') as HTMLElement
    expect(farthest).toHaveTextContent(far.t.title)
    expect(farthest).toHaveTextContent(`${Math.round(far.km).toLocaleString('pt-BR')} km de SJC`)
    expect(c.querySelector('[data-record="repeated"]')).toBeNull()
  })

  it('destino repetido: a cidade e "{n} vezes"', () => {
    const paraty2 = { ...TRIP_PARATY, id: 'a0000000-0000-4000-8000-0000000000ee', startsOn: '2024-05-01', endsOn: '2024-05-03' }
    renderPanel({ trips: [...ALL_TRIPS, paraty2] })
    const row = card('Recordes').querySelector('[data-record="repeated"]') as HTMLElement
    expect(row).toHaveTextContent('Destino mais repetido')
    expect(row).toHaveTextContent('Paraty')
    expect(row).toHaveTextContent('2 vezes')
  })

  it('sem viagem feita: o bloco some', () => {
    renderPanel({ trips: [TRIP_LISBOA, TRIP_GRAMADO] })
    expect(screen.queryByRole('region', { name: 'Recordes' })).not.toBeInTheDocument()
  })
})

describe('A12 — Há um ano (R13)', () => {
  it('a feita que contém hoje − 1 ano, com a memória mais recente cortada em 140 letras', () => {
    renderPanel()
    const c = card('Há um ano')
    expect(c).toHaveTextContent('20–27 set 2025 · 8 dias')
    expect(c).toHaveTextContent('Paraty, RJ')
    const quote = within(c).getByText(/^“Choveu/)
    expect(quote.textContent?.endsWith('…”')).toBe(true)
    expect(Array.from(quote.textContent ?? '').length).toBeLessThanOrEqual(143)
    fireEvent.click(within(c).getByRole('button', { name: 'Ver viagem' }))
    expect(window.location.pathname).toBe(`/viagens/${TRIP_PARATY_ID}`)
  })

  it('nenhuma feita perto de um ano atrás: o bloco some', () => {
    renderPanel({ trips: [TRIP_ILHABELA, TRIP_LISBOA] })
    expect(screen.queryByRole('region', { name: 'Há um ano' })).not.toBeInTheDocument()
  })

  it('sem memória: a foto e o título, sem citação', () => {
    renderPanel({ trips: [{ ...TRIP_PARATY, memories: [] }] })
    const c = card('Há um ano')
    expect(c).toHaveTextContent('Paraty, RJ')
    expect(c.querySelector('blockquote')).toBeNull()
  })
})
