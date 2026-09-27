// A área do mapa da Home (Fase 7): cabeçalho do casal, breadcrumb e seletores,
// pins e grupos, cartão do lugar, filtros, _Aqui por perto_, falha da engine,
// uma instância só, e o `mapFocus`. ADR 0005: comportamento se prova
// renderizando, com a engine falsa (`fakeMapEngine`: x = (lng+180)·4,
// y = (90−lat)·4 — 44 px de grupo são ~11°, então tudo num raio de 150 km
// cai no mesmo grupo, e `map.hidden` tira um ponto da projeção).
//
// Spec: .agent/Tasks/fase-7-mapa.md — R2, R4, R7–R14, I3, I12; A10, A11, A12,
//       A14 (cabeçalho), A15, A17, A18 (a parte da Home)

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearListFocus, peekListFocus } from './../app/listFocus'
import { clearMapFocus, peekMapFocus, requestMapFocus } from '../app/mapFocus'
import type { SettingsData } from '../data/settings'
import type { Stay } from '../domain/calendar'
import type { ListItem } from '../domain/list'
import { allPins, applyFilters, cameraFor, pathOfCity } from '../domain/map'
import type { Camera, MapView } from '../domain/map'
import { listItem, listItems } from '../list/test/fixtures'
import { fakeMapEngine } from '../map/fakeEngine'
import type { FakeMap } from '../map/fakeEngine'
import { settingsData } from '../settings/test/fixtures'
import {
  CITY_LISBOA,
  CITY_SJC,
  ITEM_BONETE,
  ITEM_BUENOS_AIRES,
  ITEM_CASTELO,
  ITEM_LX_FACTORY,
  ITEM_PASTEIS,
  tripsContextData,
} from '../trips/test/fixtures'
import type { HomeApi } from './api'
import { HomeScreen } from './HomeScreen'
import { seededHomeApi } from './test/fakeApi'
import type { HomeSeed } from './test/fakeApi'

// ---------------------------------------------------------------------------
// O acervo: a Lista de exemplo (SJC, São Paulo, Salvador, Noronha, Gramado,
// Japão, mídia) mais Lisboa (3), Ilhabela e Buenos Aires. 15 pins:
//   · Brasil 10 — SP 7 (SJC 4, São Paulo 2, Ilhabela 1), BA 1, PE 1, RS 1;
//   · Portugal 3, Argentina 1, Japão 1;
//   · feitos: Casa Amarela, Noronha, Ibirapuera, Bonete (4); a fazer 11.
// ---------------------------------------------------------------------------

const ITEMS: ListItem[] = [...listItems(), ITEM_CASTELO, ITEM_PASTEIS, ITEM_LX_FACTORY, ITEM_BONETE, ITEM_BUENOS_AIRES]
const VIEWER = { lat: CITY_SJC.lat, lng: CITY_SJC.lng }
const SJC_PATH = pathOfCity(CITY_SJC)

const camera = (view: MapView, pins = allPins(ITEMS, [])): Camera => cameraFor(view, pins, VIEWER)

afterEach(() => {
  clearMapFocus()
  clearListFocus()
  window.history.replaceState(null, '', '/')
})

async function renderHome(seed: HomeSeed = {}, overrides: Partial<HomeApi> = {}) {
  const map = seed.map ?? fakeMapEngine()
  const api = seededHomeApi({ items: ITEMS, ...seed, map }, overrides)
  const user = userEvent.setup()
  render(<HomeScreen api={api} />)
  const area = await screen.findByRole('region', { name: 'Mapa' })
  return { map, api, user, area }
}

const crumbs = (area: HTMLElement) => within(area).getByRole('navigation', { name: 'Onde o mapa está' })
const segment = (area: HTMLElement, name: string) => within(crumbs(area)).getByRole('button', { name })
const current = (area: HTMLElement) => within(crumbs(area)).getByRole('button', { current: 'location' })
const picker = (area: HTMLElement) => within(area).getByRole('dialog', { name: /Países|Estados|Cidades/ })
const pinLayer = (area: HTMLElement) => within(area).findByRole('group', { name: 'Lugares no mapa' })
const lastFlight = (map: FakeMap) => map.flights[map.flights.length - 1]

