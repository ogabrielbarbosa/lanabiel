// A _Galeria_ do detalhe (spec R18: mosaico de 9 em 3 colunas, a última com
// "+{resto}") e a **Galeria em tela cheia** (`pUXaX`, R22): título, contador,
// _Definir como capa_, favoritar, baixar, o menu da foto (_Apagar foto_), a
// foto, _Anterior/Próxima_, a legenda editável, as miniaturas e a dica de
// teclado. Teclado: ← → circular, F favorita, Esc fecha e devolve o foco.
//
// Seção 8: URLs assinadas só do visível — as 9 do mosaico; na tela cheia, a
// foto, as vizinhas e a janela de miniaturas.

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Download, Ellipsis, Heart, Image as ImageIcon, ImagePlus, Trash2, X } from 'lucide-react'
import { dayOfTrip, photosLabel, sortPhotos, tripDateRange } from '../../domain/tripDerive'
import { TRIP_LIMITS } from '../../domain/trips'
import type { Trip, TripPhoto } from '../../domain/trips'
import { validateCaption } from '../../domain/tripValidation'
import { weekdayShortDayMonth } from '../../lib/date'
import { Avatar } from '../../calendar/parts'
import { tripFailureMessage, usePhotoUrls, useTrips } from '../context'
import { photoOf } from './format'
import { Card } from './parts'

/** As alturas do mosaico do frame (`Masonry`): três colunas, três fotos cada. */
const MOSAIC_HEIGHTS = [
  [230, 150, 190],
  [160, 240, 170],
  [200, 170, 200],
] as const

export const MOSAIC_SIZE = 9

