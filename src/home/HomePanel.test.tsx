// O painel da direita da Home (Fase 7): os seis blocos com os dados do `.pen`
// (A13), _Nosso ritmo_ separado / viajando / sem registro / em aberto (A14,
// a parte do painel), as navegações e os blocos que somem.
// ADR 0005: comportamento de tela se prova renderizando.
//
// Spec: .agent/Tasks/fase-7-mapa.md — R15–R21, R25, I7, I10, I11 (A13, A14)
//
// O painel roda sobre a leitura DE VERDADE (`useHomeData`) com a API falsa
// (`seededHomeApi`): as fixtures abaixo são as do `LFEx4` — hoje 25/9/2026,
// quem vê é o Gabriel, juntos em SJC de 14/9 a 3/10, Lisboa de 1 a 9/10.

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearListFocus, peekListFocus } from '../app/listFocus'
import type { MapFocus } from '../app/mapFocus'
import type { CalCity, Stay } from '../domain/calendar'
import type { GeoPlace, ListCategory, ListItem, ListMemory } from '../domain/list'
import type { Trip } from '../domain/trips'
import { wroteLabel } from '../domain/map'
import { localDateOf, shortDayMonth } from '../lib/date'
import { listItem } from '../list/test/fixtures'
import {
  CITY_SJC,
  GABRIEL,
  LANA,
  TRIP_CITIES,
  TRIP_LISBOA,
  TRIP_LISBOA_ID,
  photo,
  trip,
  tripsContextData,
} from '../trips/test/fixtures'
import type { HomeApi } from './api'
import { HomeContext, useHomeData } from './context'
import { HomePanel } from './HomePanel'
import { seededHomeApi } from './test/fakeApi'

// ---------------------------------------------------------------------------
// As estadias do `.pen` (as mesmas do harness `?preview`)
// ---------------------------------------------------------------------------

type Span = [cityId: string, from: string, to: string | null]

function staysOf(spans: Record<string, Span[]>): Stay[] {
  return Object.entries(spans).flatMap(([profileId, list]) =>
    list.map(([cityId, startsOn, endsOn], i) => ({ id: `st-${profileId}-${i}`, profileId, cityId, startsOn, endsOn })),
  )
}

/** 2026 sem buraco. Juntos até hoje: 20 + 20 + 19 + 20 + 8 + 5 + 12 = 104 (de 268 dias → 38%). */
const PEN_STAYS = staysOf({
  [GABRIEL]: [
    ['c-sjc', '2026-01-01', '2026-02-28'],
    ['c-marau', '2026-03-01', '2026-03-20'],
    ['c-sjc', '2026-03-21', '2026-05-31'],
    ['c-marau', '2026-06-01', '2026-06-20'],
    ['c-sjc', '2026-06-21', '2026-07-11'],
    ['c-ilhabela', '2026-07-12', '2026-07-19'],
    ['c-sjc', '2026-07-20', '2026-09-08'],
    ['c-paraty', '2026-09-09', '2026-09-13'],
    ['c-sjc', '2026-09-14', null],
  ],
  [LANA]: [
    ['c-sjc', '2026-01-01', '2026-01-20'],
    ['c-marau', '2026-01-21', '2026-04-14'],
    ['c-sjc', '2026-04-15', '2026-05-03'],
    ['c-marau', '2026-05-04', '2026-07-11'],
    ['c-ilhabela', '2026-07-12', '2026-07-19'],
    ['c-marau', '2026-07-20', '2026-09-08'], // 1–8 set separados
    ['c-paraty', '2026-09-09', '2026-09-13'], // viajando juntos
    ['c-sjc', '2026-09-14', '2026-10-03'], // o trecho de hoje: 14 set – 3 out
    ['c-marau', '2026-10-04', null],
  ],
})

// ---------------------------------------------------------------------------
// As viagens feitas: 7 países, 23 cidades (12 no Brasil), 18.420 km
// ---------------------------------------------------------------------------