/** O texto de cada linha do seletor aberto: `"SP São Paulo 7"`. */
function pickerRows(area: HTMLElement): string[] {
  return within(picker(area))
    .queryAllByRole('button')
    .filter((b) => b.classList.contains('hm-region'))
    .map((b) => [...b.querySelectorAll('span')].map((s) => s.textContent).join(' '))
}

// ---------------------------------------------------------------------------

describe('A10 — breadcrumb e seletores: Brasil → São Paulo → São José dos Campos', () => {
  it('abre no globo com o caminho de quem vê, Mundo ativo (R7)', async () => {
    const { area, map } = await renderHome()
    const names = within(crumbs(area))
      .getAllByRole('button')
      .map((b) => b.textContent || b.getAttribute('aria-label'))
    expect(names).toEqual(['Voltar ao globo', 'Mundo', 'Brasil', 'São Paulo', 'São José dos Campos'])
    expect(current(area)).toHaveTextContent('Mundo')
    await waitFor(() => expect(map.mounts).toHaveLength(1))
    expect(map.mounts[0].camera).toEqual(camera({ level: 'world', path: SJC_PATH }))
    expect(map.mounts[0]).toMatchObject({ interactive: true, projection: 'globe' })
  })

  it('cada toque desce um nível, abre o seletor seguinte com a copy e as contagens, e voa a câmera', async () => {
    const { area, map, user } = await renderHome()
    await waitFor(() => expect(map.mounts).toHaveLength(1))

    await user.click(segment(area, 'Brasil'))
    expect(current(area)).toHaveTextContent('Brasil')
    expect(picker(area)).toHaveAccessibleName('Estados do Brasil')
    expect(within(picker(area)).getByText('4 com lugares')).toBeInTheDocument()
    expect(within(picker(area)).getByPlaceholderText('Buscar estado')).toBeInTheDocument()
    expect(pickerRows(area)).toEqual(['SP São Paulo 7', 'BA Bahia 1', 'PE Pernambuco 1', 'RS Rio Grande do Sul 1'])
    expect(lastFlight(map)).toEqual(camera({ level: 'country', path: SJC_PATH }))
    // A UF em foco fica destacada.
    expect(within(picker(area)).getByRole('button', { name: /São Paulo/ })).toHaveAttribute('aria-current', 'true')

    await user.click(within(picker(area)).getByRole('button', { name: /São Paulo/ }))
    expect(current(area)).toHaveTextContent('São Paulo')
    expect(picker(area)).toHaveAccessibleName('Cidades em São Paulo')
    expect(within(picker(area)).getByText('3 com lugares')).toBeInTheDocument()
    expect(within(picker(area)).getByPlaceholderText('Buscar cidade')).toBeInTheDocument()
    expect(pickerRows(area)).toEqual(['SJC São José dos Campos 4', 'SPO São Paulo 2', 'ILH Ilhabela 1'])
    expect(lastFlight(map)).toEqual(camera({ level: 'state', path: SJC_PATH }))

    await user.click(within(picker(area)).getByRole('button', { name: /São José dos Campos/ }))
    expect(current(area)).toHaveTextContent('São José dos Campos')
    expect(within(area).queryByRole('dialog', { name: /Cidades/ })).not.toBeInTheDocument()
    const flight = lastFlight(map)
    expect(flight).toEqual(camera({ level: 'city', path: SJC_PATH }))
    expect(flight).toMatchObject({ kind: 'center', pitch: 60, terrain: true })
    expect(within(area).getByRole('region', { name: 'Aqui por perto' })).toHaveTextContent('7 lugares · até 150 km')
  })

  it('Mundo abre "Países" com o código ISO; escolher um país de fora pula o estado (R6, R8)', async () => {
    const { area, user } = await renderHome()
    await user.click(segment(area, 'Mundo'))
    expect(picker(area)).toHaveAccessibleName('Países')
    expect(within(picker(area)).getByText('4 com lugares')).toBeInTheDocument()
    expect(pickerRows(area)).toEqual(['BR Brasil 10', 'PT Portugal 3', 'AR Argentina 1', 'JP Japão 1'])

    await user.click(within(picker(area)).getByRole('button', { name: /Portugal/ }))
    expect(current(area)).toHaveTextContent('Portugal')
    // O caminho troca de país: sem São Paulo nem SJC.
    expect(within(crumbs(area)).queryByRole('button', { name: 'São Paulo' })).not.toBeInTheDocument()
    expect(picker(area)).toHaveAccessibleName('Cidades em Portugal')
    expect(pickerRows(area)).toEqual(['LIS Lisboa 3'])
    // Fora do Brasil, só as cidades com lugares.
    expect(within(picker(area)).queryByText('Ver cidades sem lugares')).not.toBeInTheDocument()

    await user.click(within(picker(area)).getByRole('button', { name: /Lisboa/ }))
    expect(within(crumbs(area)).getAllByRole('button').map((b) => b.textContent)).toEqual(['', 'Mundo', 'Portugal', 'Lisboa'])
    expect(current(area)).toHaveTextContent('Lisboa')
  })

  it('"Ver os 27 estados" expande, com os sem lugar em 0; a busca filtra', async () => {
    const { area, user } = await renderHome()
    await user.click(segment(area, 'Brasil'))
    await user.click(within(picker(area)).getByRole('button', { name: /Ver os 27 estados/ }))
    const rows = pickerRows(area)
    expect(rows).toHaveLength(27)
    expect(rows.slice(0, 4)).toEqual(['SP São Paulo 7', 'BA Bahia 1', 'PE Pernambuco 1', 'RS Rio Grande do Sul 1'])
    expect(rows).toContain('AC Acre 0')

    await user.type(within(picker(area)).getByPlaceholderText('Buscar estado'), 'minas')
    expect(pickerRows(area)).toEqual(['MG Minas Gerais 0'])
  })

  it('tocar no ativo alterna o seletor; Esc e clique fora fecham', async () => {
    const { area, user } = await renderHome()
    await user.click(segment(area, 'Brasil'))
    expect(picker(area)).toBeInTheDocument()
    await user.click(segment(area, 'Brasil'))
    expect(within(area).queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(segment(area, 'Brasil'))
    expect(picker(area)).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(within(area).queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(segment(area, 'Brasil'))
    await user.click(within(area).getByRole('group', { name: 'Status' }))
    expect(within(area).queryByRole('dialog')).not.toBeInTheDocument()
    // Fechar não muda o nível.
    expect(current(area)).toHaveTextContent('Brasil')
  })

  it('"Ver cidades sem lugares" busca os municípios do IBGE da UF, com contagem 0', async () => {
    const searchCities = vi.fn<HomeApi['searchCities']>(async () => ({
      status: 'ok',
      rows: [
        { id: 'c-taubate', name: 'Taubaté', stateCode: 'SP', lat: -23.0264, lng: -45.5553 },
        { id: 'c-outra', name: 'Taubaté do Sul', stateCode: 'RS', lat: -29, lng: -51 },
      ],
    }))
    const { area, user, map } = await renderHome({}, { searchCities })
    await user.click(segment(area, 'São Paulo'))
    expect(picker(area)).toHaveAccessibleName('Cidades em São Paulo')
    await user.click(within(picker(area)).getByRole('button', { name: /Ver cidades sem lugares/ }))
    await user.type(within(picker(area)).getByPlaceholderText('Buscar cidade'), 'Taub')

    await waitFor(() => expect(pickerRows(area)).toEqual(['TAU Taubaté 0']))
    expect(searchCities).toHaveBeenLastCalledWith('Taub')

    await user.click(within(picker(area)).getByRole('button', { name: /Taubaté/ }))
    expect(current(area)).toHaveTextContent('Taubaté')
    expect(lastFlight(map)).toMatchObject({ kind: 'center', center: { lat: -23.0264, lng: -45.5553 }, pitch: 60 })
  })

  it('Zoom Controls: + e − mudam o zoom sem mudar o nível; o alvo leva à cidade de quem vê (R10)', async () => {
    const { area, user, map } = await renderHome()
    await waitFor(() => expect(within(area).getByRole('button', { name: 'Aproximar' })).toBeEnabled())
    await user.click(within(area).getByRole('button', { name: 'Aproximar' }))
    await user.click(within(area).getByRole('button', { name: 'Afastar' }))
    expect(map.zooms).toEqual([1, -1])
    expect(current(area)).toHaveTextContent('Mundo')

    await user.click(within(area).getByRole('button', { name: 'Onde estou' }))
    expect(current(area)).toHaveTextContent('São José dos Campos')
    expect(lastFlight(map)).toEqual(camera({ level: 'city', path: SJC_PATH }))
  })
})

describe('R11 — pins e grupos', () => {
  it('um pin por item geográfico com coordenada: mídia nunca vira pin (I3)', async () => {
    const { area } = await renderHome()
    const layer = await pinLayer(area)
    expect(within(layer).queryByRole('button', { name: /Severance|Aftersun|Past Lives/ })).not.toBeInTheDocument()
    expect(within(layer).getByRole('button', { name: 'Japão' })).toBeInTheDocument()
  })

  it('os próximos na tela viram um grupo com o ícone do mais recente e "+n"; tocar desce um nível centrado nele', async () => {
    const { area, user, map } = await renderHome()
    const layer = await pinLayer(area)
    const group = within(layer).getByRole('button', { name: 'Mocotó e mais 7' })
    expect(group).toHaveTextContent('+7')

    await user.click(group)
    expect(current(area)).toHaveTextContent('Brasil')
    const grouped = allPins(ITEMS, []).filter((p) =>
      ['i-mocoto', 'i-ceramica', 'i-sorveteria', 'i-vicentina', 'i-gramado', 'i-casa-amarela', 'i-bonete', 'i-ibirapuera'].includes(p.item.id),
    )
    expect(lastFlight(map)).toEqual(camera({ level: 'country', path: SJC_PATH }, grouped))
  })

  it('no nível cidade: o grupo da cidade em foco diz "+n em SJC", e os de outras cidades levam o nome; tocar o grupo recorta Aqui por perto', async () => {
    const sjc = listItems().filter((i) => i.place?.city === 'São José dos Campos')
    const mocoto = { ...(listItems().find((i) => i.id === 'i-mocoto') as ListItem), createdAt: '2026-01-01T00:00:00Z' }
    const acaraje = listItems().find((i) => i.id === 'i-acaraje') as ListItem
    const map = fakeMapEngine()
    // O Mocotó (São Paulo, ~80 km) fica fora da projeção: está por perto, mas não no grupo.
    map.hidden.add(`${mocoto.place?.lat},${mocoto.place?.lng}`)
    const { area, user } = await renderHome({ map, items: [...sjc, mocoto, acaraje] })
    await user.click(within(area).getByRole('button', { name: 'Onde estou' }))

    const layer = await pinLayer(area)
    const group = within(layer).getByRole('button', { name: 'Aula de cerâmica a dois e mais 3' })
    expect(group).toHaveTextContent('+3 em SJC')
    expect(within(layer).getByRole('button', { name: 'Acarajé da Dinha' })).toHaveTextContent('Acarajé da Dinha')

    const nearbyBox = within(area).getByRole('region', { name: 'Aqui por perto' })
    expect(nearbyBox).toHaveTextContent('5 lugares · até 150 km')
    await user.click(group)
    expect(nearbyBox).toHaveTextContent('4 lugares · até 150 km')
    expect(within(nearbyBox).queryByRole('button', { name: /Mocotó/ })).not.toBeInTheDocument()
    await user.click(within(nearbyBox).getByRole('button', { name: 'Ver todos por perto' }))
    expect(nearbyBox).toHaveTextContent('5 lugares · até 150 km')
  })

  it('um pin atrás do globo não é desenhado', async () => {
    const map = fakeMapEngine()
    map.hidden.add('36.2,138.25')
    const { area } = await renderHome({ map })
    const layer = await pinLayer(area)
    expect(within(layer).queryByRole('button', { name: 'Japão' })).not.toBeInTheDocument()
  })
})

describe('A12 — o cartão do lugar (R14)', () => {
  it('tocar no pin abre o cartão com a copy do R14; a seta leva à Lista com o item', async () => {
    const { area, user } = await renderHome()
    const layer = await pinLayer(area)
    await user.click(within(layer).getByRole('button', { name: 'Japão' }))

    const card = within(area).getByRole('dialog', { name: 'Japão' })
    expect(card).toHaveTextContent('Quero ir')
    expect(card).toHaveTextContent('País')
    expect(card).toHaveTextContent('Adicionado por Gabriel')
    // O pin selecionado fica fora do grupo, maior.
    expect(within(layer).getByRole('button', { name: 'Japão', pressed: true })).toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: 'Abrir Japão na Lista' }))
    expect(window.location.pathname).toBe('/lista')
    expect(peekListFocus()).toBe('i-japao')
  })

  it('a foto é a do item (assinada), e "Já fomos" nos feitos', async () => {
    const photoItem = listItem({
      id: 'i-foto',
      name: 'Mirante',
      category: 'parque',
      status: 'done',
      addedBy: 'u-lana',
      photoPath: 'couple-1/item/mirante.webp',
      place: { address: null, city: 'Tóquio', state: null, country: 'Japão', countryCode: 'JP', lat: 35.68, lng: 139.69 },
    })
    const { area, user } = await renderHome({ items: [photoItem] })
    await user.click(within(await pinLayer(area)).getByRole('button', { name: 'Mirante' }))
    const card = within(area).getByRole('dialog', { name: 'Mirante' })
    expect(card).toHaveTextContent('Já fomos')
    expect(card).toHaveTextContent('Adicionado por Lana')
    await waitFor(() => expect(card.querySelector('img')).toHaveAttribute('src', 'https://signed/couple-1/item/mirante.webp'))
  })

  it('Esc e tocar fora fecham o cartão', async () => {
    const { area, user } = await renderHome()
    const layer = await pinLayer(area)
    await user.click(within(layer).getByRole('button', { name: 'Japão' }))
    await user.keyboard('{Escape}')
    expect(within(area).queryByRole('dialog', { name: 'Japão' })).not.toBeInTheDocument()

    await user.click(within(layer).getByRole('button', { name: 'Japão' }))
    await user.click(within(area).getByRole('group', { name: 'Status' }))
    expect(within(area).queryByRole('dialog', { name: 'Japão' })).not.toBeInTheDocument()
  })
})

