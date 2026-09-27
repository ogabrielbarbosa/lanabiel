// A receita visual do mapa (R5): o que faz o satélite chegar perto do `.pen`.
//
// Spec: .agent/Tasks/fase-7-mapa.md, R5 e risco 1 · ledger, T1
// ADR:  .agent/Decisions/0022-engine-do-mapa-mapbox.md
//
// Duas receitas, e a escolha é do Gabriel olhando lado a lado com `eocRt` e
// `XwYKK` (A1). Até lá vale `DEFAULT_RECIPE`; em DEV, `?receita=custom` troca.
//
// - `standard`: o Mapbox Standard Satellite, com luz de entardecer (cidades
//   acesas, o brilho de SJC no zoom) e a névoa/atmosfera do próprio estilo.
// - `custom`: estilo próprio sobre o raster `mapbox.satellite`, com saturação e
//   contraste puxados (o verde e o turquesa do `.pen`), terreno do
//   `mapbox-terrain-dem-v1` e névoa com as cores do halo do globo.

export type Recipe = 'standard' | 'custom'
export const DEFAULT_RECIPE: Recipe = 'standard'

/** O halo do globo no `.pen`: verde-água por dentro, rosado na borda, espaço escuro. */
export const FOG = {
  color: 'rgb(186, 226, 214)',
  'high-color': 'rgb(122, 182, 196)',
  'horizon-blend': 0.08,
  'space-color': 'rgb(9, 13, 24)',
  'star-intensity': 0.25,
} as const

export const TERRAIN_EXAGGERATION = 1.6

export const STANDARD = {
  style: 'mapbox://styles/mapbox/standard-satellite',
  config: { lightPreset: 'dusk', showPointOfInterestLabels: false, showTransitLabels: false, showRoadLabels: false, showPlaceLabels: false },
} as const

export const CUSTOM_RASTER = {
  saturation: 0.45,
  contrast: 0.18,
  brightnessMin: 0.04,
  brightnessMax: 1,
} as const

export function recipeFromUrl(search: string): Recipe {
  const value = new URLSearchParams(search).get('receita')
  return value === 'custom' || value === 'standard' ? value : DEFAULT_RECIPE
}
