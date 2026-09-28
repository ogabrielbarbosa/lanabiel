# Spec — Fase 7: Mapa (a Home)

> **Gate 1.** Decide _o que_ construir, antes de escrever código.

- **Data:** 2026-09-27
- **Autor:** Gabriel Barbosa (com Claude)
- **Status:** 🟡 Implementada e verificada (2026-09-27), **com o visual do mapa reprovado** — A1 (a receita lado a lado com o `.pen`) foi olhada pelo Gabriel com o token `pk.` e não passou ("não tá bom"); fica como dívida registrada no ledger, e a fase fecha a pedido dele. As 8 decisões da seção 13 foram aceitas pelo Gabriel
- **Research (Gate 0):** N/A. A fase está desenhada (5 frames da Home + os mapas das Viagens) e a engine foi escolhida no brainstorm de 2026-09-27 (Mapbox GL JS v3). O risco que a pesquisa cobriria — _o satélite real chega perto do `.pen`?_ — vira a **tarefa 1 do plano** (protótipo descartável comparado lado a lado), antes de qualquer tela
- **ADR necessário?** Sim, dois no mesmo PR: **0022** (engine do mapa: Mapbox GL JS v3 com satélite, terreno 3D e atmosfera — supersede o item _Engine do mapa_ do backlog, que escolhia MapLibre + OpenFreeMap, e o [0021](../Decisions/0021-mapas-das-viagens-sem-engine.md)) e **0023** (a Home ocupa `/` e o Calendário passa a `/calendario` — muda o que o [0013](../Decisions/0013-casca-e-navegacao-por-caminho.md) pôs na raiz)

---

## 1. What & Why

O app não tem Home. O Calendário ocupa `/`, os lugares da Lista só existem em lista, e as Viagens mostram um JPG do mundo com pins (ADR 0021). Não dá para **ver** onde o casal está, onde já foi e aonde quer ir, nem descer do mundo até a cidade.

Depois desta fase o Gabriel e a Lana abrem o app e caem na **Home** desenhada: um globo 3D de satélite com atmosfera, os lugares da Lista como pins, a navegação **Mundo → País → Estado → Cidade** pelo breadcrumb (com os seletores de estados e de cidades), os filtros de status e de categoria embaixo, o zoom da cidade com relevo 3D e _Aqui por perto_, e o painel da direita com próxima viagem, nosso ritmo, a região, os destaques, a última memória e os números pelo mundo. Os dois mapas das Viagens saem do JPG e passam para a mesma engine; os botões _Ver no globo_, _Abrir globo_ e _Abrir no globo_, escondidos desde as Fases 4 e 6, passam a existir.

A Fase 7 é a última de propósito: ela **só lê**. Nenhuma tabela, coluna ou RPC nova — tudo sai de `list_items`, `stays`, `calendar_events`/`trips`, memórias e `couple_settings`.

## 2. Como funciona (um cenário real)

Quinta, 25 de setembro. O Gabriel abre o app em `/`. A casca mostra a Home com esqueleto no painel enquanto lê, em paralelo: os itens da Lista com a primeira foto, os integrantes com as cidades-casa, as estadias, os eventos e as viagens com memórias e capas, as memórias da Lista e `couple_settings`. Ao mesmo tempo, o módulo do Mapbox carrega sob demanda (chunk próprio) e o globo aparece girado para o Brasil.

O cabeçalho diz _"Juntos agora · São José dos Campos"_ e _"Juntos há 12 dias"_ — o trecho de hoje, derivado das estadias (`runs` do Calendário). O breadcrumb mostra _Mundo › Brasil › São Paulo › São José dos Campos_, com _Mundo_ ativo: a câmera está no globo. Os pins são os 73 itens geográficos (42 _Quero ir_, 31 _Já fomos_); os que caem a menos de 44 px na tela viram um pin agrupado com _"+8"_.

Ele toca _Brasil_. A câmera voa para o Brasil e abre o seletor _"Estados do Brasil · 12 com lugares"_: São Paulo 24, Rio de Janeiro 11… Toca _São Paulo_: a câmera enquadra o estado, o seletor vira _"Cidades em São Paulo · 5 com lugares"_ (SJC 12, SPO 6, UBA 3…). Toca _São José dos Campos_: a câmera inclina a 60°, o relevo da Mantiqueira sobe, e à direita do mapa aparece _"Aqui por perto · 12 lugares · até 150 km"_ com os cartões ordenados por distância. Ele toca _Restaurante_ nos filtros: pins, cartões e contagens passam a contar só restaurantes. Toca no pin de _Fondue em Campos do Jordão_: abre o cartão do lugar (foto, _Já fomos_, _Restaurante_, _"Adicionado por Lana"_); a seta leva para `/lista` com o item aberto.

No painel, _Próxima viagem_ mostra Lisboa, _"GRU → LIS"_, _"1–9 out · 9 dias"_, _"embarque em 6 dias"_. _Nosso ritmo_ mostra _"Juntos · dia 12 de 20"_, _"8 dias restantes"_, a barra de 14 set a 3 out, e setembro dia a dia (_"22 juntos · 8 separados"_); _38% do ano juntos_, _104 dias juntos em 2026_. Nada disso é gravado: tudo é derivação sobre o que as Fases 4–6 já gravam.

## 3. Requisitos (comportamentos observáveis)

