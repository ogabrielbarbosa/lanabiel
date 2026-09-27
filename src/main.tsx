import { StrictMode } from 'react'
import type { ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const root = createRoot(document.getElementById('root')!)

function render(Root: ComponentType) {
  root.render(
    <StrictMode>
      <Root />
    </StrictMode>,
  )
}

// Harness visual (só DEV): `?preview` liga, `?preview=off` desliga, e a flag
// fica no `sessionStorage` da aba para sobreviver à navegação interna. Ver
// `src/dev/Preview.tsx`. No build, `import.meta.env.DEV` é `false` e o ramo
// inteiro (com o `import()`) sai como código morto.
if (import.meta.env.DEV && previewWanted()) {
  void import('./dev/Preview').then((m) => render(m.default))
} else {
  render(App)
}

function previewWanted(): boolean {
  const key = '__lanabiel_preview'
  const flag = new URLSearchParams(window.location.search).get('preview')
  try {
    if (flag === 'off') {
      sessionStorage.removeItem(key)
      return false
    }
    if (flag !== null) sessionStorage.setItem(key, '1')
    return sessionStorage.getItem(key) === '1'
  } catch {
    // sessionStorage bloqueado: vale só o que está na URL.
    return flag !== null && flag !== 'off'
  }
}
