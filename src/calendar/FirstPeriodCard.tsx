// "Onde vocês estão hoje?" (`W9BK5`, R9): o estado vazio do Calendário, no
// painel "Onde a gente está" no lugar do _Agora_. Só
// aparece com leitura `ok`, zero estadias e os dois integrantes — nunca com
// erro de leitura (seção 7), senão o casal regravaria a história por cima.
//
// _Juntos em outra cidade_ usa o seletor de cidade (R17), que entra por
// `renderCityPicker` (a `CalendarScreen` passa o `CityPicker` real): sem a
// prop, a opção fica desabilitada ("Em breve"). Cidade do mundo escolhida só
// vira linha em `cities` ao criar, logo antes da pintura (seção 7, cascata).

import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Calendar, CalendarPlus } from 'lucide-react'
import { CALENDAR_LIMITS, entriesForPeriod, shortCityName } from '../domain/calendar'
import type { PeriodChoice } from '../domain/calendar'
import { addDays, diffDays, shortDayMonth } from '../lib/date'
import { resolveCity } from './cityChoice'
import type { CityChoice, CityPickerProps } from './cityChoice'
import { useCalendar, writeFailureMessage } from './context'
import { CouplePair, DateField } from './parts'
import { bandColor } from './view'

export type { CityPickerProps }

export interface FirstPeriodCardProps {
  /** O seletor de cidade (R17). Ausente = _Juntos em outra cidade_ desabilitada. */
  renderCityPicker?: (props: CityPickerProps) => ReactNode
}

const PREVIEW_DAYS = 10

export function FirstPeriodCard({ renderCityPicker }: FirstPeriodCardProps) {
  const c = useCalendar()
  const { people, members, settings, today } = c
  const sameHome = people[1].homeCity.id === people[2].homeCity.id

  const [choice, setChoice] = useState<PeriodChoice | null>(null)
  const [city, setCity] = useState<CityChoice | null>(null)
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const options: { choice: PeriodChoice; label: string; disabled?: boolean }[] = [
    { choice: 'home1', label: `Juntos em ${shortCityName(people[1].homeCity.name)}` },
    ...(sameHome ? [] : [{ choice: 'home2' as const, label: `Juntos em ${shortCityName(people[2].homeCity.name)}` }]),
    { choice: 'away', label: 'Juntos em outra cidade', disabled: !renderCityPicker },
    ...(sameHome ? [] : [{ choice: 'apart' as const, label: 'Separados' }]),
  ]

  const end = to === '' ? null : to
  let invalid: string | null = null
  if (choice === null) invalid = 'Escolha onde vocês estão.'
  else if (from === '') invalid = 'Escolha desde quando.'
  else if (end !== null && end < from) invalid = 'O fim precisa ser no dia do começo ou depois.'
  else if (end !== null && diffDays(from, end) >= CALENDAR_LIMITS.spanDays) invalid = `No máximo ${CALENDAR_LIMITS.spanDays} dias.`
  else if (choice === 'away' && city === null) invalid = 'Escolha a cidade.'

  async function submit() {
    if (invalid !== null || choice === null) return
    setPending(true)
    setError(null)
    let cityId: string | null = null
    if (choice === 'away' && city !== null) {
      const resolved = await resolveCity(c.api, c.coupleId, city)
      if (!resolved.ok) {
        setError(`Não deu pra criar: ${resolved.message}`)
        setPending(false)
        return
      }
      setCity(resolved.city)
      cityId = resolved.city.id
    }
    const result = await c.api.paint(entriesForPeriod({ choice, cityId, from, to: end }, members))
    if (result.status !== 'ok') {
      setError(`Não deu pra criar: ${writeFailureMessage(result)}`)
      setPending(false)
      return
    }
    // A leitura nova traz a estadia, e o cartão some sozinho (R9).
    await c.reload()
    setPending(false)
  }

  const swatchBand = choice === 'home2' ? 'home2' : choice === 'away' ? 'away' : choice === 'apart' ? 'apart' : 'home1'
  const previewDays = Array.from({ length: PREVIEW_DAYS }, (_, i) => addDays(from || today, i)).filter(
    (d) => end === null || d <= end,
  )

  return (
    <section className="cal-first lg" aria-labelledby="cal-first-title">
      <header className="cal-first-head">
        <CouplePair people={[people[1], people[2]]} together />
        <div>
          <h2 id="cal-first-title">Onde vocês estão hoje?</h2>
          <p>Cria o primeiro período no calendário</p>
        </div>
      </header>

      <div className="cal-first-options" role="radiogroup" aria-label="Onde vocês estão">
        {options.map((o) => (
          <button
            key={o.choice}
            type="button"
            role="radio"
            aria-checked={choice === o.choice}
            className="cal-first-option lg"
            style={{ '--band': bandColor(settings, o.choice) } as CSSProperties}
            disabled={o.disabled || pending}
            title={o.disabled ? 'Em breve' : undefined}
            onClick={() => setChoice(o.choice)}
          >
            <span className="cal-first-swatch" />
            {o.label}
          </button>
        ))}
      </div>

      {choice === 'away' && renderCityPicker?.({ value: city, onChange: setCity, label: 'Cidade' })}

      <div className="cal-first-dates">
        <label className="cal-field">
          <DateField
            value={from}
            onChange={setFrom}
            format={shortDayMonth}
            icon={<FieldLead label="Desde" />}
            inputProps={{ 'aria-label': 'Desde', disabled: pending, required: true }}
          />
        </label>
        <label className="cal-field">
          <DateField
            value={to}
            onChange={setTo}
            format={shortDayMonth}
            placeholder="em aberto"
            icon={<FieldLead label="Até" />}
            inputProps={{ 'aria-label': 'Até', min: from, disabled: pending }}
          />
        </label>
      </div>

      {choice !== null && (
        <div className="cal-first-preview" aria-hidden="true">
          {previewDays.map((d) => (
            <span
              key={d}
              className={d > today ? 'cal-band-planned' : ''}
              style={{ '--band': bandColor(settings, swatchBand) } as CSSProperties}
            />
          ))}
        </div>
      )}

      {error && (
        <p className="cal-first-error" role="alert">
          {error}
        </p>
      )}
      {choice !== null && invalid !== null && <p className="cal-first-hint">{invalid}</p>}

      <button
        type="button"
        className="cal-btn cal-btn--primary cal-btn--wide"
        disabled={invalid !== null || pending}
        onClick={() => void submit()}
      >
        <CalendarPlus size={17} aria-hidden="true" />
        {pending ? 'Criando…' : 'Criar no calendário'}
      </button>
    </section>
  )
}

/** O ícone e a palavra antes do valor ("📅 Desde 21 set"), como no `W9BK5`. */
function FieldLead({ label }: { label: string }) {
  return (
    <>
      <Calendar size={14} aria-hidden="true" />
      <span className="cal-field-label" aria-hidden="true">
        {label}
      </span>
    </>
  )
}
