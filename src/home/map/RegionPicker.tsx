// Os seletores do breadcrumb: países (R8, sem frame — o visual do de estados),
// estados do Brasil (`j32cy`) e cidades (`saMmF`), com `Region Item` (LptF9).
//
// Spec: .agent/Tasks/fase-7-mapa.md — R8, R9, I4, I9, seção 8 (`search_cities`)
//
// As linhas e as contagens são `regionRows` sobre os pins JÁ FILTRADOS (R12:
// os filtros valem para as contagens dos seletores). _"Ver cidades sem
// lugares"_ troca a lista pela busca de municípios do IBGE (`searchCities`,
// por nome) restrita à UF em foco, com o debounce do `CityPicker`.

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ChevronRight, Search } from 'lucide-react'
import { CITY_DEBOUNCE_MS, IBGE_MIN_QUERY } from '../../calendar/cityChoice'
import type { City } from '../../data/cities'
import type { CalCity } from '../../domain/calendar'
import { BR_STATES, cityCode, cityKeyOf, countryName, normalizeName, regionRows, regionsWithPlaces } from '../../domain/map'
import type { FocusPath, Pin, RegionRow } from '../../domain/map'
import type { HomeApi } from '../api'
import type { PickerLevel } from './useMapNav'

/** As 7 de maior contagem antes de _"Ver os 27 estados"_ (`j32cy`). */
const TOP_STATES = 7

export interface RegionPickerProps {
  level: PickerLevel
  path: FocusPath
  /** Os pins sob os filtros (R12). */
  pins: readonly Pin[]
  searchCities: HomeApi['searchCities']
  onChoose: (level: PickerLevel, row: RegionRow) => void
  onChooseCity: (city: CalCity) => void
}

function titleOf(level: PickerLevel, path: FocusPath): string {
  if (level === 'world') return 'Países'
  if (level === 'country' && path.countryCode === 'BR') return 'Estados do Brasil'
  if (level === 'state' && path.uf) return `Cidades em ${BR_STATES[path.uf].name}`
  return `Cidades em ${countryName(path.countryCode ?? '')}`
}

function searchLabel(level: PickerLevel, path: FocusPath): string {
  if (level === 'world') return 'Buscar país'
  if (level === 'country' && path.countryCode === 'BR') return 'Buscar estado'
  return 'Buscar cidade'
}

/** A chave em foco no seletor (a linha destacada — R9). */
function focusKey(level: PickerLevel, path: FocusPath): string | null {
  if (level === 'world') return path.countryCode
  if (level === 'country' && path.countryCode === 'BR') return path.uf
  return path.cityKey
}

const matches = (row: RegionRow, q: string) => {
  const n = normalizeName(q)
  return normalizeName(row.name).includes(n) || row.code.toLowerCase() === n
}

