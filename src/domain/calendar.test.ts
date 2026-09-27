import { describe, expect, it } from 'vitest'
import {
  CALENDAR_LIMITS,
  EVENT_KINDS,
  bandLabel,
  bandOf,
  countDrawn,
  entriesForDelete,
  entriesForEdit,
  entriesForEvent,
  entriesForPeriod,
  eventSubtitle,
  monthWeeks,
  nowSummary,
  occurrences,
  paintStays,
  personStatus,
  previewImpact,
  runAround,
  runs,
  shortCityName,
  upcoming,
  validateEvent,
} from './calendar'
import type { CalCity, CalendarEvent, CityMap, EventDraft, MembersBySlot, NamesBySlot, Occurrence, Run } from './calendar'
import { countStates } from './coupleState'
import type { Stay } from './coupleState'
import { EVENT_VALIDATION_CASES } from './eventValidationCases'
import { PAINT_CASES } from './paintCases'
import type { CaseCity, CasePerson, CaseStay } from './paintCases'

const G = 'profile-gabriel'
const L = 'profile-lana'
const SJC = 'city-sjc'
const MARAU = 'city-marau'
const PARATY = 'city-paraty'
const LISBOA = 'city-lisboa'
const RIO = 'city-rio'

/** Slot 1 Gabriel, casa em SJC; slot 2 Lana, casa em Marau. */
const MEMBERS: MembersBySlot = {
  1: { profileId: G, homeCityId: SJC },
  2: { profileId: L, homeCityId: MARAU },
}
/** Moram juntos: as duas casas são a mesma cidade. */
const SAME_HOME: MembersBySlot = {
  1: { profileId: G, homeCityId: SJC },
  2: { profileId: L, homeCityId: SJC },
}
const NAMES: NamesBySlot = { 1: 'Gabriel', 2: 'Lana' }

const city = (id: string, name: string, stateCode: string | null, countryCode = 'BR'): CalCity => ({
  id,
  name,
  stateCode,
  countryCode,
  region: null,
  lat: 0,
  lng: 0,
})
const CITIES: CityMap = new Map([
  [SJC, city(SJC, 'São José dos Campos', 'SP')],
  [MARAU, city(MARAU, 'Marau', 'RS')],
  [PARATY, city(PARATY, 'Paraty', 'RJ')],
  [RIO, city(RIO, 'Rio de Janeiro', 'RJ')],
  [LISBOA, city(LISBOA, 'Lisboa', null, 'PT')],
])

let seq = 0
const newId = () => `new-${++seq}`

function stay(profileId: string, cityId: string, startsOn: string, endsOn: string | null): Stay {
  return { id: `${profileId}-${cityId}-${startsOn}`, profileId, cityId, startsOn, endsOn }
}

const TODAY = '2026-09-26'

// ---------------------------------------------------------------------------
// A1 — lado do domínio
// ---------------------------------------------------------------------------

describe('constantes (A1, lado domínio)', () => {
  it('os seis tipos, na ordem dos chips', () => {
    expect(EVENT_KINDS).toEqual(['viagem', 'visita', 'date', 'data_especial', 'compromisso', 'lembrete'])
  })

  it('os limites que o banco espelha', () => {
    expect(CALENDAR_LIMITS).toMatchObject({ title: 80, note: 280, place: 80, spanDays: 366, kissesPerDay: 20, paintEntries: 8 })
  })
})

// ---------------------------------------------------------------------------
// A2 — a pintura
// ---------------------------------------------------------------------------

const PERSON: Record<CasePerson, string> = { g: G, l: L }
const CITY: Record<CaseCity, string> = { sjc: SJC, marau: MARAU, paraty: PARATY }

const toStay = (c: CaseStay, i: number): Stay => ({
  id: `before-${i}`,
  profileId: PERSON[c.person],
  cityId: CITY[c.city],
  startsOn: c.from,
  endsOn: c.to,
})

/** A comparação dos casos: sem `id`, por pessoa e depois por início. */
const normalize = (stays: readonly Stay[]) =>
  stays
    .map(({ profileId, cityId, startsOn, endsOn }) => ({ profileId, cityId, startsOn, endsOn }))
    .sort((a, b) => (a.profileId === b.profileId ? a.startsOn.localeCompare(b.startsOn) : a.profileId.localeCompare(b.profileId)))

