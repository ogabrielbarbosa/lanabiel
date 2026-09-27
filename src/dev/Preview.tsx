// Harness visual de desenvolvimento — SÓ DEV, nunca vai para o build.
//
// Como usar: `npm run dev` e abra
//
//     http://localhost:5173/viagens?preview
//
// O app sobe com a casca de verdade (`Shell`, a barra lateral) e as Viagens
// servidas por uma `TripsApi` EM MEMÓRIA semeada com o que os frames do
// Pencil mostram (`previewSeed.ts`): sem login e sem nenhuma chamada ao
// Supabase — para comparar a tela lado a lado com o design. Hoje = 25 set
// 2026, quem vê = Gabriel. As escritas funcionam em memória (dá para testar
// os modais na mão) e somem ao recarregar a página.
//
// A flag fica no `sessionStorage` desta aba, então a navegação interna
// (Grade → Detalhe → Calendário) continua no harness. Para sair:
//
//     http://localhost:5173/?preview=off
//
// Quem liga isto é `src/main.tsx`, atrás de `import.meta.env.DEV`, por
// `import()` dinâmico: no build de produção o ramo é código morto e este
// diretório inteiro fica de fora (confira com `grep -r previewSeed dist/`).
//
// Calendário, Lista e Configurações recebem APIs mínimas sobre o MESMO
// estado: as leituras devolvem o seed (ou vazio coerente), e o que não foi
// implementado responde `{ status: 'error' }` — a casca não quebra, mas essas
// telas não são o alvo do harness.
//
// NÃO importe nada de `src/**/test/**` aqui: os falsos e fixtures de teste
// importam `vitest`, que não roda no navegador.

import { Shell } from '../app/Shell'
import type { CalendarApi } from '../calendar/api'
import type { ListApi } from '../list/api'
import type { SettingsApi } from '../settings/api'
import { PATH_URLS, PREVIEW_TODAY, STAYS, eventOf, settingsSeed } from './previewSeed'
import { previewStore, previewTripsApi } from './previewTripsApi'

const UNAVAILABLE = { status: 'error', cause: 'indisponível no preview' } as const

/**
 * `impl` com o resto dos métodos respondendo `UNAVAILABLE` (assíncrono). Só
 * para as APIs das telas que o harness não mira.
 */
function stubApi<T extends object>(impl: Partial<T>): T {
  return new Proxy(impl, {
    get(target, key) {
      if (key in target) return target[key as keyof typeof target]
      // `then` indefinido: o objeto não pode parecer uma promessa.
      if (typeof key === 'symbol' || key === 'then') return undefined
      return () => Promise.resolve(UNAVAILABLE)
    },
  }) as T
}

const store = previewStore()
const tripsApi = previewTripsApi(store)
const context = () => Promise.resolve({ status: 'ok' as const, rows: settingsSeed(STAYS) })
const calCities = (ids: readonly string[]) =>
  Promise.resolve({
    status: 'ok' as const,
    rows: new Map(ids.flatMap((id) => (store.cities.has(id) ? [[id, store.cities.get(id)!] as const] : []))),
  })

const calendarApi = stubApi<CalendarApi>({
  today: () => PREVIEW_TODAY,
  newId: () => crypto.randomUUID(),
  loadContext: context,
  loadCalendar: () =>
    Promise.resolve({
      status: 'ok',
      rows: {
        events: store.trips.map(eventOf),
        listItems: store.listItems.map((i) => ({ id: i.id, name: i.name, category: i.category })),
      },
    }),
  loadCities: calCities,
  loadKisses: () => Promise.resolve({ status: 'ok', rows: new Map() }),
  avatarUrl: () => Promise.resolve(null),
  searchCities: tripsApi.searchCities,
  searchWorldCities: tripsApi.searchWorldCities,
  ensureWorldCity: tripsApi.ensureWorldCity,
})

const listApi = stubApi<ListApi>({
  today: () => PREVIEW_TODAY,
  random: Math.random,
  loadContext: context,
  loadList: () => Promise.resolve({ status: 'ok', rows: { items: structuredClone(store.listItems), memories: [], photos: [] } }),
  loadCitiesByIds: async (ids) => {
    const r = await calCities(ids)
    return {
      status: 'ok',
      rows: new Map([...r.rows].map(([id, c]) => [id, { id, name: c.name, stateCode: c.stateCode, lat: c.lat, lng: c.lng }])),
    }
  },
  signedUrls: (paths) =>
    Promise.resolve({
      status: 'ok',
      rows: new Map(paths.flatMap((p) => (p && PATH_URLS.has(p) ? [[p, PATH_URLS.get(p)!] as const] : []))),
    }),
  avatarUrl: () => Promise.resolve(null),
  searchCities: tripsApi.searchCities,
  calendar: calendarApi,
})

const settingsApi = stubApi<SettingsApi>({
  today: () => PREVIEW_TODAY,
  now: () => Date.now(),
  loadSettings: context,
  loadCalCities: calCities,
  searchCities: tripsApi.searchCities,
  avatarUrl: () => Promise.resolve(null),
  coverUrl: () => Promise.resolve(null),
  loadTrips: tripsApi.loadTrips,
  signOut: () => Promise.resolve(),
  download: () => {},
})

export default function Preview() {
  return (
    <Shell
      calendarApi={calendarApi}
      api={settingsApi}
      listApi={listApi}
      tripsApi={tripsApi}
      // Sem portão de sessão aqui: "mudou de estágio" só volta ao início.
      onStageChanged={() => window.location.assign('/viagens')}
    />
  )
}
