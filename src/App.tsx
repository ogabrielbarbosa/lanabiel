// O portão de sessão e, dentro dele, a casca do app (Fase 3). O Calendário
// desenhado (Fase 5) substituiu a timeline antiga sobre localStorage.
//
// Spec: .agent/Tasks/fase-1-login.md · .agent/Tasks/fase-3-configuracoes.md ·
//       .agent/Tasks/fase-5-calendario.md (R1, R2)

import { AuthGate } from './auth/AuthGate'
import { supabase } from './lib/supabase'
import { Shell } from './app/Shell'
import { calendarApi } from './calendar/api'
import { listApi } from './list/api'
import { settingsApi } from './settings/api'

const settings = settingsApi(supabase)
const list = listApi(supabase)
const calendar = calendarApi(supabase)

// R2: a timeline antiga guardava as estadias em `lanabiel:stays:v1`, neste
// navegador. Nada dela é importado (spec, seção 13, decisão 4); a chave sai
// para não ficar um dado órfão que ninguém lê.
try {
  localStorage.removeItem('lanabiel:stays:v1')
} catch {
  // localStorage indisponível (aba anônima, bloqueio): não há o que limpar.
}

export default function App() {
  return (
    <AuthGate db={supabase}>
      <Shell calendarApi={calendar} api={settings} listApi={list} />
    </AuthGate>
  )
}
