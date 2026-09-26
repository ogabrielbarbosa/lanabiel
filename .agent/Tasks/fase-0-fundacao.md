# Spec — `fase-0-fundacao`

- **Data:** 2026-09-25
- **Autor:** Gabriel Barbosa
- **Status:** 🟢 Done — 2026-09-25. Os 14 critérios provados; execução em [`fase-0-fundacao.ledger.md`](./fase-0-fundacao.ledger.md).
- **Research (Gate 0):** N/A — o produto está desenhado tela por tela no Pencil (~50 frames). Não havia dúvida de mercado nem de comportamento esperado; a dúvida era de modelo de dados, e ela virou ADR.
- **ADR necessário?** Não — as três decisões estruturais já estão escritas: [0001](../Decisions/0001-supabase-com-rls-por-casal.md), [0002](../Decisions/0002-estadia-por-pessoa-estado-derivado.md), [0003](../Decisions/0003-lista-tabela-unica-com-check-por-categoria.md). Esta spec as implementa; não introduz decisão nova.

---

## 1. What & Why

O app hoje guarda estadias num array em `localStorage`, no navegador do Gabriel. A Lana não tem acesso a nada — o "app do casal" é um bloco de notas de uma pessoa. Esta fase troca o chão: Postgres no Supabase, isolamento por RLS, e o domínio central (onde cada um está, e portanto se estão juntos) escrito como módulo puro e testado.

Nenhuma tela desenhada nasce aqui. O que nasce é o que as oito fases seguintes vão assumir como dado: o schema, as policies, os tipos gerados, a derivação do estado do casal, e um test runner que prove RLS. Ao fim desta fase, duas contas reais escrevem no mesmo acervo sem ver o acervo de mais ninguém, e a pergunta "onde cada um estava no dia X" tem uma resposta só.

O usuário é o próprio casal. O que ele consegue fazer depois que isto existir: nada visível ainda. O que ele deixa de correr risco de: perder tudo ao limpar o navegador, e construir sete fases sobre um modelo que duplica a verdade.

## 2. Como funciona (um cenário real)

A Lana está em Marau desde 12 de setembro, com estadia em aberto — ninguém sabe ainda quando ela volta. O Gabriel voltou pra São José dos Campos em 22 de setembro. Hoje é 25 de setembro.

Um script de teste autentica como a Lana (`signInWithPassword`, usuário criado pelo seed) e pede as estadias do casal: `select * from stays`. Ela não passa `couple_id` em nenhum lugar. A policy resolve `auth.uid()` → `couple_members` → `couple_id`, e devolve as onze estadias do histórico do casal, nenhuma de mais ninguém. O mesmo script autentica como um terceiro usuário, de outro casal, roda a mesma query, e recebe **zero linhas** — não um erro, zero linhas.

Com as estadias em mão, o módulo `coupleStateOn('2026-09-25', stays, members)` compara a estadia vigente de cada um. Gabriel em São José dos Campos, Lana em Marau: cidades diferentes → `{ kind: 'apart' }`. Para o dia 20, os dois estavam em Marau, que é a cidade-casa da Lana → `{ kind: 'together', cityId: <marau>, hostProfileIds: [<lana>] }`, o que a interface vai rotular "Juntos em Marau". Nenhuma linha em nenhuma tabela guarda a palavra "juntos".

A Lana então tenta registrar que estava em Ilhabela de 18 a 22 de setembro — mas ela já tem estadia em Marau nesse intervalo. O `INSERT` é rejeitado pelo banco, pela restrição de exclusão, com violação `stays_no_overlap`. Não é validação de tela que pode ser contornada: é o banco dizendo que uma pessoa não está em dois lugares no mesmo dia.

## 3. Requisitos (comportamentos observáveis)

