// `Breadcrumb` (RrNiQ, e `/ Estados` OspYO, `/ Cidades` XXySj): o globo e os
// segmentos do caminho em foco; o ativo é o nível da câmera. O seletor aberto
// pende do segmento dele, numa silhueta só com a barra — desenhada por
// `CrumbShape` com as medidas do DOM (crumbShape.ts) e animada por
// `useCrumbSilhouette`: abre a partir do segmento, fecha de volta nele e
// passa de um seletor ao outro. O que fecha segue montado (inerte, com o
// caminho de quando fechou) até a forma recolher.
//
// Spec: .agent/Tasks/fase-7-mapa.md — R6, R7, R8, R9

import { Fragment, useCallback, useId, useRef, useState } from 'react'
import { ChevronRight, Globe } from 'lucide-react'
import { BR_STATES, countryName, levelsOf } from '../../domain/map'
import type { FocusPath, MapLevel, Pin } from '../../domain/map'
import type { RegionPickerProps } from './RegionPicker'
import { RegionPicker } from './RegionPicker'
import type { Silhouette } from './useCrumbSilhouette'
import { useCrumbSilhouette } from './useCrumbSilhouette'
import type { MapNav, PickerLevel } from './useMapNav'

function labelOf(level: MapLevel, path: FocusPath): string {
  if (level === 'world') return 'Mundo'
  if (level === 'country') return countryName(path.countryCode ?? '')
  if (level === 'state') return path.uf ? BR_STATES[path.uf].name : ''
  return path.cityName ?? ''
}

export function Breadcrumb({
  nav,
  pins,
  stateCities,
}: {
  nav: MapNav
  pins: readonly Pin[]
  stateCities: RegionPickerProps['stateCities']
}) {
  const { level, path, picker } = nav.state
  const levels = levelsOf(path)
  const navRef = useRef<HTMLElement>(null)

  // O seletor que acabou de fechar, com o caminho daquele momento: escolher
  // uma linha fecha E muda o caminho, e o conteúdo não deve trocar enquanto some.
  const [prevPicker, setPrevPicker] = useState(picker)
  const [leaving, setLeaving] = useState<{ level: PickerLevel; path: FocusPath } | null>(null)
  const [prevPath, setPrevPath] = useState(path)
  if (picker !== prevPicker || path !== prevPath) {
    setPrevPicker(picker)
    setPrevPath(path)
    if (picker !== prevPicker) setLeaving(picker === null && prevPicker !== null ? { level: prevPicker, path: prevPath } : null)
  }
  const clearLeaving = useCallback(() => setLeaving(null), [])

  const shown = picker !== null ? { level: picker, path } : leaving
  const shownKey = shown && `${shown.level}:${shown.path.countryCode}:${shown.path.uf}`
  const shape = useCrumbSilhouette(navRef, shownKey && `${picker === null ? 'out' : 'in'}:${shownKey}`, picker === null, clearLeaving)

  return (
    <nav ref={navRef} className={`hm-crumbs lg${shape ? ' is-joined' : ''}`} aria-label="Onde o mapa está">
      {shape && <CrumbShape {...shape} />}
      <button type="button" className="hm-crumbs-globe" aria-label="Voltar ao globo" onClick={nav.goWorld}>
        <Globe size={15} aria-hidden="true" />
      </button>
      {levels.map((l, i) => {
        const active = l === level
        return (
          <Fragment key={l}>
            {i > 0 && <ChevronRight className="hm-crumb-sep" size={12} aria-hidden="true" />}
            <span className={`hm-crumb-slot${picker === null && shown?.level === l ? ' is-leaving' : ''}`}>
              <button
                type="button"
                className={`hm-crumb${active ? ' is-active' : ''}${picker === l ? ' is-open' : ''}`}
                aria-current={active ? 'location' : undefined}
                aria-expanded={l === 'city' ? undefined : picker === l}
                onClick={() => nav.tapSegment(l)}
              >
                {labelOf(l, path)}
              </button>
              {shown?.level === l && (
                <RegionPicker
                  key={shownKey}
                  level={l}
                  path={shown.path}
                  inert={picker === null}
                  pins={pins}
                  stateCities={stateCities}
                  onChoose={nav.choose}
                  onChooseCity={nav.chooseCity}
                />
              )}
            </span>
          </Fragment>
        )
      })}
    </nav>
  )
}

/**
 * A silhueta em três camadas, como o `Silhouette` do `.pen`: a sombra (só por
 * fora — por dentro o vidro a desfocaria junto), o vidro (desfoque +
 * preenchimento, recortado pelo path) e o contorno em degradê com o brilho de
 * 1px em cima, ambos por dentro da forma.
 */
function CrumbShape({ d, left, width, height }: Silhouette) {
  // `url(#…)` não aceita os caracteres do `useId` (« »).
  const id = `crumb${useId().replace(/[^\w-]/g, '')}`
  const box = { width, height, viewBox: `0 0 ${width} ${height}` }
  return (
    <span className="hm-crumbs-shape" style={{ left: left - 1, width, height }} aria-hidden="true">
      <svg className="hm-crumbs-shape-layer" {...box} overflow="visible">
        <defs>
          <mask id={`${id}o`} maskUnits="userSpaceOnUse" x={-80} y={-80} width={width + 160} height={height + 160}>
            <rect x={-80} y={-80} width={width + 160} height={height + 160} fill="#fff" />
            <path d={d} fill="#000" />
          </mask>
          <filter id={`${id}s`} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx={0} dy={18} stdDeviation={24} floodColor="#020514" floodOpacity={0.5} />
          </filter>
        </defs>
        <g mask={`url(#${id}o)`}>
          <path d={d} filter={`url(#${id}s)`} />
        </g>
      </svg>
      <span className="hm-crumbs-shape-glass" style={{ clipPath: `path('${d}')` }} />
      <svg className="hm-crumbs-shape-layer" {...box}>
        <defs>
          <clipPath id={`${id}c`}>
            <path d={d} />
          </clipPath>
          <mask id={`${id}t`} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
            <rect width={width} height={height} fill="#fff" />
            <path d={d} fill="#000" transform="translate(0 1)" />
          </mask>
          <linearGradient id={`${id}e`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity={0.25} />
            <stop offset="0.45" stopColor="#fff" stopOpacity={0.08} />
            <stop offset="1" stopColor="#fff" stopOpacity={0.22} />
          </linearGradient>
        </defs>
        <g clipPath={`url(#${id}c)`}>
          <rect width={width} height={height} fill="#fff" fillOpacity={0.25} mask={`url(#${id}t)`} />
          <path d={d} fill="none" stroke={`url(#${id}e)`} strokeWidth={2} />
        </g>
      </svg>
    </span>
  )
}
