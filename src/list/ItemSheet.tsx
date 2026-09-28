// Detalhe do item (`RWegR`, painel sobreposto). Spec: R16–R19, seção 7, A16.
//
// ── CONTRATO (T6) — preencha SEM mudar as props ─────────────────────────────
// Quem abre: a `ListScreen`, ao tocar um card, um item do painel (Perto de
// vocês, Adicionados recentemente). Recebe só o `itemId` e lê item, memórias,
// fotos e URLs de `useList()` — assim a releitura depois de uma escrita já
// atualiza o que está aberto. Item que sumiu na releitura (a outra pessoa
// apagou) → mostre isso, não quebre.
//
//   onClose()          — fechar.
//   onEdit(item)       — "Editar": a tela fecha o detalhe e abre o
//                        `AddItemModal` em modo edit.
//   onMarkDone(item)   — "Marcar como feito": a tela fecha o detalhe e abre o
//                        `MarkDoneModal`.
//   onDeleted()        — o item foi apagado (seção 7, cascata arquivos →
//                        linha): a tela fecha e relê.
//
// Escritas que ficam DENTRO do detalhe (nota de corações, memória, fotos)
// chamam `reload()` do contexto depois do `ok` e continuam abertas.
// ─────────────────────────────────────────────────────────────────────────────
//
// Decisões onde o frame não decide (registradas no relatório da T8):
// - Os corações só aparecem no item FEITO: `rating` exige `status = 'done'` no
//   banco (I3), e mostrar corações tocáveis que o banco recusa seria mentir.
// - Tocar o coração igual à nota atual limpa a nota (`setRating(null)`).
// - A nota mostrada é a do banco: muda só depois do `ok`; na falha fica a
//   anterior e a causa aparece ao lado.
// - Memória própria salva vazia = `deleteMemory` (a entrada some e volta o
//   _Escrever a minha_). Memória de quem já saiu do casal não aparece: a
//   seção é "uma entrada por integrante".
// - Remover foto fica na galeria (tocar uma miniatura a abre), só para quem a
//   subiu, com confirmação.
//
// _Agendar_ (Fase 5, R23): abre o `EventModal` do Calendário (importado, não
// copiado) do tipo Date, com o título e o vínculo do item. O modal ENTRA NO
// LUGAR do detalhe enquanto está aberto, em vez de por cima: os dois diálogos
// escutam o Esc no documento, e empilhados um Esc fecharia os dois. Fechar
// o modal volta ao detalhe; salvar volta com _"Agendado para {d mmm}"_.

import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Check,
  CircleCheck,
  Globe,
  ImagePlus,
  Link2,
  Pencil,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react'
import { requestMapFocus } from '../app/mapFocus'
import { navigate } from '../app/router'
import { EventModal } from '../calendar/EventModal'
import { loadModalEnv } from '../calendar/modalEnv'
import type { ModalEnv } from '../calendar/modalEnv'
import type { ListFailure } from '../data/list'
import { pinOf } from '../domain/map'
import { distanceKmExact } from '../domain/onboarding'
import { LIST_LIMITS, formatDistance, isMediaCategory } from '../domain/list'
import type { ListItem, ListPhoto, Rating } from '../domain/list'
import { localDateOf, shortDayMonth } from '../lib/date'
import { failureMessage, memberName, useList } from './context'
import type { ListMember } from './context'
import { dayMonthYear, weekdayDayMonthYear } from '../lib/date'
import { Hearts } from './Hearts'
import { Avatar, CategoryTag, ItemPhoto, ListDialog } from './parts'

export interface ItemSheetProps {
  itemId: string
  onClose: () => void
  onEdit: (item: ListItem) => void
  onMarkDone: (item: ListItem) => void
  onDeleted: () => void
}

const REJECTED: Record<'not_image' | 'too_large', string> = {
  not_image: 'não é uma imagem',
  too_large: 'é grande demais',
}

export function ItemSheet({ itemId, onClose, onEdit, onMarkDone, onDeleted }: ItemSheetProps) {
  const { items } = useList()
  const item = items.find((i) => i.id === itemId)
  if (!item) {
    return (
      <ListDialog variant="sheet" title="Item" onClose={onClose}>
        <p className="ls-hint" role="status">
          Este item não existe mais
        </p>
        <div>
          <button type="button" className="ls-btn lg" onClick={onClose}>
            Fechar
          </button>
        </div>
      </ListDialog>
    )
  }
  return <Sheet key={item.id} item={item} onClose={onClose} onEdit={onEdit} onMarkDone={onMarkDone} onDeleted={onDeleted} />
}