- **R1** — O schema atual (`places`, `calendar_events`, `mementos`, `profiles`, `couples`, `couple_members`) é removido e reconstruído. As migrations aplicam de um banco vazio, em ordem, sem intervenção manual.
- **R2** — Toda tabela de domínio tem RLS ativa. Uma sessão autenticada lê e escreve exclusivamente as linhas do seu casal, sem passar `couple_id` na query.
- **R3** — Uma pessoa não pode ter duas estadias que se sobreponham, nem duas estadias em aberto. A regra é cobrada pelo banco, não pelo cliente.
- **R4** — A cidade é uma referência (`city_id`), nunca texto digitado. Duas grafias da mesma cidade são impossíveis por construção.
- **R5** — O estado do casal (`juntos` em casa de alguém, `viajando juntos`, `separados`, `desconhecido`) é calculado a partir das estadias e das cidades-casa. Nenhuma coluna em nenhuma tabela o armazena.
- **R6** — Os tipos TypeScript das tabelas são gerados do schema e versionados. Renomear uma coluna sem regenerar quebra o `typecheck`.
- **R7** — O histórico real do casal (hoje em `seedStays.ts`) vive no banco, carregado por migration idempotente, e deixa de existir no bundle.
- **R8** — Existe test runner configurado, e `DEVKIT_CMD_TEST` em `.devkit/profile.sh` aponta para ele. O hook `Stop` roda teste de verdade.
- **R9** — O cliente distingue três resultados: lista vazia legítima, ausência de sessão, e falha de rede. Os três têm estados diferentes e nomeáveis; nenhum dos dois últimos se apresenta como "nada por aqui".

## 4. Invariantes

- **I1** — Nenhuma tabela tem coluna que armazene estado ou período de casal. Verificável por consulta ao `information_schema`.
- **I2** — Intervalos de data são **inclusivos nas duas pontas**. Uma estadia de 12 a 12 de setembro dura um dia.
- **I3** — `ends_on IS NULL` significa "em aberto", nunca "terminou hoje". Em aberto e terminado hoje são estados distintos.
- **I4** — Para **contagem**, o fim efetivo de uma estadia é `min(ends_on ?? hoje, hoje)`: dia futuro nunca entra em "dias juntos". Para **exibição**, o fim efetivo é `ends_on ?? fim da janela visível`: a barra de uma estadia em aberto não para em hoje no calendário. São duas funções com nomes diferentes, e nenhuma serve para os dois usos.
- **I5** — Para um mesmo `profile_id`, os intervalos `[starts_on, ends_on]` são dois a dois disjuntos.
- **I6** — `ends_on >= starts_on` quando `ends_on` não é nulo.
- **I7** — Todo perfil tem `home_city_id` preenchida. Sem ela a derivação não distingue "juntos em casa" de "viajando juntos".
- **I8** — Um casal tem exatamente dois membros. A derivação é definida para dois e não tem comportamento especificado para um ou três.
- **I9** — Toda linha de domínio pertence a exatamente um casal, e é invisível para quem não é membro dele.
- **I10** — Datas circulam como string ISO `YYYY-MM-DD` e são comparadas lexicograficamente. `Date` só aparece dentro de `src/lib/date.ts`, que parseia em horário **local** — `new Date('2026-08-01')` seria UTC e deslocaria o dia.
- **I11** — `couples.invite_code` não é legível por quem não é membro do casal.

## 5. Contrato & dados

### Escopo do schema nesta fase

Só as tabelas que a Fundação precisa: `cities`, `couples`, `profiles`, `couple_members`, `stays`. `list_items`, `memories`, eventos e viagens **não** nascem aqui — nascem com a fase que tem a tela, e a forma delas já está travada pelo [ADR 0003](../Decisions/0003-lista-tabela-unica-com-check-por-categoria.md) para não ser re-discutida. Das quatro quebras que motivaram reescrever o schema, esta fase corrige duas: a ausência de quem-está-onde e a cidade-casa sem coordenada. As outras duas (`places` rejeitando série, `mementos` sem nota/fotos/quem-estava) são corrigidas na Fase 4.

### Esboço do schema

```sql
create extension if not exists btree_gist;

create table cities (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  state_code    text,                 -- 'SP', 'RS'; nulo fora do Brasil
  country_code  text not null,        -- ISO 3166-1 alfa-2
  lat           double precision not null,
  lng           double precision not null,
  created_at    timestamptz not null default now(),
  unique (name, state_code, country_code)
);

create table couples (
  id           uuid primary key default gen_random_uuid(),
  name         text,                  -- 'Gabi & Lana', opcional (design)
  started_on   date not null,         -- início do namoro; alimenta 'juntos há N'
  invite_code  text not null unique,
  created_at   timestamptz not null default now()
);

create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  display_name  text not null,        -- 'Gabriel', 'Lana'
  color         text not null,        -- cor da faixa no calendário
  home_city_id  uuid not null references cities,   -- I7
  created_at    timestamptz not null default now()
);

create table couple_members (
  couple_id   uuid not null references couples  on delete cascade,
  profile_id  uuid not null references profiles on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (couple_id, profile_id)
);

create table stays (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references couples  on delete cascade,
  profile_id  uuid not null references profiles on delete cascade,
  city_id     uuid not null references cities,
  starts_on   date not null,
  ends_on     date,                   -- null = em aberto (I3)
  created_by  uuid references profiles,
  created_at  timestamptz not null default now(),

  constraint stays_ends_after_starts
    check (ends_on is null or ends_on >= starts_on),          -- I6

  constraint stays_no_overlap exclude using gist (            -- I5
    profile_id with =,
    daterange(starts_on, ends_on, '[]') with &&
  )
);

create index stays_couple_starts_idx on stays (couple_id, starts_on);
create index stays_profile_idx    on stays (profile_id);
create index stays_city_idx       on stays (city_id);
create index stays_created_by_idx on stays (created_by);
create index couple_members_profile_idx on couple_members (profile_id);
create index profiles_home_city_idx     on profiles (home_city_id);
```