/**
 * Coordenadas de mentira: todo destino fica na casa do Gabriel (0 km), menos
 * Göreme, posta no mesmo meridiano a exatos 9.210 km — ida e volta, 18.420
 * (`tripTotals` soma `2 × distanceKm` da casa de quem vê). Só o total importa.
 */
const FAR_KM = 9210
const dest = (id: string, name: string, countryCode: string, stateCode: string | null = null, km = 0): CalCity => ({
  id,
  name,
  stateCode,
  countryCode,
  region: null,
  lat: CITY_SJC.lat + ((km / 6371) * 180) / Math.PI,
  lng: CITY_SJC.lng,
})

const DONE_CITIES: CalCity[] = [
  dest('c-ilhabela', 'Ilhabela', 'BR', 'SP'),
  dest('c-paraty', 'Paraty', 'BR', 'RJ'),
  dest('d-ubatuba', 'Ubatuba', 'BR', 'SP'),
  dest('d-cdj', 'Campos do Jordão', 'BR', 'SP'),
  dest('d-floripa', 'Florianópolis', 'BR', 'SC'),
  dest('d-gramado', 'Gramado', 'BR', 'RS'),
  dest('d-rio', 'Rio de Janeiro', 'BR', 'RJ'),
  dest('d-salvador', 'Salvador', 'BR', 'BA'),
  dest('d-recife', 'Recife', 'BR', 'PE'),
  dest('d-bonito', 'Bonito', 'BR', 'MS'),
  dest('d-noronha', 'Fernando de Noronha', 'BR', 'PE'),
  dest('d-ouro-preto', 'Ouro Preto', 'BR', 'MG'),
  dest('d-goreme', 'Göreme', 'TR', null, FAR_KM),
  dest('d-istambul', 'Istambul', 'TR'),
  dest('d-izmir', 'Izmir', 'TR'),
  dest('d-baires', 'Buenos Aires', 'AR'),
  dest('d-bariloche', 'Bariloche', 'AR'),
  dest('d-porto', 'Porto', 'PT'),
  dest('d-sintra', 'Sintra', 'PT'),
  dest('d-santiago', 'Santiago', 'CL'),
  dest('d-atacama', 'San Pedro de Atacama', 'CL'),
  dest('d-montevideu', 'Montevidéu', 'UY'),
  dest('d-kyoto', 'Kyoto', 'JP'),
]

const ILHABELA_TRIP_ID = 'b0000000-0000-4000-8000-000000000001'

/** Uma viagem feita por cidade, em 2025; a de Ilhabela é a de julho de 2026, com a memória da Lana. */
const DONE_TRIPS: Trip[] = DONE_CITIES.map((c, i) => {
  if (c.id === 'c-ilhabela') {
    return trip({
      id: ILHABELA_TRIP_ID,
      title: 'Ilhabela, SP',
      cityId: c.id,
      startsOn: '2026-07-12',
      endsOn: '2026-07-19',
      coverPhotoId: 'p-ilh',
      photos: [photo('p-ilh')],
      memories: [
        {
          profileId: LANA,
          rating: 5,
          writtenOn: '2026-09-23',
          body: 'A gente se perdeu procurando a cachoeira e acabou achando a praia mais bonita da vida. Quero voltar com você todo julho.',
        },
      ],
    })
  }
  const day = `2025-${String(1 + Math.floor(i / 2)).padStart(2, '0')}-${i % 2 === 0 ? '05' : '20'}`
  return trip({ id: `b-${c.id}`, title: c.name, cityId: c.id, startsOn: day, endsOn: day })
})

const PEN_TRIPS: Trip[] = [...DONE_TRIPS, TRIP_LISBOA]

// ---------------------------------------------------------------------------
// A Lista: 14 salvos a até 30 km de SJC, e os destaques
// ---------------------------------------------------------------------------

