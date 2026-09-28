// R17 — o seletor de cidade (parte de A18). Renderizado com a busca falsa:
// cada resposta do IBGE e do Photon é dirigida pelo teste, e o relógio é falso
// para o debounce de 350 ms.

import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarApi, WorldSearchResult } from './api'
import { CityPicker } from './CityPicker'
import type { CityChoice } from './cityChoice'
import {
  CITY_MARAU,
  CITY_SJC,
  LISBOA_CANDIDATE,
  PELOTAS_IBGE,
  PELOTAS_PHOTON,
  deferred,
  fakeCalendarApi,
} from './test/fixtures'

const HOMES = [
  { city: CITY_SJC, owner: 'Gabriel' },
  { city: CITY_MARAU, owner: 'Lana' },
]

function Harness({ api, onPick }: { api: CalendarApi; onPick: (c: CityChoice | null) => void }) {
  const [value, setValue] = useState<CityChoice | null>(null)
  return (
    <CityPicker
      api={api}
      homes={HOMES}
      value={value}
      label="Destino"
      onChange={(next) => {
        setValue(next)
        onPick(next)
      }}
    />
  )
}

function setup(overrides: Partial<CalendarApi> = {}) {
  const api = fakeCalendarApi(overrides)
  const onPick = vi.fn()
  render(<Harness api={api} onPick={onPick} />)
  const input = screen.getByRole('combobox', { name: 'Destino' })
  return { api, onPick, input }
}

async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const type = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } })
const optionTexts = () => screen.queryAllByRole('option').map((o) => o.textContent)

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('R17 — seletor de cidade', () => {
  it('ao focar, as duas casas vêm primeiro, com "casa de {nome}"', () => {
    const { input } = setup()
    fireEvent.focus(input)
    expect(optionTexts()).toEqual(['São José dos Campos, SP · casa de Gabriel', 'Marau, RS · casa de Lana'])
  })

  it('IBGE a partir de 2 caracteres, Photon a partir de 3, depois de 350 ms', async () => {
    const { api, input } = setup()
    type(input, 'Pe')
    await wait(349)
    expect(api.searchCities).not.toHaveBeenCalled()
    await wait(1)
    expect(api.searchCities).toHaveBeenCalledWith('Pe')
    expect(api.searchWorldCities).not.toHaveBeenCalled()

    type(input, 'Pel')
    await wait(350)
    expect(api.searchCities).toHaveBeenLastCalledWith('Pel')
    expect(api.searchWorldCities).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api.searchWorldCities).mock.calls[0][0]).toBe('Pel')
  })

  it('ordem: casas, IBGE, mundo e o crédito; Photon BR é descartado', async () => {
    const { input } = setup({
      searchCities: vi.fn<CalendarApi['searchCities']>(async () => ({ status: 'ok', rows: [PELOTAS_IBGE, { ...CITY_MARAU }] })),
      searchWorldCities: vi.fn<CalendarApi['searchWorldCities']>(async () => ({
        status: 'ok',
        rows: [PELOTAS_PHOTON, LISBOA_CANDIDATE],
      })),
    })
    type(input, 'a')
    type(input, 'mar')
    await wait(350)
    // Marau casa com "mar"; Marau do IBGE não se repete; Pelotas do Photon (BR) sai.
    expect(optionTexts()).toEqual(['Marau, RS · casa de Lana', 'Pelotas, RS', 'Lisboa · Portugal'])
    expect(screen.getByText('© OpenStreetMap')).toBeInTheDocument()
  })

  it('escolher cidade do Brasil devolve a cidade; do mundo, um candidato ainda não gravado', async () => {
    const { api, input, onPick } = setup({
      searchCities: vi.fn<CalendarApi['searchCities']>(async () => ({ status: 'ok', rows: [PELOTAS_IBGE] })),
      searchWorldCities: vi.fn<CalendarApi['searchWorldCities']>(async () => ({ status: 'ok', rows: [LISBOA_CANDIDATE] })),
    })
    type(input, 'lis')
    await wait(350)
    fireEvent.click(screen.getByRole('option', { name: 'Lisboa · Portugal' }))
    expect(onPick).toHaveBeenLastCalledWith({ kind: 'world', candidate: LISBOA_CANDIDATE })
    expect(api.ensureWorldCity).not.toHaveBeenCalled()
    expect(input).toHaveValue('Lisboa · Portugal')

    type(input, 'pel')
    expect(onPick).toHaveBeenLastCalledWith(null)
    await wait(350)
    fireEvent.click(screen.getByRole('option', { name: 'Pelotas, RS' }))
    expect(onPick).toHaveBeenLastCalledWith({ ...PELOTAS_IBGE, countryCode: 'BR', region: null })
  })

  it('Photon fora → só o Brasil, com o aviso', async () => {
    const { input } = setup({
      searchCities: vi.fn<CalendarApi['searchCities']>(async () => ({ status: 'ok', rows: [PELOTAS_IBGE] })),
      searchWorldCities: vi.fn<CalendarApi['searchWorldCities']>(async () => ({ status: 'error', cause: 'rede' })),
    })
    type(input, 'pel')
    await wait(350)
    expect(optionTexts()).toEqual(['Pelotas, RS'])
    expect(screen.getByRole('status')).toHaveTextContent('A busca fora do Brasil não respondeu. Por enquanto, só cidades brasileiras.')
    expect(screen.queryByText('© OpenStreetMap')).not.toBeInTheDocument()
  })

  it('IBGE e Photon fora → "fora do ar"', async () => {
    const { input } = setup({
      searchCities: vi.fn<CalendarApi['searchCities']>(async () => ({ status: 'error', cause: 'pausado' })),
      searchWorldCities: vi.fn<CalendarApi['searchWorldCities']>(async () => ({ status: 'error', cause: 'rede' })),
    })
    type(input, 'pel')
    await wait(350)
    expect(screen.getByRole('alert')).toHaveTextContent('A busca de cidades está fora do ar. Tente de novo daqui a pouco.')
  })

  it('a busca anterior é abortada e a resposta velha, descartada', async () => {
    const slow = deferred<WorldSearchResult>()
    const signals: AbortSignal[] = []
    const searchWorldCities = vi.fn<CalendarApi['searchWorldCities']>(async (query, { signal }) => {
      if (signal) signals.push(signal)
      if (query === 'lis') return slow.promise
      return { status: 'ok', rows: [{ ...LISBOA_CANDIDATE, osmRef: 'R1', name: 'Lisburn', country: 'Reino Unido' }] }
    })
    const { input } = setup({ searchWorldCities })
    type(input, 'lis')
    await wait(350)
    type(input, 'lisb')
    expect(signals[0].aborted).toBe(true)
    await wait(350)
    // A resposta de "lis" chega depois da de "lisb": ignorada.
    await act(async () => slow.resolve({ status: 'ok', rows: [LISBOA_CANDIDATE] }))
    const list = screen.getByRole('listbox', { name: 'Destino: resultados' })
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual(['Lisburn · Reino Unido'])
  })
})
