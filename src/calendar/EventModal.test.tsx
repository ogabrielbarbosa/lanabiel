// Critério A18 — .agent/Tasks/fase-5-calendario.md (R18–R20, I6, I8, seção 7).
// O modal se prova renderizado com a `CalendarApi` falsa e o `ModalEnv` do
// setembro das fixtures (Gabriel = slot 1 em SJC, quem está vendo; Lana =
// slot 2 em Marau).

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EventDraft, Stay } from '../domain/calendar'
import type { CalendarApi } from './api'
import { CalendarScreen } from './CalendarScreen'
import { EventModal } from './EventModal'
import type { EventModalProps } from './EventModal'
import { loadModalEnv } from './modalEnv'
import {
  CITY_LISBOA,
  GABRIEL,
  LANA,
  LISBOA_CANDIDATE,
  SEPTEMBER_EVENTS,
  fakeCalendarApi,
  seededCalendarApi,
} from './test/fixtures'
import { calendarValue } from './test/renderInCalendar'
import type { CalendarValueOptions } from './test/renderInCalendar'
import { MARAU, SJC } from '../settings/test/fixtures'

const createOk = () => vi.fn<CalendarApi['createEvent']>(async () => ({ status: 'ok', value: { id: 'e-new' } }))

function renderModal(mode: EventModalProps['mode'], options: CalendarValueOptions & { api?: CalendarApi } = {}) {
  const api = options.api ?? fakeCalendarApi({ createEvent: createOk() })
  const env = calendarValue({ ...options, api })
  const onClose = vi.fn()
  const onSaved = vi.fn(async () => {})
  render(<EventModal env={env} mode={mode} onClose={onClose} onSaved={onSaved} />)
  return { api, env, onClose, onSaved }
}

const NEW = { kind: 'new', day: '2026-10-30' } as const
const fieldsShown = () =>
  [...document.querySelectorAll<HTMLElement>('.cal-eform [data-field]')].map((el) => el.dataset.field)
const chip = (name: string) => within(screen.getByRole('group', { name: 'Tipo' })).getByRole('button', { name })
const setValue = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const save = () => screen.getByRole('button', { name: 'Salvar evento' })

/** O cenário da seção 2: primeiro período _Separados_ desde 26/09, em aberto. */
const SEPARATED_SINCE_26: Stay[] = [
  { id: 'g', profileId: GABRIEL, cityId: SJC.id, startsOn: '2026-09-26', endsOn: null },
  { id: 'l', profileId: LANA, cityId: MARAU.id, startsOn: '2026-09-26', endsOn: null },
]

afterEach(() => {
  vi.useRealTimers()
})

