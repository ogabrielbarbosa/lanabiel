// O painel da direita da Home (`Painel — scroll completo` LFEx4), com rolagem
// própria: data e saudação, _Próxima viagem_, _Nosso ritmo_, _Nessa região_,
// _Em destaque_, _Última memória_ e _Juntos pelo mundo_.
//
// Spec: .agent/Tasks/fase-7-mapa.md — R15–R21, R25, I2, I7, I8, I10, I11 (A13, A14)
//
// Renderizado DENTRO do `HomeContext` (só depois do primeiro `ok`): lê tudo de
// `useHome()` e não busca nada (I1). Cada número é derivado pelas funções que
// já existem (I2); nada aqui lê `day_kisses` (R25). Bloco sem resposta some
// (_Em destaque_, _Última memória_, _Juntos pelo mundo_); os que têm estado
// vazio desenhado o mostram (_Próxima viagem_, _Nosso ritmo_, _Nessa região_).
//
// _Ver mapa_ e os itens de _Nessa região_ pedem foco ao MAPA DESTA TELA
// (`onShowOnMap`): a Home já está montada, e o `requestMapFocus` só é lido ao
// montar. Sem a prop (o painel solto), cai no pedido pendente de `mapFocus`.

import { requestMapFocus } from '../app/mapFocus'
import type { MapFocus } from '../app/mapFocus'
import { weekdayDayMonthLabel } from '../lib/date'
import '../list/list.css'
import { useHome } from './context'
import { Featured } from './panel/Featured'
import { Memory } from './panel/Memory'
import { NextTrip } from './panel/NextTrip'
import { Region } from './panel/Region'
import { Rhythm } from './panel/Rhythm'
import { World } from './panel/World'
import './panel.css'

export interface HomePanelProps {
  /** Leva a área do mapa da Home a um foco: a cidade (_Ver mapa_) ou um item (R18). */
  onShowOnMap?: (focus: MapFocus) => void
}

export function HomePanel({ onShowOnMap = requestMapFocus }: HomePanelProps) {
  const { today, people } = useHome()
  return (
    <aside className="home-panel lg" aria-label="Painel">
      <div className="hp-scroll">
        <header className="hp-head">
          <p>{weekdayDayMonthLabel(today)}</p>
          <h2>
            Oi, {people[1].name} &amp; {people[2].name}
          </h2>
        </header>
        <NextTrip />
        <Rhythm />
        <Region onShowOnMap={onShowOnMap} />
        <Featured />
        <Memory />
        <World />
      </div>
    </aside>
  )
}