const sjc = (km: number): GeoPlace => ({
  address: null,
  city: 'São José dos Campos',
  state: 'SP',
  country: 'Brasil',
  countryCode: 'BR',
  // Para o norte, no meridiano do centro: `km` de distância.
  lat: CITY_SJC.lat + ((km / 6371) * 180) / Math.PI,
  lng: CITY_SJC.lng,
})

const item = (id: string, name: string, category: ListCategory, place: GeoPlace, extra: Partial<ListItem> = {}): ListItem =>
  listItem({ id, name, category, place, createdAt: '2026-06-01T12:00:00Z', ...extra })

const REGION_ITEMS: ListItem[] = [
  item('i-vicentina', 'Parque Vicentina Aranha', 'parque', sjc(1.2), { featured: true, photoPath: 'couple-1/item/vicentina.webp' }),
  item('i-mirante', 'Mirante do Banhado', 'experiencia', sjc(2.05), { featured: true }),
  item('i-casa-amarela', 'Casa Amarela Bistrô', 'restaurante', sjc(3.4), { status: 'done', doneOn: '2026-08-26' }),
  item('i-mercado', 'Mercado Municipal', 'comida', sjc(4.4)),
  item('i-cidade', 'Parque da Cidade', 'parque', sjc(5.8)),
  // inventado — o resto dos 14.
  ...[9, 11, 13, 15, 17, 19, 22, 25, 28].map((km, i) => item(`i-sjc-${i}`, `Lugar ${km} km`, 'parque', sjc(km))),
]

const FAR_ITEMS: ListItem[] = [
  item(
    'i-arpoador',
    'Pôr do sol no Arpoador',
    'experiencia',
    { address: null, city: 'Rio de Janeiro', state: 'RJ', country: 'Brasil', countryCode: 'BR', lat: -22.988, lng: -43.193 },
    { featured: true, createdAt: '2026-09-20T12:00:00Z', photoPath: 'couple-1/item/arpoador.webp' },
  ),
  item(
    'i-mani',
    'Tasting menu no Maní',
    'restaurante',
    { address: null, city: 'São Paulo', state: 'SP', country: 'Brasil', countryCode: 'BR', lat: -23.567, lng: -46.683 },
    { featured: true, createdAt: '2026-09-18T12:00:00Z' },
  ),
  item(
    'i-balao',
    'Balão na Capadócia',
    'experiencia',
    { address: null, city: 'Göreme', state: 'Nevşehir', country: 'Turquia', countryCode: 'TR', lat: 38.643, lng: 34.829 },
    { featured: true, createdAt: '2026-09-15T12:00:00Z' },
  ),
  // Feito e em destaque: não entra (R19 pede "a fazer").
  item(
    'i-feito',
    'Destaque já feito',
    'parque',
    { address: null, city: 'Ubatuba', state: 'SP', country: 'Brasil', countryCode: 'BR', lat: -23.43, lng: -45.08 },
    { featured: true, status: 'done', doneOn: '2026-09-01', createdAt: '2026-09-24T12:00:00Z' },
  ),
]

const PEN_ITEMS: ListItem[] = [...REGION_ITEMS, ...FAR_ITEMS]

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------

interface Seed {
  stays?: Stay[]
  trips?: Trip[]
  items?: ListItem[]
  memories?: ListMemory[]
}

function penApi(seed: Seed = {}): HomeApi {
  const all = new Map<string, CalCity>([...TRIP_CITIES, ...DONE_CITIES].map((c) => [c.id, c]))
  return seededHomeApi(
    {
      context: tripsContextData({ stays: seed.stays ?? PEN_STAYS }),
      trips: seed.trips ?? PEN_TRIPS,
      items: seed.items ?? PEN_ITEMS,
      memories: seed.memories ?? [],
    },
    {
      loadCities: vi.fn<HomeApi['loadCities']>(async (ids) => ({
        status: 'ok',
        rows: new Map(ids.flatMap((id) => (all.has(id) ? [[id, all.get(id)!] as const] : []))),
      })),
    },
  )
}