`daterange(starts_on, ends_on, '[]')` com `ends_on` nulo produz intervalo superiormente ilimitado, que é exatamente o significado de "em aberto" — e faz duas estadias em aberto da mesma pessoa colidirem, o que é desejado. **Isso tem de ser provado quando a migration rodar** (critério A4), não assumido.

### RLS

O pertencimento é resolvido por uma função `security definer`, não por subquery na policy. Policy em `couple_members` que consulta `couple_members` recursa; a função quebra o ciclo. A função devolve **o conjunto** de casais, não um booleano, e é usada como `couple_id in (select public.my_couple_ids())`: nessa forma o planner a avalia uma vez por query (InitPlan), enquanto uma função booleana recebendo a coluna rodaria por linha. É a mesma função que o schema anterior já tinha, e a migration `00004_performance_lints` de lá existe justamente porque o advisor do Supabase aponta essa classe de problema.

```sql
create function public.my_couple_ids() returns setof uuid
  language sql security definer stable set search_path = public
as $$ select couple_id from public.couple_members where profile_id = (select auth.uid()) $$;

-- Obrigatório: o Postgres concede EXECUTE a PUBLIC por padrão, então sem isto
-- a função é chamável por `anon`.
revoke execute on function public.my_couple_ids() from public, anon;
grant  execute on function public.my_couple_ids() to authenticated;
```

Dentro das policies, `auth.uid()` aparece sempre como `(select auth.uid())`, pelo mesmo motivo de InitPlan.

| Tabela | Leitura | Escrita |
| --- | --- | --- |
| `cities` | qualquer sessão autenticada | insert por sessão autenticada; sem update/delete |
| `couples` | `id in (select my_couple_ids())` | update por membro; insert só no onboarding (Fase 2) |
| `couple_members` | `couple_id in (select my_couple_ids())` | nenhuma nesta fase |
| `profiles` | próprio perfil, ou perfil que compartilha casal | update do próprio perfil |
| `stays` | `couple_id in (select my_couple_ids())` | insert/update/delete por membro |

`cities` é referência global e legível por qualquer sessão autenticada — é o trade-off desta fase. Alguém poderia enumerar que "Marau, RS" existe na tabela, sem descobrir de quem. A alternativa (cidades por casal) duplicaria linhas e coordenadas para ganhar sigilo sobre nomes de cidade, que não é segredo. **Nenhuma policy expõe `couples` por `invite_code`** (I11): a busca por código é RPC `security definer` e nasce na Fase 2, não aqui. Uma policy de conveniência escrita agora vazaria o código de convite de qualquer casal.

### Contrato do módulo de derivação

Módulo puro, sem import de Supabase. É o que o Calendário, a Lista e a Home vão consumir.