function Sheet({
  item,
  onClose,
  onEdit,
  onMarkDone,
  onDeleted,
}: Omit<ItemSheetProps, 'itemId'> & { item: ListItem }) {
  const { api, members, photos, urls, where, reload } = useList()
  const done = item.status === 'done'
  const itemPhotos = photos
    .filter((p) => p.itemId === item.id)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))

  // Corações: o valor mostrado é o do banco. `saved` guarda o que o `ok`
  // devolveu, preso à nota da qual partiu; quando a releitura trouxer outra
  // nota (a própria ou a da outra pessoa), vale a da releitura.
  const [saved, setSaved] = useState<{ from: Rating | null; value: Rating | null } | null>(null)
  const rating = saved && saved.from === item.rating ? saved.value : item.rating
  const [ratingBusy, setRatingBusy] = useState(false)
  const [ratingError, setRatingError] = useState<string | null>(null)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // _Agendar_ (R23): o ambiente do modal é lido na hora (a mesma leitura da
  // tela do Calendário); leitura que não deu `ok` mostra a causa aqui.
  const [scheduleEnv, setScheduleEnv] = useState<ModalEnv | null>(null)
  const [scheduleBusy, setScheduleBusy] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [scheduled, setScheduled] = useState<string | null>(null)

  async function openSchedule() {
    setScheduleBusy(true)
    setScheduleError(null)
    setScheduled(null)
    const env = await loadModalEnv(api.calendar)
    setScheduleBusy(false)
    if (env.status === 'ok') setScheduleEnv(env.rows)
    else setScheduleError(`Não deu pra abrir o agendamento: ${failureMessage(env)}`)
  }

  async function pickRating(next: Rating | null) {
    setRatingBusy(true)
    setRatingError(null)
    const result = await api.setRating(item.id, next)
    setRatingBusy(false)
    if (result.status === 'ok') {
      setSaved({ from: item.rating, value: result.value.rating })
      void reload()
    } else {
      setRatingError(failureMessage(result))
    }
  }

  async function remove() {
    setDeleting(true)
    setDeleteError(null)
    const result = await api.deleteItem(item, itemPhotos)
    if (result.status === 'ok' || result.status === 'not_found') {
      onDeleted()
      return
    }
    setDeleting(false)
    setDeleteError(
      result.status === 'files_deleted_row_failed'
        ? `As fotos de ${item.name} foram apagadas, mas o item não. Tente de novo.`
        : failureMessage(result),
    )
  }

  const place = item.place
  const photoUrl = item.photoPath ? (urls.get(item.photoPath) ?? null) : null
  const distance =
    place && where.kind === 'together' ? formatDistance(distanceKmExact(where.city, place)) : null
  const cityLine = place ? [place.city, place.city ? (place.state ?? place.country) : place.country].filter(Boolean).join(', ') : ''
  const added = memberName(members, item.addedBy)

  if (scheduleEnv) {
    return (
      <EventModal
        env={scheduleEnv}
        mode={{
          kind: 'new',
          day: scheduleEnv.today,
          preset: { kind: 'date', title: item.name, listItemId: item.id },
        }}
        onClose={() => setScheduleEnv(null)}
        onSaved={({ startsOn }) => {
          setScheduleEnv(null)
          setScheduled(`Agendado para ${shortDayMonth(startsOn)}`)
        }}
      />
    )
  }

  return (
    <ListDialog variant="sheet" title={item.name} onClose={onClose} footer={
      <div className="ls-sheet-foot">
        {confirmDelete ? (
          <div className="ls-sheet-confirm" role="alertdialog" aria-label="Confirmar apagar">
            <p>{done ? `Apagar ${item.name}? A memória e as fotos vão junto.` : `Apagar ${item.name} da lista?`}</p>
            <div className="ls-sheet-confirm-actions">
              <button type="button" className="ls-btn lg" disabled={deleting} onClick={() => setConfirmDelete(false)}>
                Cancelar
              </button>
              <button type="button" className="ls-btn ls-md-danger" disabled={deleting} onClick={() => void remove()}>
                {deleting ? 'Apagando…' : 'Sim, apagar'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {done ? (
              <span className="ls-sheet-done lg">
                <CircleCheck size={16} aria-hidden="true" />
                Feito
              </span>
            ) : (
              <button type="button" className="ls-btn ls-btn--primary ls-btn--wide" onClick={() => onMarkDone(item)}>
                <Check size={16} aria-hidden="true" />
                Marcar como feito
              </button>
            )}
            <button type="button" className="ls-btn lg" onClick={() => onEdit(item)}>
              <Pencil size={14} aria-hidden="true" />
              Editar
            </button>
            <button type="button" className="ls-btn lg" disabled={scheduleBusy} onClick={() => void openSchedule()}>
              <CalendarPlus size={14} aria-hidden="true" />
              {scheduleBusy ? 'Abrindo…' : 'Agendar'}
            </button>
            <button type="button" className="ls-btn lg" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} aria-hidden="true" />
              Apagar
            </button>
          </>
        )}
        {deleteError && (
          <p className="ls-notice ls-notice--error lg" role="alert">
            {deleteError}
          </p>
        )}
        {scheduleError && (
          <p className="ls-notice ls-notice--error lg" role="alert">
            {scheduleError}
          </p>
        )}
        {scheduled && (
          <p className="ls-notice lg" role="status">
            {scheduled}
          </p>
        )}
      </div>
    }>
      <ItemPhoto category={item.category} url={photoUrl} className="ls-sheet-photo">
        {done && item.doneOn && <span className="ls-sheet-done-on lg">Feito em {dayMonthYear(item.doneOn)}</span>}
      </ItemPhoto>

      <div className="ls-sheet-top">
        <CategoryTag category={item.category} />
        {done && <Hearts value={rating} onPick={(n) => void pickRating(n)} disabled={ratingBusy} label="Nota de vocês" size={14} />}
      </div>
      {ratingError && (
        <p className="ls-notice ls-notice--error lg" role="alert">
          {ratingError}
        </p>
      )}

      {place && (
        <div className="ls-sheet-place lg">
          {place.address && <p className="ls-sheet-address">{place.address}</p>}
          <p className="ls-meta">
            {cityLine}
            {distance && <span className="ls-sheet-distance"> · {distance}</span>}
          </p>
          {/* Fase 7 R23: só o que vira pin na Home (`pinOf`) tem onde abrir. */}
          {pinOf(item) && (
            <button
              type="button"
              className="ls-sheet-globe"
              onClick={() => {
                requestMapFocus({ kind: 'item', id: item.id })
                navigate('/')
              }}
            >
              <Globe size={12} aria-hidden="true" />
              Ver no globo
            </button>
          )}
        </div>
      )}
      {isMediaCategory(item.category) && (
        <div className="ls-sheet-place lg">
          {item.platform && <p className="ls-sheet-address">{item.platform}</p>}
          {item.seasons !== null && (
            <p className="ls-meta">{item.seasons === 1 ? '1 temporada' : `${item.seasons} temporadas`}</p>
          )}
        </div>
      )}

      {done && <Memory item={item} itemPhotos={itemPhotos} />}

      {item.link && (
        <div className="ls-sheet-field">
          <span className="ls-sheet-label">
            <Link2 size={13} aria-hidden="true" />
            Link
          </span>
          <a href={item.link} target="_blank" rel="noopener noreferrer" className="ls-sheet-link">
            {item.link.replace(/^https?:\/\/(www\.)?/i, '')}
          </a>
        </div>
      )}
      {item.note && (
        <div className="ls-sheet-field">
          <span className="ls-sheet-label">
            <StickyNote size={13} aria-hidden="true" />
            Nota
          </span>
          <p>{item.note}</p>
        </div>
      )}
      <p className="ls-meta ls-meta--small">
        Adicionado · {added} · {dayMonthYear(localDateOf(item.createdAt))}
      </p>
    </ListDialog>
  )
}