describe('paintStays (A2, lado domínio)', () => {
  it.each(PAINT_CASES)('$name', ({ before, entries, after }) => {
    const result = paintStays(
      before.map(toStay),
      entries.map((e) => ({ profileId: PERSON[e.person], cityId: CITY[e.city], from: e.from, to: e.to })),
      newId,
    )
    expect(normalize(result)).toEqual(normalize(after.map(toStay)))
  })

  it('não muta as estadias de entrada', () => {
    const before = [stay(G, SJC, '2026-09-01', null)]
    const snapshot = structuredClone(before)
    paintStays(before, [{ profileId: G, cityId: MARAU, from: '2026-10-30', to: '2026-11-03' }], newId)
    expect(before).toEqual(snapshot)
  })

  it('ids únicos no resultado, mesmo partindo uma estadia em duas', () => {
    const result = paintStays(
      [stay(G, SJC, '2026-09-01', null)],
      [{ profileId: G, cityId: MARAU, from: '2026-10-30', to: '2026-11-03' }],
      newId,
    )
    expect(new Set(result.map((s) => s.id)).size).toBe(3)
  })

  it('entrada com fim antes do início é bug de quem chama, e explode', () => {
    expect(() => paintStays([], [{ profileId: G, cityId: SJC, from: '2026-09-10', to: '2026-09-09' }], newId)).toThrow(RangeError)
  })
})

