// _Última memória · Álbum ›_ (R20, I10): a memória escrita mais recentemente
// entre as das viagens e as da Lista (`latestMemory`, pelo DIA; empate, a de
// viagem). Sem memória, o bloco some. O coração do `Memory Entry` (YmDIZ) não
// aparece: não existe dado de favoritar memória (decisão 8 da spec).

import { MapPin, Quote } from 'lucide-react'
import { requestListFocus } from '../../app/listFocus'
import { navigate } from '../../app/router'
import { latestMemory, wroteLabel } from '../../domain/map'
import type { LatestMemory } from '../../domain/map'
import { daysLabel, destinationLabel, excerpt, tripDays } from '../../domain/tripDerive'
import { localDateOf, longDateBR, shortDayMonth } from '../../lib/date'
import { coverPath } from '../../trips/context'
import { tripPath } from '../../trips/links'
import { usePhotoUrls, useHome } from '../context'
import type { HomeContextValue } from '../context'
import { longRangeLabel } from './derive'
import { CardAction, PanelCard, PanelPhoto, PersonAvatar } from './parts'

/** R20: o texto vai até 240 letras. */
const MEMORY_CHARS = 240


interface MemoryView {
  photo: string | null
  title: string
  date: string
  chip: string | null
  body: string
  authorId: string
  writtenOn: string
  open: () => void
}

function viewOf(latest: LatestMemory, ctx: Pick<HomeContextValue, 'cities' | 'listPhotos'>): MemoryView {
  if (latest.kind === 'trip') {
    const { trip, memory } = latest
    const city = ctx.cities.get(trip.cityId)
    return {
      photo: coverPath(trip),
      title: city ? destinationLabel(city) : '?',
      date: longRangeLabel(trip.startsOn, trip.endsOn),
      chip: `${daysLabel(tripDays(trip))} juntos`,
      body: memory.body,
      authorId: memory.profileId,
      writtenOn: memory.writtenOn,
      open: () => navigate(tripPath(trip.id)),
    }
  }
  const { item, memory } = latest
  return {
    // A primeira foto do feito; sem ela, a capa do item.
    photo: ctx.listPhotos.get(item.id)?.[0]?.path ?? item.photoPath,
    title: item.name,
    date: item.doneOn ? longDateBR(item.doneOn) : '',
    chip: null,
    body: memory.body,
    authorId: memory.profileId,
    writtenOn: localDateOf(memory.updatedAt),
    open: () => {
      requestListFocus(item.id)
      navigate('/lista')
    },
  }
}

export function Memory() {
  const { trips, items, listMemories, cities, listPhotos, people, today } = useHome()
  const latest = latestMemory(trips, items, listMemories)
  const view = latest ? viewOf(latest, { cities, listPhotos }) : null
  usePhotoUrls([view?.photo])
  if (!view) return null

  const author = [people[1], people[2]].find((p) => p.profileId === view.authorId)
  return (
    <PanelCard title="Última memória" action={<CardAction label="Álbum" onClick={view.open} />}>
      <button type="button" className="hp-memory" aria-label={`Abrir a memória de ${view.title}`} onClick={view.open}>
        <PanelPhoto path={view.photo} className="hp-memory-photo">
          <span className="hp-memory-scrim">
            <span className="hp-memory-place">
              <span className="hp-memory-title">
                <MapPin size={15} aria-hidden="true" />
                {view.title}
              </span>
              {view.date && <span className="hp-memory-date">{view.date}</span>}
            </span>
            {view.chip && (
              <span className="hp-memory-chip">
                <span className="hp-dot" aria-hidden="true" />
                {view.chip}
              </span>
            )}
          </span>
        </PanelPhoto>
        <span className="hp-quote">
          <Quote size={18} className="hp-ic-pink" aria-hidden="true" />
          <span className="hp-quote-text">“{excerpt(view.body, MEMORY_CHARS)}”</span>
        </span>
        <span className="hp-author">
          {author && <PersonAvatar person={author} size={32} />}
          <span className="hp-author-meta">
            <span className="hp-author-name">{author?.name ?? '?'}</span>
            <span className="hp-author-when">{wroteLabel(view.writtenOn, today, shortDayMonth)}</span>
          </span>
        </span>
      </button>
    </PanelCard>
  )
}