Os frames: `Home — Escuro` `eocRt`, `Painel — scroll completo` `LFEx4`, `Navegação · Estados` `j32cy`, `Navegação · Cidades` `saMmF`, `Zoom São José dos Campos` `XwYKK`. Componentes: `Couple Status` `X89zD`, `Breadcrumb` `RrNiQ` (+ `/ Estados` `OspYO`, `/ Cidades` `XXySj`), `Region Item` `LptF9`, `Zoom Controls` `rhuQS`, `Map Filters` `ZLuWp`, `Pin / Quero ir` `PfsUA`, `Pin / Já fomos` `shqGO`, `Place Popover` `RWZKP`, `Place Quick Card` `apt2z` (+ `Active` `V8VroB`), `Map Pin Label` `GxIWr`, `Destaque Card` `vg3JO`, `Memory Entry` `YmDIZ`, `Stat Metric` `JHJxK`. **Toda a copy fixa sai do `.pen`**; a copy com dado sai das regras abaixo.

**Casca e rotas**

- **R1** — A barra lateral ganha **Home** (o primeiro ícone do `Navbar` `PajKz`), na ordem do frame: Home · Calendário · Lista · Viagens. `/` abre a Home; o Calendário passa a `/calendario` (que já resolve hoje). Todo link interno que leva ao Calendário (`calendarFocus`, _Ver no calendário_, _Calendário ›_) aponta para `/calendario`. ADR 0023.
- **R2** — `mapFocus`: um pedido em memória (como `calendarFocus`) que a Home consome ao montar — `{ kind: 'item', id }` (seleciona o pin e desce ao nível da cidade dele), `{ kind: 'city', cityId }` ou `{ kind: 'world' }`. Usado por _Ver no globo_ (item da Lista, Fase 4 R16), _Abrir globo_ (Viagens, painel: `world`) e _Abrir no globo_ (detalhe da viagem: `city` do destino).
- **R3** — `listFocus`: o pedido inverso — `/lista` abre com o item pedido na ficha (`ItemSheet`). Usado pela seta do cartão do lugar (R14), pelos cartões de _Aqui por perto_, _Nessa região_ e _Em destaque_ quando pedem "ver o item".

**Cabeçalho do mapa**

- **R4** — `Couple Status`: os dois avatares (ou a foto do casal quando `use_couple_cover` está ligado e ela existe) e duas linhas a partir do trecho de hoje (`runs` + `nowSummary` do Calendário): juntos em casa ou fora → _"Juntos agora · {cidade}"_ / _"Juntos há {k} dias"_; viajando juntos → _"Viajando juntos · {cidade}"_ / _"Juntos há {k} dias"_; separados → _"Separados agora · {cidade de quem vê} e {cidade do outro}"_ / _"Separados há {k} dias"_; `unknown` → _"Sem registro de hoje"_ e sem segunda linha. `k` = dia do trecho de hoje (o primeiro dia do trecho é 1). Com `show_home_counter` desligado, a segunda linha some.

**Globo e navegação**

- **R5** — O mapa é o do ADR 0022: globo com atmosfera no nível **Mundo**; satélite, relevo 3D e névoa no nível **Cidade**. A tarefa 1 do plano fixa a receita (estilo, saturação, luz) e ela vira constante em `src/map/style.ts`.
- **R6** — **Níveis** (`MapLevel`): `world` → `country` → `state` → `city`. Brasil tem os quatro; **país de fora pula `state`** (_Mundo › Portugal › Lisboa_) — o `state` de fora do Brasil é texto livre do Photon e não agrupa com confiança. A câmera de cada nível é `cameraFor` (I6).
- **R7** — **Breadcrumb**: o globo à esquerda (volta a `world`) e os segmentos do **caminho em foco**. Ao abrir a Home, o caminho é o da cidade de quem vê hoje (a estadia dele; sem estadia, a cidade-casa) e o nível é `world` — o segmento ativo é o do nível da câmera. Tocar num segmento vai para aquele nível e abre o seletor dele (R8/R9); tocar de novo no ativo alterna o seletor. Esc ou clique fora fecha o seletor.
- **R8** — **Seletor do Mundo** (não desenhado; mesmo visual do de estados): _"Países · {n} com lugares"_, busca, `Region Item` com o código ISO do país no selo e o nome (`Intl.DisplayNames('pt-BR')`), a contagem e a seta. Lista **todos** os países do ISO (`src/domain/countries.ts`), os com lugar primeiro por contagem e o resto em 0 por nome; um país sem lugar voa para o centro aproximado dele. Escolher → nível `country`.
- **R9** — **Seletor de estados** (`j32cy`, só Brasil): _"Estados do Brasil · {n} com lugares"_, _Buscar estado_, as linhas com UF no selo, nome, contagem e seta, os 27 de uma vez (os com lugar primeiro, por contagem; os sem lugar com contagem 0, por nome — o _"Ver os 27 estados"_ do `.pen` saiu a pedido do casal). **Seletor de cidades** (`saMmF`): _"Cidades em {estado ou país} · {n} com lugares"_, _Buscar cidade_, `cityCode` no selo (I9), nome, contagem; todos os municípios do IBGE daquele estado de uma vez (`loadStateCities`), os sem lugar com contagem 0 — sem o _"Ver cidades sem lugares"_. Fora do Brasil, só as cidades com lugares. A linha da cidade em foco fica destacada.
- **R10** — **Zoom Controls** (`rhuQS`): `+` e `−` mudam o zoom da câmera em 1 sem mudar o nível; o alvo leva ao nível `city` da cidade de quem vê hoje (a mesma do R7). Arrastar, girar e inclinar com o mouse funcionam em todos os níveis; o nível só muda pelo breadcrumb, pelos seletores, por tocar num pin agrupado ou pelo alvo.

**Pins, filtros e o lugar**

