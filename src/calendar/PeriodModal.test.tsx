// Critério A17 — .agent/Tasks/fase-5-calendario.md (R13–R16, I3, seção 7).
// O modal se prova renderizado com a `CalendarApi` falsa: a pintura que ele
// manda é a de `entriesForPeriod` / `entriesForEdit` / `entriesForDelete`.

import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runAround } from '../domain/calendar'
import type { Run } from '../domain/calendar'
import type { CalendarApi } from './api'
import { CalendarScreen } from './CalendarScreen'
import { PeriodModal } from './PeriodModal'
import type { PeriodModalProps } from './PeriodModal'
import {
  CITY_LISBOA,
  CITY_PARATY,
  GABRIEL,
  LANA,
  LISBOA_CANDIDATE,
  SEPTEMBER_STAYS,
  fakeCalendarApi,
  seededCalendarApi,
} from './test/fixtures'
import { calendarValue } from './test/renderInCalendar'
import type { CalendarValueOptions } from './test/renderInCalendar'
import { MARAU, SJC } from '../settings/test/fixtures'

const paintOk = () => vi.fn<CalendarApi['paint']>(async () => ({ status: 'ok' }))

function renderModal(
  mode: PeriodModalProps['mode'],
  options: CalendarValueOptions & { api?: CalendarApi } = {},
) {
  const api = options.api ?? fakeCalendarApi({ paint: paintOk() })
  const env = calendarValue({ ...options, api })
  const onClose = vi.fn()
  const onSaved = vi.fn(async () => {})
  render(<PeriodModal env={env} mode={mode} onClose={onClose} onSaved={onSaved} />)
  return { api, env, onClose, onSaved }
}

const dialog = () => screen.getByRole('dialog')
const setDate = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
/** "Título · sub" de cada cartão (os avatares são decorativos). */
const cardTexts = () =>
  screen.getAllByRole('radio').map((c) => `${c.querySelector('.cal-pcard-title')?.textContent} · ${c.querySelector('.cal-pcard-sub')?.textContent}`)
const save = () => screen.getByRole('button', { name: 'Salvar período' })

afterEach(() => {
  vi.useRealTimers()
})

