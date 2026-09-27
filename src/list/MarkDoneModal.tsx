// Marcar como feito (`x4sciG`). Spec: R20, seção 7 (cascata upload → RPC), A15.
//
// ── CONTRATO (T6) — preencha SEM mudar as props ─────────────────────────────
// Quem abre: a `ListScreen` — "Marcar como feito" no hover do card, "Bora
// fazer" da Sugestão do momento, e "Marcar como feito" do detalhe. Use
// `useList()` para `api`, `coupleId`, `me`, `members`, `today`.
//
//   onDone()   — a RPC voltou `done`: a tela fecha e relê. Também em
//                `already_done` (a outra pessoa marcou antes): chame
//                `onDone()` depois de avisar, para a tela reler (seção 7).
//   onClose()  — cancelar / Esc / Fechar, sem gravar.
// ─────────────────────────────────────────────────────────────────────────────
//
// Decisões onde o frame não decide (registradas no relatório da T8):
// - Subtítulo: a terceira parte é a cidade (geográfico), o país (`pais`) ou a
//   plataforma (mídia) — não `secondaryLine`, que traria região, "onde comer"
//   ou as cidades de interesse no lugar da cidade ("Mocotó · Restaurante · São
//   Paulo" no frame).
// - Legenda da memória: "{meu nome} escrevendo · {outro nome} pode completar",
//   sem o artigo "a" do frame — artigo por pessoa seria inferir gênero (mesmo
//   ruling do estado vazio, T2).
// - `already_done`: como o aviso não pode sobreviver ao modal (props e
//   contexto fixos), o modal troca o conteúdo pelo aviso "{outra pessoa} já
//   marcou este item como feito" com um Fechar — e Fechar, Esc ou o X chamam
//   `onDone()`, que fecha e relê.
// - Tocar no coração igual à nota escolhida limpa a nota (é opcional).

import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Check, Heart, House, ImagePlus, X } from 'lucide-react'
import { CATEGORY_LABELS, LIST_LIMITS, isMediaCategory, ratingLabel } from '../domain/list'
import type { ListItem, Rating } from '../domain/list'
import { failureMessage, useList } from './context'
import { Hearts } from './Hearts'
import { ListDialog } from './parts'

export interface MarkDoneModalProps {
  item: ListItem
  onClose: () => void
  onDone: () => void
}

/** "{nome} · {Categoria} · {cidade ou plataforma}". */
function subtitleOf(item: ListItem): string {
  const where = isMediaCategory(item.category)
    ? item.platform
    : item.category === 'pais'
      ? (item.place?.country ?? null)
      : (item.place?.city ?? null)
  return [item.name, CATEGORY_LABELS[item.category].one, where].filter(Boolean).join(' · ')
}

interface Picked {
  file: File
  /** Prévia local; `null` onde o navegador não cria object URL (jsdom). */
  url: string | null
}

function previewUrl(file: File): string | null {
  return typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null
}

