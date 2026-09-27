// O portão de sessão e, dentro dele, a casca do app (Fase 3). A tela do
// Calendário ainda é a timeline antiga, sobre localStorage, até a Fase 5.
//
// Spec: .agent/Tasks/fase-1-login.md · .agent/Tasks/fase-3-configuracoes.md

import { AuthGate } from './auth/AuthGate'
import { supabase } from './lib/supabase'
import { Shell } from './app/Shell'
import { listApi } from './list/api'
import { settingsApi } from './settings/api'
import { TimelineScreen } from './timeline/TimelineScreen'

const settings = settingsApi(supabase)
const list = listApi(supabase)

export default function App() {
  return (
    <AuthGate db={supabase}>
      <Shell calendar={<TimelineScreen />} api={settings} listApi={list} />
    </AuthGate>
  )
}