- **R11** — **Pins**: um por item da Lista com coordenada (as 6 categorias geográficas; filme e série não têm lugar e não entram no mapa), não ocultado por `hidden_categories`, que passa nos filtros (R12). Visual: `Pin / Quero ir` (a fazer) e `Pin / Já fomos` (feito), com o ícone da categoria (os de `list/categories.ts`). Pins a menos de 44 px na tela se **agrupam** num pin com o ícone do item mais recente e _"+{n−1}"_; tocar no grupo desce um nível centrado nele (no nível `city`, abre _Aqui por perto_ filtrado àquele grupo). No nível `city`, o grupo da cidade em foco mostra _"+{n} em {cityCode}"_ e os pins de outras cidades levam `Map Pin Label` com o nome do item.
- **R12** — **Filtros** (`Map Filters`): status _Todos {n} · Quero ir {n} · Já fomos {n}_ e categoria _Todas · {as categorias geográficas visíveis, na ordem de `LIST_CATEGORIES`}_ — um ativo em cada. As contagens de status contam os pins sob o filtro de categoria. Filtros são estado da tela (começam em Todos/Todas) e valem para pins, contagens dos seletores e _Aqui por perto_.
- **R13** — **Aqui por perto** (`XwYKK`, só no nível `city`): _"Aqui por perto · {n} lugares · até 150 km"_, com os itens a ≤ `NEARBY_MAP_KM` (150) do centro da cidade em foco, sob os filtros; `Place Quick Card` com foto (ou o ícone da categoria), nome, categoria e _"· {km}"_ (I8), e à direita: alvo = selecionado, círculo tracejado = quero ir, check = já fomos. O botão alterna **Mais perto** / **Mais recentes**. Tocar num cartão seleciona o pin (voa até ele e abre R14). Nenhum item: _"Nada salvo por aqui ainda."_.
- **R14** — **Cartão do lugar** (`Place Popover`), preso ao pin selecionado: foto, _Quero ir_ / _Já fomos_, a tag da categoria, nome, avatar e _"Adicionado por {nome}"_, e a seta, que abre o item na Lista (R3). Tocar fora ou Esc fecha.

**Painel da direita** (`LFEx4`, rolagem própria)

- **R15** — Data de hoje por extenso (_"Quinta, 25 de setembro"_) e _"Oi, {nome slot 1} & {nome slot 2}"_.
- **R16** — **Próxima viagem · Roteiro ›**: a `heroTrip` das Viagens. Capa, o chip _"{origem} → {destino}"_ (origem: o `origin_code` da saída de quem vê, senão `cityCode` da casa dele; destino: `cityCode` do destino — _GRU → LIS_), os avatares, a cidade, o país, _"{d–d mmm} · {N} dias"_ e _"embarque em {n} dias"_ (em andamento: _"Viajando agora · dia {k} de {N}"_). _Roteiro ›_ e tocar no cartão abrem `/viagens/<id>`. Sem viagem: _"Nenhuma viagem pela frente"_ com _Planejar_, que vai para `/viagens`.
- **R17** — **Nosso ritmo · Calendário ›**: _Período atual_ — o trecho de hoje (`runs`): _"{Juntos | Viajando juntos | Separados} · dia {k} de {N}"_, _"{N−k} dias restantes"_, a barra de progresso com as datas de início e fim do trecho. Trecho em aberto (estadia sem fim): _"· dia {k}"_, sem restantes, e _"em aberto"_ no lugar da data final. `unknown`: _"Sem registro de hoje"_ e _Registrar_ (vai para `/calendario`). Depois, o **mês corrente**: _"{Mês}"_, _"{j} juntos · {s} separados"_ (`countDrawn` sobre o mês — planejado incluso) e uma barra por dia: juntos, separados, hoje (contorno), planejado (futuro, apagado); dia `unknown` fica vazio. Duas métricas: _"{p}% do ano juntos · desde janeiro"_ e _"{d} dias juntos · em {ano}"_ (I7).
- **R18** — **Nessa região · Ver mapa ›**: _"{cidade de quem vê}, {UF ou país} · {n} salvos"_ (itens a ≤ `NEARBY_RADIUS_KM` = 30 da cidade), os chips de categoria (geográficas visíveis, _Todos_ inicial) e até 5 itens por distância em `Region Item`: foto, nome, tag, _"{linha secundária da Lista} · {km}"_, e ✦ quando `featured`, senão a seta. _Ver mapa_ = nível `city` dessa cidade. Tocar num item = R2 `item`. Sem itens: o bloco mostra _"Nada salvo perto de vocês ainda."_.
- **R19** — **Em destaque · Ver lista ›**: os itens `featured`, a fazer, mais recentes — um grande e dois pequenos (`Destaque Card`: foto, tag, nome, _"{cidade}, {UF ou país}"_; mídia: a plataforma). Tocar abre o item na Lista (R3). _Ver lista_ vai para `/lista`. Sem destaque: o bloco some.
- **R20** — **Última memória · Álbum ›**: a memória mais recente entre as das viagens e as da Lista (I10). Viagem: a capa, _"{destino}"_, _"{d a d de mês de aaaa}"_, o chip _"{N} dias juntos"_; item da Lista: a primeira foto do feito, o nome, _"{d de mês de aaaa}"_ (o `done_on`), sem chip. Depois, entre aspas, o texto (até 240 letras, com reticências), o avatar, o nome e _"escreveu {há n dias | hoje | ontem | em d mmm}"_. _Álbum_ e tocar: viagem → `/viagens/<id>`; item → a ficha na Lista. Sem memória: o bloco some.
- **R21** — **Juntos pelo mundo · Detalhes ›** (`tripTotals` das Viagens, só feitas): **Países** — o número e _"{A}, {B} e mais {n}"_ (os dois com mais viagens; um só: o nome; dois: _"A e B"_); **Cidades** — o número e _"{b} no Brasil, {f} lá fora"_; **Quilômetros viajados** — _"{km}"_ (milhar com ponto) e a frase da volta ao mundo (I11), com a barra de `min(p, 100)%`. _Detalhes_ vai para `/viagens`.

