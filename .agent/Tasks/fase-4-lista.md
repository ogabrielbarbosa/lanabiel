# Spec — Fase 4: Lista

> **Gate 1.** Decide _o que_ construir, antes de escrever código.

- **Data:** 2026-09-26
- **Autor:** Gabriel Barbosa (com Claude)
- **Status:** 🟡 Implementada e verificada (2026-09-26) — A21 (manual, duas contas) pendente; ver o ledger
- **Research (Gate 0):** N/A — a fase está desenhada nos 14 frames da Lista; a dúvida é de desenho, não de mercado. A escolha do provedor de busca foi provada com chamadas reais (seção 5)
- **ADR necessário?** Sim, três, no mesmo PR: **0015** (Lista sem realtime: reler ao voltar ao foco), **0016** (busca de lugares pelo Photon/OSM, com o resultado guardado no item), e a **revisão do 0003** (colunas que os seis modais revelaram, `done_on` como data, `done_with` por pessoa). O 0003 ainda está `Proposed`, então recebe uma seção de revisão datada em vez de ser superseded

---

## 1. What & Why

A Lista é o acervo do que o casal quer fazer junto (países, cidades, restaurantes, parques, comidas, filmes, séries, experiências) e do que já fez, com a memória de cada um. Hoje ela não existe no app, e o Calendário da Fase 5 depende dela: o modal "Novo evento" tem o campo _Vínculo com a lista_, que aponta para um item.

Depois desta fase, Gabriel e Lana abrem **Lista** pela barra lateral e usam as telas desenhadas: a grade com filtros, os 8 modais de adicionar, o detalhe do item, o marcar como feito (fotos, quem estava, memória e corações) e o painel da direita (progresso, sugestão do momento, perto de vocês, adicionados recentemente). Tudo grava no Supabase, cortado por casal.

As preferências da Lista que a Fase 3 gravou (`list_default_sort`, `show_category_progress`, `hidden_categories`, `show_daily_suggestion`) **passam a ter efeito aqui**.

## 2. Como funciona (um cenário real)

Gabriel está em SJC. Ele abre `/lista`. A tela lê em paralelo os itens (`list_items`), as memórias, as fotos, `couple_settings`, os dois integrantes com as cidades-casa e as estadias. Enquanto isso mostra esqueleto, não uma lista vazia.

Ele toca _Adicionar_ e escolhe **Restaurantes**. Os campos se ajustam. No campo _Local_ ele digita "Mocotó São Paulo". Depois de 350 ms sem digitar, o cliente pergunta ao Photon (`photon.komoot.io`), com viés para a cidade-casa dele. A lista suspensa mostra _Mocotó · Av. Nossa Senhora do Loreto, 1100 · São Paulo, SP_ e o crédito _© OpenStreetMap_. Ele escolhe. O cartão de prévia diz _"Vai virar um pin no globo · Mocotó"_. Ele escreve a nota _"Ir num sábado no almoço — pedir o torresmo"_, liga _Dar ênfase_ e toca _Adicionar à lista_.

O cliente faz `insert into list_items (...)` sem `couple_id` escolhido à mão: vai o `couple_id` do próprio casal, e a policy recusa qualquer outro. O `CHECK` confere que um restaurante tem cidade, país e coordenada, e nenhuma plataforma. A grade só mostra o card quando o banco devolve a linha. O item também aparece em _Em destaque_ e em _Adicionados recentemente_.

Duas semanas depois, em São Paulo, ele abre o Mocotó e toca _Marcar como feito_. Escolhe a data (_Sáb, 26 set 2026_), _Quem estava: Os dois_, três fotos, escreve a memória dele (142 de 500 caracteres) e dá 4 corações (_"4 de 5 · Amamos"_). O cliente reduz as fotos e sobe cada uma para `couple-media/{couple_id}/memory/{uuid}.webp`, depois chama `mark_item_done(...)`. A RPC grava, **numa transação**, o status, a data, quem estava, a nota, a memória do Gabriel e as três fotos. O card ganha o selo _Feito · 26 set_ e o progresso vai de 31 para 32 de 86.

Em Marau, a Lana abre a Lista mais tarde. A aba volta ao foco e a lista é relida (ADR 0015). No detalhe do Mocotó ela vê a memória do Gabriel e um espaço vazio com _Escrever a minha_. Ela escreve a dela, que é uma linha dela em `list_memories`, e a do Gabriel continua intocada.

## 3. Requisitos (comportamentos observáveis)

**Casca**

- **R1** — A barra lateral ganha **Lista** (rota `/lista`), entre Calendário e Configurações. O botão global _Adicionar_ da barra continua fora: ele abre um seletor entre evento e item, e o evento é da Fase 5.

**Tela da Lista** (`B3rwp`)

- **R2** — Cabeçalho: _"{n} coisas · {m} já feitas"_. Com filtro ativo, acrescenta _" · filtrando: {resumo}"_ (ex.: _"Séries, já feitas, do Gabriel"_). Título _Nossa lista_. Busca _"Buscar lugar, filme, comida…"_ com o atalho ⌘K (Ctrl+K fora do macOS), que foca o campo. Botão _Adicionar_.
- **R3** — Chips de categoria: _Todos_ e as 8, cada um com o total **da categoria**, ignorando os outros filtros. As categorias em `hidden_categories` não aparecem em chip, grade, progresso, sugestão nem contagem nenhuma (inclusive a do cabeçalho).
- **R4** — Filtros: _Quero fazer_ / _Já fizemos_ / _Todos_ (padrão _Todos_). **Quem** (_Gabriel_ / _Lana_ / _♥ os dois_) filtra por **quem estava** no item feito (seção 13, decisão 3), e por isso só aparece com _Já fizemos_ selecionado. _Gabriel_ quer dizer "feito só pelo Gabriel", sem incluir os feitos pelos dois: as três opções são as mesmas do modal e não se sobrepõem. A ordenação (_Recentes_ / _A–Z_ / _Categoria_) começa em `list_default_sort` e, mudada na tela, vale só até sair da tela. **O seletor de visualização (grade/lista) não é renderizado**: só a grade está desenhada.
- **R5** — A busca filtra no cliente, sem diferenciar acento nem maiúscula, por nome, nota, cidade, região, _onde comer_, cidades de interesse e plataforma. Ela compõe com os outros filtros.
- **R6** — _Em destaque · {k} com ênfase_: faixa horizontal com os itens `featured` visíveis, na ordem escolhida. Ela some quando `k = 0` ou quando qualquer filtro ou busca está ativo.
- **R7** — _Tudo · {n} itens · {ordenação} primeiro_ (_"Recentes primeiro"_, _"A–Z"_, _"Por categoria"_): a grade de cards (`List Card`, `jjOX2`). O card mostra foto (ou o fundo da categoria, quando não há foto), o selo _Feito · {d mmm}_ quando feito, o nome, a etiqueta da categoria e a **linha secundária** (I10). O rodapé do card de item feito mostra quem estava e há quanto tempo foi feito (_"Lana · 2 sem"_, _"♥ os dois · 3 sem"_). O do item a fazer mostra quem adicionou e há quanto tempo (_"Gabriel · 3 dias"_). Tocar o card abre o detalhe (R14).
- **R8** — Ordens: _Recentes_ = `created_at` decrescente. _A–Z_ = `name` com `localeCompare('pt-BR', { sensitivity: 'base' })`. _Categoria_ = ordem de `LIST_CATEGORIES`, depois recentes dentro de cada uma.
- **R9** — **Filtro sem resultados** (`DXg1A`): título _"Nenhuma {categoria no singular} por aqui ainda"_ (ou _"Nada por aqui ainda"_ sem categoria), um texto que muda com o filtro (o do frame vale para série + já feitas + pessoa: _"O {nome} ainda não marcou nenhuma série como vista. Que tal escolher a próxima pra maratonar juntos?"_), os filtros ativos como chips, _Limpar filtros_ e _Adicionar {categoria}_, que abre o modal com a categoria já escolhida. O texto de cada combinação fica numa tabela em `src/domain/list.ts`, com um fallback genérico.
- **R10** — **Lista vazia** (nenhum item no casal, estado sem frame): _"A lista de vocês começa aqui"_, _"Lugares, comidas, filmes — tudo que vocês querem fazer juntos."_ e _Adicionar o primeiro_. O painel da direita mostra só o progresso (_0 de 0_) e _Adicionados recentemente_ vazio.

