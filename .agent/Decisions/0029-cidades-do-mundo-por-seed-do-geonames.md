# ADR 0029 — Cidades do mundo por seed do GeoNames, só de leitura

- **Status:** Proposed
- **Data:** 2026-10-11
- **Área:** schema (`geo_cities`), Home, Lista

---

## Contexto

Na Home, escolher a África do Sul abria um seletor de cidades vazio. O
seletor tem dois caminhos (`regionRows`): no Brasil, todos os municípios do
IBGE (ADR 0007); fora dele, só as cidades que já têm item na Lista. Sem item
na África do Sul, nada aparecia. O defeito não estava na tela. Faltava o dado:
o app não tinha nenhuma lista de cidades do mundo.

Na mesma rodada, o casal pediu que o modal da Lista juntasse País e Cidade
numa categoria só, com os países do seletor da Home e as cidades do país
escolhido, como a Home mostra. A falta era a mesma.

`cities` já guarda cidade estrangeira (ADR 0017), mas como linha **do casal**,
criada quando alguém escolhe a cidade no Calendário, a partir do Photon. Ela
existe para ser alvo de FK (`stays.city_id`), não para ser listada.

## Decisão

- Uma tabela nova, **`geo_cities`**, de referência: `geoname_id`, `name` (em
  português quando o GeoNames tem), `country_code`, `region`, `lat`, `lng`,
  `population`. Sem o Brasil (`CHECK`): cidade brasileira continua sendo a do
  IBGE.
- Seed do **GeoNames `cities15000`** (cidades com 15 mil habitantes ou mais,
  CC BY 4.0), sem seções de cidade (`PPLX`: os arrondissements de Paris) e sem
  as históricas ou abandonadas. São 29.461 cidades, 307 delas na África do Sul.
  O nome em português vem do `alternateNamesV2` (`isolanguage = pt`, o
  preferido primeiro). A migration é gerada por `scripts/gen-geonames-seed.mjs`,
  com o SHA-256 das fontes no cabeçalho, no molde do seed do IBGE.
- **RLS:** `select` para `authenticated`; nenhuma escrita pelo cliente (o
  `revoke` tira `insert`, `update`, `delete` e `truncate` de `anon` e
  `authenticated`).
- **Nada referencia a tabela por FK.** A Home usa a cidade só para a câmera
  (`id` sintético `geo:<geonameid>`). A Lista grava nome e coordenada nas
  colunas do próprio item, como sempre (ADR 0003).
- Leitura: `loadCountryCities` (`src/data/cities.ts`), paginada, da maior para
  a menor.

## Alternativas descartadas

- **Buscar as cidades sob demanda no Photon** (filtrando pelo país). O
  seletor da Home mostra a lista inteira de uma vez, sem digitar, e o Photon
  é busca, não listagem: devolve 10 resultados por texto.
- **`cities500` ou `cities1000`** (o dobro ou o sêxtuplo de linhas, 30–40 MB
  de arquivo). Cobririam o vilarejo turístico (Göreme), mas a migration ficaria
  enorme. O vilarejo que não está na lista continua achável: o modal da Lista
  cai no Photon quando o nome não está no GeoNames.
- **Natural Earth.** Domínio público, mas só cidades grandes: poucas por país.
- **Overture divisions.** ODbL, em GeoParquet, pesado para um seed.
- **Pôr as cidades em `cities`.** Misturaria referência com alvo de FK, e o
  `cities_scope` do ADR 0017 exige `couple_id` para cidade estrangeira.

## Consequências

### Positivas

- O seletor da Home lista as cidades de qualquer país, sem rede extra além de
  uma leitura paginada por país (com cache na sessão da tela).
- O "Países e cidades" da Lista escolhe da lista, sem digitar o nome exato.
- Os nomes saem em português ("Cidade do Cabo", "Nova Iorque", "Tóquio").

### Negativas / trade-offs

- **Duas fontes de cidade estrangeira**: `cities` (Photon, do casal) e
  `geo_cities`. Uma cidade escolhida no Calendário e a mesma escolhida na
  Lista podem ter nome diferente ("Cape Town" e "Cidade do Cabo"). Hoje nada
  compara as duas. Se um dia compararem, este ADR precisa ser revisto.
- **Cidade pequena fica de fora** (abaixo de 15 mil habitantes). Na Home ela
  só aparece se tiver item; na Lista, pelo Photon.
- **Migration de 1,9 MB** no repositório. Ela é gerada, como o seed do IBGE.
- **A região está em inglês** ("Western Cape"): o GeoNames não traduz o
  `admin1`.
- Atribuição CC BY: o GeoNames tem de ser creditado onde o app lista créditos.

## Código / evidência

| Artefato | Caminho |
| -------- | ------- |
| Gerador | `scripts/gen-geonames-seed.mjs` |
| Migration | `supabase/migrations/20261011120000_geo_cities.sql` |
| Leitura | `src/data/cities.ts` (`loadCountryCities`) |
| Home | `src/home/map/RegionPicker.tsx`, `src/domain/map.ts` (`regionRows`) |
| Lista | `src/list/AddItemModal.tsx` (`useCityOptions`) |
| Testes | `src/home/MapArea.test.tsx` (África do Sul), `src/list/AddItemModal.test.tsx`, `supabase/tests/geo-cities.test.ts` |

## Related

- [0007 — Cidades brasileiras por seed do IBGE](./0007-cidades-brasileiras-por-seed-do-ibge.md)
- [0017 — Cidades do mundo por casal](./0017-cidades-do-mundo-por-casal.md)
- [0030 — Endereço com número pelo Mapbox Geocoding permanente](./0030-endereco-pelo-mapbox-geocoding-permanente.md)
- Pesquisa: [`../Research/lista-adicionar-simples.md`](../Research/lista-adicionar-simples.md)