**Viagens (os mapas saem do JPG)**

- **R22** — _Onde já estivemos_ (painel das Viagens) e _Mapa da viagem_ (detalhe) passam a ser mapas do ADR 0022, **não interativos** (sem arrastar nem zoom), com os mesmos pins, arcos (grande círculo; contínuo nas feitas, tracejado nas planejadas) e legenda que a Fase 6 especificou (R10/R10b). O enquadramento do _Mapa da viagem_ é `fitBounds` de origem e destino com folga. Aparecem **_Abrir globo_** (→ `/` com `mapFocus` `world`) e **_Abrir no globo_** (→ `/` com `mapFocus` `city` do destino). `src/trips/assets/world-map.jpg`, `project` e `cropFor` saem.
- **R23** — Lista: _Ver no globo_ na ficha do item geográfico (Fase 4 R16) → `/` com `mapFocus` `item`. O modal _Marcar como feito_ ganha a legenda _"Vira a 'Última memória' da Home"_ no rodapé, à esquerda dos botões, com o ícone de casa — onde o `.pen` a põe (nó `P0MzG`; Fase 4 R20).

**Falha e leitura**

- **R24** — Sem realtime (ADR 0015): a Home relê ao voltar ao foco e depois de cada navegação de volta para ela. O mapa **não** é recriado na releitura: só os pins e o painel mudam.
- **R25** — Nada nesta fase lê `day_kisses`.

## 4. Invariantes

- **I1** — **A Home só lê.** Nenhuma escrita parte dela (os links levam às telas donas). Nenhuma tabela, coluna, RPC ou policy nova nesta fase.
- **I2** — **Tudo o que ela mostra é derivado** de dado que as Fases 4–6 já gravam, pelas funções que já existem quando existem: estado do casal e trechos (`coupleStateOn`, `runs`, `nowSummary`), contagens (`countStates` para o vivido, `countDrawn` para o mês desenhado — **nunca trocadas**), viagem (`heroTrip`, `tripTotals`, `tripStatus`), distância (`distanceKm`). Nada é recalculado por um caminho paralelo.
- **I3** — **Um pin existe se e só se** o item tem `lat`/`lng`, a categoria é geográfica, não está em `hidden_categories` e passa nos dois filtros. Mídia nunca vira pin.
- **I4** — **O agrupamento de região é derivado do item**, nunca gravado: país = `country_code`; estado = `state` quando `country_code = 'BR'` (a UF — `places.ts` já normaliza); cidade = `city` comparada sem acento e sem caixa dentro do mesmo país (e UF, no Brasil). Item `pais` pertence só ao nível país. Item brasileiro sem `state` conta no país e não aparece em estado nenhum.
- **I5** — **O caminho em foco e o nível são estado da tela**, não URL e não gravados. Abrir a Home começa sempre em `world` com o caminho de quem vê (R7), salvo um `mapFocus` pendente.
- **I6** — `cameraFor(nível, região, pins)`: `world` → globo, zoom 1,6, centrado na cidade de quem vê, sem inclinação; `country` e `state` → `fitBounds` dos pins da região com folga, zoom mínimo 3 (país) / 5 (estado), sem inclinação — sem pins, o centro de `BR_STATES` (27 UFs com nome e centro, constante no domínio) ou do país (o centro dos seus pins); `city` → centro da cidade (`cities.lat/lng`), zoom 11, inclinação 60°, terreno ligado. Função pura, testada.
- **I7** — _"% do ano juntos"_ = `floor(100 × dias juntos de 1º de janeiro até hoje / dias de 1º de janeiro até hoje)`, com dias juntos pelo `countStates` (vivido; `unknown` não é juntos, e também não é separado). _"dias juntos em {ano}"_ = o mesmo numerador.
- **I8** — Distâncias em linha reta (`distanceKm`), com uma casa decimal abaixo de 10 km (_"1,2 km"_) e inteiras acima (_"86 km"_). _Aqui por perto_ mede do centro da cidade em foco; _Nessa região_, do centro da cidade de quem vê.
- **I9** — `cityCode(nome)`: com 3+ palavras significativas (as mesmas `MINOR_WORDS` do `shortCityName`), as iniciais (_SJC_, _CDJ_); com 2, as duas iniciais mais a última letra da segunda (_SPO_); com 1, as três primeiras letras (_UBA_, _LIS_, _ILH_). Maiúsculas, sem acento. Estende `shortCityName`, não o substitui.
- **I10** — _Última memória_ = a escrita mais recentemente, pelo **dia**: `written_on` das `trip_memories` (só guardam a data) e o dia local de `updated_at` das `list_memories`; empate, a de viagem.
- **I11** — Volta ao mundo: `p = round(100 × km / 40.075)` (o `.pen`: 18.420 km → 46%). `p < 40` → _"{p}% da circunferência da Terra"_; `40 ≤ p < 50` → _"Quase meia volta ao mundo — {p}% da circunferência da Terra"_; `50 ≤ p < 100` → _"Mais de meia volta ao mundo — {p}%…"_; `p ≥ 100` → _"{v} voltas ao mundo"_ (`v` com uma casa, _"1,3"_; exatamente 1 volta: _"Uma volta ao mundo"_).
- **I12** — **Uma instância de mapa por montagem de tela**, nunca recriada por releitura, troca de filtro ou de nível. É o que conta como _map load_ no Mapbox (seção 8).
- **I13** — O Mapbox recebe só **pedidos de tile** (coordenadas vistas) e o token público. Nenhum dado do casal — nome, item, foto, memória — sai para ele: pins, rótulos e cartões são desenhados pelo app por cima do mapa, com dados lidos do Supabase.