**Adicionar / editar** (8 modais: `RvlR2`, `i160RR`, `PmKZ4`, `cX0DT`, `UaQ1K`, `e3jts`, `wBKDf`, `NuAJ6`)

- **R11** — Passo _1 · Categoria_: os 8 chips (as ocultas também aparecem, porque esconder não impede adicionar). Passo _2 · Detalhes da {categoria}_ com os campos de cada uma:

  | Categoria | Campos (na ordem do frame) |
  | --- | --- |
  | País | Nome · _Cidades que interessam_ (chips, ≤ 12, _"Aparece como segunda linha do item na lista"_) · Link · Nota · Foto. Local = **o país**, buscado com `layer=country`; o pin fica no centro do país (_"O pin fica no centro do país, não num endereço — as cidades acima não viram pins."_) |
  | Cidade | Nome · País (só leitura, vem do local) · _Região_ (texto livre, segunda linha) · _Local · busca de cidade_ (`layer=city`) · Link · Nota · Foto |
  | Restaurante | Nome · Link · _Local_ (busca de estabelecimento ou endereço) · Nota · Foto |
  | Parque | igual ao Restaurante |
  | Comida | Nome · _Onde comer · opcional_ (_"Pode ficar vazio se for um prato, não um lugar"_) · _Local · cidade_ (`layer=city`) · Link · Nota · Foto |
  | Experiência | Nome · Link · _Local_ (_"Busque cidade, região ou endereço — ex.: Capadócia"_, sem filtro de camada) · Nota · Foto |
  | Filme | Nome · _Onde assistir_ · Link · Nota · Foto · aviso _"Sem local"_ |
  | Série | igual ao Filme, mais _Temporadas_ |

  _Dar ênfase · Aparece em destaque_ em todos. Rodapé: **_"Adicionando como {nome}"_**. O _"· a {outra} recebe um aviso"_ do frame não aparece enquanto não houver aviso nenhum (fora de escopo, seção 14); o texto não promete o que não acontece.
- **R12** — _Onde assistir_: os chips _Netflix_, _Prime Video_, _Max_, _Disney+_, _Apple TV+_, _MUBI_ e _Outra…_, que abre um campo de texto (≤ 30). Os números ao lado dos chips no frame não são renderizados, porque não significam nada no produto. _Temporadas_: inteiro de 1 a 99, opcional.
- **R13** — **Busca de lugar** (ADR 0016). Pede ≥ 3 caracteres, espera 350 ms sem digitar, cancela a requisição anterior, traz no máximo 5 resultados, com viés de proximidade pela cidade-casa de quem busca, e mostra _"© OpenStreetMap"_ na lista suspensa. Cada resultado mostra nome e _"{rua, nº} · {cidade}, {UF}"_ (ou _"{estado}, {país} · {lat}, {lng}"_ na busca de cidade, como no frame de Gramado). O nome do país sai de `Intl.DisplayNames('pt-BR', { type: 'region' })` a partir do código ISO, porque o Photon devolve o nome local (_日本_). Escolher preenche endereço, cidade, estado, país, código do país e coordenada. **Quando não se acha o lugar**: a última linha da lista é _"Não achei — usar só a cidade"_, que troca a busca para `layer=city` e libera um campo _Endereço_ de texto livre. O pin cai no centro da cidade.
- **R14** — Editar um item reabre o mesmo modal preenchido, com o título _"Editar"_. **A categoria não muda na edição**, porque trocar de formato (geográfico ↔ mídia) deixaria campos órfãos. Quem quer outra categoria apaga e adiciona de novo.
- **R15** — _Foto_ do item: _Trocar foto_ sobe uma imagem reduzida no cliente (800 px no lado maior, WebP) para `couple-media/{couple_id}/item/{uuid}.webp`. Trocar de novo apaga a anterior depois de gravar a nova, como a capa da Fase 3.

**Detalhe do item** (`RWegR`, painel sobreposto)

- **R16** — Topo: foto, _"Feito em {d mmm aaaa}"_ (se feito), etiqueta da categoria, corações (0–5, **tocáveis** para mudar a nota, que grava no gesto como nas Configurações), nome. Para item geográfico: endereço, _"{cidade}, {UF}"_ e a distância (I11). Para mídia: plataforma e temporadas. _Ver no globo_ não aparece (Fase 7).
- **R17** — _A nossa memória_ (só no item feito): a data do feito, as fotos (as 3 primeiras e _"+{n} fotos"_, que abre a galeria em tela cheia), e uma entrada por integrante (`Memory Entry`, `YmDIZ`), com avatar, nome e texto. A entrada de quem está vendo pode ser editada no lugar. A da outra pessoa só se lê. Se a outra pessoa ainda não escreveu, a entrada dela não aparece. Se quem está vendo não escreveu, aparece _Escrever a minha_. _Adicionar fotos_ vale para qualquer um dos dois, até 10 no total. Quem subiu uma foto pode removê-la.
- **R18** — Abaixo: _Link_ (abre em nova aba, `rel="noopener noreferrer"`), _Nota_, _"Adicionado · {nome} · {d mmm aaaa}"_. Rodapé: no item a fazer, _Marcar como feito_ (primário). No feito, o selo _Feito_. Nos dois, _Editar_ e _Apagar_. _Agendar de novo_ não aparece (Fase 5).
- **R19** — _Apagar_ pede confirmação (_"Apagar {nome}? A memória e as fotos vão junto."_ quando feito, _"Apagar {nome} da lista?"_ quando não) e segue a ordem da seção 7.

**Marcar como feito** (`x4sciG`)

