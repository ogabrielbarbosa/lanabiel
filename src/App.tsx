// O portão de sessão é tudo que vive aqui. A tela de hoje mudou para
// `timeline/TimelineScreen.tsx` na Fase 1, sem mudar de conteúdo.
//
// Spec: .agent/Tasks/fase-1-login.md

import { AuthGate } from './auth/AuthGate'
import { supabase } from './lib/supabase'
import { TimelineScreen } from './timeline/TimelineScreen'

export default function App() {
  return (
    <AuthGate db={supabase}>
      <TimelineScreen />
    </AuthGate>
  )
}
