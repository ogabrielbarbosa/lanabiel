// Os seletores do breadcrumb: países (R8, sem frame — o visual do de estados),
// estados do Brasil (`j32cy`) e cidades (`saMmF`), com `Region Item` (LptF9).
//
// Spec: .agent/Tasks/fase-7-mapa.md — R8, R9, I4, I9
//
// Cada seletor mostra TUDO de uma vez: os países do ISO, as 27 UFs e, num
// estado, todos os municípios do IBGE (`stateCities`). As contagens são
// `regionRows` sobre os pins JÁ FILTRADOS (R12: os filtros valem para as
// contagens dos seletores); os com lugar vêm primeiro, e a busca só filtra a
// lista que já está na tela.

import { useEffect, useState } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import type { City } from '../../data/cities'
import type { DataResult } from '../../data/result'
import type { CalCity } from '../../domain/calendar'
import { BR_STATES, cityKeyOf, countryName, normalizeName, regionRows, regionsWithPlaces } from '../../domain/map'
import type { FocusPath, Pin, RegionRow } from '../../domain/map'
import type { HomeApi } from '../api'
import type { PickerLevel } from './useMapNav'

export interface RegionPickerProps {
  level: PickerLevel
  path: FocusPath
  /** Os pins sob os filtros (R12). */
  pins: readonly Pin[]
  stateCities: HomeApi['stateCities']
  onChoose: (level: PickerLevel, row: RegionRow) => void
  onChooseCity: (city: CalCity) => void
  /** Fechando: ainda na tela enquanto a silhueta recolhe, mas fora de alcance. */
  inert?: boolean
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

/** Os municípios da UF em foco, lidos ao abrir o seletor de um estado. */
function useStateCities(uf: string | null, stateCities: HomeApi['stateCities']) {
  const [landed, setLanded] = useState<{ uf: string; result: DataResult<City[]> } | null>(null)
  useEffect(() => {
    if (!uf) return
    let live = true
    void stateCities(uf).then((result) => {
      if (live) setLanded({ uf, result })
    })
    return () => {
      live = false
    }
  }, [uf, stateCities])
  return uf && landed?.uf === uf ? landed.result : null
}

export function RegionPicker({ level, path, pins, stateCities, onChoose, onChooseCity, inert }: RegionPickerProps) {
  const [query, setQuery] = useState('')
  const ibgeUf = level === 'state' && path.countryCode === 'BR' ? path.uf : null
  const loaded = useStateCities(ibgeUf, stateCities)
  const cities = loaded?.status === 'ok' ? loaded.rows : []
  const title = titleOf(level, path)
  const q = query.trim()
  const loading = ibgeUf !== null && loaded === null

  const all = regionRows(pins, level, path, cities)
  const rows = q === '' ? all : all.filter((r) => matches(r, q))
  const focus = focusKey(level, path)
  const ibgeByKey = new Map(cities.map((c) => [cityKeyOf('BR', ibgeUf, c.name), c]))

  function choose(row: RegionRow) {
    const city = ibgeByKey.get(row.key)
    if (city) onChooseCity({ ...city, countryCode: 'BR', region: null })
    else onChoose(level, row)
  }

  return (
    <div className="hm-picker" role="dialog" aria-label={title} inert={inert} aria-hidden={inert || undefined}>
      <div className="hm-picker-head">
        <p className="hm-picker-title">{title}</p>
        <p className="hm-picker-meta">{regionsWithPlaces(all)} com lugares</p>
      </div>
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
          <RegionItem key={row.key} row={row} active={row.key === focus} onClick={() => choose(row)} />
        ))}
        {rows.length === 0 && !loading && <p className="hm-picker-empty">{q === '' ? 'Nenhum lugar por aqui.' : 'Nada com esse nome.'}</p>}
        {loading && <p className="hm-picker-empty">Carregando as cidades…</p>}
        {loaded && loaded.status !== 'ok' && <p className="hm-picker-empty">Não deu para carregar as outras cidades.</p>}
      </div>
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
