// Zona sensível (wFxyC): sair do casal e apagar o espaço.
//
// A digitação do nome é atrito de interface, não controle de segurança (spec,
// seção 9) — por isso é cobrada só aqui.

import { useEffect, useState } from 'react'
import { Braces, Keyboard, Trash2, UserMinus } from 'lucide-react'
import { coupleLabel, formatThousands } from '../../domain/settings'
import { effectiveEndForCounting } from '../../domain/coupleState'
import type { Stay } from '../../domain/coupleState'
import { addDays } from '../../lib/date'
import { Button, Card, Dialog, FieldError } from '../parts'
import { failureMessage } from '../context'
import type { TabContext } from '../context'
import { exportAll } from '../exportAll'

/**
 * Dias com pelo menos uma estadia registrada, até hoje. Fim de contagem, não
 * de desenho: dia futuro não é "registrado" (effectiveEndForCounting).
 */
function daysRecorded(stays: readonly Stay[], today: string): number {
  const covered = new Set<string>()
  for (const stay of stays) {
    const end = effectiveEndForCounting(stay, today)
    for (let day = stay.startsOn; day <= end; day = addDays(day, 1)) covered.add(day)
  }
  return covered.size
}

export function DangerTab(ctx: TabContext) {
  const { data, api, partner, onStageChanged } = ctx
  const label = coupleLabel(data.couple.name, data.couple.members)
  const [dialog, setDialog] = useState<'leave' | 'delete' | null>(null)
  const [photos, setPhotos] = useState<number | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  // Sozinho no espaço, sair é apagar: `leave_couple` apaga o casal quando
  // ninguém fica — e depois disso ninguém alcança mais a pasta de fotos dele.
  // Então o caminho é o de apagar (fotos primeiro, RPC depois).
  const alone = partner === null

  return (
    <div className="st-stack">
      <Card className="st-danger">
        <div className="st-danger-head">
          <UserMinus size={18} aria-hidden="true" />
          <h3>Sair do casal</h3>
        </div>
        <p>
          {alone
            ? `Você está sozinho no espaço ${label}: sair apaga o espaço e tudo que está nele, pra sempre.`
            : `Você sai do espaço ${label} e perde o acesso. O acervo inteiro — estadias, lista, viagens, memórias e fotos — fica com ${partner!.displayName}, e o convite aberto deixa de valer.`}{' '}
          Sua conta continua: dá pra criar um espaço novo depois.
        </p>
        <div className="st-danger-foot">
          <span className="st-hint">
            <Keyboard size={13} aria-hidden="true" /> Pede o nome do casal pra confirmar
          </span>
          <Button variant="danger" icon={UserMinus} onClick={() => setDialog('leave')}>
            Sair do casal
          </Button>
        </div>
      </Card>

      <Card className="st-danger">
        <div className="st-danger-head">
          <Trash2 size={18} aria-hidden="true" />
          <h3>Apagar o espaço</h3>
        </div>
        <p>
          Apaga estadias, lista, viagens, memórias e fotos dos dois, pra sempre. Não tem volta: ninguém consegue
          recuperar depois.
        </p>
        <dl className="st-metrics st-metrics--danger">
          <div>
            <dt>dias registrados</dt>
            <dd>{formatThousands(daysRecorded(data.stays, ctx.today))}</dd>
          </div>
          <div>
            <dt>itens na lista</dt>
            <dd>—</dd>
          </div>
          <div>
            <dt>viagens</dt>
            <dd>—</dd>
          </div>
          <PhotoCount ctx={ctx} onCount={setPhotos} />
        </dl>
        <div className="st-danger-foot">
          <Button
            icon={Braces}
            variant="link"
            disabled={exporting}
            onClick={async () => {
              setExporting(true)
              const result = await exportAll(ctx)
              setExporting(false)
              setExportError(result.status === 'ok' ? null : `Não deu pra exportar: ${result.cause}`)
            }}
          >
            {exporting ? 'Gerando a cópia…' : 'Quer guardar uma cópia antes? Exportar tudo em JSON'}
          </Button>
          <Button variant="danger" icon={Trash2} onClick={() => setDialog('delete')}>
            Apagar o espaço
          </Button>
        </div>
        <FieldError message={exportError} />
      </Card>

      {dialog && (
        <ConfirmByName
          kind={dialog === 'leave' && alone ? 'delete' : dialog}
          label={label}
          photos={photos}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            if (dialog === 'leave' && !alone) {
              const result = await api.leaveCouple()
              if (result.status === 'left' || result.status === 'not_member') {
                onStageChanged()
                return null
              }
              return failureMessage(result)
            }
            const result = await api.deleteCouple(data.couple.id)
            switch (result.status) {
              case 'deleted':
              case 'not_member':
                onStageChanged()
                return null
              case 'media_failed':
                return `Nada foi apagado: não deu pra apagar as fotos do casal (${result.cause}).`
              case 'couple_failed':
                return `A foto do casal foi apagada, mas o espaço não. Tente de novo. (${result.cause})`
              case 'unauthenticated':
                return 'Sua sessão expirou — entre de novo.'
            }
          }}
        />
      )}
    </div>
  )
}

function PhotoCount({ ctx, onCount }: { ctx: TabContext; onCount: (n: number) => void }) {
  const [count, setCount] = useState<number | null | 'error'>(null)
  const { api, data } = ctx
  const couple = data.couple
  useEffect(() => {
    let cancelled = false
    void api.loadPhotoStats(couple).then((r) => {
      if (cancelled) return
      if (r.status === 'ok') {
        setCount(r.rows.count)
        onCount(r.rows.count)
      } else setCount('error')
    })
    return () => {
      cancelled = true
    }
  }, [api, couple, onCount])
  return (
    <div>
      <dt>fotos</dt>
      <dd>{count === null ? '…' : count === 'error' ? '—' : formatThousands(count)}</dd>
    </div>
  )
}

function ConfirmByName({
  kind,
  label,
  photos,
  onClose,
  onConfirm,
}: {
  kind: 'leave' | 'delete'
  label: string
  photos: number | null
  onClose: () => void
  onConfirm: () => Promise<string | null>
}) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const matches = typed.trim() === label

  return (
    <Dialog title={kind === 'leave' ? 'Sair do casal?' : 'Apagar o espaço pra sempre?'} onClose={onClose}>
      <form
        className="st-dialog-form"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!matches) return
          setBusy(true)
          const message = await onConfirm()
          setBusy(false)
          setError(message)
        }}
      >
        {kind === 'delete' && photos !== null && photos > 0 && (
          <p className="st-hint">As fotos de perfil ficam — são de cada um. A do casal vai junto.</p>
        )}
        <label className="st-field">
          <span className="st-field-label">Digite “{label}” pra confirmar</span>
          <span className="st-input">
            <input value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
          </span>
        </label>
        <FieldError message={error} />
        <div className="st-dialog-actions">
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="danger" disabled={!matches || busy}>
            {busy ? 'Aguarde…' : kind === 'leave' ? 'Sair do casal' : 'Apagar o espaço pra sempre'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
