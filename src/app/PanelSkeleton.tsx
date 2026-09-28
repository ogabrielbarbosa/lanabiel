// O miolo do painel da direita enquanto a tela lê (ou quando a leitura
// falhou): o painel em si é SEMPRE montado por cada tela, com a sua classe
// (`cal-panel`, `ls-panel`, `tr-panel`, `st-panel`) — a mesma largura, altura e
// regra de esconder no estreito —, como a Home já fazia. Assim o painel não
// entra depois da área, empurrando-a, quando os dados chegam.
//
// Aqui só o esqueleto: a linha da data, o título e os cartões na altura
// aproximada dos reais de cada tela (`cards`). Sem `busy` (erro, espaço de uma
// pessoa só), o painel fica vazio — nada está carregando, e um esqueleto
// pulsando para sempre diria o contrário.

export interface PanelSkeletonProps {
  /** A altura (px) de cada cartão, na ordem do painel real. */
  cards: readonly number[]
  /** Carregando: mostra o esqueleto. Falso: o painel vazio. */
  busy?: boolean
}

export function PanelSkeleton({ cards, busy = true }: PanelSkeletonProps) {
  if (!busy) return null
  return (
    <div className="panel-skeleton" aria-hidden="true">
      <div className="panel-skeleton-head">
        <span />
        <span />
      </div>
      {cards.map((height, i) => (
        <span key={i} className="panel-skeleton-card" style={{ height }} />
      ))}
    </div>
  )
}
