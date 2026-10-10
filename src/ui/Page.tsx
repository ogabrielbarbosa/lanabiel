// O esqueleto de toda tela (ADR 0026): a área que rola e o cabeçalho.
//
// O cabeçalho é texto e botão — não depende do banco, então aparece desde o
// primeiro quadro, com a tela ainda lendo, e nada pula quando a leitura chega.
// Sem linha acima do título: o que vem dos dados mora no corpo.

import type { ReactNode } from 'react'
import './ui.css'

export interface PageAreaProps {
  /** A classe da tela, para o que é só dela (`ls-area`, `tr-area`…). */
  className?: string
  children: ReactNode
}

/** A coluna que rola à esquerda do painel, com o respiro e o ritmo da página. */
export function PageArea({ className, children }: PageAreaProps) {
  return <div className={className ? `page-area ${className}` : 'page-area'}>{children}</div>
}

export interface PageHeaderProps {
  title: ReactNode
  /** Junto do título, na mesma linha (as setas do Calendário). */
  titleAside?: ReactNode
  /** À direita: busca, botões, alternâncias. */
  actions?: ReactNode
}

export function PageHeader({ title, titleAside, actions }: PageHeaderProps) {
  const h1 = <h1 className="page-title">{title}</h1>
  return (
    <header className="page-header">
      <div className="page-heading">
        {titleAside ? (
          <div className="page-title-row">
            {h1}
            {titleAside}
          </div>
        ) : (
          h1
        )}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

/** A linha de filtros e alternâncias logo abaixo do cabeçalho. */
export function PageToolbar({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={className ? `page-toolbar ${className}` : 'page-toolbar'}>{children}</div>
}