describe('A17 — Novo período', () => {
  it('os 4 cartões, com os nomes e as casas; Cidade só com Viajando juntos', async () => {
    renderModal({ kind: 'new', day: '2026-11-13' })
    expect(within(dialog()).getByRole('heading', { name: 'Novo período' })).toBeInTheDocument()
    expect(screen.getByText('Marque onde cada um vai estar')).toBeInTheDocument()
    expect(cardTexts()).toEqual([
      'Juntos em SJC · Lana veio',
      'Juntos em Marau · Gabriel foi',
      'Viajando juntos · Outra cidade',
      'Separados · Cada um na sua',
    ])
    expect(screen.queryByRole('combobox', { name: 'Cidade' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: /Viajando juntos/ }))
    expect(screen.getByRole('combobox', { name: 'Cidade' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: /Separados/ }))
    expect(screen.queryByRole('combobox', { name: 'Cidade' })).not.toBeInTheDocument()
  })

  it('casas iguais → os dois primeiros viram um só, e Separados some (R13)', () => {
    const api = fakeCalendarApi()
    const env = calendarValue({ api })
    const same = { ...env, people: { ...env.people, 2: { ...env.people[2], homeCity: env.people[1].homeCity } } }
    render(<PeriodModal env={same} mode={{ kind: 'new', day: '2026-11-13' }} onClose={vi.fn()} onSaved={vi.fn()} />)
    expect(cardTexts()).toEqual(['Juntos em SJC · Os dois em casa', 'Viajando juntos · Outra cidade'])
  })

  it('Início e Fim obrigatórios; Fim antes do Início bloqueia', async () => {
    renderModal({ kind: 'new', day: '2026-11-13' })
    await userEvent.click(screen.getByRole('radio', { name: /Juntos em SJC/ }))
    expect(screen.getByLabelText('Início')).toHaveValue('2026-11-13')
    expect(screen.getByText('Escolha o fim.')).toBeInTheDocument()
    expect(save()).toBeDisabled()
    setDate('Fim', '2026-11-10')
    expect(screen.getByText('O fim precisa ser no dia do início ou depois.')).toBeInTheDocument()
    expect(save()).toBeDisabled()
    expect(screen.queryByRole('region', { name: /Prévia/ })).not.toBeInTheDocument()
    setDate('Fim', '2027-11-14')
    expect(screen.getByText('No máximo 366 dias.')).toBeInTheDocument()
    expect(save()).toBeDisabled()
  })

  it('a prévia mostra o depois, o rótulo e "Substitui {n} dias…"; salvar pinta entriesForPeriod', async () => {
    const { api, onSaved } = renderModal({ kind: 'new', day: '2026-11-13' })
    await userEvent.click(screen.getByRole('radio', { name: /Juntos em SJC/ }))
    setDate('Fim', '2026-11-15')

    const preview = screen.getByRole('region', { name: 'Prévia · novembro' })
    expect(within(preview).getByText('3 dias juntos em SJC')).toBeInTheDocument()
    const days = [...preview.querySelectorAll<HTMLElement>('.cal-strip-day')]
    expect(days.map((d) => [d.dataset.day, d.dataset.band])).toEqual([
      ['2026-11-10', 'apart'],
      ['2026-11-11', 'apart'],
      ['2026-11-12', 'apart'],
      ['2026-11-13', 'home1'],
      ['2026-11-14', 'home1'],
      ['2026-11-15', 'home1'],
      ['2026-11-16', 'apart'],
    ])
    // Os três dias estavam _Separados_ (as duas estadias abertas desde 6/10).
    expect(within(preview).getByText('Substitui 3 dias que já estavam no calendário')).toBeInTheDocument()

    await userEvent.click(save())
    expect(api.paint).toHaveBeenCalledWith([
      { profileId: GABRIEL, cityId: SJC.id, from: '2026-11-13', to: '2026-11-15' },
      { profileId: LANA, cityId: SJC.id, from: '2026-11-13', to: '2026-11-15' },
    ])
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('sem nada antes, a prévia não diz que substitui', async () => {
    renderModal({ kind: 'new', day: '2026-11-13' }, { stays: [] })
    await userEvent.click(screen.getByRole('radio', { name: /Separados/ }))
    setDate('Fim', '2026-11-13')
    expect(screen.getByText('1 dia separados')).toBeInTheDocument()
    expect(screen.queryByText(/Substitui/)).not.toBeInTheDocument()
  })

  it('Viajando juntos exige a cidade; cidade do mundo é gravada ANTES da pintura', async () => {
    vi.useFakeTimers()
    const api = fakeCalendarApi({
      paint: paintOk(),
      searchWorldCities: vi.fn<CalendarApi['searchWorldCities']>(async () => ({ status: 'ok', rows: [LISBOA_CANDIDATE] })),
      ensureWorldCity: vi.fn<CalendarApi['ensureWorldCity']>(async () => ({ status: 'ok', value: CITY_LISBOA })),
    })
    renderModal({ kind: 'new', day: '2026-11-13' }, { api })
    fireEvent.click(screen.getByRole('radio', { name: /Viajando juntos/ }))
    setDate('Fim', '2026-11-15')
    expect(screen.getByText('Escolha a cidade.')).toBeInTheDocument()
    expect(save()).toBeDisabled()

    fireEvent.change(screen.getByRole('combobox', { name: 'Cidade' }), { target: { value: 'lisb' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350)
    })
    fireEvent.click(screen.getByRole('option', { name: 'Lisboa · Portugal' }))
    // A prévia já roda com o candidato (id provisório), sem gravar nada.
    expect(screen.getByText('3 dias viajando')).toBeInTheDocument()
    expect(api.ensureWorldCity).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(save())
    })
    expect(api.ensureWorldCity).toHaveBeenCalledWith('couple-1', LISBOA_CANDIDATE)
    expect(api.paint).toHaveBeenCalledWith([
      { profileId: GABRIEL, cityId: CITY_LISBOA.id, from: '2026-11-13', to: '2026-11-15' },
      { profileId: LANA, cityId: CITY_LISBOA.id, from: '2026-11-13', to: '2026-11-15' },
    ])
    expect(vi.mocked(api.ensureWorldCity).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.paint).mock.invocationCallOrder[0])
  })

  it('falha na pintura: fica aberto, com a escolha e a causa', async () => {
    const api = fakeCalendarApi({ paint: vi.fn<CalendarApi['paint']>(async () => ({ status: 'invalid', constraint: 'stays_no_overlap' })) })
    const { onSaved } = renderModal({ kind: 'new', day: '2026-11-13' }, { api })
    await userEvent.click(screen.getByRole('radio', { name: /Separados/ }))
    setDate('Fim', '2026-11-15')
    await userEvent.click(save())
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu pra salvar: o banco recusou (stays_no_overlap)')
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByRole('radio', { name: /Separados/ })).toHaveAttribute('aria-checked', 'true')
    expect(save()).toBeEnabled()
  })
})

