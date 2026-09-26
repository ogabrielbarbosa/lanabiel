// O contrato entre a tela das Configurações e as abas: metadados das abas, o
// registro de escritas, e o contexto que cada aba recebe.
//
// Spec: .agent/Tasks/fase-3-configuracoes.md, R3 e R24

import { useCallback, useState } from 'react'
import {
  Bell,
  CalendarHeart,
  Heart,
  ListChecks,
  MapPin,
  Palette,
  ShieldCheck,
  TriangleAlert,
  UserRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { SettingsData, SettingsMember } from '../data/settings'
import type { SettingsTab } from '../domain/settings'
import type { AppearanceControl } from '../app/useAppearance'
import type { SettingsApi } from './api'

export const TAB_META: Record<SettingsTab, { label: string; icon: LucideIcon; lead: string }> = {
  'perfil-do-casal': { label: 'Perfil do casal', icon: Heart, lead: 'O que aparece pros dois no topo do app e no contador da Home.' },
  'meu-perfil': { label: 'Meu perfil', icon: UserRound, lead: 'Só você vê e edita isto.' },
  cidades: { label: 'Cidades', icon: MapPin, lead: 'Onde cada um mora define se um dia conta como juntos em casa ou viajando.' },
  calendario: { label: 'Calendário', icon: CalendarHeart, lead: 'Como o mês aparece.' },
  lista: { label: 'Lista', icon: ListChecks, lead: 'Como a lista aparece e o que o app sugere.' },
  notificacoes: { label: 'Notificações', icon: Bell, lead: 'Quem é avisado, de quê, e por onde.' },
  aparencia: { label: 'Aparência', icon: Palette, lead: 'Como o app se parece.' },
  'dados-e-privacidade': { label: 'Dados e privacidade', icon: ShieldCheck, lead: 'O que existe e quem alcança.' },
  'zona-sensivel': { label: 'Zona sensível', icon: TriangleAlert, lead: 'Coisas que não dá pra desfazer.' },
}

/** Mensagem de uma falha de escrita, para mostrar junto do controle. */
export function failureMessage(result: { status: 'unauthenticated' } | { status: 'error'; cause: string }): string {
  return result.status === 'unauthenticated' ? 'Sua sessão expirou — entre de novo.' : result.cause
}

/** Escritas em voo e erros, por chave de controle. */
export interface Writes {
  pending: (key: string) => boolean
  error: (key: string) => string | null
  /**
   * Roda a escrita. `action` devolve `null` no sucesso (e já aplicou o dado
   * gravado) ou a mensagem de erro. Enquanto roda, o controle fica desabilitado.
   */
  run: (key: string, action: () => Promise<string | null>) => Promise<boolean>
}

export function useWrites(): Writes {
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({})

  const run = useCallback(async (key: string, action: () => Promise<string | null>) => {
    setPending((p) => new Set(p).add(key))
    setErrors((e) => {
      const { [key]: _removed, ...rest } = e
      return rest
    })
    let message: string | null
    try {
      message = await action()
    } catch (error) {
      // Exceção (redutor de imagem, fetch que lança) não pode deixar o
      // controle travado em "pendente" para sempre.
      message = error instanceof Error ? error.message : String(error)
    } finally {
      setPending((p) => {
        const next = new Set(p)
        next.delete(key)
        return next
      })
    }
    if (message) setErrors((e) => ({ ...e, [key]: message }))
    return message === null
  }, [])

  return {
    pending: (key) => pending.has(key),
    error: (key) => errors[key] ?? null,
    run,
  }
}

export interface TabContext {
  data: SettingsData
  api: SettingsApi
  me: SettingsMember
  partner: SettingsMember | null
  today: string
  writes: Writes
  /** Aplica o que o banco devolveu. */
  update: (fn: (data: SettingsData) => SettingsData) => void
  /** Relê tudo — depois de um conflito ("este espaço mudou"). */
  reload: () => void
  urls: { avatar: (profileId: string) => string | null; cover: string | null }
  refreshUrls: () => void
  appearance: AppearanceControl
  /** A conta mudou de estágio (saiu, apagou): o portão precisa reavaliar. */
  onStageChanged: () => void
}

