// STUB da T3 — a Grade e a Linha do tempo (`OmXwr`, `NAPHW`) e o painel
// (`lB4rw`) chegam na T4, que substitui este arquivo. Lê do `TripsContext`
// (`useTrips()`); a `TripsRoute` já tratou carregando, erro e ausência.

import { useTrips } from './context'

export function TripsScreen() {
  const { trips } = useTrips()
  return (
    <header className="trips-header">
      <h1>Nossas viagens</h1>
      <p className="visually-hidden">{trips.length} viagens</p>
    </header>
  )
}
