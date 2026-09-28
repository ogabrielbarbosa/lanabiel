// A marca do app: o mesmo coração do favicon (public/favicon.svg), no topo da
// barra lateral. Mudou um, mude o outro.
export function Logo() {
  return (
    <span className="shell-logo" role="img" aria-label="lanabiel">
      <svg viewBox="0 0 64 64" width="40" height="40" aria-hidden="true">
        <defs>
          <linearGradient id="shell-logo-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7fd8c4" />
            <stop offset="1" stopColor="#f4a3b4" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="url(#shell-logo-bg)" />
        <path
          fill="#fff"
          d="M32 51C18 42 11 34 11 25.5 11 19.2 15.8 14.5 21.8 14.5c4.2 0 7.9 2.3 10.2 6 2.3-3.7 6-6 10.2-6 6 0 10.8 4.7 10.8 11 0 8.5-7 16.5-21 25.5z"
        />
      </svg>
    </span>
  )
}