- **R20** — Subtítulo _"{nome} · {Categoria} · {cidade ou plataforma}"_. _Quando_: data, padrão hoje, **não pode ser futura**. _Quem estava_: _{nome 1}_ / _{nome 2}_ / _♥ Os dois_, padrão _Os dois_. _Fotos_: _"{k} de 10"_, _Adicionar_ (múltiplas), cada uma reduzida a 1600 px WebP. _Memória_ (opcional, ≤ 500, contador _"{k}/500"_), com a legenda _"{nome} escrevendo · a {outra} pode completar"_. _Quanto vocês amaram?_ de 1 a 5, opcional, com o rótulo _"{n} de 5 · {rótulo}"_ (`RATING_LABELS`: 1 _Não foi pra nós_, 2 _Ok_, 3 _Gostamos_, 4 _Amamos_, 5 _Inesquecível_). A legenda _"Vira a 'Última memória' da Home"_ não aparece até a Fase 7. _Cancelar_ / _Marcar como feito_.

**Painel da direita** (`ltlFV`)

- **R21** — Data de hoje por extenso e _O que vem por aí_ (o mesmo cabeçalho do painel das Configurações).
- **R22** — _Progresso_: _"{feitos} de {total} feitas"_, a porcentagem inteira e, com `show_category_progress`, uma barra por categoria visível (_"{f}/{t}"_). _Ver tudo_ aplica _Já fizemos_ na grade.
- **R23** — _Sugestão do momento_ (some com `show_daily_suggestion = false`): _"Sorteado da lista"_, com nome, _"{Categoria} · {secundária} · {distância}"_ e uma linha de contexto. O sorteio vem **do lugar onde o casal está hoje** (seção 13, decisão 4), por `coupleStateOn` sobre as estadias do banco:
  - **juntos** (em casa ou viajando): item geográfico não feito a até `NEARBY_RADIUS_KM` da cidade. Contexto: _"Vocês estão juntos em {cidade} até {d mmm}"_, ou sem o _"até"_ quando a estadia está em aberto;
  - **separados**: filme ou série não feito. Contexto: _"Pra uma noite separados, cada um na sua casa."_;
  - **`unknown`** (o caso real até a Fase 5): qualquer item não feito. Contexto: _"Sem registro de onde vocês estão hoje."_

  _Outra_ sorteia de novo, sem repetir a atual enquanto houver alternativa. _Bora fazer_ abre o _Marcar como feito_ do item. Com o conjunto vazio aparece _"Nada pra sugerir por aqui — adicione algo à lista."_ O sorteio usa um gerador injetável, para o teste ser determinístico.
- **R24** — _Perto de vocês_: só quando o casal está **juntos**, com o ícone do estado (_♥_), _"Juntos em {cidade}"_, _"{n} itens da lista na cidade · do calendário"_ e os 3 itens não feitos mais próximos, com a distância. Separados, o bloco diz _"Vocês estão em cidades diferentes hoje"_. Em `unknown`, diz _"Sem registro de onde vocês estão hoje — o Calendário vai preencher isso."_ Nunca usa a cidade-casa como palpite. _Ver no globo_ não aparece.
- **R25** — _Adicionados recentemente_: os 4 últimos por `created_at`, com _"{secundária} · há {tempo}"_. _Ver todos_ zera os filtros e ordena por _Recentes_.

**Configurações e export** (efeitos da Fase 3 que esta fase liga)

- **R26** — No painel _O espaço de vocês_ e na _Zona sensível_, _itens na lista_ passa a mostrar o total real, no lugar de **—**. Na aba _Lista_, os chips de _Categorias visíveis_ ganham o contador por categoria que a Fase 3 adiou. Em _Fotos guardadas_, a legenda vira _"Fotos de perfil, do casal e da lista"_.
- **R27** — O export sobe para `version: 2` e ganha `list_items` (sem `couple_id` nem ids de perfil: quem adicionou e quem estava vão como `slot`), `list_memories` (por `slot`) e `list_photos` (só a contagem por item, porque o export nunca leva imagem).

**Gravação**

- **R28** — Como nas Configurações, a tela só mostra o valor depois do `ok` do banco. O modal fica aberto e desabilitado enquanto grava. Na falha, continua aberto com o que foi digitado e a causa. Depois de cada escrita própria e sempre que a aba volta ao foco (`visibilitychange` → `visible`), a Lista relê tudo (ADR 0015).

## 4. Invariantes

- **I1** — Um item pertence a exatamente um casal, e o `couple_id` não muda depois de criado (trigger).
- **I2** — **Dois formatos, cobrados no banco** (ADR 0003 revisado):
  - mídia (`filme`, `serie`): `platform` preenchida; `lat`, `lng`, `country_code`, `city`, `address`, `region`, `venue` e `highlights` nulos ou vazios;
  - geográfico (as outras 6): `lat`, `lng` e `country_code` preenchidos; `platform` nula;
  - `pais`: `city` nula. As 5 geográficas restantes: `city` preenchida;
  - `seasons` só em `serie`, `highlights` só em `pais`, `region` só em `cidade`, `venue` só em `comida`.
- **I3** — **Feito é um estado coerente**: `status = 'done'` ⇔ `done_on` e `done_with` preenchidos. `done_with = 'solo'` ⇔ `done_solo_by` preenchido. `rating` só existe em item feito. `done_on` nunca é futuro (tolerância de um dia para o fuso).
- **I4** — `done_solo_by`, `added_by` e o autor de memória e de foto são integrantes do casal do item **no momento da escrita**. Depois, quem sai do casal continua como autor (os perfis não são apagados).
- **I5** — **Uma memória por pessoa por item** (chave `(item_id, profile_id)`). Cada um escreve, edita e apaga só a sua. A outra pessoa lê.
- **I6** — No máximo **10 fotos** por item (trigger). Cada foto aponta para `couple-media/{couple_id do item}/memory/…`, e a foto do item para `…/item/…` (`CHECK` de prefixo, como `cover_path`).
- **I7** — Marcar como feito é **atômico**: status, data, quem estava, nota, memória e fotos entram numa transação só, ou nada entra.
- **I8** — As chaves de categoria são as de `LIST_CATEGORIES` (I6 da Fase 3). `list_items.category` e `couple_settings.hidden_categories` usam o mesmo vocabulário, e a paridade é testada.
- **I9** — O estado do casal usado pela sugestão e pelo _Perto de vocês_ é **derivado** (`coupleStateOn`, ADR 0002), nunca gravado. `unknown` nunca é tratado como _separados_ nem como _em casa_.
- **I10** — A linha secundária é uma função pura da categoria (`secondaryLine`): mídia → plataforma; `pais` → cidades de interesse, juntas com vírgula e _"e"_ (ou o nome do país, se vazias); `cidade` → região, ou _"{estado}, {país}"_; `comida` → _"{onde comer}, {cidade}"_ ou só a cidade; as outras → cidade. Um lugar só, usado por card, destaque, recentes, sugestão e o subtítulo do _Marcar como feito_.
- **I11** — A distância é sempre em **linha reta** (`distanceKm`, já existente) **a partir da cidade onde o casal está hoje**. Sem essa cidade (separados ou `unknown`), a distância não aparece. Nunca é medida a partir da cidade-casa.
- **I12** — A lista não usa `cities`. Os itens guardam o lugar **resolvido** (texto + coordenada), e a escrita em `cities` continua fechada ao cliente (ADR 0007 intacto).