// ---------------------------------------------------------------------------
// A nossa memória (R17)
// ---------------------------------------------------------------------------

function Memory({ item, itemPhotos }: { item: ListItem; itemPhotos: ListPhoto[] }) {
  const { api, coupleId, me, members, memories, urls, reload } = useList()
  const [gallery, setGallery] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const full = itemPhotos.length >= LIST_LIMITS.photosPerItem
  const shown = itemPhotos.slice(0, 3)
  const more = itemPhotos.length - shown.length

  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (chosen.length === 0) return
    const room = LIST_LIMITS.photosPerItem - itemPhotos.length
    const files = chosen.slice(0, Math.max(0, room))
    setUploading(true)
    setPhotoError(null)
    let error: string | null =
      chosen.length > files.length ? `Só cabiam mais ${room}, as outras ficaram de fora.` : null
    // Uma de cada vez (seção 7): upload → insert. Para na primeira falha.
    for (const [index, file] of files.entries()) {
      const result = await api.addPhoto(coupleId, item.id, file)
      if (result.status === 'ok') continue
      if (result.status === 'photo_rejected') {
        error = `A foto ${index + 1} ${REJECTED[result.reason]}.`
      } else {
        error = failureMessage(result)
      }
      break
    }
    setUploading(false)
    setPhotoError(error)
    await reload()
  }

  const people = [...members.values()]
  const ordered = [me, ...people.filter((m) => m.profileId !== me.profileId)]

  return (
    <section className="ls-memory" aria-label="A nossa memória">
      <div className="ls-memory-head">
        <h3>A nossa memória</h3>
        {item.doneOn && <span className="ls-meta ls-meta--small">{weekdayDayMonthYear(item.doneOn)}</span>}
      </div>

      {itemPhotos.length > 0 && (
        <div className="ls-memory-photos">
          {shown.map((photo, index) => {
            const url = urls.get(photo.path)
            const last = index === shown.length - 1 && more > 0
            return (
              <button
                key={photo.id}
                type="button"
                className="ls-memory-thumb"
                aria-label={last ? `+${more} fotos` : `Abrir foto ${index + 1}`}
                onClick={() => setGallery(index)}
              >
                {url ? <img src={url} alt="" /> : <span className="ls-memory-thumb-empty" />}
                {last && <span className="ls-memory-more">+{more} fotos</span>}
              </button>
            )
          })}
        </div>
      )}

      <div className="ls-memory-add">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          aria-label="Escolher fotos"
          onChange={(e) => void addFiles(e)}
        />
        <button
          type="button"
          className="ls-link"
          disabled={full || uploading}
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus size={14} aria-hidden="true" />
          {uploading ? 'Enviando…' : 'Adicionar fotos'}
        </button>
        <span className="ls-meta ls-meta--small">
          {itemPhotos.length} de {LIST_LIMITS.photosPerItem}
        </span>
      </div>
      {photoError && (
        <p className="ls-notice ls-notice--error lg" role="alert">
          {photoError}
        </p>
      )}

      {ordered.map((member) => {
        const memory = memories.find((m) => m.itemId === item.id && m.profileId === member.profileId)
        if (member.profileId === me.profileId) {
          return <MyMemory key={member.profileId} item={item} member={member} body={memory?.body ?? null} />
        }
        if (!memory) return null
        return <MemoryEntry key={member.profileId} member={member} body={memory.body} />
      })}

      {gallery !== null && itemPhotos.length > 0 && (
        <Gallery photos={itemPhotos} start={Math.min(gallery, itemPhotos.length - 1)} onClose={() => setGallery(null)} />
      )}
    </section>
  )
}

