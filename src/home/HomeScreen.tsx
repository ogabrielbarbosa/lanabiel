// A Home (Fase 7, `/`): lê tudo (`useHomeData`), publica o `HomeContext` e
// desenha o esqueleto do frame — a área do mapa à esquerda e o painel de 424
// à direita (`Home — Escuro` eocRt).
//
// Spec: .agent/Tasks/fase-7-mapa.md — seção 2, R1, R24, I1, seção 7 (A16, A17)
//
// Enquanto não há `ok`: a área do mapa é só o fundo escuro, e o painel mostra
// o esqueleto ou _"Não deu para carregar a Home."_ com _Tentar de novo_. Com a
// leitura falha o mapa NÃO é montado — sem instância não há pin, e um globo
// vazio diria "vocês não salvaram nada" (seção 7, A16).
//
// Depois do primeiro `ok`, a `MapArea` fica montada: a releitura (voltar à
// aba, R24) troca o valor do contexto, nunca a árvore, e a instância do mapa
// não é recriada (I12, A17). Uma releitura falha liga `stale` e a tela segue.

import { useState } from 'react'
import { RotateCw } from 'lucide-react'
import type { HomeApi } from './api'
import { HomeContext, useHomeData } from './context'
import { HomePanel } from './HomePanel'
import { MapArea } from './MapArea'
import type { FocusRequest } from './MapArea'
import './home.css'

export interface HomeScreenProps {
  /** O que a Home pede ao mundo. Injetado: o teste dirige sem rede (e com a engine falsa). */
  api: HomeApi
}

export function HomeScreen({ api }: HomeScreenProps) {
  // O foco que o painel pede com a Home aberta (R18) — a área do mapa aplica.
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null)
  const load = useHomeData(api)

  if (load.status === 'loading') {
    return (
      <div className="home-screen" aria-busy="true">
        <div className="home-map-blank" aria-hidden="true" />
        <aside className="home-panel-state">
          <span className="visually-hidden">Carregando a Home…</span>
          <div className="home-skeleton" aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} />
            ))}
          </div>
        </aside>
      </div>
    )
  }

  if (load.status === 'error') {
    return (
      <div className="home-screen">
        <div className="home-map-blank" aria-hidden="true" />
        <aside className="home-panel-state">
          <div className="home-state" role="alert">
            <p>Não deu para carregar a Home.</p>
            <p className="visually-hidden">{load.cause}</p>
            <button type="button" className="home-state-btn" onClick={load.retry}>
              <RotateCw size={16} aria-hidden="true" />
              Tentar de novo
            </button>
          </div>
        </aside>
      </div>
    )
  }

  if (load.value === null) {
    return (
      <div className="home-screen">
        <div className="home-map-blank" aria-hidden="true" />
        <aside className="home-panel-state">
          <div className="home-state" role="status">
            <p>
              {load.problem === 'alone'
                ? 'A Home é de vocês dois — convide de novo em Configurações.'
                : 'Este espaço mudou — recarregue.'}
            </p>
          </div>
        </aside>
      </div>
    )
  }

  return (
    <HomeContext.Provider value={load.value}>
      <div className="home-screen">
        <div className="home-map-slot">
          <MapArea request={focusRequest} />
          {load.value.stale && (
            <p className="home-notice" role="status">
              Não deu pra atualizar — mostrando o que já estava aqui
            </p>
          )}
        </div>
        <HomePanel onShowOnMap={(focus) => setFocusRequest((r) => ({ focus, nonce: (r?.nonce ?? 0) + 1 }))} />
      </div>
    </HomeContext.Provider>
  )
}
