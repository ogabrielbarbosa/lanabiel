import { useEffect, useRef, useState } from 'react'
import type { FormEvent, MouseEvent, SyntheticEvent } from 'react'
import { PEOPLE } from './people'
import type { PersonId, Stay } from './types'

interface StayDialogProps {
  stay?: Stay
  date?: string
  cityOptions: string[]
  onSave: (values: Omit<Stay, 'id'>) => void
  onDelete?: () => void
  onClose: () => void
}

export function StayDialog({ stay, date, cityOptions, onSave, onDelete, onClose }: StayDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [person, setPerson] = useState<PersonId>(stay?.person ?? PEOPLE[0].id)
  const [start, setStart] = useState(stay?.start ?? date ?? '')
  const [end, setEnd] = useState(stay?.end ?? stay?.start ?? date ?? '')
  const [ongoing, setOngoing] = useState(stay ? stay.end === undefined : false)
  const [city, setCity] = useState(stay?.city ?? '')
  const [note, setNote] = useState(stay?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()

    if (!city.trim()) {
      setError('Diz a cidade aí.')
      return
    }
    if (!ongoing && end < start) {
      setError('A data final não pode vir antes da inicial.')
      return
    }

    onSave({
      person,
      start,
      end: ongoing ? undefined : end,
      city: city.trim(),
      note: note.trim() || undefined,
    })
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) onClose()
  }

  // `cancel` é só o Esc do usuário; o evento `close` também dispara quando o
  // próprio cleanup fecha o dialog, o que reabriria/fecharia em loop.
  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault()
    onClose()
  }

  return (
    <dialog className="dialog" ref={dialogRef} onCancel={handleCancel} onClick={handleBackdropClick}>
      <form className="dialog-form" onSubmit={handleSubmit}>
        <div className="dialog-header">
          <h2 className="dialog-title">{stay ? 'Editar período' : 'Novo período'}</h2>
          <p className="dialog-desc">Onde cada um esteve — a interseção vira "juntos" sozinha.</p>
        </div>

        <div className="dialog-body">
          <div className="row2">
            <label className="field">
              <span className="label">Quem</span>
              <select
                className="input"
                value={person}
                onChange={(event) => setPerson(event.target.value as PersonId)}
              >
                {PEOPLE.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">Cidade</span>
              <input
                className="input"
                list="city-options"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder="Marau"
                autoFocus
              />
              <datalist id="city-options">
                {cityOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </label>
          </div>

          <div className="row2">
            <label className="field">
              <span className="label">Início</span>
              <input
                className="input"
                type="date"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="label">Fim</span>
              <input
                className="input"
                type="date"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                disabled={ongoing}
                required={!ongoing}
              />
            </label>
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={ongoing}
              onChange={(event) => setOngoing(event.target.checked)}
            />
            Ainda não acabou (conta até hoje)
          </label>

          <label className="field">
            <span className="label">Nota (opcional)</span>
            <input
              className="input"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Aniversário, feriado..."
            />
          </label>

          {error && <p className="form-error">{error}</p>}
        </div>

        <div className="dialog-footer">
          {onDelete && (
            <button type="button" className="btn btn-danger" onClick={onDelete}>
              Excluir
            </button>
          )}
          <span className="dialog-spacer" />
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary">
            Salvar
          </button>
        </div>
      </form>
    </dialog>
  )
}