describe('A18 — tipos e campos (R18)', () => {
  it('os 6 chips, sem números, e cada tipo mostra exatamente os campos da tabela', async () => {
    renderModal(NEW)
    const chips = within(screen.getByRole('group', { name: 'Tipo' })).getAllByRole('button')
    expect(chips.map((c) => c.textContent)).toEqual(['Viagem', 'Visita', 'Date', 'Data especial', 'Compromisso', 'Lembrete'])

    const expected: Record<string, string[]> = {
      Viagem: ['title', 'travelers', 'destination', 'departure', 'return', 'allDay', 'note', 'link'],
      Visita: ['title', 'travelers', 'destination', 'departure', 'return', 'allDay', 'note', 'link'],
      Date: ['title', 'day', 'time', 'place', 'note', 'link'],
      'Data especial': ['title', 'day', 'repeats', 'note'],
      Compromisso: ['title', 'start', 'end', 'time', 'place', 'note'],
      Lembrete: ['title', 'day', 'until', 'note'],
    }
    for (const [label, fields] of Object.entries(expected)) {
      await userEvent.click(chip(label))
      expect(chip(label)).toHaveAttribute('aria-pressed', 'true')
      expect(fieldsShown(), label).toEqual(fields)
    }
  })

  it('"Avisar a…" não existe; Dia inteiro esconde as horas', async () => {
    renderModal(NEW)
    expect(screen.queryByText(/Avisar/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Hora da ida')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('switch', { name: 'Dia inteiro' }))
    expect(screen.queryByLabelText('Hora da ida')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Hora da volta')).not.toBeInTheDocument()
  })

  it('Visita: quem viaja é quem cria, e o destino é a casa da OUTRA pessoa; com os dois, vazio', async () => {
    renderModal(NEW)
    expect(chip('Visita')).toHaveAttribute('aria-pressed', 'true')
    const who = screen.getByRole('radiogroup', { name: 'Quem viaja' })
    expect(within(who).getByRole('radio', { name: 'Gabriel' })).toHaveAttribute('aria-checked', 'true')
    const dest = screen.getByRole('combobox', { name: 'Destino' })
    expect(dest).toHaveValue('Marau, RS · casa de Lana')

    await userEvent.click(within(who).getByRole('radio', { name: 'Lana' }))
    expect(dest).toHaveValue('São José dos Campos, SP · casa de Gabriel')
    await userEvent.click(within(who).getByRole('radio', { name: 'Os dois' }))
    expect(dest).toHaveValue('')
  })

  it('Viagem: padrão Os dois, destino vazio', async () => {
    renderModal(NEW)
    await userEvent.click(chip('Viagem'))
    expect(within(screen.getByRole('radiogroup', { name: 'Quem viaja' })).getByRole('radio', { name: 'Os dois' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('combobox', { name: 'Destino' })).toHaveValue('')
  })
})

describe('A18 — Período automático', () => {
  it('o cenário da seção 2: o cartão, a tira e as três linhas', () => {
    renderModal(NEW, { stays: SEPARATED_SINCE_26 })
    const auto = screen.getByRole('complementary', { name: 'Período automático' })
    expect(within(auto).getByText('Escolha quem viaja, o destino e a volta para ver como os dias vão ficar.')).toBeInTheDocument()

    setValue('Volta', '2026-11-03')
    expect(within(auto).getByText('Como os dias vão ficar')).toBeInTheDocument()
    expect(within(auto).getByText('Gabriel viaja · 30 out → 3 nov')).toBeInTheDocument()
    expect(within(auto).getByText('5d')).toBeInTheDocument()
    const days = [...auto.querySelectorAll<HTMLElement>('.cal-strip-day')]
    // Duas semanas a partir do domingo da ida: 25/10 a 7/11.
    expect(days).toHaveLength(14)
    expect(days[0].dataset.day).toBe('2026-10-25')
    expect(days.filter((d) => d.classList.contains('is-on')).map((d) => d.dataset.day)).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
    ])
    expect(days.map((d) => d.dataset.band)).toEqual([
      ...Array(5).fill('apart'),
      ...Array(5).fill('home2'),
      ...Array(4).fill('apart'),
    ])
    expect(within(auto).getByText('+5 dias juntos no ano')).toBeInTheDocument()
    expect(within(auto).getByText('Separados em novembro: 30 → 27 dias')).toBeInTheDocument()
    expect(within(auto).getByText('Dá pra ajustar o período depois')).toBeInTheDocument()
  })

  it('só em viagem e visita, e só ao criar', async () => {
    renderModal(NEW)
    await userEvent.click(chip('Date'))
    expect(screen.queryByRole('complementary', { name: 'Período automático' })).not.toBeInTheDocument()
    await userEvent.click(chip('Viagem'))
    expect(screen.getByRole('complementary', { name: 'Período automático' })).toBeInTheDocument()
  })
})

describe('A18 — salvar (R19)', () => {
  it('Visita chama createEvent com pintura, relê pelo onSaved', async () => {
    const { api, onSaved } = renderModal(NEW, { stays: SEPARATED_SINCE_26 })
    await userEvent.type(screen.getByLabelText('Título'), 'Feriado de Finados em Marau')
    setValue('Hora da ida', '19:20')
    setValue('Volta', '2026-11-03')
    setValue('Hora da volta', '21:05')
    await userEvent.click(save())
    expect(api.createEvent).toHaveBeenCalledWith(
      'couple-1',
      {
        kind: 'visita',
        title: 'Feriado de Finados em Marau',
        startsOn: '2026-10-30',
        endsOn: '2026-11-03',
        allDay: false,
        startsAt: '19:20',
        endsAt: '21:05',
        travelers: 'solo',
        travelerId: GABRIEL,
        cityId: MARAU.id,
        place: null,
        repeatsYearly: false,
        note: null,
        listItemId: null,
      } satisfies EventDraft,
      true,
    )
    expect(onSaved).toHaveBeenCalledWith({ action: 'created', startsOn: '2026-10-30' })
  })

  it('Date nunca pinta', async () => {
    const { api } = renderModal(NEW)
    await userEvent.click(chip('Date'))
    await userEvent.type(screen.getByLabelText('Título'), 'Cinema')
    await userEvent.type(screen.getByLabelText('Local'), 'Centervale')
    await userEvent.click(save())
    expect(api.createEvent).toHaveBeenCalledTimes(1)
    const [, draft, paint] = vi.mocked(api.createEvent).mock.calls[0]
    expect(paint).toBe(false)
    expect(draft).toMatchObject({ kind: 'date', title: 'Cinema', allDay: true, place: 'Centervale', cityId: null, travelers: null })
  })

  it('validateEvent aponta o campo: sem título, sem destino', async () => {
    const { api } = renderModal(NEW)
    await userEvent.click(chip('Viagem'))
    await userEvent.click(save())
    expect(screen.getByRole('alert')).toHaveTextContent('Dê um título ao evento.')
    expect(screen.getByLabelText('Título')).toHaveFocus()

    await userEvent.type(screen.getByLabelText('Título'), 'Paraty')
    await userEvent.click(save())
    expect(screen.getByRole('alert')).toHaveTextContent('Escolha o destino.')
    expect(screen.getByRole('combobox', { name: 'Destino' })).toHaveFocus()
    expect(api.createEvent).not.toHaveBeenCalled()
  })

  it('destino do mundo: ensureWorldCity ANTES de createEvent, com o id que voltou', async () => {
    vi.useFakeTimers()
    const api = fakeCalendarApi({
      createEvent: createOk(),
      searchWorldCities: vi.fn<CalendarApi['searchWorldCities']>(async () => ({ status: 'ok', rows: [LISBOA_CANDIDATE] })),
      ensureWorldCity: vi.fn<CalendarApi['ensureWorldCity']>(async () => ({ status: 'ok', value: CITY_LISBOA })),
    })
    renderModal(NEW, { api })
    fireEvent.click(chip('Viagem'))
    setValue('Título', 'Lisboa')
    setValue('Volta', '2026-11-05')
    fireEvent.change(screen.getByRole('combobox', { name: 'Destino' }), { target: { value: 'Lisboa' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350)
    })
    fireEvent.click(screen.getByRole('option', { name: 'Lisboa · Portugal' }))
    expect(api.ensureWorldCity).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(save())
    })
    expect(api.ensureWorldCity).toHaveBeenCalledWith('couple-1', LISBOA_CANDIDATE)
    expect(vi.mocked(api.createEvent).mock.calls[0][1]).toMatchObject({ cityId: CITY_LISBOA.id, travelers: 'both' })
    expect(vi.mocked(api.ensureWorldCity).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(api.createEvent).mock.invocationCallOrder[0],
    )
  })

  it('cidade do mundo falhou → nada é criado; o modal fica com a causa', async () => {
    vi.useFakeTimers()
    const api = fakeCalendarApi({
      createEvent: createOk(),
      searchWorldCities: vi.fn<CalendarApi['searchWorldCities']>(async () => ({ status: 'ok', rows: [LISBOA_CANDIDATE] })),
      ensureWorldCity: vi.fn<CalendarApi['ensureWorldCity']>(async () => ({ status: 'error', cause: 'rede' })),
    })
    const { onSaved } = renderModal(NEW, { api })
    fireEvent.click(chip('Viagem'))
    setValue('Título', 'Lisboa')
    setValue('Volta', '2026-11-05')
    fireEvent.change(screen.getByRole('combobox', { name: 'Destino' }), { target: { value: 'Lisboa' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350)
    })
    fireEvent.click(screen.getByRole('option', { name: 'Lisboa · Portugal' }))
    await act(async () => {
      fireEvent.click(save())
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Não deu pra salvar: não deu pra guardar a cidade: rede')
    expect(api.createEvent).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Título')).toHaveValue('Lisboa')
  })

  it('createEvent falhou → fica aberto, com a causa', async () => {
    const api = fakeCalendarApi({
      createEvent: vi.fn<CalendarApi['createEvent']>(async () => ({ status: 'invalid', constraint: 'calendar_events_format' })),
    })
    const { onSaved } = renderModal(NEW, { api })
    await userEvent.click(chip('Lembrete'))
    await userEvent.type(screen.getByLabelText('Título'), 'Passagens')
    await userEvent.click(save())
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu pra salvar: o banco recusou (calendar_events_format)')
    expect(onSaved).not.toHaveBeenCalled()
    expect(save()).toBeEnabled()
  })
})

describe('A18 — vínculo com a lista e preset (R23)', () => {
  it('busca por nome, mostra a categoria, e o × desfaz', async () => {
    const { api } = renderModal(NEW)
    await userEvent.click(chip('Date'))
    await userEvent.type(screen.getByLabelText('Título'), 'Vinho')
    await userEvent.type(screen.getByRole('combobox', { name: 'Vínculo com a lista' }), 'vin')
    const options = screen.getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['Vinícola em Marau · Experiências'])
    await userEvent.click(options[0])
    expect(screen.getByText('Vinícola em Marau')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer vínculo' }))
    expect(screen.getByRole('combobox', { name: 'Vínculo com a lista' })).toHaveValue('')
    await userEvent.type(screen.getByRole('combobox', { name: 'Vínculo com a lista' }), 'vicen')
    await userEvent.click(screen.getByRole('option'))
    await userEvent.click(save())
    expect(vi.mocked(api.createEvent).mock.calls[0][1]).toMatchObject({ kind: 'date', listItemId: 'i-vicentina' })
  })

  it('preset do Agendar: Date com o título e o vínculo, montado fora da tela por loadModalEnv', async () => {
    const api = seededCalendarApi({}, { createEvent: createOk() })
    const env = await loadModalEnv(api)
    if (env.status !== 'ok') throw new Error('loadModalEnv falhou')
    const onSaved = vi.fn()
    render(
      <EventModal
        env={env.rows}
        mode={{ kind: 'new', day: env.rows.today, preset: { kind: 'date', title: 'Vinícola em Marau', listItemId: 'i-vinicola' } }}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    )
    expect(chip('Date')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Título')).toHaveValue('Vinícola em Marau')
    expect(screen.getByText('Vinícola em Marau', { selector: '.cal-mf-chosen' })).toBeInTheDocument()
    await userEvent.click(save())
    expect(api.createEvent).toHaveBeenCalledWith(
      'couple-1',
      expect.objectContaining({ kind: 'date', title: 'Vinícola em Marau', listItemId: 'i-vinicola', startsOn: '2026-09-25' }),
      false,
    )
    expect(onSaved).toHaveBeenCalledWith({ action: 'created', startsOn: '2026-09-25' })
  })
})

describe('A18 — Editar evento (R20)', () => {
  const lisboa = SEPTEMBER_EVENTS.find((e) => e.id === 'e-lisboa')!
  const jantar = SEPTEMBER_EVENTS.find((e) => e.id === 'e-jantar')!

  it('viagem: tipo travado, aviso do período no lugar da prévia, updateEvent', async () => {
    const api = fakeCalendarApi({ updateEvent: vi.fn<CalendarApi['updateEvent']>(async () => ({ status: 'ok' })) })
    const { onSaved } = renderModal({ kind: 'edit', event: lisboa }, { api })
    expect(screen.getByRole('heading', { name: 'Editar evento' })).toBeInTheDocument()
    expect(chip('Viagem')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('Date')).toBeDisabled()
    expect(screen.getByText('Mudar datas ou destino aqui não muda o período — ajuste no calendário.')).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Período automático' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Destino' })).toHaveValue('Lisboa · Portugal')

    await userEvent.clear(screen.getByLabelText('Título'))
    await userEvent.type(screen.getByLabelText('Título'), 'Lisboa!')
    await userEvent.click(save())
    expect(api.updateEvent).toHaveBeenCalledWith('e-lisboa', expect.objectContaining({ title: 'Lisboa!', cityId: CITY_LISBOA.id }))
    expect(api.ensureWorldCity).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalledWith({ action: 'updated', startsOn: '2026-10-01' })
  })

  it('apagar viagem avisa que o período continua', async () => {
    const api = fakeCalendarApi({ deleteEvent: vi.fn<CalendarApi['deleteEvent']>(async () => ({ status: 'ok' })) })
    renderModal({ kind: 'edit', event: lisboa }, { api })
    await userEvent.click(screen.getByRole('button', { name: 'Apagar' }))
    expect(screen.getByText('Apagar Lisboa, Portugal? O período no calendário continua.')).toBeInTheDocument()
    expect(api.deleteEvent).not.toHaveBeenCalled()
    await userEvent.click(within(screen.getByRole('group', { name: 'Apagar evento' })).getByRole('button', { name: 'Apagar' }))
    expect(api.deleteEvent).toHaveBeenCalledWith('e-lisboa')
  })

  it('apagar outro tipo: só "Apagar {título}?"', async () => {
    renderModal({ kind: 'edit', event: jantar })
    await userEvent.click(screen.getByRole('button', { name: 'Apagar' }))
    expect(screen.getByText('Apagar Jantar 20h?')).toBeInTheDocument()
  })
})

describe('A18 — dentro da tela', () => {
  it('Novo evento abre o modal; salvar relê e fecha', async () => {
    const api = seededCalendarApi({}, { createEvent: createOk() })
    render(<CalendarScreen api={api} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Novo evento' }))
    const modal = screen.getByRole('dialog', { name: 'Novo evento' })
    await userEvent.click(within(modal).getByRole('button', { name: 'Lembrete' }))
    await userEvent.type(within(modal).getByLabelText('Título'), 'Malas')
    await userEvent.click(within(modal).getByRole('button', { name: 'Salvar evento' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.loadContext).toHaveBeenCalledTimes(2)
  })

  it('tocar num evento abre o Editar evento', async () => {
    render(<CalendarScreen api={seededCalendarApi()} />)
    const [pill] = await screen.findAllByRole('button', { name: /Jantar 20h/ })
    await userEvent.click(pill)
    expect(screen.getByRole('dialog', { name: 'Editar evento' })).toBeInTheDocument()
    expect(screen.getByLabelText('Título')).toHaveValue('Jantar 20h')
  })
})
