// Dados e privacidade (mV5s2): o que existe e quem alcança.

import { useEffect, useState } from 'react'
import { Braces, Download, HardDrive, Images, Laptop, LockKeyhole, Smartphone } from 'lucide-react'
import { ago } from '../../onboarding/format'
import type { ActiveSession } from '../../data/sessions'
import type { PhotoStats } from '../../data/settings'
import type { DataResult } from '../../data/result'
import { STORAGE_QUOTA_BYTES, formatBytes, formatThousands, parseUserAgent } from '../../domain/settings'
import { Avatar, Button, Card, FieldError } from '../parts'
import { failureMessage } from '../context'
import type { TabContext } from '../context'
import { exportAll } from '../exportAll'

export function DataTab(ctx: TabContext) {
  const { data, api } = ctx
  const names = data.couple.members.map((m) => m.displayName)

  return (
    <div className="st-stack">
      <Card className="st-private">
        <LockKeyhole size={20} aria-hidden="true" />
        <div>
          <p className="st-row-label">
            {names.length === 2 ? `Espaço privado · só ${names[0]} e ${names[1]}` : 'Espaço privado'}
          </p>
          <p className="st-row-hint">
            Não existe link público nem compartilhamento. Nada do que vocês guardam aparece pra mais ninguém.
          </p>
        </div>
        <div className="st-private-avatars">
          {data.couple.members.map((m) => (
            <Avatar key={m.profileId} url={ctx.urls.avatar(m.profileId)} name={m.displayName} color={m.color} size={32} />
          ))}
        </div>
      </Card>

      <ExportCard {...ctx} />
      <PhotoCards api={api} ctx={ctx} />
      <Sessions {...ctx} />
    </div>
  )
}

function ExportCard(ctx: TabContext) {
  const [state, setState] = useState<{ kind: 'idle' | 'busy' } | { kind: 'done'; bytes: number } | { kind: 'error'; cause: string }>({
    kind: 'idle',
  })
  const size = state.kind === 'done' ? formatBytes(state.bytes) : null
  return (
    <Card className="st-row st-export">
      <span className="st-row-icon" aria-hidden="true">
        <Braces size={17} />
      </span>
      <div className="st-row-text">
        <span className="st-row-label">Exportar tudo</span>
        <span className="st-row-hint">
          Estadias, cidades e preferências num arquivo JSON
          {size ? ` · ${size.value} ${size.unit}` : ''}
        </span>
        {state.kind === 'error' && <FieldError message={`Não deu pra exportar: ${state.cause}`} />}
      </div>
      <Button
        icon={Download}
        disabled={state.kind === 'busy'}
        onClick={async () => {
          setState({ kind: 'busy' })
          const result = await exportAll(ctx)
          setState(result.status === 'ok' ? { kind: 'done', bytes: result.bytes } : { kind: 'error', cause: result.cause })
        }}
      >
        {state.kind === 'busy' ? 'Gerando…' : 'Baixar'}
      </Button>
    </Card>
  )
}

function PhotoCards({ api, ctx }: { api: TabContext['api']; ctx: TabContext }) {
  const [stats, setStats] = useState<DataResult<PhotoStats> | null>(null)
  const couple = ctx.data.couple
  useEffect(() => {
    let cancelled = false
    void api.loadPhotoStats(couple).then((r) => {
      if (!cancelled) setStats(r)
    })
    return () => {
      cancelled = true
    }
  }, [api, couple])

  if (stats === null) {
    return (
      <div className="st-metric-cards" aria-busy="true">
        <Card>
          <span className="st-hint">Contando as fotos…</span>
        </Card>
      </div>
    )
  }
  if (stats.status !== 'ok') {
    return <FieldError message={`Não deu pra contar as fotos: ${failureMessage(stats)}`} />
  }
  const used = formatBytes(stats.rows.bytes)
  const quota = formatBytes(STORAGE_QUOTA_BYTES)
  const percent = Math.min(100, (stats.rows.bytes / STORAGE_QUOTA_BYTES) * 100)
  return (
    <div className="st-metric-cards">
      <Card className="st-metric-card">
        <p className="st-row-hint">
          <Images size={14} aria-hidden="true" /> Fotos guardadas
        </p>
        <p className="st-metric-value">
          {formatThousands(stats.rows.count)}
          {stats.rows.truncated ? '+' : ''}
        </p>
        <p className="st-hint">Fotos de perfil e do casal</p>
      </Card>
      <Card className="st-metric-card">
        <p className="st-row-hint">
          <HardDrive size={14} aria-hidden="true" /> Espaço usado pelas fotos
        </p>
        <p className="st-metric-value">
          {used.value} <span>{used.unit}</span>
        </p>
        <p className="st-hint">
          de {quota.value.replace(',0', '')} {quota.unit} disponíveis
        </p>
        <div className="st-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} aria-label="Espaço usado">
          <span style={{ width: `${percent}%` }} />
        </div>
      </Card>
    </div>
  )
}

function Sessions({ api, writes }: TabContext) {
  const [sessions, setSessions] = useState<DataResult<ActiveSession[]> | null>(null)
  const [version, setVersion] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void api.listSessions().then((r) => {
      if (!cancelled) setSessions(r)
    })
    return () => {
      cancelled = true
    }
  }, [api, version])

  return (
    <>
      <div className="st-subhead">
        <h3>Sessões ativas</h3>
        <p className="st-hint">Onde sua conta está aberta agora</p>
      </div>
      <Card className="st-list">
        {sessions === null && <p className="st-hint st-list-empty">Carregando…</p>}
        {sessions && sessions.status !== 'ok' && (
          <FieldError message={`Não deu pra ler as sessões: ${failureMessage(sessions)}`} />
        )}
        {sessions?.status === 'ok' && (
          <ul>
            {sessions.rows.map((s) => {
              const { device, browser } = parseUserAgent(s.userAgent)
              const Icon = device === 'iPhone' || device === 'Android' || device === 'iPad' ? Smartphone : Laptop
              return (
                <li key={s.id} className="st-city-row">
                  <span className="st-row-icon" aria-hidden="true">
                    <Icon size={16} />
                  </span>
                  <div className="st-row-text">
                    <span className="st-row-label">
                      {device} · {browser}
                    </span>
                    <span className="st-row-hint">
                      {s.isCurrent ? 'agora · este aparelho' : `ativa ${ago(s.lastActiveAt, api.now())}`}
                    </span>
                    <FieldError message={writes.error(`session:${s.id}`)} />
                  </div>
                  <Button
                    disabled={writes.pending(`session:${s.id}`)}
                    onClick={() => {
                      if (s.isCurrent) {
                        void api.signOut()
                        return
                      }
                      void writes.run(`session:${s.id}`, async () => {
                        const result = await api.endSession(s.id)
                        if (result.status === 'ended' || result.status === 'not_found') {
                          if (result.status === 'ended') setNotice('Sessão encerrada. O outro aparelho sai em até 1 hora.')
                          setVersion((v) => v + 1)
                          return null
                        }
                        return failureMessage(result)
                      })
                    }}
                  >
                    Encerrar
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
      {notice && (
        <p className="st-ok" role="status">
          {notice}
        </p>
      )}
    </>
  )
}