```ts
// src/domain/coupleState.ts

export type CityId = string
export type ProfileId = string

/** Estadia de uma pessoa. Intervalo inclusivo nas duas pontas (I2). */
export interface Stay {
  id: string
  profileId: ProfileId
  cityId: CityId
  startsOn: string          // ISO YYYY-MM-DD
  endsOn: string | null     // null = em aberto (I3)
}

export interface Member {
  profileId: ProfileId
  homeCityId: CityId
}

export type CoupleState =
  /** Mesma cidade. `hostProfileIds` vazio = viajando juntos; com 1 = casa de alguém. */
  | { kind: 'together'; cityId: CityId; hostProfileIds: readonly ProfileId[] }
  /** Cidades diferentes. */
  | { kind: 'apart'; positions: readonly { profileId: ProfileId; cityId: CityId }[] }
  /** Ao menos um dos dois sem estadia registrada no dia. Não é 'separados'. */
  | { kind: 'unknown' }

export function coupleStateOn(
  day: string,
  stays: readonly Stay[],
  members: readonly [Member, Member],
): CoupleState

/** Contagem por estado num intervalo. Nunca conta dia futuro (I4). */
export function countStates(
  from: string, to: string, today: string,
  stays: readonly Stay[], members: readonly [Member, Member],
): { together: number; apart: number; unknown: number }

/** min(endsOn ?? today, today) — para somar dias vividos (I4). */
export function effectiveEndForCounting(stay: Stay, today: string): string

/** endsOn ?? windowEnd — para desenhar a barra até a borda da janela (I4). */
export function effectiveEndForDisplay(stay: Stay, windowEnd: string): string
```

Os quatro rótulos do design saem de `CoupleState` sem estado novo: `together` com um host → "Juntos em <cidade>"; `together` sem host → "Viajando juntos"; `apart` → "Separados". O quinto caso, `unknown`, **não existe no design** — o Pencil mostra todos os dias cobertos porque são dados de exemplo. Com dados reais haverá lacuna, e chamá-la de "Separados" seria inventar: a contagem mentiria. `unknown` não entra em `together` nem em `apart`.

### Compatibilidade

Quebra tudo que existe, de propósito, e não há dado a preservar: as seis tabelas do Supabase têm **zero linhas**, e o `localStorage` só tem o que o `seedStays.ts` colocou lá. Esta fase é **aditiva**: ela não apaga o caminho antigo. `storage.ts`, `useTimeline.ts`, `exportStays.ts`, `seedStays.ts` e `together.ts` ficam onde estão e a tela atual continua compilando e funcionando contra `localStorage`. Eles são removidos na Fase 5, quando o Calendário desenhado substituir a tela de hoje. A razão é que uma tela que compila é o que mantém `typecheck` e `lint` verdes (A14) sem construir interface nesta fase. `coupleState.ts` nasce ao lado de `together.ts`, mais amplo — o atual só sabe dizer "juntos", não os quatro estados, e não conhece cidade-casa. `src/lib/date.ts` sobrevive praticamente intacto: é onde I10 já está implementado.

## 6. Identidade & nomes

**Cidade.** A chave natural é `(name, state_code, country_code)`, com `unique`. É o que impede "SJC" e "São José dos Campos" de coexistirem como duas cidades — a falha que I5 e a derivação não detectariam (os dois na mesma cidade e o app dizendo "Separados"). Quem escreve uma estadia resolve a cidade antes: acha a existente ou cria uma. Nunca digita texto em `stays`.

**Seed.** Os ids do histórico são UUIDs **fixos**, escritos na migration, não gerados. É o que torna a migration idempotente: rodar duas vezes não duplica o histórico, e um `on conflict (id) do nothing` basta. Os ids `seed-1`…`seed-11` de hoje não são UUID e não sobrevivem; o mapeamento antigo→novo não precisa ser guardado, porque nada externo referencia esses ids.

**`invite_code`.** Formato e geração nascem na Fase 2, junto com a tela que o mostra. Nesta fase a coluna existe, é `unique`, e é preenchida no seed com um valor qualquer — porque a Fase 0 não tem fluxo de convite e um código previsível aqui não é exposto a ninguém.

**Nome de exibição.** Um campo só, `display_name`, e ele vale em toda a interface. O design alterna "Lana" e "Alana"; a interface usa **Lana** em todo lugar, e o Pencil será ajustado. Não há `full_name` separado: um segundo campo de nome existiria para uma tela que não existe.

## 7. Comportamento em falha

**Sem sessão.** RLS não erra: devolve zero linhas. Essa é a falha silenciosa que o [ADR 0001](../Decisions/0001-supabase-com-rls-por-casal.md) registra como o principal custo da decisão, e R9 é a resposta. A camada de dados devolve um resultado discriminado — `{ status: 'ok', rows }`, `{ status: 'unauthenticated' }`, `{ status: 'error', cause }` — e quem chama não pode confundir os três, porque `rows` só existe no primeiro. Uma função que devolvesse `Stay[]` e `[]` em todos os casos ruins é exatamente o bug.