## 5. Contrato & dados

### Contrato compartilhado — `src/domain/list.ts` (puro)

```ts
export { LIST_CATEGORIES } from './settings'           // a mesma lista, não uma cópia
export type ListCategory = (typeof LIST_CATEGORIES)[number]
export const MEDIA_CATEGORIES = ['filme', 'serie'] as const
export const PLATFORMS = ['Netflix', 'Prime Video', 'Max', 'Disney+', 'Apple TV+', 'MUBI'] as const
export const RATING_LABELS = { 1: 'Não foi pra nós', 2: 'Ok', 3: 'Gostamos', 4: 'Amamos', 5: 'Inesquecível' } as const
export const LIST_LIMITS = { name: 80, note: 280, link: 300, region: 60, venue: 80, address: 160,
  platform: 30, highlights: 12, highlight: 40, seasons: 99, memory: 500, photosPerItem: 10 } as const
export const NEARBY_RADIUS_KM = 30

export const CATEGORY_LABELS: Record<ListCategory, { one: string; many: string; gender: 'm' | 'f' }>

export interface ListItem { id; category; name; note; link; photoPath; featured; status: 'want' | 'done';
  rating: 1|2|3|4|5 | null; addedBy; createdAt; doneOn: string | null;
  doneWith: 'both' | 'solo' | null; doneSoloBy: string | null;
  place: GeoPlace | null; media: { platform: string; seasons: number | null } | null;
  region: string | null; venue: string | null; highlights: string[] }
export interface GeoPlace { address: string | null; city: string | null; state: string | null;
  country: string; countryCode: string; lat: number; lng: number }

export function validateItem(draft): { ok: true } | { ok: false; field: string; reason: string } // espelha o CHECK
export function secondaryLine(item: ListItem): string                                       // I10
export function applyFilters(items, filters: ListFilters, hidden: readonly ListCategory[]): ListItem[]
export function sortItems(items, sort: 'recent' | 'az' | 'category'): ListItem[]
export function progress(items, hidden): { done: number; total: number; byCategory: Record<…> }
export function whereWeAre(stays, members, cities, today): { kind: 'together'; city: City; until: string | null }
                                                      | { kind: 'apart' } | { kind: 'unknown' }
export function nearby(items, city, radiusKm = NEARBY_RADIUS_KM): { item: ListItem; km: number }[]
export function suggestionPool(items, where, hidden): ListItem[]
export function pickSuggestion(pool, current: string | null, random: () => number): ListItem | null
export function emptyStateCopy(filters, names): { title: string; body: string }
export function relativeAge(fromIso: string, today: string): string   // "3 dias", "2 sem", "1 mês", "5 meses"
```

`whereWeAre` usa `coupleStateOn` e escolhe a cidade da estadia vigente (a mesma para os dois, por definição de _juntos_) e o `until = min(ends_on)` das duas. As duas estadias em aberto dão `null`.

### Migration — `…_list.sql` (append-only, aplicada por `npm run db:push`)

```sql
create table public.list_items (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples (id) on delete cascade,
  category     text not null check (category in ('pais','cidade','restaurante','parque','comida','experiencia','filme','serie')),
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  note         text check (char_length(note) <= 280),
  link         text check (char_length(link) <= 300),
  photo_path   text,
  featured     boolean not null default false,
  status       text not null default 'want' check (status in ('want','done')),
  rating       smallint check (rating between 1 and 5),
  added_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  done_on      date,
  done_with    text check (done_with in ('both','solo')),
  done_solo_by uuid references public.profiles (id) on delete set null,
  -- geográfico
  address text, city text, state text, country text, country_code text check (country_code ~ '^[A-Z]{2}$'),
  lat double precision check (lat between -90 and 90), lng double precision check (lng between -180 and 180),
  region text check (char_length(region) <= 60),
  venue  text check (char_length(venue) <= 80),
  highlights text[] not null default '{}' check (cardinality(highlights) <= 12),
  -- mídia
  platform text check (char_length(platform) <= 30),
  seasons  smallint check (seasons between 1 and 99),

  unique (id, couple_id),                                              -- alvo das FKs compostas
  constraint list_items_format check (...),                            -- I2, um bloco por formato
  constraint list_items_done   check (...),                            -- I3
  constraint list_items_photo  check (photo_path is null or photo_path like couple_id::text || '/item/%')
);
create index on public.list_items (couple_id, created_at desc);
create index on public.list_items (added_by);
create index on public.list_items (done_solo_by);

create table public.list_memories (
  item_id    uuid not null,
  couple_id  uuid not null,
  profile_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body       text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (item_id, profile_id),
  foreign key (item_id, couple_id) references public.list_items (id, couple_id) on delete cascade
);

create table public.list_photos (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null,
  couple_id  uuid not null,
  path       text not null unique check (path like couple_id::text || '/memory/%'),
  added_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (item_id, couple_id) references public.list_items (id, couple_id) on delete cascade
);
```

O `couple_id` repetido nas duas tabelas filhas existe para a RLS ser a mesma expressão de sempre (`couple_id in (select private.my_couple_ids())`), sem subquery por item. A FK composta garante que ele é o do item.

**Triggers** (funções em `private`, `security invoker`, exceto onde dito): `updated_at` nas três; `list_items_couple_immutable` (I1); `list_items_members` confere que `added_by` e `done_solo_by` são integrantes (I4), com `security definer` só para ler `couple_members`, como o `profiles_color_distinct` da Fase 3; `list_photos_max` recusa a 11ª foto com `23514` / `list_photos_limit` (I6).

**RLS:**

| Tabela | select | insert | update | delete |
| --- | --- | --- | --- | --- |
| `list_items` | casal | casal, `added_by = auth.uid()` | casal | casal |
| `list_memories` | casal | casal, `profile_id = auth.uid()` | `profile_id = auth.uid()` | `profile_id = auth.uid()` |
| `list_photos` | casal | casal, `added_by = auth.uid()` | — | casal |

Os dois editam e apagam qualquer item, porque o acervo é dos dois. Apagar a foto de outra pessoa fica permitido no banco, porque a foto é do casal (ADR 0012). A tela só oferece _remover_ a quem subiu (R17), e isso é atrito de interface, não controle de segurança.

**Storage:** nada novo. `couple-media` e as policies da Fase 3 já cobrem `{couple_id}/item/…` e `{couple_id}/memory/…` (ADR 0012 previu `memory`; `item` entra no texto do ADR).

**RPC `mark_item_done`** — `security invoker` (a RLS vale dentro dela), `set search_path = ''`, `revoke from public, anon`, `grant to authenticated`:

```
mark_item_done(p_item uuid, p_done_on date, p_done_with text, p_solo_by uuid,
               p_rating smallint, p_memory text, p_photo_paths text[]) → jsonb
  sem sessão → 42501
  item não visível → {status:'not_found'}
  já feito → {status:'already_done'}
  senão, numa transação: update do item (I3) · upsert da memória de auth.uid() se p_memory não vazio
        · insert de uma list_photos por caminho → {status:'done'}
  violação de CHECK/trigger → propaga (23514), e a transação inteira volta
```

