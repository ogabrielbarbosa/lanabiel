// Critérios A13 e A20 — .agent/Tasks/fase-5-calendario.md, seção 10 — e a
// parte da tela de A19 (falha só do 💋) e da seção 7 (um integrante só).
// ADR 0005: comportamento de tela se prova renderizando.

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { settingsData } from '../settings/test/fixtures'
import type { CalendarApi } from './api'
import { CalendarScreen } from './CalendarScreen'
import { CITY_PARATY, GABRIEL, LANA, TODAY, calendarContext, fakeCalendarApi, seededCalendarApi } from './test/fixtures'

afterEach(() => {
  vi.useRealTimers()
})

function renderScreen(api: CalendarApi = seededCalendarApi()) {
  return { ...render(<CalendarScreen api={api} />), api }
}

const firstPeriod = () => screen.queryByRole('region', { name: 'Onde vocês estão hoje?' })
const loaded = () => screen.findByRole('group', { name: 'Dias do mês' })

describe('A13 — leitura: esqueleto, erro, e nunca o primeiro período antes do ok', () => {
  it('com a leitura em voo, esqueleto — sem grade e sem o cartão', () => {
    renderScreen(fakeCalendarApi({ loadCalendar: vi.fn<CalendarApi['loadCalendar']>(() => new Promise(() => undefined)) }))
    expect(screen.getByText('Carregando o calendário…')).toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(screen.queryByRole('group', { name: 'Dias do mês' })).not.toBeInTheDocument()
    expect(firstPeriod()).not.toBeInTheDocument()
  })

  it('contexto ok e vazio, cidades ainda lendo: não afirma que o casal não tem período', async () => {
    let resolve!: (v: Awaited<ReturnType<CalendarApi['loadCities']>>) => void
    const api = fakeCalendarApi({ loadCities: vi.fn<CalendarApi['loadCities']>(() => new Promise((r) => (resolve = r))) })
    renderScreen(api)
    await waitFor(() => expect(api.loadCities).toHaveBeenCalled())
    expect(firstPeriod()).not.toBeInTheDocument()
    await act(async () => resolve({ status: 'ok', rows: new Map() }))
    expect(await screen.findByRole('region', { name: 'Onde vocês estão hoje?' })).toBeInTheDocument()
  })

  it.each([
    ['loadContext', 'projeto pausado'],
    ['loadCalendar', 'rede caiu'],
    ['loadCities', 'timeout'],
  ] as const)('%s com erro → a causa e "Tentar de novo", nunca o cartão', async (fn, cause) => {
    const failing = vi.fn(async () => ({ status: 'error' as const, cause }))
    renderScreen(fakeCalendarApi({ [fn]: failing }))
    expect(await screen.findByRole('alert')).toHaveTextContent(`Não deu pra carregar o calendário: ${cause}`)
    expect(firstPeriod()).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Dias do mês' })).not.toBeInTheDocument()
  })

  it('sessão ausente também é erro — nunca o vazio', async () => {
    renderScreen(fakeCalendarApi({ loadContext: vi.fn<CalendarApi['loadContext']>(async () => ({ status: 'unauthenticated' })) }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu pra carregar o calendário: sua sessão expirou')
    expect(firstPeriod()).not.toBeInTheDocument()
  })

  it('"Tentar de novo" relê e mostra o calendário', async () => {
    const load = vi
      .fn<CalendarApi['loadCalendar']>()
      .mockResolvedValueOnce({ status: 'error', cause: 'projeto pausado' })
      .mockResolvedValueOnce({ status: 'ok', rows: { events: [], listItems: [] } })
    renderScreen(seededCalendarApi({}, { loadCalendar: load }))
    await userEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }))
    await loaded()
    expect(load).toHaveBeenCalledTimes(2)
    expect(firstPeriod()).not.toBeInTheDocument() // o casal tem estadias
  })

  it('lê as cidades de estadias, eventos e casas, e os 💋 da grade visível', async () => {
    const { api } = renderScreen()
    await loaded()
    const ids = vi.mocked(api.loadCities).mock.calls[0]![0]
    expect([...ids].sort()).toEqual(['c-lisboa', 'c-marau', 'c-paraty', 'c-sjc'])
    // Setembro de 2026, semana no domingo: 30/ago a 3/out.
    expect(api.loadKisses).toHaveBeenCalledWith('2026-08-30', '2026-10-03')
  })
})