export function GalleryCard({
  trip,
  onOpen,
  onAddPhotos,
}: {
  trip: Trip
  onOpen: (index: number) => void
  onAddPhotos: () => void
}) {
  const photos = sortPhotos(trip.photos)
  const visible = photos.slice(0, MOSAIC_SIZE)
  const rest = photos.length - visible.length
  const urls = usePhotoUrls(visible.map((p) => p.path))
  const columns = [0, 1, 2].map((c) => visible.map((p, i) => ({ p, i })).filter(({ i }) => i % 3 === c))

  return (
    <Card
      title={`Galeria · ${photosLabel(photos.length)}`}
      labelledBy={`td-gallery-${trip.id}`}
      className="td-gallery"
      action={photos.length > 0 ? { label: 'Tela cheia', onClick: () => onOpen(0), ariaLabel: 'Abrir a galeria em tela cheia' } : null}
    >
      {photos.length === 0 ? (
        <div className="td-empty">
          <p>Nenhuma foto ainda</p>
          <button type="button" className="td-pill-btn" onClick={onAddPhotos}>
            <ImagePlus size={16} aria-hidden="true" />
            Adicionar fotos
          </button>
        </div>
      ) : (
        <div className="td-mosaic">
          {columns.map((col, c) => (
            <div key={c} className="td-mosaic-col">
              {col.map(({ p, i }) => {
                const url = urls.get(p.path)
                const last = i === visible.length - 1 && rest > 0
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="td-mosaic-photo"
                    style={{ height: MOSAIC_HEIGHTS[c][Math.floor(i / 3)] }}
                    aria-label={last ? `Ver mais ${rest} fotos` : `Abrir foto ${i + 1} de ${photos.length}`}
                    onClick={() => onOpen(i)}
                  >
                    {url && <img src={url} alt="" loading="lazy" />}
                    {last && (
                      <span className="td-mosaic-rest" aria-hidden="true">
                        +{rest}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Tela cheia (pUXaX)
// ---------------------------------------------------------------------------

/** Quantas miniaturas aparecem em volta da atual (o frame mostra 10). */
const THUMB_WINDOW = 5

export function FullGallery({ trip, start, onClose }: { trip: Trip; start: number; onClose: () => void }) {
  const { api, people, reload } = useTrips()
  const photos = sortPhotos(trip.photos)
  const count = photos.length
  const [index, setIndex] = useState(Math.min(Math.max(start, 0), Math.max(count - 1, 0)))
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [menu, setMenu] = useState<'closed' | 'open' | 'confirm'>('closed')
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)

  // A foto apagada (ou relida a menos) não deixa o índice fora da lista.
  const current = count === 0 ? undefined : photos[Math.min(index, count - 1)]
  const at = count === 0 ? 0 : Math.min(index, count - 1)

  const lo = Math.max(0, Math.min(at - THUMB_WINDOW, count - 2 * THUMB_WINDOW - 1))
  const thumbs = photos.slice(lo, lo + 2 * THUMB_WINDOW + 1)
  const neighbors = count > 1 ? [photos[(at + 1) % count], photos[(at - 1 + count) % count]] : []
  const urls = usePhotoUrls([current?.path, ...neighbors.map((p) => p.path), ...thumbs.map((p) => p.path)])

  const isCover = current !== undefined && trip.coverPhotoId === current.id

  const go = (delta: number) => {
    if (count === 0) return
    setEditing(false)
    setMenu('closed')
    setIndex((i) => (Math.min(i, count - 1) + delta + count) % count)
  }

  async function write(fn: () => Promise<{ status: 'ok' } | Parameters<typeof tripFailureMessage>[0]>, prefix: string): Promise<boolean> {
    setPending(true)
    setFailure(null)
    const result = await fn()
    if (result.status !== 'ok') {
      setFailure(`${prefix}: ${tripFailureMessage(result)}`)
      setPending(false)
      return false
    }
    await reload()
    setPending(false)
    return true
  }

  const toggleFavorite = () => {
    if (!current || pending) return
    void write(() => api.setFavorite(current.id, !current.favorite), 'Não deu pra favoritar')
  }
  const setCover = () => {
    if (!current || isCover || pending) return
    void write(() => api.updateTrip(trip.id, { coverPhotoId: current.id }), 'Não deu pra trocar a capa')
  }
  const erase = async () => {
    if (!current) return
    const ok = await write(() => api.deletePhoto(current), 'Não deu pra apagar a foto')
    setMenu('closed')
    if (ok && count <= 1) onClose()
  }

  // Refs para o atalho de teclado ver o estado atual sem re-registrar.
  const keys = useRef({ go, toggleFavorite, onClose, editing, menu })
  useEffect(() => {
    keys.current = { go, toggleFavorite, onClose, editing, menu }
  })

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.focus()
    function onKey(event: KeyboardEvent) {
      const k = keys.current
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
      if (event.key === 'Escape') {
        event.preventDefault()
        if (k.editing) return // a legenda cancela a si mesma
        if (k.menu !== 'closed') return setMenu('closed')
        k.onClose()
        return
      }
      if (typing) return
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        k.go(1)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        k.go(-1)
      } else if ((event.key === 'f' || event.key === 'F') && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        k.toggleFavorite()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [])

  // A miniatura atual fica à vista.
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('.td-thumb.is-current')
    el?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
  }, [at])

  const url = current ? urls.get(current.path) : undefined
  const author = current?.addedBy ? [people[1], people[2]].find((p) => p.profileId === current.addedBy) : undefined
  const k = current?.takenOn ? dayOfTrip(trip, current.takenOn) : null
  const secondary = current
    ? [
        current.takenOn ? weekdayShortDayMonth(current.takenOn) : null,
        author ? photoOf(author.name) : null,
        current.takenOn && k !== null ? `Dia ${k}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  return createPortal(
    <div
      ref={ref}
      className="td-full"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      {url && <img className="td-full-ambient" src={url} alt="" aria-hidden="true" />}
      <div className="td-full-top">
        <div className="td-full-left">
          <button type="button" className="td-round" aria-label="Fechar" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
          <div className="td-full-title">
            <h2 id={titleId}>{trip.title}</h2>
            <p>
              {tripDateRange(trip, { year: true })} · {photosLabel(count)}
            </p>
          </div>
        </div>
        <div className="td-full-right">
          <span className="td-full-counter" aria-live="polite">
            {count === 0 ? '0 / 0' : `${at + 1} / ${count}`}
          </span>
          <button type="button" className="td-pill-btn" onClick={setCover} disabled={!current || isCover || pending} aria-pressed={isCover}>
            <ImageIcon size={16} aria-hidden="true" />
            {isCover ? 'Capa da viagem' : 'Definir como capa'}
          </button>
          <button
            type="button"
            className={`td-round ${current?.favorite ? 'is-favorite' : ''}`}
            aria-label="Favoritar"
            aria-pressed={!!current?.favorite}
            onClick={toggleFavorite}
            disabled={!current || pending}
          >
            <Heart size={17} fill={current?.favorite ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
          {url ? (
            <a className="td-round" href={url} download aria-label="Baixar" target="_blank" rel="noopener noreferrer">
              <Download size={17} aria-hidden="true" />
            </a>
          ) : (
            <button type="button" className="td-round" aria-label="Baixar" disabled>
              <Download size={17} aria-hidden="true" />
            </button>
          )}
          <div className="td-full-menu-wrap">
            <button
              type="button"
              className="td-round"
              aria-label="Mais opções da foto"
              aria-haspopup="menu"
              aria-expanded={menu !== 'closed'}
              onClick={() => setMenu((m) => (m === 'closed' ? 'open' : 'closed'))}
              disabled={!current}
            >
              <Ellipsis size={17} aria-hidden="true" />
            </button>
            {menu === 'open' && (
              <div className="td-full-menu" role="menu">
                <button type="button" role="menuitem" className="td-full-menu-item is-danger" onClick={() => setMenu('confirm')}>
                  <Trash2 size={15} aria-hidden="true" />
                  Apagar foto
                </button>
              </div>
            )}
            {menu === 'confirm' && (
              <div className="td-full-menu td-full-menu--confirm" role="group" aria-label="Apagar foto">
                <p>Apagar esta foto? Não dá pra desfazer.</p>
                <span>
                  <button type="button" className="cal-btn" onClick={() => setMenu('closed')} disabled={pending}>
                    Voltar
                  </button>
                  <button type="button" className="cal-btn cal-btn--danger" onClick={() => void erase()} disabled={pending}>
                    <Trash2 size={15} aria-hidden="true" />
                    {pending ? 'Apagando…' : 'Apagar'}
                  </button>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {failure && (
        <p className="td-full-failure" role="alert">
          {failure}
        </p>
      )}

      <div className="td-full-stage">
        <button type="button" className="td-round td-round--nav" aria-label="Anterior" onClick={() => go(-1)} disabled={count < 2}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <figure className="td-full-photo">
          {url ? <img src={url} alt={current?.caption ?? trip.title} /> : <span className="td-full-photo-empty" />}
          {current && (
            <figcaption className="td-full-caption">
              {author && <Avatar person={author} size={28} />}
              <span className="td-full-caption-text">
                {editing ? (
                  <CaptionEditor
                    photo={current}
                    onDone={() => setEditing(false)}
                    save={(caption) => write(() => api.setCaption(current.id, caption), 'Não deu pra salvar a legenda')}
                  />
                ) : (
                  <button type="button" className="td-full-caption-btn" aria-label={`Editar a legenda: ${current.caption ?? 'sem legenda'}`} onClick={() => setEditing(true)}>
                    {current.caption ?? destOf(trip)}
                  </button>
                )}
                {secondary && <span className="td-full-caption-sub">{secondary}</span>}
              </span>
            </figcaption>
          )}
        </figure>
        <button type="button" className="td-round td-round--nav" aria-label="Próxima" onClick={() => go(1)} disabled={count < 2}>
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>

      <ol className="td-thumbs" aria-label="Miniaturas">
        {thumbs.map((p) => {
          const i = photos.indexOf(p)
          const thumbUrl = urls.get(p.path)
          return (
            <li key={p.id}>
              <button
                type="button"
                className={`td-thumb ${i === at ? 'is-current' : ''}`}
                aria-label={`Foto ${i + 1}`}
                aria-current={i === at ? 'true' : undefined}
                onClick={() => {
                  setEditing(false)
                  setIndex(i)
                }}
              >
                {thumbUrl && <img src={thumbUrl} alt="" loading="lazy" />}
              </button>
            </li>
          )
        })}
      </ol>

      <p className="td-full-hint" aria-hidden="true">
        <span>
          <kbd>← →</kbd> navegar
        </span>
        <span>
          <kbd>F</kbd> favoritar
        </span>
        <span>
          <kbd>Esc</kbd> fechar
        </span>
      </p>
    </div>,
    document.body,
  )
}

/** A legenda sem texto mostra o destino (R22 "{legenda ou destino}"). */
function destOf(trip: Pick<Trip, 'title'>): string {
  return trip.title
}

/** R22: tocar na legenda edita (≤ 80); Enter grava, Esc desiste; vazio = sem legenda. */
function CaptionEditor({
  photo,
  onDone,
  save,
}: {
  photo: TripPhoto
  onDone: () => void
  save: (caption: string | null) => Promise<boolean>
}) {
  const [value, setValue] = useState(photo.caption ?? '')
  const [invalid, setInvalid] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])

  async function commit() {
    const caption = value.trim() === '' ? null : value.trim()
    const v = validateCaption(caption)
    if (!v.ok) {
      setInvalid(v.reason)
      return
    }
    if (caption === photo.caption) return onDone()
    if (await save(caption)) onDone()
  }

  return (
    <span className="td-full-caption-edit">
      <input
        ref={inputRef}
        type="text"
        aria-label="Legenda"
        value={value}
        maxLength={TRIP_LIMITS.caption}
        placeholder="Escreva uma legenda"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void commit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            onDone()
          }
        }}
      />
      {invalid && <span role="alert">{invalid}</span>}
    </span>
  )
}