/** O painel sobre a leitura de verdade, como a `HomeScreen` o monta (sem a área do mapa). */
function Harness({ api, onShowOnMap }: { api: HomeApi; onShowOnMap?: (focus: MapFocus) => void }) {
  const load = useHomeData(api)
  if (load.status !== 'ok' || load.value === null) return null
  return (
    <HomeContext.Provider value={load.value}>
      <HomePanel onShowOnMap={onShowOnMap} />
    </HomeContext.Provider>
  )
}

async function renderPanel(seed: Seed = {}, onShowOnMap = vi.fn<(focus: MapFocus) => void>()) {
  const user = userEvent.setup()
  render(<Harness api={penApi(seed)} onShowOnMap={onShowOnMap} />)
  const panel = await screen.findByRole('complementary', { name: 'Painel' })
  return { user, panel, onShowOnMap }
}

const section = (name: string) => screen.getByRole('region', { name })

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  clearListFocus()
})
afterEach(() => clearListFocus())

// ---------------------------------------------------------------------------
// A13 — o painel com os dados do `.pen`
// ---------------------------------------------------------------------------

describe('A13 — o painel do .pen', () => {
  it('data de hoje e a saudação com os dois nomes (R15)', async () => {
    await renderPanel()
    // 25/9/2026 é uma sexta; o `.pen` diz "Quinta" (é o 25/9 de 2025).
    expect(screen.getByText('Sexta, 25 de setembro')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Oi, Gabriel & Lana' })).toBeInTheDocument()
  })

  it('Próxima viagem: GRU → LIS, Lisboa, Portugal, 1–9 out · 9 dias, embarque em 6 dias (R16)', async () => {
    await renderPanel()
    const trip = within(section('Próxima viagem'))
    expect(trip.getByText('GRU → LIS')).toBeInTheDocument()
    expect(trip.getByText('Lisboa')).toBeInTheDocument()
    expect(trip.getByText('Portugal')).toBeInTheDocument()
    expect(trip.getByText('1–9 out · 9 dias')).toBeInTheDocument()
    expect(trip.getByText('embarque em 6 dias')).toBeInTheDocument()
  })

  it('Nosso ritmo: Juntos · dia 12 de 20, 8 dias restantes, 14 set – 3 out (R17)', async () => {
    await renderPanel()
    const rhythm = within(section('Nosso ritmo'))
    expect(rhythm.getByText('Juntos · dia 12 de 20')).toBeInTheDocument()
    expect(rhythm.getByText('8 dias restantes')).toBeInTheDocument()
    expect(rhythm.getByText('14 set')).toBeInTheDocument()
    expect(rhythm.getByText('3 out')).toBeInTheDocument()
  })

  it('Nosso ritmo: setembro dia a dia, 22 juntos · 8 separados, hoje e planejado (R17)', async () => {
    await renderPanel()
    const rhythm = within(section('Nosso ritmo'))
    expect(rhythm.getByText('Setembro')).toBeInTheDocument()
    expect(rhythm.getByText('22 juntos · 8 separados')).toBeInTheDocument()
    const days = within(rhythm.getByRole('list', { name: 'Setembro dia a dia' })).getAllByRole('listitem')
    expect(days).toHaveLength(30)
    expect(days.map((d) => d.dataset.mark)).toEqual([
      ...Array(8).fill('apart'),
      ...Array(22).fill('together'),
    ])
    expect(days[24]).toHaveAttribute('data-today', 'true')
    expect(days.filter((d) => d.dataset.today)).toHaveLength(1)
    // Do dia 26 em diante é planejado (apagado).
    expect(days.map((d) => d.dataset.planned === 'true')).toEqual([...Array(25).fill(false), ...Array(5).fill(true)])
  })

  it('Nosso ritmo: 38% do ano juntos e 104 dias juntos em 2026 (I7)', async () => {
    await renderPanel()
    const rhythm = within(section('Nosso ritmo'))
    expect(rhythm.getByText('38%')).toBeInTheDocument()
    expect(rhythm.getByText('do ano juntos')).toBeInTheDocument()
    expect(rhythm.getByText('desde janeiro')).toBeInTheDocument()
    expect(rhythm.getByText('104')).toBeInTheDocument()
    expect(rhythm.getByText('em 2026')).toBeInTheDocument()
  })

  it('Nessa região: São José dos Campos, SP · 14 salvos, os 5 mais perto, ✦ nos destaques (R18, I8)', async () => {
    await renderPanel()
    const region = within(section('Nessa região'))
    expect(region.getByText('São José dos Campos, SP')).toBeInTheDocument()
    expect(region.getByText('14 salvos')).toBeInTheDocument()
    const rows = region.getAllByRole('button', { name: /no mapa$/ })
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Ver Parque Vicentina Aranha no mapa',
      'Ver Mirante do Banhado no mapa',
      'Ver Casa Amarela Bistrô no mapa',
      'Ver Mercado Municipal no mapa',
      'Ver Parque da Cidade no mapa',
    ])
    const note = (row: HTMLElement) => row.querySelector('.hp-region-note')
    expect(note(rows[0])).toHaveTextContent('São José dos Campos · 1,2 km')
    expect(note(rows[2])).toHaveTextContent('São José dos Campos · 3,4 km')
    expect(rows.map((r) => r.classList.contains('hp-region-item--featured'))).toEqual([true, true, false, false, false])
  })

  it('Nessa região: os chips filtram por categoria (R18)', async () => {
    const { user } = await renderPanel()
    const region = within(section('Nessa região'))
    expect(region.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true')
    expect(region.getAllByRole('button').filter((b) => b.classList.contains('hp-tab')).map((b) => b.textContent)).toEqual([
      'Todos',
      'País',
      'Cidade',
      'Restaurante',
      'Parque',
      'Comida',
      'Experiência',
    ])
    await user.click(region.getByRole('button', { name: 'Restaurante' }))
    expect(region.getAllByRole('button', { name: /no mapa$/ }).map((r) => r.getAttribute('aria-label'))).toEqual([
      'Ver Casa Amarela Bistrô no mapa',
    ])
    // O "14 salvos" é da região, não do chip.
    expect(region.getByText('14 salvos')).toBeInTheDocument()
  })

  it('Em destaque: um grande e dois pequenos, os a fazer mais recentes (R19)', async () => {
    await renderPanel()
    const feat = within(section('Em destaque'))
    const cards = feat.getAllByRole('button', { name: /na Lista$/ })
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual([
      'Abrir Pôr do sol no Arpoador na Lista',
      'Abrir Tasting menu no Maní na Lista',
      'Abrir Balão na Capadócia na Lista',
    ])
    expect(cards[0]).toHaveClass('hp-feat--big')
    expect(within(cards[0]).getByText('Rio de Janeiro, RJ')).toBeInTheDocument()
    expect(within(cards[0]).getByText('Experiência')).toBeInTheDocument()
    expect(within(cards[1]).getByText('São Paulo, SP')).toBeInTheDocument()
    expect(within(cards[2]).getByText('Göreme, Turquia')).toBeInTheDocument()
    // A foto assinada chega pelo lote do painel.
    expect(await within(cards[0]).findByRole('presentation', { hidden: true })).toHaveAttribute(
      'src',
      'https://signed/couple-1/item/arpoador.webp',
    )
  })

  it('Última memória: Ilhabela, SP, 12 a 19 de julho de 2026, 8 dias juntos, a Lana há 2 dias (R20)', async () => {
    await renderPanel()
    const mem = within(section('Última memória'))
    expect(mem.getByText('Ilhabela, SP')).toBeInTheDocument()
    expect(mem.getByText('12 a 19 de julho de 2026')).toBeInTheDocument()
    expect(mem.getByText('8 dias juntos')).toBeInTheDocument()
    expect(mem.getByText(/^“A gente se perdeu procurando a cachoeira/)).toBeInTheDocument()
    expect(mem.getByText('Lana')).toBeInTheDocument()
    expect(mem.getByText('escreveu há 2 dias')).toBeInTheDocument()
    // Decisão 8: sem o coração de favoritar.
    expect(mem.queryByRole('button', { name: /curtir|favoritar/i })).not.toBeInTheDocument()
  })

  it('Juntos pelo mundo: 7 países, 23 cidades, 18.420 km e a meia volta (R21, I11)', async () => {
    const { panel } = await renderPanel()
    const world = within(section('Juntos pelo mundo'))
    const stat = (key: string) => within(panel.querySelector(`[data-stat="${key}"]`) as HTMLElement)
    expect(stat('countries').getByText('7')).toBeInTheDocument()
    expect(stat('countries').getByText('Brasil, Turquia e mais 5')).toBeInTheDocument()
    expect(stat('cities').getByText('23')).toBeInTheDocument()
    expect(stat('cities').getByText('12 no Brasil, 11 lá fora')).toBeInTheDocument()
    expect(stat('km').getByText('18.420')).toBeInTheDocument()
    expect(world.getByText('Quase meia volta ao mundo — 46% da circunferência da Terra')).toBeInTheDocument()
    expect(panel.querySelector('.hp-km-track > span')).toHaveStyle({ width: '46%' })
  })
})