/** `Memory Entry` (`YmDIZ`): avatar, nome e texto. */
function MemoryEntry({ member, body, children }: { member: ListMember; body: string; children?: ReactNode }) {
  return (
    <article className="ls-memory-entry lg" aria-label={`Memória de ${member.name}`}>
      <Avatar member={member} size={24} />
      <div className="ls-memory-entry-body">
        <span className="ls-memory-name">{member.name}</span>
        <p>{body}</p>
        {children}
      </div>
    </article>
  )
}

function MyMemory({ item, member, body }: { item: ListItem; member: ListMember; body: string | null }) {
  const { api, coupleId, reload } = useList()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function start() {
    setText(body ?? '')
    setError(null)
    setEditing(true)
  }

  async function save() {
    const trimmed = text.trim()
    if (trimmed === '' && body === null) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    const result: { status: 'ok' } | ListFailure =
      trimmed === '' ? await api.deleteMemory(item.id) : await api.saveMemory(item.id, coupleId, trimmed)
    setSaving(false)
    if (result.status !== 'ok') {
      setError(failureMessage(result))
      return
    }
    setEditing(false)
    await reload()
  }

  if (editing) {
    return (
      <div className="ls-memory-entry ls-memory-entry--edit lg">
        <Avatar member={member} size={24} />
        <div className="ls-memory-entry-body">
          <label className="ls-memory-name" htmlFor={`memory-${item.id}`}>
            {member.name}
          </label>
          <textarea
            id={`memory-${item.id}`}
            className="ls-md-textarea"
            value={text}
            maxLength={LIST_LIMITS.memory}
            rows={3}
            disabled={saving}
            onChange={(e) => setText(e.target.value.slice(0, LIST_LIMITS.memory))}
          />
          <div className="ls-memory-edit-foot">
            <span className="ls-meta ls-meta--small">
              {text.length}/{LIST_LIMITS.memory}
            </span>
            <button type="button" className="ls-btn lg" disabled={saving} onClick={() => setEditing(false)}>
              Cancelar
            </button>
            <button type="button" className="ls-btn ls-btn--primary" disabled={saving} onClick={() => void save()}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
          {error && (
            <p className="ls-notice ls-notice--error lg" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    )
  }

  if (body === null) {
    return (
      <button type="button" className="ls-btn ls-memory-write lg" onClick={start}>
        <Pencil size={14} aria-hidden="true" />
        Escrever a minha
      </button>
    )
  }

  return (
    <MemoryEntry member={member} body={body}>
      <button type="button" className="ls-link ls-memory-edit" onClick={start} aria-label="Editar a minha memória">
        <Pencil size={12} aria-hidden="true" />
        Editar
      </button>
    </MemoryEntry>
  )
}

// ---------------------------------------------------------------------------
// Galeria em tela cheia
// ---------------------------------------------------------------------------

function Gallery({ photos, start, onClose }: { photos: ListPhoto[]; start: number; onClose: () => void }) {
  const { api, me, urls, reload } = useList()
  const [index, setIndex] = useState(start)
  const [confirm, setConfirm] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = photos[Math.min(index, photos.length - 1)]
  const count = photos.length

  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  // Esc e setas na captura da janela: o Esc fecha só a galeria, não o detalhe
  // que está por baixo (o `ListDialog` escuta o Esc no documento).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeRef.current()
      } else if (event.key === 'ArrowLeft') {
        setIndex((i) => (i - 1 + count) % count)
      } else if (event.key === 'ArrowRight') {
        setIndex((i) => (i + 1) % count)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [count])

  if (!current) return null
  const url = urls.get(current.path)
  const mine = current.addedBy === me.profileId

  async function remove() {
    setRemoving(true)
    setError(null)
    const result = await api.removePhoto(current)
    setRemoving(false)
    if (result.status !== 'ok') {
      setError(failureMessage(result))
      return
    }
    setConfirm(false)
    if (count <= 1) onClose()
    else setIndex((i) => Math.min(i, count - 2))
    await reload()
  }

  return (
    <div className="ls-gallery" role="dialog" aria-modal="true" aria-label="Fotos">
      <div className="ls-gallery-head">
        <span className="ls-meta">
          {index + 1} de {count}
        </span>
        <button type="button" className="ls-icon-btn ls-icon-btn--glass lg" aria-label="Fechar fotos" onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="ls-gallery-stage">
        {count > 1 && (
          <button
            type="button"
            className="ls-icon-btn ls-icon-btn--glass ls-icon-btn--40 lg"
            aria-label="Foto anterior"
            onClick={() => setIndex((i) => (i - 1 + count) % count)}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
        )}
        {url ? <img src={url} alt={`Foto ${index + 1} de ${count}`} /> : <div className="ls-gallery-empty">Foto indisponível</div>}
        {count > 1 && (
          <button
            type="button"
            className="ls-icon-btn ls-icon-btn--glass ls-icon-btn--40 lg"
            aria-label="Próxima foto"
            onClick={() => setIndex((i) => (i + 1) % count)}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      {mine && (
        <div className="ls-gallery-foot">
          {confirm ? (
            <>
              <span>Remover esta foto?</span>
              <button type="button" className="ls-btn lg" disabled={removing} onClick={() => setConfirm(false)}>
                Cancelar
              </button>
              <button type="button" className="ls-btn ls-md-danger" disabled={removing} onClick={() => void remove()}>
                {removing ? 'Removendo…' : 'Sim, remover'}
              </button>
            </>
          ) : (
            <button type="button" className="ls-btn lg" onClick={() => setConfirm(true)}>
              <Trash2 size={14} aria-hidden="true" />
              Remover foto
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="ls-notice ls-notice--error lg" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