## 5. Contrato & dados

### Armazenamento

**Nenhuma mudança** (I1). A fase lê: `list_items` (+ a primeira `list_photos` e `list_memories`), `profiles`/`couple_members` (casa, nome, cor, avatar), `stays`, `cities`, `calendar_events` + `trips` + filhas (via a leitura da Fase 6), `trip_memories`, `couple_settings` (`show_home_counter`, `use_couple_cover`, `hidden_categories`, a capa). Sem migration, sem `types:gen`.

### Contrato compartilhado — `src/domain/map.ts` (puro, sem Supabase nem Mapbox; `Date` só via `lib/date.ts`)

```ts
export const NEARBY_MAP_KM = 150
export const CLUSTER_PX = 44
export const BR_STATES: Record<Uf, { name: string; lat: number; lng: number }> // as 27

export type MapLevel = 'world' | 'country' | 'state' | 'city'
export interface FocusPath {        // o caminho do breadcrumb
  countryCode: string | null        // 'BR'
  stateCode: string | null          // 'SP' (só BR)
  cityKey: string | null            // `${country}:${uf ?? ''}:${nome normalizado}`
  cityId: string | null             // o de `cities`, quando a cidade existe lá (IBGE ou do casal)
}
export interface MapView { level: MapLevel; path: FocusPath }

export interface Pin {              // I3
  itemId: string; category: GeoCategory; status: 'todo' | 'done'
  lat: number; lng: number
  countryCode: string; stateCode: string | null; cityKey: string | null
  createdAt: string; addedBy: string
}
export interface MapFilters { status: 'all' | 'todo' | 'done'; category: 'all' | GeoCategory }

export function pinsOf(items: ListItem[], hidden: ListCategory[], filters: MapFilters): Pin[]
export function statusCounts(items: ListItem[], hidden: ListCategory[], category: MapFilters['category']): { all: number; todo: number; done: number }
export function regionRows(pins: Pin[], level: 'world' | 'country' | 'state', path: FocusPath, opts?: { allStates?: boolean }): RegionRow[] // I4; contagem, nome
export function defaultPath(viewerCity: City): FocusPath           // R7
export function cameraFor(view: MapView, pins: Pin[], viewer: LatLng): Camera // I6
export function nearby(pins: Pin[], center: LatLng, km: number, sort: 'near' | 'recent'): NearbyRow[]
export function cityCode(name: string): string                     // I9
export function circumferenceLine(km: number): { text: string; pct: number } // I11
export function yearTogether(today, stays, members): { pct: number; days: number } // I7
export function monthStrip(today, stays, members): { days: StripDay[]; together: number; apart: number } // R17
export function latestMemory(trips, listItems, listMemories): LatestMemory | null // I10
```

**Pins, grupos, rótulos e o cartão do lugar são React por cima do mapa**, posicionados por `project` a cada `onMove` (ledger, T0): assim o comportamento se prova em jsdom e nenhum dado do casal vira camada do provedor (I13). O agrupamento é `clusterPoints` (guloso em pixels, raio `CLUSTER_PX`), puro, no domínio.

### A engine atrás de uma interface — `src/map/`

```ts
// src/map/engine.ts — o que as telas usam; nenhum import de mapbox-gl fora de src/map/mapbox/
export interface MapEngine {
  mount(el: HTMLElement, opts: { interactive: boolean; camera: Camera; projection: 'globe' | 'mercator' }): Promise<MountResult>
}
export interface MapHandle {
  flyTo(camera: Camera, opts?: { instant?: boolean }): void
  zoomBy(delta: 1 | -1): void
  project(point: LatLng): { x: number; y: number } | null   // null = atrás do globo / fora da tela
  onMove(cb: () => void): () => void
  setArcs(arcs: readonly Arc[]): void                        // Viagens
  destroy(): void
}
export type MountResult = { status: 'ok'; handle: MapHandle } | { status: 'failed'; reason: 'no_token' | 'no_webgl' | 'load_error' }
```

`src/map/mapbox/` é o único lugar com `mapbox-gl`, carregado por `import()` dinâmico (chunk próprio; o bundle inicial não cresce). Os testes de interface injetam um `MapEngine` falso, como as outras telas recebem a `Api` injetada. `src/map/style.ts` guarda a receita do R5.

### A tela — `src/home/`

`HomeScreen` recebe `HomeApi` injetada (`api.ts`), que **compõe as leituras existentes** (`data/list.ts`, `data/stays.ts`, `data/trips.ts`, `data/settings`…) e devolve `DataResult` discriminado — uma falha em qualquer leitura é falha da Home, nunca zero linhas. CSS em `home/home.css` (um arquivo, a regra). O harness `?preview` de `src/dev/` ganha a Home com os dados do `.pen` (Parque Vicentina Aranha, Lisboa, _"Juntos há 12 dias"_).

### Configuração

`VITE_MAPBOX_TOKEN` em `.env.local` (token **público** `pk.…`, com restrição de URL para `localhost` e o domínio do app, escopos padrão). Ausente → `MapFailure 'no_token'` (seção 7). O `.env.example` ganha a linha comentada.

### Compatibilidade

`/` deixa de ser o Calendário (R1, ADR 0023); `/calendario` já resolve, então links velhos continuam funcionando, só caem na Home. O export das Configurações não muda (a Home não tem dado próprio).

## 6. Identidade & nomes