// ---------------------------------------------------------------------------
// A14 — Nosso ritmo nos outros estados
// ---------------------------------------------------------------------------

describe('A14 — Nosso ritmo fora do "juntos"', () => {
  const rhythm = () => within(section('Nosso ritmo'))

  it('separados: "Separados · dia 6 de 11", 5 dias restantes', async () => {
    await renderPanel({
      stays: staysOf({
        [GABRIEL]: [['c-sjc', '2026-09-01', null]],
        [LANA]: [
          ['c-sjc', '2026-09-01', '2026-09-19'],
          ['c-marau', '2026-09-20', '2026-09-30'],
          ['c-sjc', '2026-10-01', null],
        ],
      }),
    })
    expect(rhythm().getByText('Separados · dia 6 de 11')).toBeInTheDocument()
    expect(rhythm().getByText('5 dias restantes')).toBeInTheDocument()
    expect(rhythm().getByText('20 set')).toBeInTheDocument()
    expect(rhythm().getByText('30 set')).toBeInTheDocument()
  })

  it('viajando juntos: "Viajando juntos · dia 3 de 5", 2 dias restantes', async () => {
    await renderPanel({
      stays: staysOf({
        [GABRIEL]: [
          ['c-sjc', '2026-09-01', '2026-09-22'],
          ['c-paraty', '2026-09-23', '2026-09-27'],
          ['c-sjc', '2026-09-28', null],
        ],
        [LANA]: [
          ['c-marau', '2026-09-01', '2026-09-22'],
          ['c-paraty', '2026-09-23', '2026-09-27'],
          ['c-marau', '2026-09-28', null],
        ],
      }),
    })
    expect(rhythm().getByText('Viajando juntos · dia 3 de 5')).toBeInTheDocument()
    expect(rhythm().getByText('2 dias restantes')).toBeInTheDocument()
  })

  it('sem registro de hoje: "Sem registro de hoje" e Registrar leva ao Calendário; o dia fica vazio', async () => {
    const { user } = await renderPanel({
      stays: staysOf({
        [GABRIEL]: [['c-sjc', '2026-09-01', null]],
        [LANA]: [['c-sjc', '2026-09-01', '2026-09-20']],
      }),
    })
    expect(rhythm().getByText('Sem registro de hoje')).toBeInTheDocument()
    expect(rhythm().queryByText(/restantes?$/)).not.toBeInTheDocument()
    const days = within(rhythm().getByRole('list', { name: 'Setembro dia a dia' })).getAllByRole('listitem')
    expect(days[24]).toHaveAttribute('data-mark', 'unknown')
    expect(rhythm().getByText('20 juntos · 0 separados')).toBeInTheDocument()
    await user.click(rhythm().getByRole('button', { name: 'Registrar' }))
    expect(window.location.pathname).toBe('/calendario')
  })

  it('trecho em aberto: "Juntos · dia 12", sem restantes, "em aberto" no fim', async () => {
    await renderPanel({
      stays: staysOf({
        [GABRIEL]: [['c-sjc', '2026-09-14', null]],
        [LANA]: [['c-sjc', '2026-09-14', null]],
      }),
    })
    expect(rhythm().getByText('Juntos · dia 12')).toBeInTheDocument()
    expect(rhythm().queryByText(/restantes?$/)).not.toBeInTheDocument()
    expect(rhythm().getByText('14 set')).toBeInTheDocument()
    expect(rhythm().getByText('em aberto')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Navegações
// ---------------------------------------------------------------------------

describe('navegações do painel', () => {
  it('Roteiro e o cartão da viagem abrem /viagens/<id> (R16)', async () => {
    const { user } = await renderPanel()
    const trip = within(section('Próxima viagem'))
    await user.click(trip.getByRole('button', { name: 'Roteiro' }))
    expect(window.location.pathname).toBe(`/viagens/${TRIP_LISBOA_ID}`)
    window.history.replaceState(null, '', '/')
    await user.click(trip.getByRole('link', { name: 'Abrir a viagem Lisboa, Portugal' }))
    expect(window.location.pathname).toBe(`/viagens/${TRIP_LISBOA_ID}`)
  })

  it('Calendário › vai para /calendario (R17)', async () => {
    const { user } = await renderPanel()
    await user.click(within(section('Nosso ritmo')).getByRole('button', { name: 'Calendário' }))
    expect(window.location.pathname).toBe('/calendario')
  })

  it('Ver mapa pede a cidade de quem vê; tocar num item pede o item (R18, R2)', async () => {
    const { user, onShowOnMap } = await renderPanel()
    const region = within(section('Nessa região'))
    await user.click(region.getByRole('button', { name: 'Ver mapa' }))
    expect(onShowOnMap).toHaveBeenLastCalledWith({ kind: 'city', cityId: 'c-sjc' })
    await user.click(region.getByRole('button', { name: 'Ver Mercado Municipal no mapa' }))
    expect(onShowOnMap).toHaveBeenLastCalledWith({ kind: 'item', id: 'i-mercado' })
    expect(window.location.pathname).toBe('/')
  })

  it('um destaque abre a ficha na Lista; Ver lista vai para /lista (R19, R3)', async () => {
    const { user } = await renderPanel()
    const feat = within(section('Em destaque'))
    await user.click(feat.getByRole('button', { name: 'Abrir Tasting menu no Maní na Lista' }))
    expect(window.location.pathname).toBe('/lista')
    expect(peekListFocus()).toBe('i-mani')
    window.history.replaceState(null, '', '/')
    clearListFocus()
    await user.click(feat.getByRole('button', { name: 'Ver lista' }))
    expect(window.location.pathname).toBe('/lista')
    expect(peekListFocus()).toBeNull()
  })

  it('Álbum e a memória de viagem abrem a viagem (R20)', async () => {
    const { user } = await renderPanel()
    const mem = within(section('Última memória'))
    await user.click(mem.getByRole('button', { name: 'Álbum' }))
    expect(window.location.pathname).toBe(`/viagens/${ILHABELA_TRIP_ID}`)
    window.history.replaceState(null, '', '/')
    await user.click(mem.getByRole('button', { name: 'Abrir a memória de Ilhabela, SP' }))
    expect(window.location.pathname).toBe(`/viagens/${ILHABELA_TRIP_ID}`)
  })

  it('Detalhes vai para /viagens (R21)', async () => {
    const { user } = await renderPanel()
    await user.click(within(section('Juntos pelo mundo')).getByRole('button', { name: 'Detalhes' }))
    expect(window.location.pathname).toBe('/viagens')
  })
})

// ---------------------------------------------------------------------------
// Estados vazios e blocos que somem
// ---------------------------------------------------------------------------

describe('blocos vazios', () => {
  it('sem viagem: "Nenhuma viagem pela frente" com Planejar, e Juntos pelo mundo some (R16, R21)', async () => {
    const { user } = await renderPanel({ trips: [] })
    const trip = within(section('Próxima viagem'))
    expect(trip.getByText('Nenhuma viagem pela frente')).toBeInTheDocument()
    expect(trip.queryByRole('button', { name: 'Roteiro' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Juntos pelo mundo' })).not.toBeInTheDocument()
    await user.click(trip.getByRole('button', { name: 'Planejar' }))
    expect(window.location.pathname).toBe('/viagens')
  })

  it('viagem em andamento: "Viajando agora · dia 3 de 9" (R16)', async () => {
    await renderPanel({ trips: [trip({ ...TRIP_LISBOA, startsOn: '2026-09-23', endsOn: '2026-10-01' })] })
    expect(within(section('Próxima viagem')).getByText('Viajando agora · dia 3 de 9')).toBeInTheDocument()
  })

  it('nada perto: "Nada salvo perto de vocês ainda." (R18)', async () => {
    await renderPanel({ items: FAR_ITEMS })
    const region = within(section('Nessa região'))
    expect(region.getByText('Nada salvo perto de vocês ainda.')).toBeInTheDocument()
    expect(region.getByText('0 salvos')).toBeInTheDocument()
  })

  it('sem destaque a fazer: Em destaque some (R19)', async () => {
    await renderPanel({ items: PEN_ITEMS.map((i) => ({ ...i, featured: i.status === 'done' && i.featured })) })
    expect(screen.queryByRole('region', { name: 'Em destaque' })).not.toBeInTheDocument()
  })

  it('sem memória: Última memória some (R20)', async () => {
    await renderPanel({ trips: PEN_TRIPS.map((t) => ({ ...t, memories: [] })) })
    expect(screen.queryByRole('region', { name: 'Última memória' })).not.toBeInTheDocument()
  })

  it('memória da Lista mais recente: o item, o dia do feito, sem chip; Álbum abre a ficha (R20, I10)', async () => {
    // O dia de `updated_at` é o LOCAL (I10): em UTC+14 este instante já é dia 25.
    const updatedAt = '2026-09-24T15:00:00Z'
    const { user } = await renderPanel({
      memories: [
        {
          itemId: 'i-casa-amarela',
          profileId: GABRIEL,
          body: 'O risoto de cogumelos.',
          createdAt: updatedAt,
          updatedAt,
        },
      ],
    })
    const mem = within(section('Última memória'))
    expect(mem.getByText('Casa Amarela Bistrô')).toBeInTheDocument()
    expect(mem.getByText('26 de agosto de 2026')).toBeInTheDocument()
    expect(mem.queryByText(/dias juntos$/)).not.toBeInTheDocument()
    expect(mem.getByText(wroteLabel(localDateOf(updatedAt), '2026-09-25', shortDayMonth))).toBeInTheDocument()
    await user.click(mem.getByRole('button', { name: 'Álbum' }))
    expect(window.location.pathname).toBe('/lista')
    expect(peekListFocus()).toBe('i-casa-amarela')
  })
})

// ---------------------------------------------------------------------------
// R25 — nada lê `day_kisses`
// ---------------------------------------------------------------------------

describe('R25', () => {
  // `?raw` e não `node:fs`: `src` é tipado sem os tipos do Node (o mesmo de `database.types.test.ts`).
  const sources = import.meta.glob(['./HomePanel.tsx', './panel/*.{ts,tsx}'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  it('nenhum arquivo do painel lê day_kisses (fora dos comentários)', () => {
    const code = (text: string) =>
      text
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\/?\*)/.test(line))
        .join('\n')
    expect(Object.keys(sources).length).toBeGreaterThan(5)
    for (const text of Object.values(sources)) expect(code(text)).not.toMatch(/day_kisses|kisses/i)
  })
})
