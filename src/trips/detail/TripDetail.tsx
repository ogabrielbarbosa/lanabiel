// STUB da T3 — o Detalhe (`Peoa7` feita, `f3yqz` futura) chega na T5, que
// substitui este arquivo. A `TripsRoute` só o monta com um `id` que É viagem
// do casal (o R1 _"Essa viagem não está aqui."_ fica lá).

import { useTrips } from '../context'

export function TripDetail({ id }: { id: string }) {
  const { tripById } = useTrips()
  const trip = tripById(id)
  return (
    <header className="trip-detail-header">
      <h1>{trip?.title}</h1>
    </header>
  )
}