describe('A17 — Editar período', () => {
  // 21–30/9: os dois em SJC ("Lana em SJC"), trecho fechado.
  const lanaEmSjc = (): Run => runAround('2026-09-25', SEPTEMBER_STAYS, calendarValue().members)

  it('tocar numa faixa abre o modal preenchido', async () => {
    render(<CalendarScreen api={seededCalendarApi()} />)
    const [band] = await screen.findAllByRole('button', { name: 'Lana em SJC' })
    await userEvent.click(band)
    const modal = screen.getByRole('dialog', { name: 'Editar período' })
    expect(within(modal).getByRole('radio', { name: /Juntos em SJC/ })).toHaveAttribute('aria-checked', 'true')
    expect(within(modal).getByLabelText('Início')).toHaveValue('2026-09-21')
    expect(within(modal).getByLabelText('Fim')).toHaveValue('2026-09-30')
  })

  it('encurtar manda os dias tirados para a casa de cada um', async () => {
    const { api } = renderModal({ kind: 'edit', run: lanaEmSjc() })
    setDate('Fim', '2026-09-28')
    expect(screen.getByText(/Substitui 2 dias/)).toBeInTheDocument()
    await userEvent.click(save())
    expect(api.paint).toHaveBeenCalledWith([
      { profileId: GABRIEL, cityId: SJC.id, from: '2026-09-29', to: '2026-09-30' },
      { profileId: LANA, cityId: MARAU.id, from: '2026-09-29', to: '2026-09-30' },
      { profileId: GABRIEL, cityId: SJC.id, from: '2026-09-21', to: '2026-09-28' },
      { profileId: LANA, cityId: SJC.id, from: '2026-09-21', to: '2026-09-28' },
    ])
  })

  it('Apagar período pede confirmação e pinta as casas no trecho inteiro', async () => {
    const { api, onSaved } = renderModal({ kind: 'edit', run: lanaEmSjc() })
    await userEvent.click(screen.getByRole('button', { name: 'Apagar período' }))
    expect(screen.getByText('Nesses dias, cada um volta pra própria casa.')).toBeInTheDocument()
    expect(api.paint).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Apagar' }))
    expect(api.paint).toHaveBeenCalledWith([
      { profileId: GABRIEL, cityId: SJC.id, from: '2026-09-21', to: '2026-09-30' },
      { profileId: LANA, cityId: MARAU.id, from: '2026-09-21', to: '2026-09-30' },
    ])
    expect(onSaved).toHaveBeenCalled()
  })

  it('trecho em aberto: Fim vazio, salvar mantém em aberto; separados em casa não tem Apagar', async () => {
    const run = runAround('2026-10-10', SEPTEMBER_STAYS, calendarValue().members)
    expect(run).toMatchObject({ from: '2026-10-06', to: null, band: 'apart' })
    const { api } = renderModal({ kind: 'edit', run })
    expect(screen.getByLabelText('Fim')).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Apagar período' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: /Juntos em Marau/ }))
    await userEvent.click(save())
    expect(api.paint).toHaveBeenCalledWith([
      { profileId: GABRIEL, cityId: MARAU.id, from: '2026-10-06', to: null },
      { profileId: LANA, cityId: MARAU.id, from: '2026-10-06', to: null },
    ])
  })

  it('trecho de viagem abre com a cidade', () => {
    const run = runAround('2026-09-12', SEPTEMBER_STAYS, calendarValue().members)
    renderModal({ kind: 'edit', run })
    expect(screen.getByRole('radio', { name: /Viajando juntos/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('combobox', { name: 'Cidade' })).toHaveValue(`${CITY_PARATY.name}, RJ`)
  })
})
