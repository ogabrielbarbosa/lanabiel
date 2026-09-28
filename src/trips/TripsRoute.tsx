// A rota das Viagens (`/viagens` e `/viagens/<id>`, ADR 0020): lê tudo
// (`useTripsData`), publica o `TripsContext` e escolhe a tela.
//
// Spec: .agent/Tasks/fase-6-viagens.md — R1, R27, seção 7 (A9, A17)
//
// Enquanto não há `ok`: esqueleto ou _"Não deu para carregar as viagens."_
// com _Tentar de novo_ — nunca a Grade vazia (A17). Em `/viagens` o painel da
// direita já fica no lugar (vazio ou com esqueleto), como na Home. Um id que não é viagem do
// casal (apagada pela outra pessoa, de outro casal, inventado) é um ESTADO da
// tela, não um redirecionamento (ADR 0020): _"Essa viagem não está aqui."_.

import { useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, RotateCw } from 'lucide-react'
import { PanelSkeleton } from '../app/PanelSkeleton'
import { navigate } from '../app/router'
import type { TripsApi } from './api'
import { TripsContext, useTrips, useTripsData } from './context'
import { TripDetail } from './detail/TripDetail'
import { TripModal } from './TripModal'
import { TripsScreen } from './TripsScreen'
import './trips.css'

export type TripsView = { name: 'trips' } | { name: 'trip'; id: string }

export interface TripsRouteProps {
  /** O que as Viagens pedem ao mundo. Injetado: o teste dirige sem rede. */
  api: TripsApi
  view: TripsView
}

export function TripsRoute({ api, view }: TripsRouteProps) {
  const load = useTripsData(api)

  if (load.status === 'loading') {
    const skeleton = (
      <>
        <span className="visually-hidden">Carregando as viagens…</span>
        <div className="trips-skeleton" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} />
          ))}
        </div>
      </>
    )
    return (
      <div className="trips-route" aria-busy="true">
        {view.name === 'trips' ? <WithPanel busy>{skeleton}</WithPanel> : skeleton}
      </div>
    )
  }

  if (load.status === 'error') {
    const state = (
      <div className="trips-route-state lg" role="alert">
        <p>Não deu para carregar as viagens.</p>
        <p className="visually-hidden">{load.cause}</p>
        <button type="button" className="trips-route-btn lg" onClick={load.retry}>
          <RotateCw size={16} aria-hidden="true" />
          Tentar de novo
        </button>
      </div>
    )
    return <div className="trips-route">{view.name === 'trips' ? <WithPanel>{state}</WithPanel> : state}</div>
  }

  if (load.value === null) {
    const state = (
      <div className="trips-route-state lg" role="status">
        <p>
          {load.problem === 'alone'
            ? 'As viagens aparecem quando as duas pessoas estiverem no espaço. Em Configurações, na aba Casal, você convida a outra pessoa ou cria o perfil dela para já ir preenchendo.'
            : 'Este espaço mudou. Recarregue a página.'}
        </p>
      </div>
    )
    return <div className="trips-route">{view.name === 'trips' ? <WithPanel>{state}</WithPanel> : state}</div>
  }

  const value = load.value
  const missing = view.name === 'trip' && value.tripById(view.id) === undefined

  return (
    <TripsContext.Provider value={value}>
      <div className="trips-route">
        {value.stale && (
          <p className="trips-notice lg" role="status">
            Não deu pra atualizar. Você está vendo a última versão carregada.
          </p>
        )}
        {view.name === 'trips' ? (
          <TripsScreen />
        ) : missing ? (
          <NotHere />
        ) : (
          <EditableDetail id={view.id} />
        )}
      </div>
    </TripsContext.Provider>
  )
}

/**
 * A Grade antes do `ok` (ou sem ele): o estado na área — sem o título, que
 * só vem com a leitura (A17) — e o painel
 * _Pelo mundo, juntos_ já no lugar e do mesmo tamanho, para a área não se
 * mexer quando os dados chegam. O Detalhe não tem painel e não passa aqui.
 */
function WithPanel({ busy = false, children }: { busy?: boolean; children: ReactNode }) {
  return (
    <div className="tr-screen">
      <div className="tr-area">{children}</div>
      <aside className="tr-panel lg" aria-label="Pelo mundo, juntos" aria-busy={busy || undefined}>
        <div className="tr-panel-scroll">
          <PanelSkeleton busy={busy} cards={[248, 188, 168, 148]} />
        </div>
      </aside>
    </div>
  )
}

/** O Detalhe com o lápis do herói ligado ao _Editar viagem_ (R26). */
function EditableDetail({ id }: { id: string }) {
  const { tripById } = useTrips()
  const [editing, setEditing] = useState(false)
  const trip = tripById(id)
  return (
    <>
      <TripDetail id={id} onEditTrip={() => setEditing(true)} />
      {editing && trip && <TripModal mode="edit" trip={trip} onClose={() => setEditing(false)} />}
    </>
  )
}

function NotHere() {
  return (
    <div className="trips-route-state lg" role="status">
      <p>Essa viagem não está aqui.</p>
      <a
        href="/viagens"
        className="trips-route-btn lg"
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
          event.preventDefault()
          navigate('/viagens')
        }}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Voltar para Nossas viagens
      </a>
    </div>
  )
}
