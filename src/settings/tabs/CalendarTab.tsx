// Calendário (o1JAVm). Tudo aqui é preferência do CASAL, lida pela Fase 5.
//
// As cores são por slot (`color_together_home_1` = juntos na casa de quem é
// slot 1), não por cidade: trocar a casa não troca a cor. "Sem registro" é o
// `unknown` do ADR 0002 — não se pinta, então não tem seletor.

import { useState } from 'react'
import { CalendarDays, CalendarRange, Heart, Pencil } from 'lucide-react'
import { BAND_COLORS } from '../../domain/settings'
import type { BandColor } from '../../domain/settings'
import type { CoupleSettings } from '../../data/settings'
import { Card, FieldError, Segmented, Swatches, Toggle } from '../parts'
import type { TabContext } from '../context'
import { saveCoupleSetting } from './saveSetting'

type ColorKey = 'colorTogetherHome1' | 'colorTogetherHome2' | 'colorTogetherAway' | 'colorApart'

export function CalendarTab(ctx: TabContext) {
  const { data, writes } = ctx
  const cs = data.coupleSettings
  const [editing, setEditing] = useState<ColorKey | null>(null)
  const bySlot = (slot: 1 | 2) => data.couple.members.find((m) => m.slot === slot)

  const bands: { key: ColorKey; title: string; hint: string }[] = [
    {
      key: 'colorTogetherHome1',
      title: `Juntos em ${bySlot(1)?.homeCity.name ?? 'casa'}`,
      hint: `Os dois em ${bySlot(1)?.homeCity.name ?? 'na casa de um'}`,
    },
    {
      key: 'colorTogetherHome2',
      title: `Juntos em ${bySlot(2)?.homeCity.name ?? 'casa'}`,
      hint: bySlot(2) ? `Os dois em ${bySlot(2)!.homeCity.name}` : 'Na casa de quem entrar no espaço',
    },
    { key: 'colorTogetherAway', title: 'Viajando juntos', hint: 'Juntos, fora das duas cidades' },
    { key: 'colorApart', title: 'Separados', hint: 'Cada um na sua cidade' },
  ]

  return (
    <div className="st-stack">
      <Card className="st-toggles">
        <div className="st-row">
          <div className="st-row-text">
            <span className="st-row-label">Visão padrão</span>
            <span className="st-row-hint">O que abre primeiro no Calendário</span>
            <FieldError message={writes.error('calendarDefaultView')} />
          </div>
          <Segmented<CoupleSettings['calendarDefaultView']>
            label="Visão padrão"
            value={cs.calendarDefaultView}
            pending={writes.pending('calendarDefaultView')}
            onChange={(v) => void saveCoupleSetting(ctx, 'calendarDefaultView', v)}
            options={[
              { value: 'month', label: 'Mês', icon: CalendarDays },
              { value: 'year', label: 'Ano', icon: CalendarRange },
            ]}
          />
        </div>
        <div className="st-row">
          <div className="st-row-text">
            <span className="st-row-label">Primeiro dia da semana</span>
            <span className="st-row-hint">Coluna mais à esquerda do mês</span>
            <FieldError message={writes.error('weekStartsOn')} />
          </div>
          <Segmented<CoupleSettings['weekStartsOn']>
            label="Primeiro dia da semana"
            value={cs.weekStartsOn}
            pending={writes.pending('weekStartsOn')}
            onChange={(v) => void saveCoupleSetting(ctx, 'weekStartsOn', v)}
            options={[
              { value: 'sun', label: 'Dom' },
              { value: 'mon', label: 'Seg' },
            ]}
          />
        </div>
        <Toggle
          label="Mostrar dias dos meses vizinhos"
          hint="Esmaecidos, antes do dia 1 e depois do último dia"
          checked={cs.showAdjacentDays}
          pending={writes.pending('showAdjacentDays')}
          error={writes.error('showAdjacentDays')}
          onChange={(v) => void saveCoupleSetting(ctx, 'showAdjacentDays', v)}
        />
        <Toggle
          icon={Heart}
          label="Mostrar ♥ e 💋 nos dias"
          hint="Os marcadores que vocês deixam em cada dia"
          checked={cs.showDayMarkers}
          pending={writes.pending('showDayMarkers')}
          error={writes.error('showDayMarkers')}
          onChange={(v) => void saveCoupleSetting(ctx, 'showDayMarkers', v)}
        />
      </Card>

      <div className="st-subhead">
        <h3>Cores das faixas</h3>
        <p className="st-hint">Toque numa cor para trocar</p>
      </div>
      <Card className="st-list">
        <ul>
          {bands.map(({ key, title, hint }) => (
            <li key={key} className="st-band">
              <span className="st-band-swatch" style={{ background: cs[key] }} aria-hidden="true" />
              <div className="st-row-text">
                <span className="st-row-label">{title}</span>
                <span className="st-row-hint">{hint}</span>
                <FieldError message={writes.error(key)} />
              </div>
              <span className="st-hint st-band-hex">{cs[key]}</span>
              <button
                type="button"
                className="st-icon-btn"
                aria-label={`Trocar a cor de ${title}`}
                aria-expanded={editing === key}
                onClick={() => setEditing(editing === key ? null : key)}
              >
                <Pencil size={14} />
              </button>
              {editing === key && (
                <div className="st-band-picker">
                  <Swatches
                    label={`Cor de ${title}`}
                    colors={BAND_COLORS}
                    value={cs[key]}
                    pending={writes.pending(key)}
                    onChange={(c) => {
                      setEditing(null)
                      void saveCoupleSetting(ctx, key, c as BandColor)
                    }}
                  />
                </div>
              )}
            </li>
          ))}
          <li className="st-band st-band--none">
            <span className="st-band-swatch st-band-swatch--none" aria-hidden="true" />
            <div className="st-row-text">
              <span className="st-row-label">Sem registro</span>
              <span className="st-row-hint">dias em que não sabemos onde vocês estavam</span>
            </div>
            <span className="st-hint st-band-hex">sem cor</span>
          </li>
        </ul>
      </Card>
    </div>
  )
}
