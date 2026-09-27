// "Exportar tudo" (R19): um JSON com o que a sessão lê, montado no navegador.
//
// Spec: .agent/Tasks/fase-3-configuracoes.md, seção 5 ("Formato do export")
//
//       .agent/Tasks/fase-4-lista.md, R27
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

import type { SettingsData } from './settings'
import type { City } from './cities'
import type { ListExportData } from './listSummary'

export const EXPORT_VERSION = 2

interface ExportCity {
  name: string
  state_code: string | null
  lat: number
  lng: number
}

const city = (c: City): ExportCity => ({ name: c.name, state_code: c.stateCode, lat: c.lat, lng: c.lng })

/**
 * Monta o documento. As estadias só trazem `city_id`; a cidade é resolvida
 * pelo que a tela já tem (casas e cidades salvas) mais `resolveCity`, que a
 * camada de dados preenche com a leitura de `cities`. Cidade que não resolve
 * é erro — não um buraco silencioso no arquivo.
 */
export function buildExport(
  data: SettingsData,
  list: ListExportData,
  citiesById: ReadonlyMap<string, City>,
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
      city: city(c),
      starts_on: stay.startsOn,
      ends_on: stay.endsOn,
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
  }
  return { status: 'ok', json: JSON.stringify(document, null, 2) }
}
