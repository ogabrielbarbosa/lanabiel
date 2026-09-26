// Aparência (CZ3oK). Preferência do APARELHO: localStorage, nunca o banco
// (ADR 0011). Aplicada na hora, no <html>.

import { Monitor, Moon, Rows2, Rows3, Sun, Wind } from 'lucide-react'
import type { Density, ThemeChoice } from '../../app/appearance'
import { Card, Segmented, Toggle } from '../parts'
import type { TabContext } from '../context'

const THEMES: { value: ThemeChoice; label: string; icon: typeof Moon }[] = [
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'system', label: 'Do sistema', icon: Monitor },
]

export function AppearanceTab({ appearance }: TabContext) {
  const { appearance: a, storable, update } = appearance
  return (
    <div className="st-stack">
      {!storable && (
        <p className="st-warning" role="status">
          Não dá pra guardar neste navegador — a aparência vale só até fechar a aba.
        </p>
      )}
      <Card className="st-theme">
        <div className="st-row">
          <div className="st-row-text">
            <span className="st-row-label">Tema</span>
            <span className="st-row-hint">Vale só pra este aparelho</span>
          </div>
          <Segmented label="Tema" value={a.theme} options={THEMES} onChange={(theme) => update({ theme })} />
        </div>
        <div className="st-theme-previews" role="radiogroup" aria-label="Tema — miniaturas">
          {THEMES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={a.theme === value}
              className={`st-theme-preview st-theme-preview--${value}`}
              onClick={() => update({ theme: value })}
            >
              <span className="st-theme-mini" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="st-toggles">
        <div className="st-row">
          <div className="st-row-text">
            <span className="st-row-label">Densidade</span>
            <span className="st-row-hint">Espaço entre linhas e cartões</span>
          </div>
          <Segmented<Density>
            label="Densidade"
            value={a.density}
            onChange={(density) => update({ density })}
            options={[
              { value: 'comfortable', label: 'Confortável', icon: Rows3 },
              { value: 'compact', label: 'Compacta', icon: Rows2 },
            ]}
          />
        </div>
        <Toggle
          icon={Wind}
          label="Reduzir animações"
          hint="As transições viram cortes simples"
          checked={a.reduceMotion}
          onChange={(reduceMotion) => update({ reduceMotion })}
        />
      </Card>
    </div>
  )
}