**Projeto pausado por inatividade.** Não é hipótese: os outros dois projetos da mesma conta (`PlinAi`, `War Room`) estão `INACTIVE` agora. O fetch falha com erro de rede, e isso tem de virar `{ status: 'error' }` visível, nunca lista vazia. Sem tratamento, o app abre mostrando um calendário limpo e o casal conclui que perdeu o histórico.

**Estadia sobreposta.** O banco rejeita com violação de `stays_no_overlap`. O erro do Postgres é opaco para quem lê; a camada de dados traduz o nome da restrição numa causa nomeada (`overlapping_stay`) antes de subir. A tela que vai tratar isso é da Fase 5; o que nasce aqui é a causa distinguível de um erro genérico.

**Falha em cascata: escrita certa, leitura errada.** O `INSERT` passa e o `select` seguinte devolve a linha sem ela — acontece se a policy de `insert` for mais permissiva que a de `select`. Sintoma: o usuário salva, a tela recarrega e o registro "desapareceu". Nenhum erro em lugar nenhum. As policies de leitura e escrita de `stays` usam a **mesma** expressão `is_couple_member(couple_id)`, e A5 prova que escrever e reler devolve o que foi escrito.

**Relógio do cliente.** `today` é argumento explícito de `countStates` e `effectiveEndForCounting`, nunca lido de dentro por `new Date()`. Um cliente com data adiantada muda o que ele conta, mas não contamina o que ele grava — e o teste consegue fixar o dia sem congelar o relógio global.

**`home_city_id` ausente.** Impossível: `NOT NULL`. É a razão da coluna ser obrigatória em vez de opcional com fallback — o fallback silencioso faria a legenda dizer "Viajando juntos" quando os dois estão em casa.

**Migration parcialmente aplicada.** Cada migration é uma transação. Postgres faz DDL transacional, então uma que falhe no meio não deixa metade das tabelas. A ordem importa: `cities` antes de `profiles` (FK), `couples` e `profiles` antes de `couple_members` e `stays`.

## 8. Limites & orçamentos

Dois usuários, um casal. O histórico cresce a algo como uma a duas estadias por semana por pessoa: da ordem de 200 linhas por ano em `stays`, alguns milhares na vida do app. Não há paginação nesta fase, e nenhuma query desta fase precisa dela.

`countStates` sobre um ano visita 365 dias e, para cada dia, procura a estadia vigente de dois perfis. O orçamento é **abaixo de 16 ms para um ano** — um frame — porque o Calendário vai chamá-la ao navegar de mês e de ano, e o design tem uma visão "Ano" inteira. Com busca linear ingênua isso é 365 × 2 × N estadias; com as estadias ordenadas por `starts_on` e um cursor por perfil, é linear no total. A implementação escolhe; o orçamento é o que vale.

`stays` do casal inteiro cabe numa resposta só (milhares de linhas, poucas colunas), então a estratégia desta fase é carregar tudo e derivar no cliente. Quando passar de dezenas de milhares, a conversa é a view materializada que o [ADR 0002](../Decisions/0002-estadia-por-pessoa-estado-derivado.md) deixou no backlog — e o gatilho é medição, não palpite.

Free tier do Supabase: 500 MB de banco e pausa após uma semana sem requisição. O banco desta fase não chega perto do limite de tamanho; a pausa é o limite que morde.

## 9. Segurança & permissões

O acervo é o diário de um casal, então o pior caso não é técnico. Duas regras carregam tudo:

RLS é a única porta, e o cliente nunca filtra por `couple_id`. A chave publishable vai no bundle por definição — é pública, e tratá-la como segredo seria o erro. Toda autorização está em policy, e a expressão de leitura e de escrita é a mesma.

`invite_code` é o único segredo real do schema (quem tem o código entra no casal). Ele não é legível fora do casal, e a busca por código é `security definer` com escopo mínimo, na Fase 2. Uma policy `using (true)` em `couples`, escrita agora "pra facilitar depois", entregaria todos os códigos de convite de todos os casais.

A função `my_couple_ids` é `security definer`, o que a faz rodar com privilégios do dono — daí `set search_path = public` obrigatório e `stable`, e daí ela ser a **única** função assim nesta fase. Cada `security definer` é uma porta que não passa por RLS; o número delas é a superfície. E cada uma precisa de `revoke execute ... from public, anon`: o Postgres concede `EXECUTE` a `PUBLIC` por padrão, então uma função criada e esquecida fica chamável por quem nem se autenticou. Isso não é hipótese neste projeto — foi o que a migration `00003_lock_down_function_grants` do schema anterior existiu para corrigir.