`cityKey` = `` `${country_code}:${uf ?? ''}:${normalize(city)}` `` (sem acento, minúsculas, espaços colapsados) — só vive na memória da tela, nunca é gravado, então errar custa um deploy, não uma migration. O `cityId` do foco vem de `cities` quando existe (a cidade de quem vê, o destino de viagem); cidade só da Lista pode não ter `cityId`, e aí o centro dela é o centro dos seus pins. `mapFocus` e `listFocus` carregam ids que já existem (`list_items.id`, `cities.id`). Nenhum nome novo para fora.

## 7. Comportamento em falha

- **Leitura falhou** (rede, projeto pausado, sessão caída): o painel mostra o erro da casca com _Tentar de novo_ e o mapa **não desenha pins** — mostrar globo vazio seria dizer "vocês não salvaram nada". `unauthenticated` segue o portão de sempre.
- **Engine falhou** (`no_token`, `no_webgl`, estilo ou tile com erro na carga): a área do mapa mostra um fundo escuro com _"O mapa não carregou."_ e _Tentar de novo_ (recria a instância — conta um load); breadcrumb, seletores, filtros, _Aqui por perto_ e o painel **continuam funcionando** sobre os dados, só sem câmera. Sem WebGL, _Tentar de novo_ não aparece (não vai adiantar).
- **Tiles lentos ou parciais** depois da carga: o Mapbox preenche quando chegam; nada no app espera por eles. Pins e cartões desenham sobre o que houver.
- **Leitura ok e engine com erro ao mesmo tempo**: vale o bloco anterior (dados sem mapa), não o de leitura.
- **Item com coordenada mas sem `state`/`city`** (legado, ou `usar só a cidade` sem UF): aparece no mundo e no país, não entra em estado/cidade (I4). Não é erro.
- **Cidade de quem vê sem estadia hoje**: usa a cidade-casa (R7); o cabeçalho diz _"Sem registro de hoje"_ (R4) — não inventa "juntos".
- **Viagem ou memória apontando para cidade que não veio na leitura**: o nome aparece como _"?"_ (a regra do `cityName` do Calendário), nunca some.
- **Cota do Mapbox estourada**: o Mapbox passa a recusar/cobrar (seção 8); a engine cai no `load_error` e a Home funciona sem mapa.

## 8. Limites & orçamentos

- **Map loads**: grátis até **50.000/mês** no Mapbox GL JS (verificado em mapbox.com/pricing em 2026-09-27); acima, US$ 5 por mil. Um load = uma inicialização de mapa (I12), e tiles vetoriais, raster, satélite e terreno vêm incluídos sem cobrança separada. Estimativa do casal: Home + Viagens (painel e detalhe) ≈ 3 loads por visita; 2 pessoas × 30 visitas/dia × 30 dias ≈ **5.400/mês**, 11% da franquia. A spec não liga nenhum plano pago.
- **Bundle**: `mapbox-gl` só no chunk dinâmico (`adapter-*`, ~510 kB gzip, baixado ao montar o primeiro mapa); o chunk de entrada cresce só pelo código das telas da fase — **≤ 20 kB gzip** — e nenhum byte do Mapbox entra nele (conferido no `vite build` contra a `main`, com o mesmo `.env`).
- **Pins**: desenhados como fonte GeoJSON com cluster da engine; até alguns milhares sem custo perceptível (o casal tem ~100).
- **Leituras**: a Home reaproveita as funções das Fases 4–6 em paralelo; nenhuma leitura por pin. Fotos: URL assinada só das visíveis (painel + cartão selecionado + _Aqui por perto_), em lote, com a regra de re-assinatura das Viagens (50 min).
- **`loadStateCities`** (seletor de cidades): os municípios do IBGE da UF, paginados (MG tem 853), lidos uma vez por UF na sessão da tela.

## 9. Segurança & permissões

Nada muda na autorização: a Home lê pelas mesmas funções, sob a RLS de sempre, e o cliente não filtra por casal. O token do Mapbox é **público** por natureza (vai no bundle) — por isso restrito por URL no painel do Mapbox e sem escopos de escrita; ele nunca é `sk.`. Para o Mapbox saem só pedidos de tile e o token (I13): nem nomes, nem itens, nem fotos, nem memórias; a telemetria de uso do SDK é a padrão dele e é registrada no ADR 0022. `day_kisses` não é lido (R25). A _Última memória_ mostra texto íntimo na tela principal — é o que o design pede e a Fase 4 já anunciava na legenda do _Marcar como feito_.

## 10. Critérios de aceite (testáveis)

