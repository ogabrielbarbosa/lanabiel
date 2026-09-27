// Lista (MrIGB). Preferências do CASAL, lidas pela Fase 4. As chaves de
// categoria são as de `list_items.category` (ADR 0003, I6). Cada chip mostra
// quantos itens há na categoria (Fase 4, R26) num selo à parte, como no frame
// ("Países" + "7"); sem a contagem (lendo ou falhou), só o nome: o chip
// continua sendo o controle.

import { ArrowDownAZ, Clock, Shapes, Sparkles } from 'lucide-react'
import { LIST_CATEGORIES, LIST_CATEGORY_LABEL, formatThousands } from '../../domain/settings'
import type { ListCategory } from '../../domain/settings'
import type { CoupleSettings } from '../../data/settings'
import { Card, FieldError, Segmented, Toggle } from '../parts'
import type { TabContext } from '../context'
import { saveCoupleSetting } from './saveSetting'

export function ListTab(ctx: TabContext) {
  const { data, writes } = ctx
  const cs = data.coupleSettings
  const hidden = new Set(cs.hiddenCategories)
  const visible = LIST_CATEGORIES.length - hidden.size
  const counts = ctx.listCounts?.status === 'ok' ? ctx.listCounts.rows.byCategory : null

  function toggleCategory(category: ListCategory) {
    const next = hidden.has(category)
      ? cs.hiddenCategories.filter((c) => c !== category)
      : [...cs.hiddenCategories, category]
    // Ordem estável: a do vocabulário, não a do clique.
    const ordered = LIST_CATEGORIES.filter((c) => next.includes(c))
    void saveCoupleSetting(ctx, 'hiddenCategories', ordered)
  }

  return (
    <div className="st-stack">
      <Card className="st-toggles">
        <div className="st-row">
          <div className="st-row-text">
            <span className="st-row-label">Ordenação padrão</span>
            <span className="st-row-hint">Como a lista abre</span>
            <FieldError message={writes.error('listDefaultSort')} />
          </div>
          <Segmented<CoupleSettings['listDefaultSort']>
            label="Ordenação padrão"
            value={cs.listDefaultSort}
            pending={writes.pending('listDefaultSort')}
            onChange={(v) => void saveCoupleSetting(ctx, 'listDefaultSort', v)}
            options={[
              { value: 'recent', label: 'Recentes', icon: Clock },
              { value: 'az', label: 'A–Z', icon: ArrowDownAZ },
              { value: 'category', label: 'Categoria', icon: Shapes },
            ]}
          />
        </div>
        <Toggle
          label="Mostrar progresso por categoria"
          hint="Quantos já foram feitos em cada uma, no topo da lista"
          checked={cs.showCategoryProgress}
          pending={writes.pending('showCategoryProgress')}
          error={writes.error('showCategoryProgress')}
          onChange={(v) => void saveCoupleSetting(ctx, 'showCategoryProgress', v)}
        />
      </Card>

      <div className="st-subhead">
        <h3>Categorias visíveis</h3>
        <p className="st-hint">
          {visible} de {LIST_CATEGORIES.length} ligadas · as desligadas somem da lista e dos filtros
        </p>
      </div>
      <Card>
        <div className="st-chips" role="group" aria-label="Categorias visíveis">
          {LIST_CATEGORIES.map((category) => {
            const on = !hidden.has(category)
            // A última ligada não desliga: a lista não pode sumir inteira (o
            // CHECK recusaria, e a tela não oferece o que o banco recusa).
            const locked = on && visible === 1
            return (
              <button
                key={category}
                type="button"
                className={`st-chip st-chip--${category}`}
                aria-pressed={on}
                disabled={writes.pending('hiddenCategories') || locked}
                title={locked ? 'Pelo menos uma categoria fica ligada' : undefined}
                onClick={() => toggleCategory(category)}
              >
                <span className="st-chip-dot" aria-hidden="true" />
                {LIST_CATEGORY_LABEL[category]}
                {counts && (
                  <>
                    {' '}
                    <span className="st-chip-count">{formatThousands(counts[category])}</span>
                  </>
                )}
              </button>
            )
          })}
        </div>
        <FieldError message={writes.error('hiddenCategories')} />
      </Card>

      <div className="st-subhead">
        <h3>Sugestão do momento</h3>
      </div>
      <Card className="st-toggles">
        <Toggle
          icon={Sparkles}
          label="Mostrar sugestão do momento"
          hint="Um card por dia na Home, conforme vocês estão agora"
          checked={cs.showDailySuggestion}
          pending={writes.pending('showDailySuggestion')}
          error={writes.error('showDailySuggestion')}
          onChange={(v) => void saveCoupleSetting(ctx, 'showDailySuggestion', v)}
        />
        <div className="st-row st-row--note">
          <div className="st-row-text">
            <span className="st-row-label">Quando estão juntos</span>
            <span className="st-row-hint">lugares perto de vocês, da lista “Quero ir”</span>
          </div>
        </div>
        <div className="st-row st-row--note">
          <div className="st-row-text">
            <span className="st-row-label">Quando estão separados</span>
            <span className="st-row-hint">filme ou série pra ver por chamada</span>
          </div>
        </div>
      </Card>
    </div>
  )
}
