// A rota das Viagens (`/viagens` e `/viagens/<id>`, ADR 0020): lê tudo
// (`useTripsData`), publica o `TripsContext` e escolhe a tela.
//
// Spec: .agent/Tasks/fase-6-viagens.md — R1, R27, seção 7 (A9, A17)
//
// Enquanto não há `ok`: esqueleto ou _"Não deu para carregar as viagens."_
// com _Tentar de novo_ — nunca a Grade vazia (A17). Um id que não é viagem do
// casal (apagada pela outra pessoa, de outro casal, inventado) é um ESTADO da
// tela, não um redirecionamento (ADR 0020): _"Essa viagem não está aqui."_.

import { useState } from 'react'
import { ArrowLeft, RotateCw } from 'lucide-react'
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
    return (
      <div className="trips-route" aria-busy="true">
        <span className="visually-hidden">Carregando as viagens…</span>
        <div className="trips-skeleton" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (load.status === 'error') {
    return (
      <div className="trips-route">
        <div className="trips-route-state" role="alert">
          <p>Não deu para carregar as viagens.</p>
          <p className="visually-hidden">{load.cause}</p>
          <button type="button" className="trips-route-btn" onClick={load.retry}>
            <RotateCw size={16} aria-hidden="true" />
            Tentar de novo
          </button>
        </div>
      </div>
    )
  }

  if (load.value === null) {
    return (
      <div className="trips-route">
        <div className="trips-route-state" role="status">
          <p>
            {load.problem === 'alone'
              ? 'As viagens são de vocês dois — convide de novo em Configurações.'
              : 'Este espaço mudou — recarregue.'}
          </p>
        </div>
      </div>
    )
  }

  const value = load.value
  const missing = view.name === 'trip' && value.tripById(view.id) === undefined

  return (
    <TripsContext.Provider value={value}>
      <div className="trips-route">
        {value.stale && (
          <p className="trips-notice" role="status">
            Não deu pra atualizar — mostrando o que já estava aqui
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
    <div className="trips-route-state" role="status">
      <p>Essa viagem não está aqui.</p>
      <a
        href="/viagens"
        className="trips-route-btn"
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