| #   | Critério (Dado/Quando/Então) | Como provar |
| --- | ---------------------------- | ----------- |
| A1  | Dado o protótipo da tarefa 1 com o globo sobre o Brasil e o zoom de SJC, quando comparado lado a lado com `eocRt` e `XwYKK`, então o Gabriel aprova a receita (ou pede ajuste) antes de qualquer tela | capturas no navegador do app + aceite no chat, registrados no ledger |
| A2  | Dado `/`, a casca abre a Home; `/calendario` abre o Calendário; a barra lista Home · Calendário · Lista · Viagens na ordem do frame | teste `app/router.test.ts` + teste de interface da casca |
| A3  | Dados itens das 8 categorias, com e sem coordenada, e `hidden_categories = ['parque']`, `pinsOf` devolve só os geográficos com coordenada, sem parque, e respeita os dois filtros; `statusCounts` bate | teste `domain/map.test.ts` |
| A4  | Dados itens em SP, RJ, BR sem UF, Portugal e um `pais` Turquia, `regionRows` agrupa por país, por UF só no Brasil e por cidade sem acento/caixa; o sem UF conta no Brasil e em nenhum estado | teste `domain/map.test.ts` |
| A5  | `cameraFor` devolve globo sem inclinação em `world`, `fitBounds` com mínimos em `country`/`state`, centro de `BR_STATES` em estado sem pins, e inclinação 60° com terreno em `city` | teste `domain/map.test.ts` |
| A6  | `cityCode`: _São José dos Campos_ → SJC, _São Paulo_ → SPO, _Campos do Jordão_ → CDJ, _Ubatuba_ → UBA, _Lisboa_ → LIS, _Ilhabela_ → ILH | teste `domain/map.test.ts` |
| A7  | `circumferenceLine(18420)` → 46%, _"Quase meia volta ao mundo — 46% da circunferência da Terra"_; e um caso de cada faixa do I11 | teste `domain/map.test.ts` |
| A8  | Dadas estadias de 1/jan a hoje com juntos, separados e lacunas, `yearTogether` conta só juntos vividos (futuro não, `unknown` não) e `monthStrip` marca planejado no futuro do mês | teste `domain/map.test.ts` |
| A9  | `latestMemory` escolhe a mais recente entre memória de viagem e da Lista, e a de viagem no empate | teste `domain/map.test.ts` |
| A10 | Dada a Home com engine falsa, quando toca _Brasil_ e depois _São Paulo_, então o seletor de estados e depois o de cidades aparecem com a copy e as contagens do `.pen`, e a engine recebe `flyTo` com a câmera de cada nível | teste de interface `home/HomeScreen.test.tsx` |
| A11 | Quando troca o filtro para _Restaurante_ e _Já fomos_, então `setPins` recebe só aqueles, as contagens mudam e _Aqui por perto_ acompanha | teste de interface |
| A12 | Quando toca num pin (engine falsa dispara `onPinClick`), então o cartão do lugar aparece com a copy do R14 e a seta navega para `/lista` com a ficha do item aberta | teste de interface (Home + Lista) |
| A13 | Dado o painel com os dados do `.pen`, então aparecem _Próxima viagem_ (_GRU → LIS_, _embarque em 6 dias_), _Nosso ritmo_ (_Juntos · dia 12 de 20_, _8 dias restantes_, _22 juntos · 8 separados_, _38%_, _104_), _Nessa região_, _Em destaque_, _Última memória_ e _Juntos pelo mundo_ (_7_, _23_, _18.420_) | teste de interface `home/HomePanel.test.tsx` |
| A14 | Dado estado separado / viajando / `unknown` / trecho em aberto, o cabeçalho e _Nosso ritmo_ mostram a copy do R4 e do R17 para cada um; com `show_home_counter` desligado, a segunda linha some | teste de interface |
| A15 | Dada a engine que devolve `no_token`, a área do mapa mostra _"O mapa não carregou."_ e o breadcrumb, os filtros e o painel continuam funcionando | teste de interface |
| A16 | Dada a leitura com falha, o mapa não recebe pins e o painel mostra o erro com _Tentar de novo_ | teste de interface |
| A17 | Releitura ao voltar o foco e troca de nível/filtro não chamam `mount` de novo (I12) | teste de interface (contador no `MapEngine` falso) |
| A18 | _Ver no globo_ (Lista), _Abrir globo_ e _Abrir no globo_ (Viagens) levam a `/` e a Home abre no item / no mundo / na cidade do destino | teste de interface |
| A19 | O painel das Viagens e o detalhe não carregam mais `world-map.jpg`; os mapas recebem pins e arcos pela engine, sem interação | teste de interface + `rg world-map src` vazio |
| A20 | Em DEV, `/?preview` mostra a Home com o mapa real e os dados do `.pen`; as capturas dos 5 frames ficam no ledger ao lado das do `.pen` | capturas no navegador do app |
| A21 | O chunk de entrada cresce ≤ 20 kB gzip (só o código das telas) e `mapbox-gl` está num chunk separado | saída do `vite build` da `main` e da branch, com o mesmo `.env` |
| A22 | Nenhum arquivo fora de `src/map/mapbox/` importa `mapbox-gl`; nenhuma tela lê `day_kisses` | `rg "mapbox-gl" src` · `rg day_kisses src/home` |
| A23 | typecheck, lint, test e build limpos | `npm run typecheck && npm run lint && npm run test && npm run build` |

## 11. Abordagem de teste

O domínio (`map.ts`) carrega a regra e é testado puro, no projeto `domain` do vitest — agrupamento, câmera, contagens, códigos, frases. A tela se prova **renderizando** em jsdom (ADR 0005) com um `MapEngine` falso que registra as chamadas (`mount`, `setPins`, `flyTo`) e dispara cliques — jsdom não tem WebGL, e o que importa provar ali é o que a tela pede à engine, não o pixel.

O que fica fora do jsdom, e por quê: **o visual do mapa** (satélite, relevo, atmosfera, cor) só existe com WebGL e tiles de verdade. Ele se prova no navegador do app (A1, A20), por captura comparada aos frames, e o aceite é do Gabriel — não há assert automático honesto para "parece o `.pen`". O adaptador `src/map/mapbox/` fica fino justamente para que quase nada dependa dessa prova manual. Não há teste de integração novo em `supabase/tests`: a fase não toca o banco (I1).

## 12. Riscos & mitigações