describe('A11 — filtros (R12) valem para pins, contagens e Aqui por perto', () => {
  it('Restaurante e Já fomos: as contagens mudam, os pins, os seletores e Aqui por perto acompanham', async () => {
    const { area, user } = await renderHome()
    const status = within(area).getByRole('group', { name: 'Status' })
    const opt = (name: RegExp) => within(status).getByRole('button', { name })
    expect(opt(/^Todos/)).toHaveTextContent('Todos15')
    expect(opt(/^Quero ir/)).toHaveTextContent('Quero ir11')
    expect(opt(/^Já fomos/)).toHaveTextContent('Já fomos4')
    // Os chips: Todas + as geográficas (sem filme e série).
    const cats = within(within(area).getByRole('group', { name: 'Categoria' })).getAllByRole('button')
    expect(cats.map((b) => b.textContent)).toEqual(['Todas', 'País', 'Cidade', 'Restaurante', 'Parque', 'Comida', 'Experiência'])

    await user.click(within(area).getByRole('button', { name: 'Onde estou' }))
    const nearbyBox = within(area).getByRole('region', { name: 'Aqui por perto' })
    expect(nearbyBox).toHaveTextContent('7 lugares · até 150 km')

    await user.click(within(area).getByRole('button', { name: 'Restaurante' }))
    expect(opt(/^Todos/)).toHaveTextContent('Todos2')
    expect(opt(/^Quero ir/)).toHaveTextContent('Quero ir1')
    expect(opt(/^Já fomos/)).toHaveTextContent('Já fomos1')
    expect(nearbyBox).toHaveTextContent('2 lugares · até 150 km')

    await user.click(opt(/^Já fomos/))
    expect(opt(/^Já fomos/)).toHaveAttribute('aria-pressed', 'true')
    expect(nearbyBox).toHaveTextContent('1 lugar · até 150 km')
    expect(within(nearbyBox).getByRole('button', { name: /Casa Amarela Bistrô/ })).toBeInTheDocument()
    const layer = await pinLayer(area)
    expect(within(layer).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Casa Amarela Bistrô'])

    // Os seletores contam sob os filtros.
    await user.click(segment(area, 'Brasil'))
    expect(within(picker(area)).getByText('1 com lugares')).toBeInTheDocument()
    expect(pickerRows(area)).toEqual(['SP São Paulo 1'])
  })

  it('categorias ocultas não viram chip nem pin', async () => {
    const context: SettingsData = tripsContextData({
      coupleSettings: { ...settingsData().coupleSettings, hiddenCategories: ['parque'] },
    })
    const { area } = await renderHome({ context })
    const cats = within(within(area).getByRole('group', { name: 'Categoria' })).getAllByRole('button')
    expect(cats.map((b) => b.textContent)).not.toContain('Parque')
    const visible = applyFilters(allPins(ITEMS, ['parque']), { status: 'all', category: 'all' })
    expect(within(within(area).getByRole('group', { name: 'Status' })).getByRole('button', { name: /^Todos/ })).toHaveTextContent(
      `Todos${visible.length}`,
    )
  })
})

describe('R13 — Aqui por perto', () => {
  it('ordena por distância, alterna para "Mais recentes", e tocar num cartão seleciona e voa até o pin', async () => {
    const { area, user, map } = await renderHome()
    await user.click(within(area).getByRole('button', { name: 'Onde estou' }))
    const box = within(area).getByRole('region', { name: 'Aqui por perto' })
    const names = () => within(box).getAllByRole('listitem').map((li) => li.querySelector('.hm-card-name')?.textContent)
    expect(names()[names().length - 1]).toBe('Parque Ibirapuera')
    expect(within(box).getAllByRole('listitem')[0]).toHaveTextContent(/· \d,\d km/)

    await user.click(within(box).getByRole('button', { name: 'Mais perto' }))
    expect(within(box).getByRole('button', { name: 'Mais recentes' })).toBeInTheDocument()
    expect(names()[0]).toBe('Mocotó')

    await user.click(within(box).getByRole('button', { name: /Parque Vicentina Aranha/ }))
    expect(within(area).getByRole('dialog', { name: 'Parque Vicentina Aranha' })).toBeInTheDocument()
    expect(within(box).getByRole('button', { name: /Parque Vicentina Aranha/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(box).getByRole('img', { name: 'selecionado' })).toBeInTheDocument()
    expect(lastFlight(map)).toMatchObject({ kind: 'center', center: { lat: -23.1896, lng: -45.8841 }, pitch: 60 })
  })

  it('sem nada por perto: "Nada salvo por aqui ainda."', async () => {
    const { area, user } = await renderHome({ items: [ITEM_CASTELO] })
    await user.click(within(area).getByRole('button', { name: 'Onde estou' }))
    expect(within(area).getByRole('region', { name: 'Aqui por perto' })).toHaveTextContent('Nada salvo por aqui ainda.')
  })

  it('só existe no nível cidade', async () => {
    const { area } = await renderHome()
    expect(within(area).queryByRole('region', { name: 'Aqui por perto' })).not.toBeInTheDocument()
  })
})

describe('A14 — o cabeçalho do casal (R4)', () => {
  const stay = (id: string, profileId: string, cityId: string, startsOn: string, endsOn: string | null): Stay => ({
    id,
    profileId,
    cityId,
    startsOn,
    endsOn,
  })

  it('juntos: "Juntos agora · {cidade}" e "Juntos há {k} dias"', async () => {
    const { area } = await renderHome()
    expect(within(area).getByText('Juntos agora · São José dos Campos')).toBeInTheDocument()
    expect(within(area).getByText('Juntos há 6 dias')).toBeInTheDocument()
  })

  it('separados: as duas cidades, a de quem vê primeiro', async () => {
    const context = tripsContextData({
      stays: [stay('a', 'u-gabriel', 'c-sjc', '2026-09-01', null), stay('b', 'u-lana', 'c-marau', '2026-09-23', null)],
    })
    const { area } = await renderHome({ context })
    expect(within(area).getByText('Separados agora · São José dos Campos e Marau')).toBeInTheDocument()
    expect(within(area).getByText('Separados há 3 dias')).toBeInTheDocument()
  })

  it('viajando juntos', async () => {
    const context = tripsContextData({
      stays: [stay('a', 'u-gabriel', CITY_LISBOA.id, '2026-09-24', '2026-09-28'), stay('b', 'u-lana', CITY_LISBOA.id, '2026-09-24', '2026-09-28')],
    })
    const { area } = await renderHome({ context })
    expect(within(area).getByText('Viajando juntos · Lisboa')).toBeInTheDocument()
    expect(within(area).getByText('Juntos há 2 dias')).toBeInTheDocument()
    // A cidade de quem vê hoje é a da estadia: o caminho é Portugal › Lisboa.
    expect(within(crumbs(area)).getAllByRole('button').map((b) => b.textContent)).toEqual(['', 'Mundo', 'Portugal', 'Lisboa'])
  })

  it('sem registro de hoje: sem segunda linha', async () => {
    const { area } = await renderHome({ context: tripsContextData({ stays: [] }) })
    expect(within(area).getByText('Sem registro de hoje')).toBeInTheDocument()
    expect(within(area).queryByText(/ há /)).not.toBeInTheDocument()
  })

  it('show_home_counter desligado: a segunda linha some', async () => {
    const context = tripsContextData({ coupleSettings: { ...settingsData().coupleSettings, showHomeCounter: false } })
    const { area } = await renderHome({ context })
    expect(within(area).getByText('Juntos agora · São José dos Campos')).toBeInTheDocument()
    expect(within(area).queryByText(/Juntos há/)).not.toBeInTheDocument()
  })

  it('use_couple_cover com foto: a foto do casal no lugar dos avatares', async () => {
    const context = tripsContextData({ coupleSettings: { ...settingsData().coupleSettings, useCoupleCover: true } })
    const { area } = await renderHome({ context }, { coverUrl: vi.fn(async () => 'https://signed/cover.webp') })
    await waitFor(() => expect(area.querySelector('.hm-status-cover img')).toHaveAttribute('src', 'https://signed/cover.webp'))
    expect(area.querySelector('.hm-status-pair')).toBeNull()
  })
})

describe('A15 — a engine falhou: o resto segue', () => {
  it('"O mapa não carregou." e breadcrumb, seletores, filtros e Aqui por perto funcionando', async () => {
    const map = fakeMapEngine({ fail: 'no_token' })
    const { area, user } = await renderHome({ map })
    expect(await within(area).findByText('O mapa não carregou.')).toBeInTheDocument()
    expect(within(area).getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    expect(within(area).queryByRole('group', { name: 'Lugares no mapa' })).not.toBeInTheDocument()
    expect(within(area).getByRole('button', { name: 'Aproximar' })).toBeDisabled()

    await user.click(segment(area, 'Brasil'))
    await user.click(within(picker(area)).getByRole('button', { name: /São Paulo/ }))
    await user.click(within(picker(area)).getByRole('button', { name: /São José dos Campos/ }))
    const box = within(area).getByRole('region', { name: 'Aqui por perto' })
    expect(box).toHaveTextContent('7 lugares · até 150 km')

    await user.click(within(area).getByRole('button', { name: 'Parque' }))
    expect(box).toHaveTextContent('3 lugares · até 150 km')

    // Sem câmera, o cartão do lugar ancora sob o breadcrumb.
    await user.click(within(box).getByRole('button', { name: /Parque Vicentina Aranha/ }))
    expect(within(area).getByRole('dialog', { name: 'Parque Vicentina Aranha' })).toHaveClass('hm-popover--docked')
    expect(map.flights).toEqual([])
  })

  it('Tentar de novo recria a instância', async () => {
    const map = fakeMapEngine({ fail: 'load_error' })
    const { area, user } = await renderHome({ map })
    await user.click(await within(area).findByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(map.mounts).toHaveLength(2))
  })

  it('sem WebGL, Tentar de novo não aparece', async () => {
    const { area } = await renderHome({ map: fakeMapEngine({ fail: 'no_webgl' }) })
    expect(await within(area).findByText('O mapa não carregou.')).toBeInTheDocument()
    expect(within(area).queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()
  })
})

describe('A17 — uma instância só (I12)', () => {
  it('trocar de nível, de filtro, selecionar e reler não chamam mount de novo', async () => {
    const { area, user, map, api } = await renderHome()
    await waitFor(() => expect(map.mounts).toHaveLength(1))
    await user.click(segment(area, 'Brasil'))
    await user.click(within(picker(area)).getByRole('button', { name: /São Paulo/ }))
    await user.click(within(picker(area)).getByRole('button', { name: /São José dos Campos/ }))
    await user.click(within(area).getByRole('button', { name: 'Restaurante' }))
    await user.click(within(area).getByRole('button', { name: 'Voltar ao globo' }))
    map.emitMove()

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(() => expect(api.loadList).toHaveBeenCalledTimes(2))

    expect(map.mounts).toHaveLength(1)
    expect(map.destroyed).toBe(0)
    // A releitura não reseta a tela: o filtro continua.
    expect(within(area).getByRole('button', { name: 'Restaurante' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('A18 — mapFocus: a Home abre onde pediram (R2)', () => {
  it('item: nível cidade do item, com o cartão aberto; o pedido é consumido', async () => {
    requestMapFocus({ kind: 'item', id: 'i-vicentina' })
    const { area, map } = await renderHome()
    expect(current(area)).toHaveTextContent('São José dos Campos')
    expect(await within(area).findByRole('dialog', { name: 'Parque Vicentina Aranha' })).toBeInTheDocument()
    await waitFor(() => expect(map.mounts).toHaveLength(1))
    expect(map.mounts[0].camera).toEqual(camera({ level: 'city', path: SJC_PATH }))
    expect(peekMapFocus()).toBeNull()
  })

  it('item país: nível país, com o cartão', async () => {
    requestMapFocus({ kind: 'item', id: 'i-japao' })
    const { area } = await renderHome()
    expect(current(area)).toHaveTextContent('Japão')
    expect(within(crumbs(area)).getAllByRole('button').map((b) => b.textContent)).toEqual(['', 'Mundo', 'Japão'])
    expect(await within(area).findByRole('dialog', { name: 'Japão' })).toBeInTheDocument()
  })

  it('city: nível cidade do destino', async () => {
    requestMapFocus({ kind: 'city', cityId: CITY_LISBOA.id })
    const { area, map } = await renderHome()
    expect(within(crumbs(area)).getAllByRole('button').map((b) => b.textContent)).toEqual(['', 'Mundo', 'Portugal', 'Lisboa'])
    expect(current(area)).toHaveTextContent('Lisboa')
    await waitFor(() => expect(map.mounts).toHaveLength(1))
    expect(map.mounts[0].camera).toMatchObject({ kind: 'center', center: { lat: CITY_LISBOA.lat, lng: CITY_LISBOA.lng }, pitch: 60 })
  })

  it('world: o globo, com o caminho de quem vê', async () => {
    requestMapFocus({ kind: 'world' })
    const { area } = await renderHome()
    expect(current(area)).toHaveTextContent('Mundo')
    expect(peekMapFocus()).toBeNull()
  })

  it('item que não é mais pin (apagado): abre no globo', async () => {
    requestMapFocus({ kind: 'item', id: 'i-nao-existe' })
    const { area } = await renderHome()
    expect(current(area)).toHaveTextContent('Mundo')
  })
})