describe('A13 — primeiro período', () => {
  it('ok com zero estadias → o cartão, com as quatro opções pelas casas', async () => {
    renderScreen(fakeCalendarApi())
    const card = await screen.findByRole('region', { name: 'Onde vocês estão hoje?' })
    expect(within(card).getByText('Cria o primeiro período no calendário')).toBeInTheDocument()
    const options = within(card).getAllByRole('radio')
    expect(options.map((o) => o.textContent)).toEqual(['Juntos em SJC', 'Juntos em Marau', 'Juntos em outra cidade', 'Separados'])
    // O seletor de cidade real (T10) vem por padrão: "outra cidade" está disponível.
    expect(within(card).getByRole('radio', { name: 'Juntos em outra cidade' })).toBeEnabled()
    expect(within(card).getByLabelText('Desde')).toHaveValue(TODAY)
    expect(within(card).getByLabelText('Até')).toHaveValue('')
    expect(within(card).getByRole('button', { name: 'Criar no calendário' })).toBeDisabled()
  })

  it('Separados + Criar no calendário → paint com as duas casas em aberto, e relê', async () => {
    const withStays = calendarContext([
      { id: 'n1', profileId: GABRIEL, cityId: 'c-sjc', startsOn: TODAY, endsOn: null },
      { id: 'n2', profileId: LANA, cityId: 'c-marau', startsOn: TODAY, endsOn: null },
    ])
    const loadContext = vi
      .fn<CalendarApi['loadContext']>()
      .mockResolvedValueOnce({ status: 'ok', rows: calendarContext([]) })
      .mockResolvedValue({ status: 'ok', rows: withStays })
    const api = fakeCalendarApi({ loadContext, paint: vi.fn<CalendarApi['paint']>(async () => ({ status: 'ok' })) })
    renderScreen(api)
    const card = await screen.findByRole('region', { name: 'Onde vocês estão hoje?' })
    await userEvent.click(within(card).getByRole('radio', { name: 'Separados' }))
    await userEvent.click(within(card).getByRole('button', { name: 'Criar no calendário' }))

    expect(api.paint).toHaveBeenCalledWith([
      { profileId: GABRIEL, cityId: 'c-sjc', from: TODAY, to: null },
      { profileId: LANA, cityId: 'c-marau', from: TODAY, to: null },
    ])
    await waitFor(() => expect(firstPeriod()).not.toBeInTheDocument())
    expect(loadContext).toHaveBeenCalledTimes(2)
    expect(screen.getAllByRole('button', { name: 'Separados · SJC e Marau' }).length).toBeGreaterThan(0)
  })

  it('Juntos em SJC com Até: paint dos dois em SJC no intervalo', async () => {
    const api = fakeCalendarApi({ paint: vi.fn<CalendarApi['paint']>(async () => ({ status: 'ok' })) })
    renderScreen(api)
    const card = await screen.findByRole('region', { name: 'Onde vocês estão hoje?' })
    await userEvent.click(within(card).getByRole('radio', { name: 'Juntos em SJC' }))
    await userEvent.type(within(card).getByLabelText('Até'), '2026-09-30')
    await userEvent.click(within(card).getByRole('button', { name: 'Criar no calendário' }))
    expect(api.paint).toHaveBeenCalledWith([
      { profileId: GABRIEL, cityId: 'c-sjc', from: TODAY, to: '2026-09-30' },
      { profileId: LANA, cityId: 'c-sjc', from: TODAY, to: '2026-09-30' },
    ])
  })

  it('Até antes de Desde bloqueia', async () => {
    renderScreen(fakeCalendarApi())
    const card = await screen.findByRole('region', { name: 'Onde vocês estão hoje?' })
    await userEvent.click(within(card).getByRole('radio', { name: 'Separados' }))
    await userEvent.type(within(card).getByLabelText('Até'), '2026-09-20')
    expect(within(card).getByText('O fim precisa ser no dia do começo ou depois.')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Criar no calendário' })).toBeDisabled()
  })

  it('pintura falhou → a causa, e o cartão continua com a escolha', async () => {
    const api = fakeCalendarApi({ paint: vi.fn<CalendarApi['paint']>(async () => ({ status: 'invalid', constraint: 'stays_no_overlap' })) })
    renderScreen(api)
    const card = await screen.findByRole('region', { name: 'Onde vocês estão hoje?' })
    await userEvent.click(within(card).getByRole('radio', { name: 'Separados' }))
    await userEvent.click(within(card).getByRole('button', { name: 'Criar no calendário' }))
    expect(await within(card).findByRole('alert')).toHaveTextContent('Não deu pra criar: o banco recusou (stays_no_overlap)')
    expect(within(card).getByRole('radio', { name: 'Separados' })).toHaveAttribute('aria-checked', 'true')
    expect(api.loadContext).toHaveBeenCalledTimes(1)
  })

  it('com o seletor de cidade, "outra cidade" exige a cidade e pinta os dois nela', async () => {
    const api = fakeCalendarApi({ paint: vi.fn<CalendarApi['paint']>(async () => ({ status: 'ok' })) })
    render(
      <CalendarScreen
        api={api}
        renderCityPicker={({ onChange, label }) => (
          <button type="button" onClick={() => onChange(CITY_PARATY)}>
            dublê: {label} Paraty
          </button>
        )}
      />,
    )
    const card = await screen.findByRole('region', { name: 'Onde vocês estão hoje?' })
    await userEvent.click(within(card).getByRole('radio', { name: 'Juntos em outra cidade' }))
    expect(within(card).getByText('Escolha a cidade.')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Criar no calendário' })).toBeDisabled()
    await userEvent.click(within(card).getByRole('button', { name: 'dublê: Cidade Paraty' }))
    await userEvent.click(within(card).getByRole('button', { name: 'Criar no calendário' }))
    expect(api.paint).toHaveBeenCalledWith([
      { profileId: GABRIEL, cityId: 'c-paraty', from: TODAY, to: null },
      { profileId: LANA, cityId: 'c-paraty', from: TODAY, to: null },
    ])
  })

  it('um integrante só: a mensagem, sem faixa e sem o cartão (seção 7)', async () => {
    const solo = settingsData({ stays: [] })
    solo.couple.members = solo.couple.members.slice(0, 1)
    renderScreen(fakeCalendarApi({ loadContext: vi.fn<CalendarApi['loadContext']>(async () => ({ status: 'ok', rows: solo })) }))
    expect(await screen.findByText('O calendário precisa de vocês dois — convide de novo em Configurações')).toBeInTheDocument()
    expect(firstPeriod()).not.toBeInTheDocument()
    expect(document.querySelector('.cal-band')).toBeNull()
    expect(screen.queryByRole('button', { name: /^💋/ })).not.toBeInTheDocument()
  })
})

describe('R3 — cabeçalho', () => {
  it('setas trocam o mês e releem só os 💋 da grade nova; Hoje volta', async () => {
    const { api } = renderScreen()
    await loaded()
    await userEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Outubro 2026')
    await waitFor(() => expect(api.loadKisses).toHaveBeenLastCalledWith('2026-09-27', '2026-10-31'))
    expect(api.loadContext).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Hoje' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Setembro 2026')
  })

  it('o seletor começa em calendar_default_view', async () => {
    renderScreen(seededCalendarApi({ settings: { calendarDefaultView: 'year' } }))
    expect(await screen.findByRole('region', { name: 'Ano' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ano' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2026')
    await userEvent.click(screen.getByRole('button', { name: 'Mês' }))
    expect(await loaded()).toBeInTheDocument()
  })

  it('o slot do painel existe à direita', async () => {
    renderScreen()
    await loaded()
    expect(screen.getByRole('complementary', { name: 'Onde a gente está' })).toBeInTheDocument()
  })
})

describe('A19 — falha só do 💋', () => {
  it('não derruba a tela: sem 💋 e um aviso discreto', async () => {
    renderScreen(seededCalendarApi({}, { loadKisses: vi.fn<CalendarApi['loadKisses']>(async () => ({ status: 'error', cause: 'x' })) }))
    await loaded()
    expect(screen.getByText('Os 💋 deste mês não carregaram')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^💋/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Lana em SJC' }).length).toBeGreaterThan(0)
  })
})

describe('A20 — releitura ao voltar à aba (ADR 0015)', () => {
  function showTab() {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  }

  it('visibilitychange → visible relê e mostra o que mudou', async () => {
    const loadCalendar = vi
      .fn<CalendarApi['loadCalendar']>()
      .mockResolvedValueOnce({ status: 'ok', rows: { events: [], listItems: [] } })
      .mockResolvedValue({
        status: 'ok',
        rows: {
          events: [
            {
              id: 'e-novo', kind: 'date', title: 'Evento da Lana', startsOn: '2026-09-22', endsOn: null, allDay: true,
              startsAt: null, endsAt: null, travelers: null, travelerId: null, cityId: null, place: null,
              repeatsYearly: false, note: null, listItemId: null, createdBy: LANA,
            },
          ],
          listItems: [],
        },
      })
    renderScreen(seededCalendarApi({}, { loadCalendar }))
    await loaded()
    expect(screen.queryByRole('button', { name: 'Evento da Lana' })).not.toBeInTheDocument()
    await act(async () => showTab())
    expect(await screen.findByRole('button', { name: 'Evento da Lana' })).toBeInTheDocument()
    expect(loadCalendar).toHaveBeenCalledTimes(2)
  })

  it('releitura com erro mantém a tela e avisa', async () => {
    const loadContext = vi
      .fn<CalendarApi['loadContext']>()
      .mockResolvedValueOnce({ status: 'ok', rows: calendarContext() })
      .mockResolvedValue({ status: 'error', cause: 'rede caiu' })
    renderScreen(seededCalendarApi({}, { loadContext }))
    await loaded()
    await act(async () => showTab())
    expect(await screen.findByText('Não deu pra atualizar — mostrando o que já estava aqui')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Dias do mês' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Lana em SJC' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
