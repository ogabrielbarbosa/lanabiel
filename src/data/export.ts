// "Exportar tudo" (R19): um JSON com o que a sessão lê, montado no navegador.
//
// Spec: .agent/Tasks/fase-3-configuracoes.md, seção 5 ("Formato do export")
//
//       .agent/Tasks/fase-4-lista.md, R27
//       .agent/Tasks/fase-5-calendario.md, R24 e I12
//
// Cidade vai RESOLVIDA (nome, UF, coordenada), não como UUID: o arquivo
// precisa fazer sentido fora do banco. Cada fase que criar tabela acrescenta a
// chave dela e sobe `version`. Nunca leva imagem — só metadados.
//
// `version`:
//   1 — Fase 3: casal, preferências, integrantes, estadias.
//   2 — Fase 4: + `list_items`, `list_memories` e `list_photos` (só a
//       contagem por item). Pessoa vai como `slot` (1 | 2, ou `null` para quem
//       já saiu do casal), nunca como id de perfil; `couple_id` não entra. O
//       `id` do item entra: é o que liga memória e contagem de fotos ao item,
//       e não identifica ninguém — é o nome do item dentro do arquivo.
//   3 — Fase 5: + `calendar_events` e `day_kisses`. O evento não leva o
//       próprio id: quem viaja e quem criou vão como `traveler_slot` e
//       `created_by_slot`; a cidade vai resolvida (nome, UF, região, país); o
//       vínculo com a Lista vai como o NOME do item (`list_item`). O 💋 vai
//       agregado, `[{ day, count }]` — o arquivo é a única saída dele fora da
//       tela do Calendário (I12). As cidades das estadias passam a levar
//       `country_code` e `region`: agora há cidades de fora do Brasil.
//   4 — Fase 6: + `trips` (R28). Cada viagem com o que o evento diz (título,
//       destino resolvido, datas, nota — o evento também está em
//       `calendar_events`) e o que é dela: hospedagem, capa, saídas e
//       memórias por `slot`, títulos dos dias, roteiro (o vínculo com a Lista
//       pelo NOME do item, como no Calendário), preparação, orçamento e as
//       fotos como CAMINHO dentro da pasta do casal (`trip/<uuid>.webp`, sem
//       o `<couple_id>/` da frente). Nenhum id de viagem, de linha ou de
//       perfil; nenhuma imagem.

import type { CalCity } from '../domain/calendar'
import type { Trip } from '../domain/trips'
import type { CalendarExportData } from './calendar'
import type { SettingsData } from './settings'
import type { City } from './cities'
import type { ListExportData } from './listSummary'

export const EXPORT_VERSION = 4

interface ExportCity {
  name: string
  state_code: string | null
  lat: number
  lng: number
}

const city = (c: City): ExportCity => ({ name: c.name, state_code: c.stateCode, lat: c.lat, lng: c.lng })

/** Cidade de estadia e de evento: pode ser de fora do Brasil (Fase 5). */
const calCity = (c: CalCity) => ({ ...city(c), region: c.region, country_code: c.countryCode })

/** `<couple_id>/trip/x.webp` → `trip/x.webp`: o caminho dentro da pasta do casal, sem o id dele. */
const inCoupleFolder = (path: string) => path.slice(path.indexOf('/') + 1)

/**
 * Monta o documento. Estadias, eventos e viagens só trazem `city_id`; a cidade
 * é resolvida por `citiesById`, que a camada de dados preenche com a leitura
 * de `cities` (IBGE e do mundo). Cidade que não resolve é erro — não um buraco
 * silencioso no arquivo. O mesmo vale para o item da Lista de um evento ou de
 * um item de roteiro.
 */