export function MarkDoneModal({ item, onClose, onDone }: MarkDoneModalProps) {
  const { api, coupleId, me, members, photos, today } = useList()
  const others = [...members.values()].filter((m) => m.profileId !== me.profileId)
  const other = others[0] ?? null
  const people = [...members.values()]

  const existing = photos.filter((p) => p.itemId === item.id).length
  const room = Math.max(0, LIST_LIMITS.photosPerItem - existing)

  const [doneOn, setDoneOn] = useState(today)
  const [who, setWho] = useState<'both' | string>('both')
  const [picked, setPicked] = useState<Picked[]>([])
  const [memory, setMemory] = useState('')
  const [rating, setRating] = useState<Rating | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [badPhoto, setBadPhoto] = useState<number | null>(null)
  const [photoNote, setPhotoNote] = useState<string | null>(null)
  const [alreadyDone, setAlreadyDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Solta as prévias ao sair.
  const pickedRef = useRef(picked)
  useEffect(() => {
    pickedRef.current = picked
  }, [picked])
  useEffect(
    () => () => {
      for (const p of pickedRef.current) if (p.url) URL.revokeObjectURL(p.url)
    },
    [],
  )

  const dateError = doneOn === '' ? 'Escolha a data.' : doneOn > today ? 'A data não pode ser no futuro.' : null
  const count = existing + picked.length

  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? [])
    event.target.value = ''
    const free = room - picked.length
    const taken = chosen.slice(0, Math.max(0, free))
    setPhotoNote(chosen.length > taken.length ? `Cabem só ${LIST_LIMITS.photosPerItem} fotos — as outras ficaram de fora.` : null)
    setBadPhoto(null)
    setPicked((current) => [...current, ...taken.map((file) => ({ file, url: previewUrl(file) }))])
  }

  function removePicked(index: number) {
    setPicked((current) => {
      const gone = current[index]
      if (gone?.url) URL.revokeObjectURL(gone.url)
      return current.filter((_, i) => i !== index)
    })
    setBadPhoto(null)
    setPhotoNote(null)
  }

  async function submit() {
    if (dateError || saving) return
    setSaving(true)
    setError(null)
    setBadPhoto(null)
    const result = await api.markDone(coupleId, {
      item,
      doneOn,
      doneWith: who === 'both' ? 'both' : 'solo',
      soloBy: who === 'both' ? null : who,
      rating,
      memory,
      files: picked.map((p) => p.file),
    })
    setSaving(false)
    switch (result.status) {
      case 'ok':
        onDone()
        return
      case 'already_done':
        setAlreadyDone(true)
        return
      case 'photo_rejected':
        setBadPhoto(result.index)
        setError(
          `A foto ${result.index + 1} ${result.reason === 'not_image' ? 'não é uma imagem' : 'é grande demais'}. Tire-a e tente de novo.`,
        )
        return
      case 'upload_failed':
        setBadPhoto(result.index)
        setError(`A foto ${result.index + 1} não subiu (${result.cause}). Nada foi gravado — tente de novo.`)
        return
      default:
        setError(failureMessage(result))
    }
  }

  if (alreadyDone) {
    return (
      <ListDialog title="Marcar como feito" subtitle={subtitleOf(item)} onClose={onDone}>
        <p className="ls-notice" role="status">
          {other?.name ?? 'Alguém'} já marcou este item como feito
        </p>
        <div className="ls-dialog-foot">
          <button type="button" className="ls-btn ls-btn--primary" onClick={onDone}>
            Fechar
          </button>
        </div>
      </ListDialog>
    )
  }

  return (
    <ListDialog
      title="Marcar como feito"
      subtitle={subtitleOf(item)}
      onClose={() => !saving && onClose()}
      footer={
        <>
          {/* Fase 7 R23 (`Hint`, P0MzG): a memória aparece na Home. */}
          <span className="ls-done-hint">
            <House size={13} aria-hidden="true" />
            Vira a “Última memória” da Home
          </span>
          <button type="button" className="ls-btn" disabled={saving} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="ls-btn ls-btn--primary"
            disabled={saving || dateError !== null}
            onClick={() => void submit()}
          >
            <Check size={16} aria-hidden="true" />
            {saving ? 'Gravando…' : 'Marcar como feito'}
          </button>
        </>
      }
    >
      <fieldset className="ls-done-form" disabled={saving}>
        <div className="ls-done-row">
          <div className="ls-md-field">
            <label className="ls-md-label" htmlFor="done-on">
              Quando
            </label>
            <input
              id="done-on"
              className="ls-md-input"
              type="date"
              value={doneOn}
              max={today}
              required
              aria-invalid={dateError !== null}
              aria-describedby={dateError ? 'done-on-error' : undefined}
              onChange={(e) => setDoneOn(e.target.value)}
            />
            {dateError && (
              <span id="done-on-error" className="ls-md-error" role="alert">
                {dateError}
              </span>
            )}
          </div>

          <div className="ls-md-field">
            <span className="ls-md-label" id="done-who">
              Quem estava
            </span>
            <div className="ls-done-who" role="group" aria-labelledby="done-who">
              {people.map((m) => (
                <button key={m.profileId} type="button" aria-pressed={who === m.profileId} onClick={() => setWho(m.profileId)}>
                  {m.name}
                </button>
              ))}
              <button type="button" aria-pressed={who === 'both'} onClick={() => setWho('both')}>
                <Heart size={12} fill="currentColor" aria-hidden="true" />
                Os dois
              </button>
            </div>
          </div>
        </div>

        <div className="ls-md-field">
          <div className="ls-md-field-head">
            <span className="ls-md-label">Fotos</span>
            <span className="ls-meta ls-meta--small">
              {count} de {LIST_LIMITS.photosPerItem}
            </span>
          </div>
          <div className="ls-done-photos">
            {picked.map((p, index) => (
              <div key={index} className={`ls-done-photo ${badPhoto === index ? 'ls-done-photo--bad' : ''}`}>
                {p.url ? <img src={p.url} alt="" /> : <span className="ls-done-photo-name">{p.file.name}</span>}
                <button
                  type="button"
                  className="ls-icon-btn ls-icon-btn--glass"
                  aria-label={`Tirar a foto ${index + 1}`}
                  onClick={() => removePicked(index)}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
            ))}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              aria-label="Escolher fotos"
              onChange={addFiles}
            />
            <button
              type="button"
              className="ls-done-add"
              disabled={count >= LIST_LIMITS.photosPerItem}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus size={18} aria-hidden="true" />
              Adicionar
            </button>
          </div>
          {photoNote && <span className="ls-hint">{photoNote}</span>}
        </div>

        <div className="ls-md-field">
          <label className="ls-md-label" htmlFor="done-memory">
            Memória
          </label>
          <div className="ls-done-memory">
            <textarea
              id="done-memory"
              className="ls-md-textarea"
              rows={3}
              value={memory}
              maxLength={LIST_LIMITS.memory}
              placeholder="Como foi?"
              onChange={(e) => setMemory(e.target.value.slice(0, LIST_LIMITS.memory))}
            />
            <div className="ls-done-memory-foot">
              <span className="ls-meta ls-meta--small">
                {other ? `${me.name} escrevendo · ${other.name} pode completar` : `${me.name} escrevendo`}
              </span>
              <span className="ls-meta ls-meta--small">
                {memory.length}/{LIST_LIMITS.memory}
              </span>
            </div>
          </div>
        </div>

        <div className="ls-done-rating">
          <div>
            <span className="ls-md-label">Quanto vocês amaram?</span>
            {rating !== null && <span className="ls-done-rating-label">{ratingLabel(rating)}</span>}
          </div>
          <Hearts value={rating} onPick={setRating} disabled={saving} />
        </div>
      </fieldset>

      {error && (
        <p className="ls-notice ls-notice--error" role="alert">
          {error}
        </p>
      )}
    </ListDialog>
  )
}