Ela é `invoker`, então a contagem de `security definer` em `public` **continua doze** (A11 da Fase 3 não muda). A RPC existe só pela atomicidade (I7). As demais escritas (criar, editar, nota, memória, foto avulsa, apagar) são `insert`/`update`/`delete` diretos.

### Cliente — fronteira de dados

- `src/data/list.ts`: `loadList()` → `DataResult<{ items, memories, photos }>` em três `select`s paralelos, sem filtro de casal. `createItem(draft)`, `updateItem(id, patch)`, `deleteItem(item)` (seção 7), `markDone(input)`, `saveMemory(itemId, body)`, `deleteMemory(itemId)`, `addPhotos(itemId, files)`, `removePhoto(photo)`, `replaceItemPhoto(item, file)`, `signedUrls(paths)` (um `createSignedUrls` por lote, validade de 1 h). As escritas devolvem `ok` / `invalid` (CHECK, com o nome da constraint) / `photo_limit` / `not_found` / `already_done` / `unauthenticated` / `error`. O snake_case não passa da fronteira.
- `src/data/places.ts`: `searchPlaces(query, { mode: 'place' | 'city' | 'country', bias?: { lat, lng }, signal })` → `DataResult<GeoPlace & { label, detail }[]>`. Faz `GET https://photon.komoot.io/api/?q=…&limit=5&lang=default[&layer=city|country][&lat&lon]` e mapeia a `Feature` para `GeoPlace`: `housenumber`/`street` → `address`, `city ?? name` (na camada de cidade) → `city`, `state`, `countrycode` em maiúsculas, o nome do país via `Intl.DisplayNames`, e `coordinates` = `[lng, lat]`, **na ordem do GeoJSON**. Se a busca falhar (rede ou HTTP ≠ 200), cai em `searchCities` (IBGE, só Brasil), já existente, e marca o resultado _"Busca mundial indisponível — mostrando cidades do Brasil"_. A URL base fica em `PHOTON_URL`, para a troca de instância ser uma linha.
- `ListApi` injetável (como `SettingsApi`), para o teste de interface andar sem rede. O relógio (`today`) e o sorteio (`random`) também são injetados.

**Provedor provado em 2026-09-26** (chamadas reais, registradas no ADR 0016): `Mocotó São Paulo` → restaurante com coordenada; `Parque Vicentina Aranha` → parque em SJC; `Göreme` → vilarejo em Nevşehir, TR; `Gramado` → município em RS; `Japão` com `layer=country` → JP (sem a camada, volta um vilarejo no Maranhão, daí o filtro obrigatório no modal de País); `Casa Amarela Bistrô São José dos Campos` → **não achado** (daí R13). `Access-Control-Allow-Origin: *`, sem chave. `lang=pt` não existe (só `default`, `de`, `en`, `fr`).

### Compatibilidade

- `database.types.ts` regenerado. O export sobe para `version: 2` (R27), e o teste do export é estendido.
- `src/app/Shell.tsx` ganha o destino Lista, e `router.ts` a rota `/lista` (sem parâmetro, porque o detalhe é estado da tela e não caminho: ADR 0013, gatilho não atingido).
- `settings/`: os três pontos de R26 leem `list_items` (a contagem vem de `select count` com `head: true`).
- ADR 0003 revisado (seção de revisão): `done_at timestamptz` → `done_on date`; `done_with` por pessoa; colunas novas `region`, `venue`, `highlights`, `updated_at`; `platform` como texto livre com sugestões, não enum. **A tabela está vazia** (não existe), então nenhum dado precisa de conversão.
- `.agent/Tasks/README.md`, seção da Fase 4: corrigir _"dos 8 modais de adicionar, 2 estão desenhados"_. Os 8 estão no `.pen`.

## 6. Identidade & nomes

- **Rota:** `/lista`. Sem sub-rotas nesta fase.
- **Chaves de categoria:** as 8 de `LIST_CATEGORIES`, que são nome de dado. Mudar custa migration.
- **Caminhos no Storage:** `couple-media/{couple_id}/item/{uuid}.webp` (foto do item) e `couple-media/{couple_id}/memory/{uuid}.webp` (fotos do feito). Um `uuid` novo por upload (ADR 0009).
- **`done_with`:** `'both' | 'solo'` + `done_solo_by`, por **perfil**, não por slot: a pessoa continua a mesma se trocar de slot depois de alguém sair.
- **Plataforma:** texto como exibido (_"Apple TV+"_), não um slug. As 6 sugestões são constantes do cliente; o banco só limita o tamanho.
- **Nomes das constraints** (`list_items_format`, `list_items_done`, `list_photos_limit`): a fronteira de dados os lê para dizer qual campo falhou. Renomear quebra a mensagem, e o teste pega.

## 7. Comportamento em falha

- **Leitura inicial.** Qualquer `DataResult` que não seja `ok` troca a tela por _"Não deu pra carregar a lista: {causa}"_ com _Tentar de novo_. `unauthenticated` volta ao Login (o portão já faz isso). **Nunca** mostra o estado _Lista vazia_ (R10) sem uma leitura `ok`: é o mesmo erro que o `DataResult` existe para impedir.
- **Releitura ao voltar ao foco falhou.** Mantém a lista que está na tela e mostra um aviso discreto _"Não deu pra atualizar — mostrando o que já estava aqui"_. Não apaga o que já foi lido.
- **Criar ou editar.** `invalid` → a mensagem do campo apontado pela constraint (o cliente já valida com `validateItem`, então chegar aqui é divergência, e a causa aparece). O modal continua aberto.
- **Busca de lugar.** Photon lento ou fora → IBGE (R13/seção 5). As duas fora → _"A busca de lugares está fora do ar — tente de novo em instantes"_, e o botão _Adicionar à lista_ fica desabilitado para item geográfico: sem coordenada, o `CHECK` recusaria de qualquer jeito. Uma resposta atrasada de uma consulta velha é descartada (`AbortController` + conferência da consulta).
- **Foto do item.** Sobe a nova → grava `photo_path` → apaga a antiga. Upload falhou → nada muda. `update` falhou → apaga a recém-subida (melhor esforço). Apagar a antiga falhou → fica órfã, como na Fase 3.
- **Marcar como feito — cascata.** (1) Sobe as fotos, em paralelo, até 3 por vez. (2) Chama a RPC com os caminhos. Se uma foto falha em (1), nada é gravado, as que subiram são apagadas (melhor esforço), e o modal mostra qual falhou e mantém tudo o que foi preenchido. Se (2) falha, as fotos que subiram são apagadas (melhor esforço) e o modal mostra a causa. `already_done` (a outra pessoa marcou segundos antes) → fecha o modal, relê a lista e avisa _"A {nome} já marcou este item como feito"_, e as fotos subidas são apagadas. `photo_limit` → _"Esse item já tem 10 fotos"_.
- **Adicionar fotos no detalhe.** Uma de cada vez: upload → `insert` em `list_photos`. Se o `insert` falha, o arquivo é apagado. Se a outra pessoa encheu as 10 no meio do caminho, `photo_limit` → a mesma mensagem e releitura.
- **Apagar item — cascata.** (1) Apaga os arquivos (`photo_path` + todas as `list_photos.path` do item). (2) `delete` da linha (as memórias e fotos vão por cascade). Se (1) falha, nada foi apagado. Se (1) dá certo e (2) falha, a tela diz _"As fotos de {nome} foram apagadas, mas o item não. Tente de novo."_: a mesma ordem e a mesma honestidade do _Apagar o espaço_ (ADR 0012). Apagar item que a outra pessoa já apagou → zero linhas → releitura sem erro.
- **Memória editada pelos dois ao mesmo tempo.** Não acontece: cada um só escreve a sua (I5).
- **Nota de corações mudada pelos dois.** Vence a última, como qualquer preferência (seção 7 da Fase 3).
- **Assinatura de URL da foto falhou.** O card mostra o fundo da categoria. As URLs são refeitas a cada releitura (validade de 1 h).
- **Projeto pausado (free tier).** É o caso `error` da leitura inicial.
- **A pessoa saiu do casal enquanto a outra está na Lista.** A primeira escrita volta com zero linhas ou erro de policy, e a tela mostra _"Este espaço mudou — recarregue"_, como nas Configurações.

