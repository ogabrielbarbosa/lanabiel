// Assistentes (ADR 0031): o link do servidor MCP para colar no Claude, como
// conectar, e quem está conectado. Não está no .pen; segue as outras abas.

import { useEffect, useState } from 'react'
import { Bot, Check, Copy, Link2 } from 'lucide-react'
import { ago } from '../../onboarding/format'
import { MCP_URL } from '../../data/assistants'
import type { ConnectedAssistant } from '../../data/assistants'
import type { DataResult } from '../../data/result'
import { Button, Card, FieldError } from '../parts'
import { failureMessage } from '../context'
import type { TabContext } from '../context'

export function AssistantsTab(ctx: TabContext) {
  return (
    <div className="st-stack">
      <LinkCard />
      <div className="st-subhead">
        <h3>Como conectar</h3>
      </div>
      <Card>
        <ol className="st-steps">
          <li>Copie o link acima.</li>
          <li>
            No Claude, abra <b>Configurações › Conectores</b> e escolha <b>Adicionar conector personalizado</b>.
          </li>
          <li>Cole o link, dê o nome lanabiel e salve.</li>
          <li>
            O Claude abre uma página do lanabiel pedindo acesso. Entre com a sua conta e toque em <b>Permitir</b>.
          </li>
        </ol>
        <p className="st-hint st-steps-foot">
          Cada um conecta com a própria conta. Depois é só mandar um link de Reel, TikTok ou site e pedir pra pôr na
          Lista.
        </p>
      </Card>
      <Connected {...ctx} />
    </div>
  )
}

function LinkCard() {
  const [copied, setCopied] = useState<boolean | null>(null)
  return (
    <Card className="st-row">
      <span className="st-row-icon" aria-hidden="true">
        <Link2 size={17} />
      </span>
      <div className="st-row-text">
        <span className="st-row-label">Link do conector</span>
        <code className="st-mcp-url">{MCP_URL}</code>
        {copied === false && <FieldError message="Não deu pra copiar. Selecione o link e copie à mão." />}
      </div>
      <Button
        icon={copied ? Check : Copy}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(MCP_URL)
            setCopied(true)
          } catch {
            setCopied(false)
          }
        }}
      >
        {copied ? 'Copiado' : 'Copiar'}
      </Button>
    </Card>
  )
}

function Connected({ api, writes }: TabContext) {
  const [list, setList] = useState<DataResult<ConnectedAssistant[]> | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    void api.listAssistants().then((r) => {
      if (!cancelled) setList(r)
    })
    return () => {
      cancelled = true
    }
  }, [api, version])

  return (
    <>
      <div className="st-subhead">
        <h3>Conectados</h3>
      </div>
      <Card className="st-list">
        {list === null && <p className="st-hint st-list-empty">Carregando…</p>}
        {list && list.status !== 'ok' && <FieldError message={`Não deu pra ler os assistentes: ${failureMessage(list)}`} />}
        {list?.status === 'ok' && list.rows.length === 0 && (
          <p className="st-hint st-list-empty">Nenhum assistente conectado à sua conta.</p>
        )}
        {list?.status === 'ok' && list.rows.length > 0 && (
          <ul>
            {list.rows.map((a) => (
              <li key={a.clientId} className="st-city-row">
                <span className="st-row-icon" aria-hidden="true">
                  <Bot size={16} />
                </span>
                <div className="st-row-text">
                  <span className="st-row-label">{a.name}</span>
                  <span className="st-row-hint">conectado {ago(a.grantedAt, api.now())}</span>
                  <FieldError message={writes.error(`assistant:${a.clientId}`)} />
                </div>
                <Button
                  disabled={writes.pending(`assistant:${a.clientId}`)}
                  onClick={() => {
                    void writes.run(`assistant:${a.clientId}`, async () => {
                      const result = await api.disconnectAssistant(a.clientId)
                      if (result.status !== 'ok') return failureMessage(result)
                      setVersion((v) => v + 1)
                      return null
                    })
                  }}
                >
                  Desconectar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