Contas de teste são usuários reais no projeto, criadas pelo seed com senha de teste. Isso significa credencial de teste dentro de um projeto que também guarda dado real — o que é aceitável agora porque o dado real é um histórico de estadias sem nada sensível, e deixa de ser aceitável quando as fotos entrarem (Fase 4). Nesse ponto, teste vai para um projeto separado ou para branch do Supabase.

## 10. Critérios de aceite (testáveis)

| # | Critério (Dado/Quando/Então) | Como provar |
| --- | --- | --- |
| A1 | Dado um banco vazio, quando as migrations rodam em ordem, então todas aplicam sem erro e sem passo manual | ✅ `npm run db:reset` — cinco migrations em ordem, sem passo manual |
| A2 | Dado o schema aplicado, quando se inspeciona o contrato gerado dele, então nenhuma coluna de nenhuma tabela armazena estado ou período de casal (I1) | ✅ `src/lib/database.types.test.ts` — afirma sobre o arquivo GERADO do schema, o que põe a prova na suíte rápida do gate |
| A3 | Dada uma estadia de 2026-09-12 a 2026-09-12, quando se conta sua duração, então o resultado é 1 dia (I2) | ✅ `src/domain/coupleState.test.ts` |
| A4 | Dada uma estadia da Lana de 12/09 em aberto, quando se insere outra dela de 18/09 a 22/09, então o banco rejeita com `stays_no_overlap` (I5, I3) | ✅ `supabase/tests/constraints.test.ts` — cobre DUAS em aberto, uma fechada dentro da aberta, e que dias adjacentes (fim 21 / início 22) **passam** |
| A5 | Dado o usuário do casal A autenticado, quando ele insere uma estadia e relê a tabela, então a linha volta — e quando o usuário do casal B lê a mesma tabela, então recebe **zero linhas**, não erro (R2, I9) | ✅ `supabase/tests/rls.test.ts` — inclui a direção negativa (casal B lê zero) e escrever-e-reler |
| A6 | Dada uma sessão ausente, quando se pedem as estadias, então o resultado é `{ status: 'unauthenticated' }` e nunca `{ status: 'ok', rows: [] }` (R9) | ✅ `supabase/tests/rls.test.ts` |
| A7 | Dado o histórico do seed e cidades-casa Gabriel→SJC e Lana→Marau, quando se derivam os estados de setembro/2026 com hoje = 25/09, então: 21 `together` (11 com host Gabriel, 10 com host Lana), 4 `apart`, 0 `unknown`, e os 5 dias futuros não são contados (R5, I4) | ✅ `src/domain/coupleState.test.ts` — 21/4/0, valores calculados por script independente ANTES de existir código |
| A8 | Dados os dois na mesma cidade que não é casa de nenhum, quando se deriva o estado, então `kind: 'together'` com `hostProfileIds` **vazio** (viajando juntos) | ✅ `src/domain/coupleState.test.ts` |
| A9 | Dado um dia em que só um dos dois tem estadia registrada, quando se deriva o estado, então `kind: 'unknown'` — nunca `apart` | ✅ `src/domain/coupleState.test.ts` |
| A10 | Dada uma estadia em aberto, quando se conta dias até hoje, então dias futuros não entram; e quando se desenha a barra numa janela que termina depois de hoje, então ela vai até a borda da janela (I4) | ✅ dois testes distintos, um por função |
| A11 | Dado o seed aplicado, quando a migration de seed roda uma segunda vez, então nenhuma linha é duplicada | ✅ reaplicado duas vezes no mesmo banco: `INSERT 0 0` nas duas, 3 cidades antes e depois |
| A12 | Dado o schema, quando se renomeia uma coluna sem regenerar os tipos, então `npm run typecheck` falha (R6) | ✅ `ends_on`→`ended_on` nos tipos quebrou o typecheck em 2 pontos de `src/data/stays.ts`; revertido e limpo |
| A13 | Dado o projeto, quando o hook `Stop` roda, então ele executa o test runner de verdade — `DEVKIT_CMD_TEST` não está vazio (R8) | ✅ `DEVKIT_CMD_TEST="npm run test"` em `.devkit/profile.sh`; integração em `DEVKIT_CMD_TEST_DB`, cobrada no Gate 3 |
| A14 | Dado o código da fase, quando se roda `npm run typecheck` e `npm run lint`, então ambos passam limpos | ✅ os dois limpos, com `strict: true` ligado nos três tsconfigs |