## 8. Limites & orçamentos

- **Leitura:** três `select`s em paralelo, sem paginação. Esperado: centenas de itens (o design mostra 86). Teto de cuidado: acima de **1000 itens** a leitura passa a paginar. Não acontece nesta fase, e o limite está registrado aqui para quem chegar lá.
- **Estadias e membros** para `whereWeAre`: a mesma leitura das Configurações (≤ 2 × 366 linhas no ano, em memória).
- **Photon:** ≥ 3 caracteres, debounce de 350 ms, uma requisição em voo por campo, `limit=5`. Ele só é chamado dentro do modal, então duas pessoas geram no máximo dezenas de consultas por dia. A instância pública pede uso justo, e isto é uso justo.
- **Fotos:** ≤ 10 por item. As de memória ficam em 1600 px WebP (≈ 300 KB). A foto do item fica em 800 px (≈ 100 KB): 86 cards ≈ 9 MB no pior caso, com `loading="lazy"`. O bucket recusa acima de 5 MB (Fase 3). O `createSignedUrls` vai em **um** lote por releitura.
- **Cota do Storage:** 1 GB (`STORAGE_QUOTA_BYTES`). 10 fotos × 300 KB = 3 MB por item feito, ou seja, cerca de 300 itens feitos com galeria cheia. A aba _Dados e privacidade_ já mostra o uso.
- **Upload simultâneo:** até 3 por vez no _Marcar como feito_.

## 9. Segurança & permissões

- **Casal:** as três tabelas são cortadas por `private.my_couple_ids()`, a mesma função das tabelas e do Storage. O cliente não filtra por `couple_id` (ADR 0001). No `insert`, o cliente **manda** o `couple_id` (a coluna não tem default), e a policy `with check` recusa qualquer um que não seja do próprio casal.
- **Autoria:** `added_by`, o autor da memória e o de foto nascem de `auth.uid()` (default) e são conferidos no `with check`. Ninguém cria em nome da outra pessoa.
- **Memória:** só a própria se escreve (I5). A da outra pessoa é só leitura, no banco e na tela.
- **RPC:** `mark_item_done` é `invoker`, então não abre nada que a RLS não abriria. Nenhum `security definer` novo em `public`.
- **Terceiro (Photon):** o que se digita na busca de lugar sai do navegador para `photon.komoot.io` (Komoot, Alemanha). Não vai identificador, sessão nem cookie (`credentials: 'omit'`, `referrerPolicy: 'no-referrer'`), só o texto da busca e, como viés, a coordenada da cidade-casa, que é pública. Registrado no ADR 0016. Nome de item, nota e memória **nunca** saem para o provedor.
- **Link do item:** aceita só `http:`/`https:` (normaliza para `https://` quando não tem esquema) e abre com `noopener noreferrer`. `javascript:` é recusado no cliente e por `CHECK` (`link ~* '^https?://'`).
- **Fotos em produção com testes em produção:** a Fase 0 marcou a entrada de fotos como gatilho para rever o teste no projeto real. O ADR 0014 continua valendo: os testes sobem arquivos só em pastas de casais `@test.local` e apagam por `id`. O teste de Storage desta fase (A6) nunca lista nem lê a pasta de um casal real.

## 10. Critérios de aceite (testáveis)