export function buildExport(
  data: SettingsData,
  list: ListExportData,
  calendar: CalendarExportData,
  trips: readonly Trip[],
  citiesById: ReadonlyMap<string, CalCity>,
  exportedAt: string,
): { status: 'ok'; json: string } | { status: 'error'; cause: string } {
  const slotOf = new Map(data.couple.members.map((m) => [m.profileId, m.slot]))
  // Perfil de quem já saiu (ou apagado: `on delete set null`) vira `null`.
  const slot = (profileId: string | null) => (profileId === null ? null : (slotOf.get(profileId) ?? null))
  const stays = []
  for (const stay of data.stays) {
    const c = citiesById.get(stay.cityId)
    if (!c) return { status: 'error', cause: `cidade ${stay.cityId} de uma estadia não foi lida` }
    stays.push({
      // Estadia de quem já saiu do casal não tem slot: vai como null.
      person_slot: slot(stay.profileId),
      city: calCity(c),
      starts_on: stay.startsOn,
      ends_on: stay.endsOn,
    })
  }

  const itemName = new Map(list.items.map((item) => [item.id, item.name]))
  const events = []
  for (const e of calendar.events) {
    let eventCity = null
    if (e.cityId !== null) {
      const c = citiesById.get(e.cityId)
      if (!c) return { status: 'error', cause: `cidade ${e.cityId} de um evento não foi lida` }
      eventCity = calCity(c)
    }
    let listItem = null
    if (e.listItemId !== null) {
      listItem = itemName.get(e.listItemId) ?? null
      if (listItem === null) return { status: 'error', cause: `item ${e.listItemId} de um evento não foi lido` }
    }
    events.push({
      kind: e.kind,
      title: e.title,
      starts_on: e.startsOn,
      ends_on: e.endsOn,
      all_day: e.allDay,
      starts_at: e.startsAt,
      ends_at: e.endsAt,
      travelers: e.travelers,
      traveler_slot: slot(e.travelerId),
      city: eventCity,
      place: e.place,
      repeats_yearly: e.repeatsYearly,
      note: e.note,
      list_item: listItem,
      created_by_slot: slot(e.createdBy),
    })
  }

  const tripDocs = []
  for (const t of trips) {
    const c = citiesById.get(t.cityId)
    if (!c) return { status: 'error', cause: `cidade ${t.cityId} de uma viagem não foi lida` }
    const itinerary = []
    for (const i of t.itinerary) {
      let listItem = null
      if (i.listItemId !== null) {
        listItem = itemName.get(i.listItemId) ?? null
        if (listItem === null) return { status: 'error', cause: `item ${i.listItemId} de um roteiro não foi lido` }
      }
      itinerary.push({ day: i.day, at: i.at, title: i.title, kind: i.kind, note: i.note, list_item: listItem, position: i.position })
    }
    const cover = t.coverPhotoId === null ? null : (t.photos.find((p) => p.id === t.coverPhotoId)?.path ?? null)
    tripDocs.push({
      title: t.title,
      city: calCity(c),
      starts_on: t.startsOn,
      ends_on: t.endsOn,
      note: t.note,
      cover: cover === null ? null : inCoupleFolder(cover),
      lodging: {
        name: t.lodging.name,
        address: t.lodging.address,
        check_in: t.lodging.checkIn,
        check_out: t.lodging.checkOut,
        url: t.lodging.url,
        code: t.lodging.code,
        cents: t.lodging.cents,
        paid: t.lodging.paid,
      },
      departures: t.departures.map((d) => ({ slot: slot(d.profileId), origin_code: d.originCode, note: d.note })),
      days: t.days.map((d) => ({ day: d.day, title: d.title })),
      itinerary,
      prep: t.prep.map((p) => ({ kind: p.kind, label: p.label, detail: p.detail, done: p.done, position: p.position })),
      budget: t.budget.map((b) => ({
        label: b.label,
        planned_cents: b.plannedCents,
        spent_cents: b.spentCents,
        position: b.position,
      })),
      memories: t.memories.map((m) => ({ slot: slot(m.profileId), rating: m.rating, body: m.body, written_on: m.writtenOn })),
      photos: t.photos.map((p) => ({
        path: inCoupleFolder(p.path),
        taken_on: p.takenOn,
        caption: p.caption,
        favorite: p.favorite,
        added_by_slot: slot(p.addedBy),
        created_at: p.createdAt,
      })),
    })
  }

  const document = {
    version: EXPORT_VERSION,
    exported_at: exportedAt,
    couple: {
      name: data.couple.name,
      started_on: data.couple.startedOn,
      settings: data.coupleSettings,
      saved_cities: data.savedCities.map((c) => ({ ...city(c), country_code: c.countryCode })),
    },
    members: data.couple.members.map((m) => ({
      slot: m.slot,
      display_name: m.displayName,
      full_name: m.fullName,
      color: m.color,
      joined_at: m.joinedAt,
      home_city: city(m.homeCity),
    })),
    my_settings: data.profileSettings,
    stays,
    list_items: list.items.map((item) => ({
      id: item.id,
      category: item.category,
      name: item.name,
      note: item.note,
      link: item.link,
      featured: item.featured,
      place: item.place
        ? {
            address: item.place.address,
            city: item.place.city,
            state: item.place.state,
            country: item.place.country,
            country_code: item.place.countryCode,
            lat: item.place.lat,
            lng: item.place.lng,
          }
        : null,
      region: item.region,
      venue: item.venue,
      highlights: item.highlights,
      platform: item.platform,
      seasons: item.seasons,
      // A foto do item existe ou não; o caminho no Storage não sai daqui.
      has_photo: item.photoPath !== null,
      status: item.status,
      rating: item.rating,
      added_by_slot: slot(item.addedBy),
      created_at: item.createdAt,
      done_on: item.doneOn,
      done_with: item.doneWith,
      done_solo_by_slot: slot(item.doneSoloBy),
    })),
    list_memories: list.memories.map((m) => ({
      item: m.itemId,
      slot: slot(m.profileId),
      body: m.body,
      created_at: m.createdAt,
      updated_at: m.updatedAt,
    })),
    list_photos: list.items
      .filter((item) => (list.photoCounts.get(item.id) ?? 0) > 0)
      .map((item) => ({ item: item.id, count: list.photoCounts.get(item.id)! })),
    calendar_events: events,
    day_kisses: calendar.kisses.map((k) => ({ day: k.day, count: k.count })),
    trips: tripDocs,
  }
  return { status: 'ok', json: JSON.stringify(document, null, 2) }
}
