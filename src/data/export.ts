// "Exportar tudo" (R19): um JSON com o que a sessão lê, montado no navegador.
//
// Spec: .agent/Tasks/fase-3-configuracoes.md, seção 5 ("Formato do export")
//
// Cidade vai RESOLVIDA (nome, UF, coordenada), não como UUID: o arquivo
// precisa fazer sentido fora do banco. Cada fase que criar tabela acrescenta a
// chave dela e sobe `version`. Nunca leva imagem — só metadados.

import type { SettingsData } from './settings'
import type { City } from './cities'

export const EXPORT_VERSION = 1

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
  citiesById: ReadonlyMap<string, City>,
  exportedAt: string,
): { status: 'ok'; json: string } | { status: 'error'; cause: string } {
  const slotOf = new Map(data.couple.members.map((m) => [m.profileId, m.slot]))
  const stays = []
  for (const stay of data.stays) {
    const c = citiesById.get(stay.cityId)
    if (!c) return { status: 'error', cause: `cidade ${stay.cityId} de uma estadia não foi lida` }
    stays.push({
      // Estadia de quem já saiu do casal não tem slot: vai como null.
      person_slot: slotOf.get(stay.profileId) ?? null,
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
  }
  return { status: 'ok', json: JSON.stringify(document, null, 2) }
}