| # | Critério (Dado/Quando/Então) | Como provar |
| --- | --- | --- |
| A1 | As categorias do cliente são idênticas ao `CHECK` de `list_items.category` e ao de `hidden_categories`, e `LIST_LIMITS` bate com os `CHECK` de tamanho | `supabase/tests/list.test.ts` (lê `pg_constraint`) + `src/domain/list.test.ts` |
| A2 | `validateItem` recusa e aceita exatamente o que o `CHECK` recusa e aceita: uma tabela de casos (filme com coordenada, país com cidade, série sem plataforma, restaurante sem coordenada, `seasons` em filme, `region` em parque, `highlights` 13, link `javascript:`), rodada **nos dois lados** | `src/domain/list.test.ts` + `list.test.ts` (db), a mesma fixture importada pelos dois |
| A3 | `secondaryLine` para as 8 categorias, com e sem os campos opcionais; `applyFilters` (categoria × status × quem × busca sem acento × ocultas); `sortItems` (três ordens, empate estável); `progress` ignora as ocultas; `relativeAge` nas fronteiras (6 dias → "6 dias", 7 → "1 sem", 30 → "1 mês") | `src/domain/list.test.ts` |
| A4 | `whereWeAre`: juntos em casa, juntos viajando, separados, `unknown` com um dos dois sem estadia, e `until` com estadia aberta (null) e com fins diferentes (o menor); `nearby` ordena por distância e corta em 30 km; `suggestionPool` escolhe o conjunto certo para cada estado; `pickSuggestion` não repete a atual quando há alternativa | `src/domain/list.test.ts` |
| A5 | Dada a pessoa A do casal 1, quando lê, cria, atualiza ou apaga item, memória e foto do casal 2, então zero linhas ou recusa. Quando A cria item com o `couple_id` do casal 2, então recusa | `list.test.ts` (db), padrão de `rls.test.ts` |
| A6 | Com o casal 1, quando A tenta editar ou apagar a memória de B, então zero linhas; quando A cria memória com `profile_id` de B, então recusa. B lê a memória de A | `list.test.ts` (db) |
| A7 | A 11ª foto de um item → `23514` / `list_photos_limit`. Foto com caminho de outro casal → recusa pelo `CHECK` e pelo Storage | `list.test.ts` (db) + `storage.test.ts` estendido |
| A8 | `mark_item_done` feliz grava status, data, quem estava, nota, a memória de quem chamou e as fotos. Com uma foto de caminho inválido no meio, **nada** muda (item continua `want`, sem memória). Em item já feito → `already_done`. Com `p_done_on` futuro → recusa. Com `solo` sem `p_solo_by`, ou com `p_solo_by` de fora do casal → recusa | `list.test.ts` (db) |
| A9 | Com o `couple_id` de um item alterado por `update` → recusa (I1). Apagar o item leva junto memórias e fotos (cascade) | `list.test.ts` (db) |
| A10 | `public` continua com as doze `security definer` da Fase 3, e `mark_item_done` é `invoker`, sem `EXECUTE` para `anon` | A20 de `onboarding.test.ts`, sem mudar a lista + asserção nova |
| A11 | `searchPlaces` mapeia `Feature`s reais (fixtures gravadas das seis consultas da seção 5) para `GeoPlace`, com `[lng, lat]` na ordem certa e o nome do país em português (JP → "Japão"); com a rede falhando, cai no IBGE e marca o aviso; uma resposta atrasada de consulta velha é descartada | `src/data/places.test.ts` (fetch simulado) |
| A12 | Tela: com leitura em voo → esqueleto; com `error` → mensagem e _Tentar de novo_; **nunca** o estado vazio antes do `ok`; com zero itens `ok` → R10 | `src/list/ListScreen.test.tsx` |
| A13 | Tela: chips com contagem por categoria; as ocultas somem de chips, grade, progresso e cabeçalho; _Quem_ só aparece com _Já fizemos_; o cabeçalho descreve o filtro; o filtro vazio mostra o texto do frame para série + feitos + Gabriel, com _Limpar filtros_ e _Adicionar série_ | `ListScreen.test.tsx` |
| A14 | Modal: escolher cada uma das 8 categorias mostra exatamente os campos da tabela de R11. Filme/série sem local; País busca com `mode: 'country'`; _"Não achei — usar só a cidade"_ troca para `mode: 'city'` e libera _Endereço_; o rodapé diz _"Adicionando como {nome}"_ sem _"recebe um aviso"_; editar não deixa trocar a categoria | `src/list/AddItemModal.test.tsx` |
| A15 | Marcar como feito: data futura bloqueada; _Os dois_ por padrão; o contador de fotos para em 10; a memória para em 500; ordem **upload → RPC**; falha no upload não chama a RPC e apaga as que subiram; `already_done` fecha, relê e mostra o nome da outra pessoa | `src/list/MarkDoneModal.test.tsx` |
| A16 | Detalhe: a memória própria é editável e a da outra pessoa não; _Escrever a minha_ aparece só para quem não escreveu; os corações gravam no gesto e voltam ao valor anterior na falha; _Apagar_ segue a ordem arquivos → linha, e a falha na linha mostra a mensagem das fotos; _Agendar de novo_ e _Ver no globo_ não existem | `src/list/ItemSheet.test.tsx` |
| A17 | Painel: com estadias de _juntos em SJC_ → _Perto de vocês_ com as distâncias e sugestão geográfica perto; separados → sugestão de filme/série; sem estadia → os textos de `unknown` e **nenhuma** distância; `show_daily_suggestion = false` esconde a sugestão; `show_category_progress = false` esconde as barras | `src/list/ListPanel.test.tsx` |
| A18 | `visibilitychange` para `visible` relê a lista; releitura com `error` mantém os itens na tela e mostra o aviso | `ListScreen.test.tsx` |
| A19 | Barra lateral mostra Calendário, Lista e Configurações; `/lista` renderiza a Lista | `src/app/Shell.test.tsx` + `router.test.ts` |
| A20 | Configurações: _itens na lista_ mostra o total real; os chips de _Categorias visíveis_ mostram a contagem; o export é `version: 2`, com itens, memórias e contagem de fotos, e sem `couple_id` nem UUID de perfil | `Settings.test.tsx` + `src/data/export.test.ts` |
| A21 | Fluxo real no online, com duas contas: adicionar um item de cada formato (restaurante pelo Photon, restaurante pelo fallback da cidade, país, série), marcar um como feito com 2 fotos e memória, a outra conta ver ao voltar à aba e escrever a memória dela, apagar um item feito e conferir que as fotos saíram do bucket | roteiro manual, com prints no ledger |
| A22 | `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:db` e `npm run build` limpos | saída dos comandos no verify |

## 11. Abordagem de teste

O domínio puro (`src/domain/list.ts`) fica no projeto `domain` do vitest, e é aqui que mora a maior parte da regra: filtros, ordens, linha secundária, progresso, onde estamos, sugestão. A **mesma fixture de casos de validação** (A2) roda contra `validateItem` e contra o banco. É assim que a regra "mora num lugar só" se prova, em vez de ser afirmada.

Interface em jsdom (ADR 0005), com `ListApi`, `today` e `random` injetados. Cada tela se prova renderizando e clicando. `places.ts` se prova com `fetch` simulado e respostas **gravadas** do Photon real (seção 5), para o teste não depender da rede nem da instância pública.

Banco: `supabase/tests/list.test.ts` e a extensão de `storage.test.ts`, contra o online (ADR 0014), com dois casais `@test.local`. Rodam no verify, fora do hook `Stop`.

Manual, e por quê: A21. Ele cruza o Photon real, o Storage real e duas sessões em dois navegadores, que é o uso de verdade. Nenhum teste automatizado cobre essa combinação sem simular metade dela.

## 12. Riscos & mitigações

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Photon público fora do ar, lento ou limitando | Não dá para adicionar item geográfico | Fallback no IBGE para cidades do Brasil (seção 5); `PHOTON_URL` é uma constante, e auto-hospedar o Photon (imagem Docker oficial) ou trocar de provedor mexe só em `places.ts`. Gatilho para rever: duas falhas percebidas pelo casal no mesmo mês |
| Estabelecimento pequeno fora do OSM (Casa Amarela Bistrô não foi achada) | O pin cai no centro da cidade, não na porta | R13: _"usar só a cidade"_ + endereço em texto livre. O globo da Fase 7 mostra o pin na cidade, o que é verdade no nível de zoom dele |
| _Perto de vocês_ e a sugestão ficam em `unknown` até a Fase 5 | O painel parece "quebrado" durante uma fase | Decisão consciente (seção 13, decisão 4): texto honesto em vez de palpite. A Fase 5 liga o painel sem retrabalho, porque ele já lê `stays` |
| Sem realtime, a outra pessoa vê um item atrasado | "Ué, não apareceu" | Releitura ao voltar ao foco cobre o uso real (ADR 0015). O ADR registra o gatilho para ligar o Postgres Changes: o casal reclamar, ou a Home (Fase 7) precisar de contador ao vivo |
| `CHECK` de formato crescer (o próprio ADR 0003 avisa) | Regra ilegível | Revisão do 0003 conta as condições: hoje são 4 por formato. Passar de 3 **novas** numa fase futura é o sinal de ADR novo, não de `CHECK` maior |
| Fotos enchendo a cota de 1 GB | Upload recusado | Redução no cliente (seção 8) + a barra de uso da Fase 3. A migração para R2/S3 já está no radar (ADR 0012) |
| Nome local do Photon (日本, Türkiye) vazando para a tela | Texto estranho | O país sempre sai de `Intl.DisplayNames('pt-BR')` pelo código ISO (A11). Cidades estrangeiras aparecem como o OSM as chama (_Göreme_), e isso é aceitável |
| Arquivos órfãos (falha no meio das cascatas) | Espaço gasto sem dono | Aceito, como na Fase 3; a limpeza vai com o agendador |