export function RegionPicker({ level, path, pins, searchCities, onChoose, onChooseCity }: RegionPickerProps) {
  const [query, setQuery] = useState('')
  const [allStates, setAllStates] = useState(false)
  const [ibge, setIbge] = useState(false)
  const isStates = level === 'country' && path.countryCode === 'BR'
  const canIbge = level === 'state' && path.uf !== null
  const title = titleOf(level, path)
  const q = query.trim()

  // Buscando estado: os 27, para chegar também aos sem lugar.
  const all = regionRows(pins, level, path, { allStates: isStates && (allStates || q !== '') })
  const withPlaces = regionsWithPlaces(regionRows(pins, level, path))
  const filtered = q === '' ? all : all.filter((r) => matches(r, q))
  const rows = isStates && !allStates && q === '' ? filtered.slice(0, TOP_STATES) : filtered
  const focus = focusKey(level, path)

  return (
    <div className="hm-picker" role="dialog" aria-label={title}>
      <div className="hm-picker-head">
        <p className="hm-picker-title">{title}</p>
        <p className="hm-picker-meta">{withPlaces} com lugares</p>
      </div>
      {ibge && path.uf ? (
        <IbgeSearch uf={path.uf} focus={focus} counts={all} searchCities={searchCities} onChooseCity={onChooseCity} />
      ) : (
        <>
          <label className="hm-picker-search">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder={searchLabel(level, path)}
              aria-label={searchLabel(level, path)}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="hm-picker-list">
            {rows.map((row) => (
              <RegionItem key={row.key} row={row} active={row.key === focus} onClick={() => onChoose(level, row)} />
            ))}
            {rows.length === 0 && <p className="hm-picker-empty">{q === '' ? 'Nenhum lugar por aqui.' : 'Nada com esse nome.'}</p>}
          </div>
        </>
      )}
      {isStates && !allStates && q === '' && (
        <button type="button" className="hm-picker-foot" onClick={() => setAllStates(true)}>
          Ver os 27 estados
          <ArrowRight size={12} aria-hidden="true" />
        </button>
      )}
      {canIbge && (
        <button type="button" className="hm-picker-foot" onClick={() => setIbge(!ibge)}>
          {ibge ? 'Ver cidades com lugares' : 'Ver cidades sem lugares'}
          <ArrowRight size={12} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

/** `Region Item` (LptF9): selo, nome, contagem e a seta. */
function RegionItem({ row, active, onClick }: { row: RegionRow; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`hm-region${active ? ' is-active' : ''}`} aria-current={active || undefined} onClick={onClick}>
      <span className="hm-region-code">{row.code}</span>
      <span className="hm-region-name">{row.name}</span>
      <span className="hm-region-count">{row.count}</span>
      <ChevronRight size={14} aria-hidden="true" />
    </button>
  )
}

type Landed = { query: string; rows: City[] | null }

/** _"Ver cidades sem lugares"_: os municípios do IBGE da UF, pelo nome (R9). */
function IbgeSearch({
  uf,
  focus,
  counts,
  searchCities,
  onChooseCity,
}: {
  uf: string
  focus: string | null
  counts: readonly RegionRow[]
  searchCities: HomeApi['searchCities']
  onChooseCity: (city: CalCity) => void
}) {
  const [query, setQuery] = useState('')
  const [landed, setLanded] = useState<Landed | null>(null)
  const seq = useRef(0)
  const q = query.trim()

  useEffect(() => {
    if (q.length < IBGE_MIN_QUERY) return
    const timer = setTimeout(() => {
      const mine = ++seq.current
      void searchCities(q).then((result) => {
        if (mine !== seq.current) return
        setLanded({ query: q, rows: result.status === 'ok' ? result.rows : null })
      })
    }, CITY_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [q, searchCities])

  const now = q.length >= IBGE_MIN_QUERY && landed?.query === q ? landed : null
  const found = now?.rows?.filter((c) => c.stateCode === uf) ?? []
  const countOf = new Map(counts.map((r) => [r.key, r.count]))

  return (
    <>
      <label className="hm-picker-search">
        <Search size={14} aria-hidden="true" />
        <input
          type="search"
          value={query}
          placeholder="Buscar cidade"
          aria-label="Buscar cidade"
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </label>
      <div className="hm-picker-list" aria-live="polite">
        {q.length < IBGE_MIN_QUERY ? (
          <p className="hm-picker-empty">Digite o nome da cidade.</p>
        ) : now === null ? (
          <p className="hm-picker-empty">Buscando…</p>
        ) : now.rows === null ? (
          <p className="hm-picker-empty">Não deu para buscar agora.</p>
        ) : found.length === 0 ? (
          <p className="hm-picker-empty">Nenhuma cidade com esse nome.</p>
        ) : (
          found.map((c) => {
            const key = cityKeyOf('BR', uf, c.name)
            const row: RegionRow = { key, code: cityCode(c.name), name: c.name, count: countOf.get(key) ?? 0 }
            return (
              <RegionItem
                key={c.id}
                row={row}
                active={key === focus}
                onClick={() => onChooseCity({ ...c, countryCode: 'BR', region: null })}
              />
            )
          })
        )}
      </div>
    </>
  )
}
