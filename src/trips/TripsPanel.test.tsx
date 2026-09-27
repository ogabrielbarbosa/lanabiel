// A12 — .agent/Tasks/fase-6-viagens.md (R9–R13): o painel _Pelo mundo,
// juntos_ — pins, arcos, legenda, destinos dos sonhos com _Planejar_, recordes
// e "Há um ano". A19 — .agent/Tasks/fase-7-mapa.md (R22): o mapa é o da engine
// (a falsa, `fakeMapEngine`), sem interação; A18: _Abrir globo_.
// ADR 0005: comportamento de tela se prova renderizando.

import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearMapFocus, peekMapFocus } from '../app/mapFocus'
import { distanceKm } from '../domain/onboarding'
import { fakeMapEngine } from '../map/fakeEngine'
import type { FakeMap } from '../map/fakeEngine'
import { seededTripsApi } from './test/fakeApi'
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

afterEach(() => {
  clearMapFocus()
  window.history.replaceState(null, '', '/')
})

function renderPanel(options: TripsValueOptions = {}, fake: FakeMap = fakeMapEngine()) {
  const onPlan = vi.fn()
  const api = options.api ?? seededTripsApi({}, { mapEngine: fake.engine })
  renderInTrips(<TripsPanel onPlan={onPlan} />, tripsValue({ ...options, api }))
  return { onPlan, fake }
}

/** O mapa pronto: os pins só aparecem depois de a engine montar. */
async function worldMap() {
  const map = within(card('Onde já estivemos')).getByRole('img', { name: /Mapa/ })
  await waitFor(() => expect(map.querySelector('[data-pin="home"]')).not.toBeNull())
  return map
}

const card = (name: string) => screen.getByRole('region', { name })

describe('R9 — cabeçalho', () => {
  it('a data de hoje por extenso e o título', () => {
    renderPanel()
    expect(screen.getByText('Sexta, 25 de setembro')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Pelo mundo, juntos' })).toBeInTheDocument()
  })
})

describe('A12/A19 — Onde já estivemos (R10, Fase 7 R22)', () => {
  it('um pin por destino, verde nas feitas e vazado nas planejadas, e a casa de quem vê', async () => {
    renderPanel()
    const map = await worldMap()
    const pins = [...map.querySelectorAll('[data-pin]')].map((p) => `${p.getAttribute('data-pin')}:${p.getAttribute('data-city')}`)
    expect(pins.sort()).toEqual(
      ['done:Paraty', 'done:Ilhabela', 'planned:Lisboa', 'planned:Gramado', 'planned:Tóquio', 'home:São José dos Campos'].sort(),
    )
  })

  it('a engine monta UMA vez, plana e sem interação, com o mundo inteiro', async () => {
    const { fake } = renderPanel()
    await worldMap()
    expect(fake.mounts).toHaveLength(1)
    expect(fake.mounts[0]).toMatchObject({ interactive: false, projection: 'mercator', camera: { kind: 'bounds' } })
    const cam = fake.mounts[0].camera
    if (cam.kind !== 'bounds') throw new Error('câmera')
    expect(cam.ne.lng - cam.sw.lng).toBeGreaterThan(300)
  })

  it('a posição do pin é a que a engine projeta', async () => {
    renderPanel()
    const map = await worldMap()
    // A falsa projeta 4 px por grau a partir de (180°O, 90°N).
    for (const city of [CITY_LISBOA, CITY_TOQUIO, CITY_ILHABELA, CITY_SJC]) {
      const pin = map.querySelector(`[data-city="${city.name}"]`) as HTMLElement
      expect(parseFloat(pin.style.left)).toBeCloseTo((city.lng + 180) * 4, 3)
      expect(parseFloat(pin.style.top)).toBeCloseTo((90 - city.lat) * 4, 3)
    }
  })

  it('ponto que a engine diz estar fora de vista não vira pin; volta ao mover', async () => {
    const { fake } = renderPanel()
    const map = await worldMap()
    fake.hidden.add(`${CITY_TOQUIO.lat},${CITY_TOQUIO.lng}`)
    fake.emitMove()
    await waitFor(() => expect(map.querySelector('[data-city="Tóquio"]')).toBeNull())
    fake.hidden.clear()
    fake.emitMove()
    await waitFor(() => expect(map.querySelector('[data-city="Tóquio"]')).not.toBeNull())
  })

  it('um arco por destino até a casa, pela engine: contínuo nas feitas, tracejado nas planejadas', async () => {
    const { fake } = renderPanel()
    await worldMap()
    const arcs = fake.arcs.at(-1) ?? []
    expect(arcs).toHaveLength(5)
    for (const a of arcs) expect(a.to).toMatchObject({ lat: CITY_SJC.lat, lng: CITY_SJC.lng })
    const byCity = new Map(arcs.map((a) => [a.id, a.dashed]))
    expect(byCity.get(CITY_ILHABELA.id)).toBe(false)
    expect(byCity.get(CITY_PARATY.id)).toBe(false)
    expect(byCity.get(CITY_LISBOA.id)).toBe(true)
    expect(byCity.get(CITY_TOQUIO.id)).toBe(true)
    expect(arcs.filter((a) => a.dashed)).toHaveLength(3)
  })

  it('cidade feita E planejada fica verde (um pin só)', async () => {
    const again = trip({ id: 'a0000000-0000-4000-8000-0000000000dd', title: 'Paraty de novo', cityId: CITY_PARATY.id, startsOn: '2027-02-01', endsOn: '2027-02-03' })
    renderPanel({ trips: [...ALL_TRIPS, again] })
    const map = await worldMap()
    const pins = map.querySelectorAll('[data-city="Paraty"]')
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
  })

  it('quem vê é a Lana: a casa é Marau', () => {
    renderPanel({ viewer: 2 })
    expect(card('Onde já estivemos')).toHaveTextContent('casa (Marau)')
  })

  it('A18: _Abrir globo_ pede o mundo e vai para a Home', () => {
    window.history.replaceState(null, '', '/viagens')
    renderPanel()
    fireEvent.click(within(card('Onde já estivemos')).getByRole('button', { name: 'Abrir globo' }))
    expect(peekMapFocus()).toEqual({ kind: 'world' })
    expect(window.location.pathname).toBe('/')
  })

  it('a engine falha: "O mapa não carregou." e o resto do painel segue', async () => {
    renderPanel({}, fakeMapEngine({ fail: 'load_error' }))
    const c = card('Onde já estivemos')
    expect(await within(c).findByText('O mapa não carregou.')).toBeInTheDocument()
    expect(within(c).getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    expect(c).toHaveTextContent('casa (SJC)')
    expect(card('Recordes')).toBeInTheDocument()
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