describe('entradas da pintura', () => {
  const d = (choice: 'home1' | 'home2' | 'away' | 'apart', cityId: string | null = null) => ({
    choice,
    cityId,
    from: '2026-10-01',
    to: '2026-10-05' as string | null,
  })

  it('entriesForPeriod: os quatro cartões, slot 1 antes do slot 2', () => {
    const at = (cityG: string, cityL: string) => [
      { profileId: G, cityId: cityG, from: '2026-10-01', to: '2026-10-05' },
      { profileId: L, cityId: cityL, from: '2026-10-01', to: '2026-10-05' },
    ]
    expect(entriesForPeriod(d('home1'), MEMBERS)).toEqual(at(SJC, SJC))
    expect(entriesForPeriod(d('home2'), MEMBERS)).toEqual(at(MARAU, MARAU))
    expect(entriesForPeriod(d('away', PARATY), MEMBERS)).toEqual(at(PARATY, PARATY))
    expect(entriesForPeriod(d('apart'), MEMBERS)).toEqual(at(SJC, MARAU))
  })

  it('entriesForPeriod: "outra cidade" sem cidade explode em vez de pintar nada', () => {
    expect(() => entriesForPeriod(d('away'), MEMBERS)).toThrow()
  })

  it('entriesForPeriod: o primeiro período em aberto (A13)', () => {
    expect(entriesForPeriod({ choice: 'apart', cityId: null, from: TODAY, to: null }, MEMBERS)).toEqual([
      { profileId: G, cityId: SJC, from: TODAY, to: null },
      { profileId: L, cityId: MARAU, from: TODAY, to: null },
    ])
  })

  it('entriesForEdit reproduz o caso "editar período" da tabela', () => {
    const before = [stay(G, SJC, '2026-09-01', null), stay(L, SJC, '2026-09-21', '2026-09-30'), stay(L, MARAU, '2026-10-01', null)]
    const old = runAround('2026-09-25', before, MEMBERS)
    expect(old).toMatchObject({ from: '2026-09-21', to: '2026-09-30', band: 'home1' })

    const entries = entriesForEdit(old, { choice: 'home1', cityId: null, from: '2026-09-21', to: '2026-09-27' }, MEMBERS)
    expect(entries.slice(0, 2)).toEqual([
      { profileId: G, cityId: SJC, from: '2026-09-28', to: '2026-09-30' },
      { profileId: L, cityId: MARAU, from: '2026-09-28', to: '2026-09-30' },
    ])
    expect(normalize(paintStays(before, entries, newId))).toEqual(
      normalize([stay(G, SJC, '2026-09-01', null), stay(L, SJC, '2026-09-21', '2026-09-27'), stay(L, MARAU, '2026-09-28', null)]),
    )
  })

  it('entriesForEdit: começo adiado manda os dias da frente para casa', () => {
    const old: Run = { from: '2026-10-01', to: '2026-10-10', band: 'away', key: `together:${PARATY}`, cityId: PARATY, positions: [] }
    const entries = entriesForEdit(old, { choice: 'away', cityId: PARATY, from: '2026-10-04', to: '2026-10-10' }, MEMBERS)
    expect(entries).toEqual([
      { profileId: G, cityId: SJC, from: '2026-10-01', to: '2026-10-03' },
      { profileId: L, cityId: MARAU, from: '2026-10-01', to: '2026-10-03' },
      { profileId: G, cityId: PARATY, from: '2026-10-04', to: '2026-10-10' },
      { profileId: L, cityId: PARATY, from: '2026-10-04', to: '2026-10-10' },
    ])
  })

  it('entriesForEdit: trecho aberto fechado manda a cauda para casa, EM ABERTO', () => {
    const old: Run = { from: '2026-10-01', to: null, band: 'home1', key: `together:${SJC}`, cityId: SJC, positions: [] }
    const entries = entriesForEdit(old, { choice: 'home1', cityId: null, from: '2026-10-01', to: '2026-10-20' }, MEMBERS)
    expect(entries.slice(0, 2)).toEqual([
      { profileId: G, cityId: SJC, from: '2026-10-21', to: null },
      { profileId: L, cityId: MARAU, from: '2026-10-21', to: null },
    ])
  })

  it('entriesForEdit: aberto que continua aberto não devolve nada para casa', () => {
    const old: Run = { from: '2026-10-01', to: null, band: 'home1', key: `together:${SJC}`, cityId: SJC, positions: [] }
    expect(entriesForEdit(old, { choice: 'home2', cityId: null, from: '2026-10-01', to: null }, MEMBERS)).toEqual([
      { profileId: G, cityId: MARAU, from: '2026-10-01', to: null },
      { profileId: L, cityId: MARAU, from: '2026-10-01', to: null },
    ])
  })

  it('entriesForEdit: intervalo novo sem interseção devolve o antigo inteiro para casa', () => {
    const old: Run = { from: '2026-10-01', to: '2026-10-05', band: 'home1', key: `together:${SJC}`, cityId: SJC, positions: [] }
    const entries = entriesForEdit(old, { choice: 'home1', cityId: null, from: '2026-11-01', to: '2026-11-03' }, MEMBERS)
    expect(entries.slice(0, 2).map((e) => [e.from, e.to])).toEqual([
      ['2026-10-01', '2026-10-05'],
      ['2026-10-01', '2026-10-05'],
    ])
    expect(entries).toHaveLength(4)
  })

  it('entriesForDelete: as casas sobre o trecho inteiro', () => {
    const old: Run = { from: '2026-10-01', to: null, band: 'away', key: `together:${PARATY}`, cityId: PARATY, positions: [] }
    expect(entriesForDelete(old, MEMBERS)).toEqual([
      { profileId: G, cityId: SJC, from: '2026-10-01', to: null },
      { profileId: L, cityId: MARAU, from: '2026-10-01', to: null },
    ])
  })

  const visit: EventDraft = {
    kind: 'visita',
    title: 'Feriado de Finados em Marau',
    startsOn: '2026-10-30',
    endsOn: '2026-11-03',
    allDay: false,
    startsAt: '19:20',
    endsAt: '21:05',
    travelers: 'solo',
    travelerId: G,
    cityId: MARAU,
    place: null,
    repeatsYearly: false,
    note: null,
    listItemId: null,
  }

  it('entriesForEvent: solo pinta o viajante, os dois pintam os dois', () => {
    expect(entriesForEvent(visit, MEMBERS)).toEqual([{ profileId: G, cityId: MARAU, from: '2026-10-30', to: '2026-11-03' }])
    expect(entriesForEvent({ ...visit, kind: 'viagem', travelers: 'both', travelerId: null, cityId: LISBOA }, MEMBERS)).toEqual([
      { profileId: G, cityId: LISBOA, from: '2026-10-30', to: '2026-11-03' },
      { profileId: L, cityId: LISBOA, from: '2026-10-30', to: '2026-11-03' },
    ])
  })

  it('entriesForEvent: outro tipo, ou rascunho sem volta, não pinta', () => {
    expect(entriesForEvent({ ...visit, kind: 'date', travelers: null, travelerId: null, cityId: null }, MEMBERS)).toEqual([])
    expect(entriesForEvent({ ...visit, endsOn: null }, MEMBERS)).toEqual([])
    expect(entriesForEvent({ ...visit, cityId: null }, MEMBERS)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// A3 — o formato do evento
// ---------------------------------------------------------------------------

describe('validateEvent (A3, lado domínio)', () => {
  it.each(EVENT_VALIDATION_CASES)('$name', ({ draft, failsOn }) => {
    const result = validateEvent(draft)
    if (failsOn === null) expect(result).toEqual({ ok: true })
    else expect(result).toMatchObject({ ok: false, field: failsOn })
  })

  it('o motivo é texto de interface, em português', () => {
    const result = validateEvent({ ...EVENT_VALIDATION_CASES[0].draft, title: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/título/)
  })

  it('título conta code points, como o char_length do banco', () => {
    const draft = EVENT_VALIDATION_CASES.find((c) => c.name === 'date com hora e local')!.draft
    expect(validateEvent({ ...draft, title: '💋'.repeat(80) })).toEqual({ ok: true })
  })
})

// ---------------------------------------------------------------------------
// A4 — trechos, faixas, contagem, rótulos
// ---------------------------------------------------------------------------

describe('bandOf (A4)', () => {
  it('as cinco faixas', () => {
    expect(bandOf({ kind: 'together', cityId: SJC, hostProfileIds: [G] }, MEMBERS)).toBe('home1')
    expect(bandOf({ kind: 'together', cityId: MARAU, hostProfileIds: [L] }, MEMBERS)).toBe('home2')
    expect(bandOf({ kind: 'together', cityId: LISBOA, hostProfileIds: [] }, MEMBERS)).toBe('away')
    expect(
      bandOf({ kind: 'apart', positions: [{ profileId: G, cityId: SJC }, { profileId: L, cityId: MARAU }] }, MEMBERS),
    ).toBe('apart')
    expect(bandOf({ kind: 'unknown' }, MEMBERS)).toBe('unknown')
  })

  it('na casa dos dois é home1', () => {
    expect(bandOf({ kind: 'together', cityId: SJC, hostProfileIds: [G, L] }, SAME_HOME)).toBe('home1')
  })
})

describe('runs e runAround (A4)', () => {
  // Separados desde 1/9, Lana em SJC de 20/9 a 5/10 (cruza o mês), um buraco
  // da Lana de 10/10 a 12/10, e depois os dois em aberto.
  const STAYS = [
    stay(G, SJC, '2026-09-01', null),
    stay(L, MARAU, '2026-09-01', '2026-09-19'),
    stay(L, SJC, '2026-09-20', '2026-10-05'),
    stay(L, MARAU, '2026-10-06', '2026-10-09'),
    stay(L, MARAU, '2026-10-13', null),
  ]

  it('cortados na janela, com unknown no meio', () => {
    expect(runs(STAYS, MEMBERS, '2026-09-15', '2026-10-31').map((r) => [r.from, r.to, r.band, r.key])).toEqual([
      ['2026-09-15', '2026-09-19', 'apart', `apart:${SJC}:${MARAU}`],
      ['2026-09-20', '2026-10-05', 'home1', `together:${SJC}`],
      ['2026-10-06', '2026-10-09', 'apart', `apart:${SJC}:${MARAU}`],
      ['2026-10-10', '2026-10-12', 'unknown', 'unknown'],
      ['2026-10-13', '2026-10-31', 'apart', `apart:${SJC}:${MARAU}`],
    ])
  })

  it('positions na ordem dos slots, cityId só quando juntos', () => {
    const [apart, together, , unknown] = runs(STAYS, MEMBERS, '2026-09-15', '2026-10-31')
    expect(apart.positions).toEqual([{ profileId: G, cityId: SJC }, { profileId: L, cityId: MARAU }])
    expect(apart.cityId).toBeNull()
    expect(together.cityId).toBe(SJC)
    expect(unknown.positions).toEqual([])
  })

  it('a mesma chave em estadias diferentes é um trecho só', () => {
    const stays = [stay(G, SJC, '2026-09-01', null), stay(L, MARAU, '2026-09-01', '2026-09-10'), stay(L, MARAU, '2026-09-11', '2026-09-30')]
    expect(runs(stays, MEMBERS, '2026-09-01', '2026-09-30')).toHaveLength(1)
  })

  it('janela invertida não tem trecho', () => {
    expect(runs(STAYS, MEMBERS, '2026-10-01', '2026-09-01')).toEqual([])
  })

  it('runAround: bordas reais de um trecho que cruza o mês', () => {
    expect(runAround('2026-10-02', STAYS, MEMBERS)).toMatchObject({ from: '2026-09-20', to: '2026-10-05', band: 'home1' })
  })

  it('runAround: trecho em aberto tem to null', () => {
    expect(runAround('2026-12-25', STAYS, MEMBERS)).toMatchObject({ from: '2026-10-13', to: null, band: 'apart' })
  })

  it('runAround: o buraco é um trecho unknown fechado', () => {
    expect(runAround('2026-10-11', STAYS, MEMBERS)).toMatchObject({ from: '2026-10-10', to: '2026-10-12', band: 'unknown' })
  })
})

describe('countDrawn (A4, I5)', () => {
  const STAYS = [stay(G, SJC, '2026-09-01', null), stay(L, MARAU, '2026-09-01', '2026-09-20'), stay(L, SJC, '2026-09-21', null)]

  it('conta futuro e estadia aberta até o fim da janela; countStates não', () => {
    const drawn = countDrawn('2026-09-01', '2026-09-30', STAYS, MEMBERS)
    expect(drawn).toEqual({ home1: 10, home2: 0, away: 0, apart: 20, unknown: 0 })

    const lived = countStates('2026-09-01', '2026-09-30', TODAY, STAYS, [MEMBERS[1], MEMBERS[2]])
    expect(lived).toEqual({ together: 6, apart: 20, unknown: 0 })
  })

  it('sem estadia, é tudo unknown — nunca separados', () => {
    expect(countDrawn('2026-08-01', '2026-08-31', STAYS, MEMBERS)).toEqual({ home1: 0, home2: 0, away: 0, apart: 0, unknown: 31 })
  })
})

describe('shortCityName e bandLabel (A4, I9)', () => {
  it.each([
    ['São José dos Campos', 'SJC'],
    ['Rio de Janeiro', 'Rio de Janeiro'],
    ['Lisboa', 'Lisboa'],
    ['Marau', 'Marau'],
    ['São João da Boa Vista', 'SJBV'],
  ])('%s → %s', (name, short) => {
    expect(shortCityName(name)).toBe(short)
  })

  const run = (band: Run['band'], cityId: string | null, positions: Run['positions'] = []): Run => ({
    from: '2026-09-01',
    to: '2026-09-10',
    band,
    key: '',
    cityId,
    positions,
  })

  it('juntos na casa de um: o visitante', () => {
    expect(bandLabel(run('home1', SJC), NAMES, CITIES, MEMBERS)).toBe('Lana em SJC')
    expect(bandLabel(run('home2', MARAU), NAMES, CITIES, MEMBERS)).toBe('Gabriel em Marau')
  })

  it('na casa dos dois: "Juntos em"', () => {
    expect(bandLabel(run('home1', SJC), NAMES, CITIES, SAME_HOME)).toBe('Juntos em SJC')
  })

  it('viajando, separados e unknown', () => {
    expect(bandLabel(run('away', RIO), NAMES, CITIES, MEMBERS)).toBe('Rio de Janeiro')
    expect(
      bandLabel(run('apart', null, [{ profileId: G, cityId: SJC }, { profileId: L, cityId: MARAU }]), NAMES, CITIES, MEMBERS),
    ).toBe('Separados · SJC e Marau')
    expect(bandLabel(run('unknown', null), NAMES, CITIES, MEMBERS)).toBe('')
  })
})

// ---------------------------------------------------------------------------
// A5 — o painel
// ---------------------------------------------------------------------------

const event = (patch: Partial<CalendarEvent>): CalendarEvent => ({
  id: `event-${++seq}`,
  createdBy: G,
  kind: 'date',
  title: 'Evento',
  startsOn: TODAY,
  endsOn: null,
  allDay: true,
  startsAt: null,
  endsAt: null,
  travelers: null,
  travelerId: null,
  cityId: null,
  place: null,
  repeatsYearly: false,
  note: null,
  listItemId: null,
  ...patch,
})

describe('personStatus (A5)', () => {
  const STAYS = [
    stay(G, SJC, '2026-09-01', '2026-09-19'),
    stay(G, MARAU, '2026-09-20', '2026-09-30'),
    stay(G, PARATY, '2026-10-01', '2026-10-05'),
    stay(L, MARAU, '2026-09-01', null),
  ]

  it('em casa, visitando, viajando e sem registro', () => {
    expect(personStatus(G, '2026-09-10', STAYS, MEMBERS)).toEqual({ cityId: SJC, status: 'home', dayN: null })
    expect(personStatus(G, TODAY, STAYS, MEMBERS)).toEqual({ cityId: MARAU, status: 'visiting', dayN: 7 })
    expect(personStatus(G, '2026-10-01', STAYS, MEMBERS)).toEqual({ cityId: PARATY, status: 'traveling', dayN: 1 })
    expect(personStatus(G, '2026-10-06', STAYS, MEMBERS)).toEqual({ cityId: null, status: 'unknown', dayN: null })
  })
})

describe('nowSummary (A5)', () => {
  it('visitando: título, subtítulo, barra e os dois contadores', () => {
    const stays = [
      stay(G, SJC, '2026-09-01', null),
      stay(L, MARAU, '2026-09-01', '2026-09-21'),
      stay(L, SJC, '2026-09-22', '2026-09-30'),
      stay(L, MARAU, '2026-10-01', null),
    ]
    const events = [
      event({ kind: 'visita', startsOn: '2026-10-30', endsOn: '2026-11-03', travelers: 'solo', travelerId: G, cityId: MARAU }),
      event({ kind: 'viagem', startsOn: '2026-12-20', endsOn: '2026-12-27', travelers: 'both', cityId: LISBOA }),
      event({ kind: 'date', startsOn: '2026-09-28' }),
    ]
    const now = nowSummary(TODAY, stays, MEMBERS, NAMES, events, CITIES)
    expect(now.band).toBe('home1')
    expect(now.title).toBe('Juntos em São José dos Campos há 4 dias')
    expect(now.subtitle).toBe('Lana está visitando desde 22 set')
    expect(now.progress).toEqual({ from: '2026-09-22', to: '2026-09-30', dayK: 5, total: 9 })
    expect(now.countdowns).toEqual([
      { label: 'Marau começa em', days: 34 },
      { label: 'Lana volta pra casa em', days: 5 },
    ])
  })

  it('no primeiro dia: "desde hoje"', () => {
    const stays = [stay(G, SJC, '2026-09-01', null), stay(L, SJC, TODAY, '2026-09-30'), stay(L, MARAU, '2026-10-01', null)]
    expect(nowSummary(TODAY, stays, MEMBERS, NAMES, [], CITIES).title).toBe('Juntos em São José dos Campos desde hoje')
  })

  it('casa dos dois: "Em casa desde", sem barra (em aberto) e sem contador', () => {
    const stays = [stay(G, SJC, '2026-09-01', null), stay(L, SJC, '2026-09-10', null)]
    const now = nowSummary(TODAY, stays, SAME_HOME, NAMES, [], CITIES)
    expect(now.title).toBe('Juntos em São José dos Campos há 16 dias')
    expect(now.subtitle).toBe('Em casa desde 10 set')
    expect(now.run?.to).toBeNull()
    expect(now.progress).toBeNull()
    expect(now.countdowns).toEqual([])
  })

  it('viajando juntos: "Voltam pra casa em" com o primeiro que volta', () => {
    const stays = [
      stay(G, LISBOA, '2026-09-20', '2026-09-28'),
      stay(G, SJC, '2026-09-29', null),
      stay(L, LISBOA, '2026-09-20', '2026-09-30'),
      stay(L, MARAU, '2026-10-01', null),
    ]
    const now = nowSummary(TODAY, stays, MEMBERS, NAMES, [], CITIES)
    expect(now.band).toBe('away')
    expect(now.title).toBe('Viajando juntos há 6 dias')
    expect(now.subtitle).toBe('Em Lisboa desde 20 set')
    expect(now.progress).toEqual({ from: '2026-09-20', to: '2026-09-28', dayK: 7, total: 9 })
    expect(now.countdowns).toEqual([{ label: 'Voltam pra casa em', days: 3 }])
  })

  it('separados: cidades curtas e "Juntos de novo em"', () => {
    const stays = [
      stay(G, SJC, '2026-09-01', '2026-10-29'),
      stay(G, MARAU, '2026-10-30', '2026-11-03'),
      stay(G, SJC, '2026-11-04', null),
      stay(L, MARAU, '2026-09-01', null),
    ]
    const now = nowSummary(TODAY, stays, MEMBERS, NAMES, [], CITIES)
    expect(now.title).toBe('Separados há 25 dias')
    expect(now.subtitle).toBe('Gabriel em SJC · Lana em Marau')
    expect(now.progress).toEqual({ from: '2026-09-01', to: '2026-10-29', dayK: 26, total: 59 })
    expect(now.countdowns).toEqual([{ label: 'Juntos de novo em', days: 34 }])
  })

  it('separados sem reencontro marcado: nenhum contador', () => {
    const stays = [stay(G, SJC, '2026-09-01', null), stay(L, MARAU, '2026-09-01', null)]
    const now = nowSummary(TODAY, stays, MEMBERS, NAMES, [event({ kind: 'visita', startsOn: '2026-09-20', endsOn: '2026-09-22', cityId: MARAU, travelers: 'both' })], CITIES)
    expect(now.title).toBe('Separados há 25 dias')
    expect(now.countdowns).toEqual([])
  })

  it('unknown: sem registro, sem subtítulo, sem barra, sem contador — nunca "separados"', () => {
    const stays = [stay(G, SJC, '2026-09-01', null)]
    const now = nowSummary(TODAY, stays, MEMBERS, NAMES, [event({ kind: 'viagem', startsOn: '2026-12-20', endsOn: '2026-12-27', travelers: 'both', cityId: LISBOA })], CITIES)
    expect(now).toEqual({
      band: 'unknown',
      title: 'Sem registro de onde vocês estão hoje',
      subtitle: null,
      run: null,
      progress: null,
      countdowns: [],
    })
  })
})

// ---------------------------------------------------------------------------
// A6 — ocorrências, próximos, subtítulo, prévia
// ---------------------------------------------------------------------------

describe('occurrences e upcoming (A6)', () => {
  const COUPLE = { startedOn: '2024-09-17' }

  it('data especial anual em três anos, com "{n} anos"', () => {
    const birthday = event({ kind: 'data_especial', title: 'Aniversário da Lana', startsOn: '1999-10-18', repeatsYearly: true })
    const occs = occurrences([birthday], COUPLE, '2026-01-01', '2028-12-31').filter((o) => o.event !== null)
    expect(occs.map((o) => [o.day, o.years])).toEqual([
      ['2026-10-18', 27],
      ['2027-10-18', 28],
      ['2028-10-18', 29],
    ])
  })

  it('no próprio ano de início aparece sem "{n} anos"', () => {
    const d = event({ kind: 'data_especial', title: 'Mudança', startsOn: '2026-10-18', repeatsYearly: true })
    expect(occurrences([d], COUPLE, '2026-10-01', '2026-10-31').filter((o) => o.event)[0].years).toBeNull()
    expect(occurrences([d], COUPLE, '2025-01-01', '2025-12-31').filter((o) => o.event)).toEqual([])
  })

  it('29/2 cai em 28/2 num ano não bissexto, e volta a 29/2 no bissexto', () => {
    const leap = event({ kind: 'data_especial', title: 'Bissexto', startsOn: '2024-02-29', repeatsYearly: true })
    const days = occurrences([leap], COUPLE, '2026-01-01', '2028-12-31').filter((o) => o.event).map((o) => o.day)
    expect(days).toEqual(['2026-02-28', '2027-02-28', '2028-02-29'])
  })

  it('aniversário de namoro derivado, só para n ≥ 1, com o singular', () => {
    const occs = occurrences([], { startedOn: '2025-09-17' }, '2025-01-01', '2027-12-31')
    expect(occs.map((o) => [o.day, o.title, o.years, o.event])).toEqual([
      ['2026-09-17', '1 ano juntos', 1, null],
      ['2027-09-17', '2 anos juntos', 2, null],
    ])
  })

  it('evento de vários dias cruzando o mês aparece nos dois meses', () => {
    const trip = event({ kind: 'visita', startsOn: '2026-10-30', endsOn: '2026-11-03', travelers: 'solo', travelerId: G, cityId: MARAU })
    const oct = occurrences([trip], COUPLE, '2026-10-01', '2026-10-31')
    const nov = occurrences([trip], COUPLE, '2026-11-01', '2026-11-30')
    expect(oct.map((o) => [o.day, o.endDay])).toEqual([['2026-10-30', '2026-11-03']])
    expect(nov.map((o) => [o.day, o.endDay])).toEqual([['2026-10-30', '2026-11-03']])
  })

  it('no mesmo dia: dia inteiro primeiro, depois por hora', () => {
    const late = event({ title: 'Jantar', allDay: false, startsAt: '20:00' })
    const early = event({ title: 'Café', allDay: false, startsAt: '08:00' })
    const allDay = event({ title: 'Folga', allDay: true })
    expect(occurrences([late, early, allDay], COUPLE, TODAY, TODAY).map((o) => o.title)).toEqual(['Folga', 'Café', 'Jantar'])
  })

  it('upcoming corta em 6, a partir de hoje', () => {
    const past = event({ title: 'Passado', startsOn: '2026-09-20' })
    const next = Array.from({ length: 8 }, (_, i) => event({ title: `E${i}`, startsOn: `2026-10-0${i + 1}` }))
    const occs = occurrences([past, ...next], COUPLE, '2026-09-01', '2027-09-30')
    const up = upcoming(occs, TODAY)
    expect(up).toHaveLength(CALENDAR_LIMITS.upcoming)
    expect(up.map((o) => o.title)).toEqual(['E0', 'E1', 'E2', 'E3', 'E4', 'E5'])
  })

  it('upcoming inclui o aniversário de namoro', () => {
    const occs = occurrences([], COUPLE, TODAY, '2027-09-30')
    expect(upcoming(occs, TODAY).map((o) => o.title)).toEqual(['3 anos juntos'])
  })
})

describe('eventSubtitle (A6, I11)', () => {
  const ctx = { cities: CITIES }
  const occ = (e: CalendarEvent, years: number | null = null): Occurrence => ({
    event: e,
    day: e.startsOn,
    endDay: e.endsOn ?? e.startsOn,
    title: e.title,
    years,
  })

  it('cada ramo', () => {
    expect(eventSubtitle(occ(event({ kind: 'date', listItemId: 'item-1', place: 'Casa Amarela' })), ctx)).toBe('Date · da nossa lista')
    expect(
      eventSubtitle(occ(event({ kind: 'visita', startsOn: '2026-10-30', endsOn: '2026-11-03', cityId: MARAU, travelers: 'both' })), ctx),
    ).toBe('Marau, RS · 5 dias')
    expect(
      eventSubtitle(occ(event({ kind: 'viagem', startsOn: '2026-12-20', endsOn: '2026-12-26', cityId: LISBOA, travelers: 'both' })), ctx),
    ).toBe('Lisboa, Portugal · 7 dias')
    expect(eventSubtitle(occ(event({ kind: 'data_especial', repeatsYearly: true }), 27), ctx)).toBe('Data especial · 27 anos')
    expect(eventSubtitle(occ(event({ kind: 'data_especial', repeatsYearly: true }), 1), ctx)).toBe('Data especial · 1 ano')
    expect(eventSubtitle(occ(event({ kind: 'data_especial' })), ctx)).toBe('Data especial')
    expect(eventSubtitle(occ(event({ kind: 'lembrete', allDay: false, startsAt: '23:59' })), ctx)).toBe('Lembrete · até 23:59')
    expect(eventSubtitle(occ(event({ kind: 'compromisso', place: 'São Paulo' })), ctx)).toBe('Compromisso · São Paulo')
    expect(eventSubtitle(occ(event({ kind: 'lembrete' })), ctx)).toBe('Lembrete')
  })

  it('o aniversário de namoro é Data especial', () => {
    expect(eventSubtitle({ event: null, day: '2026-09-17', endDay: '2026-09-17', title: '2 anos juntos', years: 2 }, ctx)).toBe('Data especial')
  })
})

describe('previewImpact (A6) — o cenário da seção 2 da spec', () => {
  // Primeiro período: Separados, desde hoje, em aberto. Depois a Visita do
  // Gabriel a Marau de 30/10 a 3/11.
  const stays = paintStays([], entriesForPeriod({ choice: 'apart', cityId: null, from: TODAY, to: null }, MEMBERS), newId)
  const visit = entriesForEvent(
    {
      kind: 'visita',
      title: 'Feriado de Finados em Marau',
      startsOn: '2026-10-30',
      endsOn: '2026-11-03',
      allDay: false,
      startsAt: '19:20',
      endsAt: '21:05',
      travelers: 'solo',
      travelerId: G,
      cityId: MARAU,
      place: null,
      repeatsYearly: false,
      note: null,
      listItemId: null,
    },
    MEMBERS,
  )

  it('a estadia aberta do Gabriel é partida em duas, e a de depois segue em aberto', () => {
    expect(normalize(paintStays(stays, visit, newId)).filter((s) => s.profileId === G)).toEqual([
      { profileId: G, cityId: SJC, startsOn: TODAY, endsOn: '2026-10-29' },
      { profileId: G, cityId: MARAU, startsOn: '2026-10-30', endsOn: '2026-11-03' },
      { profileId: G, cityId: SJC, startsOn: '2026-11-04', endsOn: null },
    ])
  })

  it('+5 dias juntos no ano; novembro tem mais dias do evento; separados 30 → 27', () => {
    expect(previewImpact(stays, visit, MEMBERS, { from: '2026-10-30', to: '2026-11-03' })).toEqual({
      togetherDeltaYear: 5,
      month: '2026-11',
      apartBefore: 30,
      apartAfter: 27,
    })
  })

  it('empate de dias entre dois meses: o primeiro', () => {
    expect(previewImpact(stays, [], MEMBERS, { from: '2026-10-30', to: '2026-11-02' }).month).toBe('2026-10')
  })
})

describe('monthWeeks', () => {
  it('setembro de 2026 começando no domingo', () => {
    const weeks = monthWeeks(2026, 9, 'sun')
    expect(weeks).toHaveLength(5)
    expect(weeks[0]).toEqual(['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'])
    expect(weeks[4][6]).toBe('2026-10-03')
  })

  it('setembro de 2026 começando na segunda', () => {
    const weeks = monthWeeks(2026, 9, 'mon')
    expect(weeks[0][0]).toBe('2026-08-31')
    expect(weeks.at(-1)?.at(-1)).toBe('2026-10-04')
  })

  it('fevereiro de 2026 começa num domingo: quatro semanas exatas', () => {
    const weeks = monthWeeks(2026, 2, 'sun')
    expect(weeks).toHaveLength(4)
    expect(weeks[0][0]).toBe('2026-02-01')
    expect(weeks[3][6]).toBe('2026-02-28')
  })

  it('agosto de 2026 com segunda: seis semanas; dezembro vira o ano', () => {
    expect(monthWeeks(2026, 8, 'mon')).toHaveLength(6)
    expect(monthWeeks(2026, 12, 'sun').at(-1)).toContain('2027-01-02')
    expect(monthWeeks(2026, 12, 'sun').every((w) => w.length === 7)).toBe(true)
  })
})