## 13. Open questions (bloqueiam a implementação)

Nenhuma. Decisões tomadas com o Gabriel em 2026-09-26:

1. **Busca de lugares pelo Photon/OSM**, direto do navegador, com o resultado guardado no item (ADR 0016). O Google Places foi descartado porque os termos proíbem guardar lat/lng por mais de 30 dias, e o pin precisa da coordenada guardada. O Mapbox foi descartado porque guardar pede o endpoint pago.
2. **Sem realtime**: reler ao voltar ao foco e depois de cada escrita própria (ADR 0015).
3. **Filtro _Quem_ = quem estava** no item feito, visível só com _Já fizemos_. O card de item feito mostra quem estava, e o de item a fazer mostra quem adicionou.
4. **_Perto de vocês_ lê as estadias do banco e é honesto**: sem estadia, diz que não há registro e não usa a cidade-casa como palpite.

Decisões de copy e de detalhe tomadas na spec, dentro do que o design deixa em aberto (mudam sem mexer em contrato):

5. **Os rótulos da nota de corações** (`RATING_LABELS`). O design só mostra o 4 (_Amamos_).
6. **_"· a {outra} recebe um aviso"_ e _"Vira a 'Última memória' da Home"_ saem** até existirem aviso e Home.
7. **Plataforma = 6 sugestões + _Outra…_**, texto no banco. Globoplay, Crunchyroll e o que vier não pedem migration.
8. **A categoria não muda na edição** (R14).

## 14. Fora de escopo

- **Avisar a outra pessoa** (no app, e-mail ou push) quando um item é adicionado ou feito. As preferências existem desde a Fase 3; o envio vai para o fim do roadmap.
- **Realtime** (ADR 0015 registra o gatilho).
- **_Agendar de novo_ e o _Vínculo com a lista_ do evento**: Fase 5.
- **_Ver no globo_**, os pins e a _Última memória_ da Home: Fase 7.
- **Visualização em lista** (o seletor grade/lista): só a grade está desenhada.
- **Desmarcar como feito** e **editar data / quem estava** depois do feito. A nota de corações e as memórias continuam editáveis. Um feito errado se corrige apagando e adicionando de novo. Voltar para _quero fazer_ levanta a pergunta "o que acontece com as memórias e fotos", que merece desenho próprio.
- **Fazer o mesmo item de novo** (várias ocorrências de "feito" por item): um item tem um feito só.
- **Filtros e item aberto na URL** (`/lista?categoria=…`, `/lista/{id}`): seria o gatilho de biblioteca de rotas do ADR 0013.
- **Importar uma lista existente** (nota do celular, planilha).
- **Distância rodoviária** e **distância a partir de onde a pessoa está fisicamente** (GPS).
- **Thumbnails gerados no servidor**: a transformação de imagem do Supabase é do plano pago; a redução no cliente cobre.
- **Limpeza de arquivos órfãos**: vai com o agendador.

---

## Plano (Gate 2)

> Toda tarefa que toca `supabase/migrations/` termina com `npx supabase db push --dry-run`, `npm run db:push`, `npm run types:gen` e `npm run typecheck` limpos. Antes do `db:push`: `select count(*)` nas tabelas afetadas (aqui só se criam tabelas).

1. [x] **ADRs e documentação que destravam.** _(feito em 2026-09-26, `Proposed` até a implementação)_ Revisão do 0003, 0015 (sem realtime), 0016 (Photon, com as provas da seção 5); a linha `item` no 0012; a correção dos "2 de 8" em `Tasks/README.md`. → base para tudo
2. [x] **Contrato de domínio.** `src/domain/list.ts` + `list.test.ts`, incluindo a fixture de validação compartilhada. → A2 (lado cliente), A3, A4
3. [x] **Migration** (`list_items`, `list_memories`, `list_photos`, triggers, RLS, `mark_item_done`) + `supabase/tests/list.test.ts` + extensão de `storage.test.ts`. → A1, A2 (lado banco), A5–A10
4. [x] **Fronteira de dados.** `src/data/list.ts`, `src/data/places.ts` (com as fixtures gravadas), `ListApi`. → A11
5. [x] **Casca.** `/lista` no roteador e Lista na barra lateral. → A19
6. [x] **Tela: grade, filtros, busca, estados vazios e de erro, releitura no foco.** `src/list/ListScreen.tsx` + `list.css`. → A12, A13, A18
7. [x] **Modal de adicionar/editar** (8 categorias, busca de lugar, foto do item). → A14
8. [x] **Detalhe do item e Marcar como feito.** → A15, A16
9. [x] **Painel da direita.** → A17
10. [x] **Configurações e export.** R26, R27. → A20
11. [ ] **Fechar.** _(tudo feito exceto o A21 manual)_ A21 manual, A22, skill `verify`, `.agent/System/project_architecture.md` (tabelas da lista documentadas, como o 0003 exige), `CLAUDE.md` (estado atual), `Tasks/README.md`, ledger, spec → 🟢.

---

## Related

- Brainstorm: conversa de 2026-09-26 (encurtado a pedido; a fase já estava desenhada)
- ADRs desta fase: revisão do [0003](../Decisions/0003-lista-tabela-unica-com-check-por-categoria.md) · 0015 · 0016 (a escrever no mesmo PR)
- ADRs que esta fase não pode violar: [0001](../Decisions/0001-supabase-com-rls-por-casal.md) · [0002](../Decisions/0002-estadia-por-pessoa-estado-derivado.md) · [0005](../Decisions/0005-interface-se-prova-em-jsdom.md) · [0007](../Decisions/0007-cidades-brasileiras-por-seed-do-ibge.md) (a lista não escreve em `cities`) · [0011](../Decisions/0011-preferencias-em-tres-escopos.md) · [0012](../Decisions/0012-midia-do-casal-em-bucket-por-casal.md) · [0013](../Decisions/0013-casca-e-navegacao-por-caminho.md) · [0014](../Decisions/0014-testes-de-integracao-no-projeto-online.md)
- Design (lido pelo MCP do Pencil em 2026-09-26): `B3rwp` Todos · `DXg1A` Filtro sem resultados · `RWegR` Detalhe (feito) · `x4sciG` Marcar como feito · `ltlFV` Painel · modais `RvlR2` Restaurante · `i160RR` Série · `PmKZ4` País · `cX0DT` Cidade · `UaQ1K` Parque · `e3jts` Comida · `wBKDf` Experiência · `NuAJ6` Filme · componentes `jjOX2` List Card, `YmDIZ` Memory Entry, `DwK4I` Category Tag
- Ledger da execução: `fase-4-lista.ledger.md`