## 11. Abordagem de teste

A derivação é função pura sobre estruturas simples, então ela é testada como função pura: entrada montada à mão, saída comparada. É onde os testes table-driven valem — os quatro estados mais `unknown`, mais as bordas de intervalo inclusivo (primeiro dia, último dia, um dia só, dia imediatamente antes e depois). `today` entra por argumento, então nada precisa congelar relógio.

RLS não tem como ser testada por leitura de código: policy permissiva demais e restritiva demais têm a mesma aparência no arquivo, e a diferença só aparece com duas sessões de verdade. Então A5 e A6 são **teste de integração contra o projeto real**, com dois casais e três usuários criados pelo seed. É mais lento e exige rede; é a única prova que vale. Um teste que mocke o cliente Supabase aqui prova que o mock funciona.

As restrições do banco (A4, A11) também são integração: a exclusão por `gist` com `daterange` e bound nulo é precisamente o tipo de coisa que "deveria funcionar" e tem de ser vista funcionando uma vez.

Fica **manual**: nada. Esta fase não tem interface, então não há comportamento de tela a provar — o que é a razão de ela ser a primeira. A partir da Fase 1 haverá tela, e aí a regra do `CLAUDE.md` vale: comportamento de interface se prova em teste automatizado, não lendo o código.

O runner é **vitest** — é o que integra com Vite sem configuração paralela. Instalar não basta: `DEVKIT_CMD_TEST` tem de ser preenchido no mesmo commit, senão o gate fica verde sem ter rodado teste nenhum, que é o aviso explícito do `CLAUDE.md`. A13 existe só para cobrar isso.

## 12. Riscos & mitigações

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Dropar o schema atual apaga algo que eu não vi | Perda de dado | Verificado: as seis tabelas têm **zero linhas**. Autorizado explicitamente em 2026-09-25. Mesmo assim, a primeira migration captura o estado atual **antes** de qualquer `drop`, para que a reconstrução seja possível sem consultar este documento |
| RLS permissiva demais passa no teste feliz | Vazamento do acervo do casal | A5 testa a direção negativa (casal B lê zero), não só a positiva. Teste que só confirma acesso próprio não detecta `using (true)` |
| `exclude using gist` com `ends_on` nulo não se comportar como esperado | I5 não é cobrada; duas estadias em aberto convivem | A4 prova o caso com bound nulo especificamente, não só com dois intervalos fechados |
| Pausa do projeto por inatividade no meio do desenvolvimento | Trabalho travado sem erro compreensível | Tratado como falha de rede nomeada (seção 7), e o comportamento é o mesmo que o casal veria em produção |
| Derivação linear ficar lenta na visão "Ano" | Navegação de mês travando | Orçamento numérico na seção 8 (16 ms/ano), medido quando o Calendário existir, não agora |
| Credencial de teste convivendo com dado real | Pequeno hoje, grande quando as fotos entrarem | Aceito nesta fase (seção 9), com gatilho explícito: Fase 4 move teste para branch do Supabase ou projeto separado |
| O seed não ser o histórico real | O app abre com dados errados e ninguém nota | O seed migra exatamente o que existe hoje em `seedStays.ts`, sem edição. Corrigir o histórico é trabalho de dado, não desta fase |

## 13. Open questions (bloqueiam a implementação)

**Bloqueantes: nenhum.** O único que havia — autorização para dropar as seis tabelas do projeto `smdtcznadmnrdubeidyz` — foi dado em 2026-09-25 e está registrado na seção 12.

**Não bloqueantes — implementáveis com o valor abaixo, corrigíveis depois sem migration:**

1. `couples.started_on` — o design diz **17 de setembro de 2024** ("juntos há 2 anos e 8 dias · desde 17 de setembro de 2024"). Vai no seed com esse valor.
2. Coordenadas das três cidades do seed — São José dos Campos `-23.1791, -45.8872`, Marau `-28.4497, -52.1986`, Londrina `-23.3045, -51.1696`. São coordenadas de centro de cidade, suficientes para a derivação (que só compara identidade) e aproximadas para distância.
3. `Londrina` aparece no histórico (15 a 31 de julho de 2026) e em nenhuma tela do design. Assumido como histórico real e migrado como está.

## 14. Fora de escopo

