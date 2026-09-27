// A área do mapa quando a engine não montou (seção 7): o resto da tela segue.

import type { MapFailureReason } from './engine'

export function MapFailed({ reason, onRetry }: { reason: MapFailureReason; onRetry: () => void }) {
  return (
    <div className="map-failed" role="status">
      <p>O mapa não carregou.</p>
      {/* Sem WebGL, tentar de novo não adianta (seção 7). */}
      {reason !== 'no_webgl' && (
        <button type="button" className="map-failed-retry" onClick={onRetry}>
          Tentar de novo
        </button>
      )}
    </div>
  )
}