| Risco | Impacto | Mitigação |
| ----- | ------- | --------- |
| O satélite real, mesmo ajustado, não chega perto das cores e luzes do `.pen` (a arte é gerada) | "Fidelidade" vira ajuste sem fim | Tarefa 1 antes de tudo: protótipo com _Standard Satellite_ (`lightPreset`, `fog`, terreno) **e** com estilo próprio (`mapbox.satellite` com `raster-saturation`/`raster-contrast`, `raster-dem`, `fog`); o Gabriel escolhe olhando (A1). Réplica exata está fora (seção 14) |
| Luzes da cidade (o brilho de SJC no `XwYKK`) não existem no satélite diurno | Zoom da cidade menos "vivo" | `lightPreset: 'dusk'`/`'night'` do Standard ilumina cidades; se não bastar, é ajuste da tarefa 1, não requisito |
| Token público vazado usado por outro site | Consome a franquia | Restrição de URL no painel do Mapbox; conta sem cartão, se o Mapbox permitir, para estourar = parar e não cobrar (conferir ao criar a conta) |
| `mapbox-gl` pesa (~1,5 MB) | Primeira abertura da Home mais lenta | `import()` dinâmico, chunk próprio (A21); o painel renderiza antes do mapa |
| Mudar `/` quebra hábito e links do Calendário | Cai na Home | `/calendario` já existe; todo link interno trocado (R1), com teste (A2) |
| Licença do Mapbox GL JS v3 não é open source | Dependência de fornecedor | Registrado no ADR 0022; a interface `MapEngine` isola a troca (MapLibre cabe atrás dela) |
| `state` de itens antigos vazio ou fora de padrão | Estado com contagem menor que a real | I4 conta no país; a busca do `places.ts` já normaliza UF desde a Fase 4 |

## 13. Open questions (bloqueiam a implementação)

Nenhuma. As decisões abaixo **foram tomadas pelo agente** porque o `.pen` não as responde ou se contradiz, e **aceitas pelo Gabriel em 2026-09-27**; cada uma já está descrita na seção que a aplica:

1. **Home abre no globo com _Mundo_ ativo** (R7). O `eocRt` mostra o globo com _São José dos Campos_ ativo — o frame contradiz a própria câmera. Alternativa: abrir já no zoom da cidade (`XwYKK`).
2. **Filme e Série saem dos filtros do mapa** (I3). O `.pen` tem os chips e até um pin de filme em SJC, mas mídia não tem lugar (ADR 0003). O chip _Lugar_ do `.pen` não é categoria (são País e Cidade): os chips são as categorias geográficas reais.
3. **Seletor de países no _Mundo_** (R8), sem frame, no visual do de estados — sem ele não dá para navegar até um país de fora, que você pediu ("mundos, países").
4. **País de fora pula o nível estado** (R6).
5. **Separados, viajando e sem registro** no cabeçalho e no _Nosso ritmo_ (R4, R17) — o `.pen` só desenha "juntos".
6. **Barras do mês em duas cores fixas do `.pen`** (juntos aqua, separados rosa), não nas quatro cores de faixa das Configurações.
7. **`cityCode` por regra** (I9): _Ilhabela_ vira _ILH_, não o _ILB_ do frame.
8. **O coração do cartão _Última memória_ não aparece** — não existe dado de favoritar memória.

## 14. Fora de escopo

- **Réplica exata da arte do `.pen`**: luz, nuvens e cor pixel a pixel. O critério é o aceite lado a lado (A1, A20).
- Modo claro do mapa: o `.pen` só desenha escuro; o mapa é o mesmo nos dois temas (o painel segue os tokens de tema que já existem).
- Mapa offline, rotas/direções, busca de endereço no mapa, prédios 3D de cidade.
- Destinos de viagem como pins no globo da Home (a Home mostra a Lista; as viagens têm os mapas delas, R22).
- Criar ou editar qualquer coisa a partir da Home (I1); o _Adicionar_ da barra continua como está.
- Realtime, avisos ao outro, agendador (fim do roadmap).
- Plano pago do Mapbox.
- Celular: a casca continua desktop-first, como nas outras fases.

---

## Plano (Gate 2 — preencher depois que a Spec for aprovada)

> Só depois de `🟡 Reviewed`. Rascunho da ordem, para a revisão enxergar o custo:

1. [ ] **Spike da engine** (A1): página descartável em `src/dev/` com as duas receitas do risco 1, globo e SJC; capturas ao lado de `eocRt`/`XwYKK`; o Gabriel escolhe. Sai a `style.ts` e o ADR 0022
2. [ ] Rota: Home em `/`, Calendário em `/calendario`, barra com Home; ADR 0023
3. [ ] Domínio `map.ts` + testes (A3–A9)
4. [ ] `src/map/`: `MapEngine`, adaptador Mapbox, engine falsa
5. [ ] Home: mapa, breadcrumb, seletores, filtros, pins, cartão do lugar, _Aqui por perto_ (A10–A12, A15–A17)
6. [ ] Painel da Home (A13, A14)
7. [ ] Viagens na engine + _Abrir globo_ / _Abrir no globo_; Lista: _Ver no globo_ e a legenda (A18, A19)
8. [ ] Harness `?preview` da Home, capturas dos 5 frames (A20); build e bundle (A21–A23)
9. [ ] Atualizar `.agent/System/project_architecture.md`, `CLAUDE.md`, o backlog de `Decisions/README.md` e este doc para 🟢

---

## Related

- Brainstorm: esta conversa (2026-09-27) — Mapbox, tudo que está no `.pen`
- ADR(s): 0022 e 0023 (a criar); [0021](../Decisions/0021-mapas-das-viagens-sem-engine.md) superseded; [0013](../Decisions/0013-casca-e-navegacao-por-caminho.md), [0003](../Decisions/0003-lista-tabela-unica-com-check-por-categoria.md), [0015](../Decisions/0015-lista-sem-realtime-reler-ao-voltar.md), [0018](../Decisions/0018-periodo-se-grava-pintando-estadias.md), [0019](../Decisions/0019-viagem-e-o-evento-estendido-por-trips.md)
- Ledger da execução: `fase-7-mapa.ledger.md`