Nenhuma tela desenhada. A Login da Fase 1 não nasce aqui — o que nasce é um helper de sessão para teste, que a Fase 1 substitui. Sem tela, esta fase não tem o que mostrar ao casal, e isso é deliberado.

`list_items` e `memories` ficam para a Fase 4, com a forma já travada pelo ADR 0003. Eventos, viagens e o globo, para as fases 5 a 7. Buckets de Storage nascem com a fase que faz upload; `profiles` nesta fase não tem `avatar_path`, porque uma coluna sem quem a escreva é convite a ficar nula pra sempre.

A escrita transacional de duas estadias — o atalho `Estado` do modal "Novo período", que grava Gabriel e Lana de uma vez — é consequência do ADR 0002 mas pertence à Fase 5, com o modal. Nesta fase o CRUD é de uma estadia.

Realtime fica de fora: não muda migration nenhuma e a decisão está no backlog para a Fase 4, quando existirem duas telas escrevendo.

Distância entre cidades fica de fora, e com um achado a registrar: linha reta entre São José dos Campos e Marau dá **861 km**, e o design mostra **960 km** nas Configurações. Ou o design usa distância rodoviária — que exige API de rotas, dependência nova — ou o número é estimativa. `cities` com lat/lng cobre as duas saídas sem mudança de schema, então a decisão é da Fase 3.

O envio de e-mail, o agendador do aniversário e a engine do mapa estão registrados no backlog de `../Decisions/README.md`, cada um com a fase em que o ADR sai.

---

## Plano (Gate 2 — preencher depois que a Spec for aprovada)

> Verticais, ordenadas por dependência. Cada tarefa cita os critérios da seção 10 que ela tem de deixar prováveis.

1. [x] **Ferramental de prova.** vitest instalado, `npm run test`, e `.devkit/profile.sh` com `DEVKIT_CMD_TEST` e `DEVKIT_MIGRATIONS_DIR` preenchidos no **mesmo commit** — instalar runner sem preencher a variável deixa o gate verde sem rodar teste. → A13
2. [x] **Supabase CLI e captura do estado atual.** `supabase init` feito; o schema anterior está preservado em `supabase_migrations.schema_migrations` (que o drop de `public` não afeta) e documentado em `supabase/baseline/README.md`, com o que foi aproveitado e o que foi descartado. → mitigação da seção 12
3. [x] **Migration: derrubar o schema antigo.** As seis tabelas com zero linhas. → A1
4. [x] **Migration: tabelas novas.** `cities`, `couples`, `profiles`, `couple_members`, `stays`, com `stays_ends_after_starts`, `stays_no_overlap` e o índice. → A1, A4
5. [x] **Migration: `is_couple_member` e policies.** Mesma expressão para leitura e escrita; nenhuma policy expõe `invite_code`. → A5, A6
6. [x] **Migration: seed idempotente.** Três cidades com coordenada, um casal (`started_on = 2024-09-17`), dois perfis com cidade-casa, as onze estadias do histórico, todos com UUID fixo. → A11
7. [x] **Tipos gerados.** `src/lib/database.types.ts` versionado, com script `npm run types:gen`. → A12
8. [x] **`src/domain/coupleState.ts`.** Módulo puro, sem import de Supabase, com os dois fins efetivos como funções separadas — e os testes table-driven dos quatro estados mais `unknown`. → A3, A7, A8, A9, A10
9. [x] **Acesso a dados.** `src/lib/supabase.ts` e `src/data/stays.ts` devolvendo resultado discriminado: `ok` carrega `rows`, `unauthenticated` e `error` não. → A6, R9
10. [x] **Testes de integração.** Dois casais e três usuários reais: isolamento nas duas direções, escrita-e-releitura, sobreposição rejeitada, e o teste SQL de I1. → A2, A4, A5, A6
11. [x] **Fechar.** `typecheck` e `lint` limpos com a tela antiga intacta, skill `verify` (Gate 3), `.agent/System/project_architecture.md` atualizado, e esta spec para 🟢. → A14

---

## Related

- Research: N/A — ver cabeçalho
- ADRs: [0001](../Decisions/0001-supabase-com-rls-por-casal.md) · [0002](../Decisions/0002-estadia-por-pessoa-estado-derivado.md) · [0003](../Decisions/0003-lista-tabela-unica-com-check-por-categoria.md)
- Ledger da execução: `fase-0-fundacao.ledger.md` — criado quando a implementação começar
- `.agent/System/project_architecture.md` — desatualizado; atualizar ao fim desta fase
