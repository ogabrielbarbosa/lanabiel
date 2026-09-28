# Arquitetura do projeto

> Atualizado ao fim da Fase 7 (Mapa / Home), 2026-09-27. O _como_ mora aqui e é
> reescrito sempre que o código muda; o _porquê_ mora em `../Decisions/`.

## O que é

App do casal Gabriel & Lana, à distância entre São José dos Campos (SP) e Marau
(RS). SPA em React 19 + TypeScript servida pelo Vite 8, com Supabase como
backend. Duas pessoas escrevem no mesmo acervo, de máquinas diferentes.

O produto está desenhado tela por tela no Pencil (~50 frames, cinco áreas:
Mapa, Calendário, Lista, Viagens, Configurações, mais Login e onboarding) e é
construído em oito fases — ver `../Tasks/`.

## Stack

| Camada | Tecnologia | Papel |
| --- | --- | --- |
| Build/dev | Vite 8 | dev server, bundling |
| Mapa | Mapbox GL JS v3 (`mapbox-gl`) | globo, satélite, terreno 3D; só em `src/map/mapbox/`, por `import()` — [ADR 0022](../Decisions/0022-engine-do-mapa-mapbox.md) |
| UI | React 19 + TS 6 | componentes e estado |
| Backend | Supabase (Postgres 17, Auth, Storage, Edge Functions) | persistência e autorização |
| Autorização | RLS por casal | a única porta — ver [ADR 0001](../Decisions/0001-supabase-com-rls-por-casal.md) |
| Tipos do banco | `supabase gen types` → `src/lib/database.types.ts` | versionado; coluna renomeada quebra o typecheck |
| Lint | oxlint | verificação estática |
| Autenticação | Supabase Auth: senha + OAuth | [ADR 0004](../Decisions/0004-login-com-senha-e-oauth.md) — sem link mágico |
| Tipos | tsc, três project refs | `tsconfig.app.json` (navegador), `.node.json` (configs), `.tests.json` (integração) |
| Testes | vitest, três projetos | `domain` (node) · `ui` (jsdom, [ADR 0005](../Decisions/0005-interface-se-prova-em-jsdom.md)) · `db` (node) — contra o projeto online, em série, fora do hook `Stop` ([ADR 0014](../Decisions/0014-testes-de-integracao-no-projeto-online.md)) |

## Estrutura

```text
src/
├── main.tsx                # entrypoint
├── App.tsx                 # portão de sessão + casca; nada mais mora aqui
├── home/                   # Fase 7: a Home em `/`; recebe `HomeApi` injetada (api.ts)
│   ├── HomeScreen.tsx · context.ts   # leitura única + releitura; o mapa monta depois do 1º `ok`
│   ├── MapArea.tsx · map/  # cabeçalho, breadcrumb + seletores, pins, cartão, filtros, _Aqui por perto_
│   ├── HomePanel.tsx · panel/        # próxima viagem, ritmo, região, destaques, memória, pelo mundo
│   └── home.css · panel.css          # exceção registrada: duas folhas
├── map/                    # Fase 7: a engine atrás de `MapEngine` (engine.ts)
│   ├── mapbox/adapter.ts   # o ÚNICO import de `mapbox-gl` (chunk dinâmico)
│   ├── style.ts            # a receita visual (Standard Satellite / estilo próprio)
│   ├── useMap.ts           # uma instância por montagem; `useMapTick` para quem desenha por cima
│   └── fakeEngine.ts · MapFailed.tsx
├── app/                    # Fase 3: a casca
│   ├── Shell.tsx           # barra lateral (só destinos que existem) + rota + _Adicionar_
│   ├── addIntent.ts        # o pedido do _Adicionar_: evento ou item, consumido pela tela dona
│   ├── calendarFocus.ts    # o _Ver no calendário_ das Viagens: o mês que o Calendário abre
│   ├── mapFocus.ts · listFocus.ts   # Fase 7: a Home abre num lugar; a Lista abre num item
│   ├── router.ts           # caminho na barra, sem biblioteca (ADR 0013, 0020: `/viagens/:id`)
│   ├── appearance.ts · useAppearance.ts   # tema/densidade/animações, por aparelho
│   └── app.css             # tokens claro/escuro do .pen, em data-theme
├── calendar/               # Fase 5: o Calendário; recebe `CalendarApi` injetada (api.ts)
│   ├── CalendarScreen.tsx · context.ts · MonthView.tsx · YearView.tsx · CalendarPanel.tsx
│   ├── FirstPeriodCard.tsx · KissCounter.tsx · parts.tsx · view.ts
│   ├── PeriodModal.tsx · EventModal.tsx · CityPicker.tsx · CalDialog.tsx · CalendarModals.tsx
│   ├── cityChoice.ts · modalEnv.ts · modalPreview.ts
│   └── calendar.css · modals.css   # exceção registrada ao "um CSS por feature"
├── trips/                  # Fase 6: as Viagens; recebe `TripsApi` injetada (api.ts)
│   ├── TripsRoute.tsx · context.ts   # leitura única + releitura; carregando/erro/"não está aqui"
│   ├── TripsScreen.tsx · TripsPanel.tsx · TripModal.tsx · parts.tsx · links.ts
│   ├── detail/             # TripDetail · Itinerary · Gallery · Planning · blocks · editors (+ trip-detail.css)
│   ├── TripMap.tsx         # os dois mapas das Viagens na engine, sem interação (ADR 0022)
│   └── trips.css           # exceção registrada: duas folhas, como o Calendário
├── dev/                    # SÓ em DEV: harness `?preview` com TripsApi em memória e os dados do .pen
├── list/                   # Fase 4: a Lista; recebe `ListApi` injetada (api.ts)
│   ├── ListScreen.tsx · ListPanel.tsx · context.ts · parts.tsx · categories.ts
│   ├── AddItemModal.tsx · ItemSheet.tsx · MarkDoneModal.tsx · Hearts.tsx
│   └── list.css            # inclui os tokens `cat-*` do .pen (claro e escuro)
├── settings/               # Fase 3: as nove abas; recebe `SettingsApi` injetada
│   ├── SettingsScreen.tsx · RightPanel.tsx · context.ts · parts.tsx · exportAll.ts
│   ├── tabs/               # uma por aba do Pencil
│   └── settings.css
├── auth/
│   ├── AuthGate.tsx        # decide: esqueleto / Login / onboarding / domínio; lê `#convite=`
│   ├── session.ts          # AuthState, com `loading` distinto de `signed_out`
│   ├── signIn.ts           # senha e OAuth; traduz erro do GoTrue em causa nomeada
│   ├── callback.ts         # volta do OAuth, e limpeza da URL
│   ├── Login.tsx · SignUp.tsx · StartChoice.tsx · AuthShell.tsx
│   └── auth.css            # tokens lidos do .pen; escuro é o padrão
├── domain/
│   ├── coupleState.ts      # derivação: estadias → juntos/separados/viajando
│   ├── onboarding.ts       # LIMITS (paridade com os CHECK), código Crockford, "juntos há", distância
│   ├── list.ts             # Fase 4: validação (espelho do CHECK), filtros, sugestão, onde estamos
│   ├── calendar.ts         # Fase 5: pintura (espelho da RPC), trechos, contagens, ocorrências, validação do evento
│   ├── paintCases.ts · eventValidationCases.ts # a MESMA tabela roda no domínio e no banco (A2, A3)
│   ├── listValidationCases.ts # a MESMA tabela de casos roda no domínio e no banco (A2)
│   ├── trips.ts            # Fase 6: contrato (tipos, listas, TRIP_LIMITS, DEFAULT_PREP)
│   ├── tripValidation.ts · tripValidationCases.ts  # espelho dos CHECK, a mesma tabela no banco
│   ├── tripDerive.ts       # estado, números, herói, recordes, roteiro
│   └── map.ts              # Fase 7: pins, regiões, câmera, agrupamento, números do painel
├── data/
│   ├── result.ts           # DataResult / WriteResult discriminados
│   ├── rpc.ts              # chamada de RPC: 42501 → unauthenticated, resto → error
│   ├── account.ts          # estágio: needs_profile / needs_couple / awaiting_partner / ready
│   ├── profile.ts · couple.ts · invites.ts · cities.ts · avatar.ts   # Fase 2
│   ├── stays.ts            # leitura e escrita de estadias, fronteira snake→camel
│   ├── list.ts · listRow.ts # Fase 4: leitura/escritas/cascatas da Lista; mapeador snake↔camel
│   ├── places.ts           # busca de lugar no Photon/OSM, fallback IBGE (ADR 0016); `osmRef`
│   ├── calendar.ts · calendarRow.ts # Fase 5: leitura, pintura, eventos, 💋; mapeador snake↔camel
│   ├── worldCities.ts      # cidade do mundo: busca no Photon (sem BR) e `ensureWorldCity` (ADR 0017)
│   ├── listSummary.ts      # contagens e export da Lista para as Configurações
│   ├── media.ts            # couple-media: caminho, upload, remoção, URL assinada (Lista e Viagens)
│   └── trips.ts · tripRow.ts # Fase 6: leitura/escritas das Viagens; mapeador snake↔camel
├── onboarding/             # Fase 2: o assistente e as telas; recebe `OnboardingApi` injetada
│   ├── Onboarding.tsx      # a máquina de passos; o banco é a verdade, o passo é local
│   ├── pendingInvite.ts    # código pendente em sessionStorage (sobrevive ao OAuth)
│   ├── ProfileStep · CoupleStep · WaitingScreen · CodeEntry · InviteScreen · ConfirmCouple (+AllSet)
│   └── onboarding.css
├── lib/
│   ├── supabase.ts         # cliente ÚNICO, com as opções de auth explícitas
│   ├── database.types.ts   # GERADO — não editar à mão
│   └── date.ts             # datas ISO em horário local, grade do mês, rótulos pt-BR
└── test/setup.ts           # só o projeto `ui` do vitest carrega

supabase/
├── config.toml             # declaração do projeto ONLINE (auth, functions); não há stack local
├── functions/send-invite/  # edge function do convite: handler.ts (regra) · email.ts · index.ts (Deno)
├── migrations/             # o schema, append-only (a das cidades é GERADA por scripts/gen-cities-seed.mjs)
├── baseline/README.md      # onde está o schema anterior e o que se aproveitou dele
└── tests/                  # integração com dois casais reais — DORMENTE (ADR 0010)
```

## O modelo: `stays`, e "juntos" como derivação

Só existe **um** registro de posição: `stays` — uma pessoa, uma cidade, um
intervalo inclusivo nas duas pontas, `ends_on` nulo significando em aberto. O
estado do casal (`Juntos em SJC`, `Juntos em Marau`, `Viajando juntos`,
`Separados`) **nunca é gravado**: `coupleStateOn` o calcula comparando as duas
estadias vigentes com as duas cidades-casa. Ver
[ADR 0002](../Decisions/0002-estadia-por-pessoa-estado-derivado.md) — inclusive
a tentativa anterior, que persistiu o estado numa coluna e por que ela não
sobreviveu.

Existe um quinto estado que o design não mostra: `unknown`, quando ao menos um
dos dois não tem estadia registrada no dia. Não é "separados" — chamar lacuna de
separação faria a contagem afirmar o que não se sabe.

Três consequências que atravessam quase todo arquivo:

1. **Datas são strings ISO `YYYY-MM-DD`, comparadas lexicograficamente.** `Date`
   só aparece dentro de `lib/date.ts`, que parseia em horário **local** —
   `new Date('2026-08-01')` seria UTC e deslocaria o dia.
2. **Há dois "fins efetivos", e confundi-los é bug silencioso.**
   `effectiveEndForCounting` devolve `min(ends_on ?? hoje, hoje)`, para somar
   dias vividos sem contar futuro. `effectiveEndForDisplay` devolve
   `ends_on ?? fim da janela`, para a barra de uma estadia em aberto ir até a
   borda da tela em vez de parar em hoje. Nenhuma das duas serve para os dois
   usos.
3. **Intervalos são inclusivos nas duas pontas** — daí `daysInclusive` somar 1, e
   daí `ends_on` em 21 e a próxima estadia começando em 22 não colidirem.

## Fluxo de dados

O cliente **nunca filtra por `couple_id`**. Ele pede a tabela e a policy resolve
`auth.uid()` → `couple_members` → `couple_id`. Uma query que precisasse do
filtro daria o mesmo resultado com RLS desligada, e então a autorização estaria
no lugar errado.

Leituras devolvem resultado **discriminado** (`src/data/result.ts`): `rows` só
existe no caso `ok`. Isso existe porque, com RLS, sessão ausente devolve **zero
linhas, não erro** — e o projeto no free tier pausa por inatividade, devolvendo
falha de rede. Uma função que devolvesse `[]` nos dois casos ruins faria o app
abrir com um calendário limpo e o casal concluir que perdeu a história.

## Entrada: sessão antes de qualquer dado

Autenticação é **senha ou OAuth**, nunca link mágico — ver
[ADR 0004](../Decisions/0004-login-com-senha-e-oauth.md) para o porquê, que é
de infraestrutura e não de gosto.

`AuthGate` resolve duas perguntas em ordem, e a ordem é a regra: primeiro
`AuthState` (`loading` | `signed_out` | `signed_in`), depois `AccountStage`
(`needs_profile` | `needs_couple` | `awaiting_partner` | `ready`). **Nenhuma tela de domínio
renderiza antes de `ready`** — não é zelo: `listStays` para quem não tem casal
devolve `ok` com zero linhas, indistinguível de "o casal não tem estadias".

`loading` é um estado de verdade, separado de `signed_out`. Colapsar os dois faz
o Login piscar em toda recarga de quem já está logado.

`getSession()` lê armazenamento local e **não valida contra o servidor**. Quem
valida é a primeira leitura, e é o resultado dela que governa a tela.

## Onboarding e convite (Fase 2)

Qualquer estágio antes de `ready` — ou um código de convite pendente — renderiza
`src/onboarding/Onboarding.tsx`. O passo do assistente é estado local; recarregar
retoma pelo estágio do banco (`awaiting_partner` → tela Aguardando).

O convite é `couple_invites`, com **código portador** (Crockford, 6 caracteres)
que só se resolve com sessão e sob limite de falhas; nenhum caminho casa convite
por e-mail, porque o e-mail da sessão não é verificado
([ADR 0008](../Decisions/0008-convite-portador-e-um-casal-por-pessoa.md)). O
link leva o código no **fragmento** (`#convite=`), que o portão guarda em
`sessionStorage` e apaga da barra.

O e-mail sai pela edge function `send-invite`, que repassa o JWT de quem chamou
— a autorização fica em `begin_invite_send`, sob RLS — e só marca `last_sent_at`
depois de o provedor aceitar ([ADR 0006](../Decisions/0006-email-transacional-por-resend-em-edge-function.md)).
Os segredos do Resend ainda não estão no online (fim do roadmap): hoje a função responde erro e a tela mostra o código. O transporte `mailpit` do código é da antiga bancada local; A17/A18 só rodam com `MAILPIT_URL`.

Cidades são os municípios do IBGE, por migration; o cliente não insere cidade
([ADR 0007](../Decisions/0007-cidades-brasileiras-por-seed-do-ibge.md)). Fotos
em bucket privado `avatars/<uid>/…`, legíveis pelo casal
([ADR 0009](../Decisions/0009-fotos-em-bucket-privado-por-casal.md)).

## Banco: só o online

Não há stack local. O app, inclusive em `localhost`, usa o projeto online
`lanabiel` (`.env.local`); migrations sobem por `npm run db:push`, tipos vêm de
`npm run types:gen --linked`. Os testes de integração rodam contra esse mesmo
projeto, com `npm run test:db`, enquanto o app não abrir a outros casais — ver
[ADR 0014](../Decisions/0014-testes-de-integracao-no-projeto-online.md), que
supersede essa parte do [0010](../Decisions/0010-banco-so-online-sem-stack-local.md).

## Preferências e Configurações (Fase 3)

Três escopos, um dono cada ([ADR 0011](../Decisions/0011-preferencias-em-tres-escopos.md)):
**casal** em `couple_settings` (os dois editam), **pessoa** em `profile_settings`
(só a própria lê), **aparelho** em `localStorage` (`lanabiel:appearance`). Os
padrões moram no `default` das colunas; as linhas nascem por trigger junto com
o casal e o perfil. As listas dos `CHECK` (paletas, categorias) são as de
`src/domain/settings.ts`, com paridade testada. As Fases 4–7 leem essas colunas.

A tela mostra sempre o valor GRAVADO: cada escrita manda um patch de uma coluna
e aplica a linha que o banco devolve; falha volta o controle e mostra a causa.

Sair do casal (`leave_couple`) deixa o acervo com quem fica e revoga o convite
aberto — convite é da pessoa convidada. Quem fica volta a `awaiting_partner`
(slot 1 ou 2), e o próximo aceite ocupa a vaga livre. Apagar o espaço apaga a
pasta `couple-media/<couple_id>/` pelo cliente e depois chama `delete_couple`.

## Lista (Fase 4)

`list_items` é **uma tabela para as oito categorias**, em dois formatos
([ADR 0003](../Decisions/0003-lista-tabela-unica-com-check-por-categoria.md),
com a revisão de 2026-09-26). O que cada coluna vale para cada categoria não se
lê no `\d`, e por isso está aqui:

| Coluna | Vale em | Regra |
| --- | --- | --- |
| `lat`, `lng`, `country_code`, `country` | as 6 geográficas | obrigatórias (menos `country`); nulas em filme/série |
| `city` | geográficas menos `pais` | obrigatória; em `pais` é nula (o pin fica no centro do país) |
| `address`, `state` | geográficas | opcionais; nulas em mídia |
| `region` | só `cidade` | texto livre, segunda linha do item |
| `venue` | só `comida` | "Onde comer", opcional |
| `highlights` | só `pais` | "Cidades que interessam", ≤ 12, cada ≤ 40; vazio nas outras |
| `platform` | só `filme`, `serie` | obrigatória nelas, texto livre (≤ 30); nula nas geográficas |
| `seasons` | só `serie` | 1–99, opcional |
| `status`, `done_on`, `done_with`, `done_solo_by`, `rating` | todas | `done` ⇔ data e "quem estava"; `solo` ⇔ `done_solo_by`; nota só em feito |

O lugar é guardado **resolvido** (texto + coordenada) a partir do Photon/OSM,
chamado direto do navegador, com fallback no IBGE
([ADR 0016](../Decisions/0016-busca-de-lugares-pelo-photon-osm.md)). A Lista
**não** escreve em `cities`. A regra do formato mora em dois lugares com prova
de paridade: `validateItem` (`src/domain/list.ts`) e o `CHECK`
`list_items_format`; `listValidationCases.ts` roda contra os dois.

`list_memories` (uma por pessoa por item; cada um escreve só a sua) e
`list_photos` (≤ 10 por item, por trigger com trava na linha do item) repetem o
`couple_id` com **FK composta** `(item_id, couple_id)`, para a RLS ser a mesma
expressão de sempre. Arquivos em `couple-media/<couple_id>/item/` (foto do
item) e `…/memory/` (fotos do feito).

Marcar como feito é a RPC `mark_item_done`, **`security invoker`** — existe só
pela atomicidade (status, data, quem estava, nota, memória e fotos numa
transação). As cascatas com Storage (subir → RPC; apagar arquivos → linha) e
o que cada falha deixa para trás estão na seção 7 da
[spec](../Tasks/fase-4-lista.md).

Sem realtime: a Lista relê ao voltar ao foco e depois de cada escrita própria
([ADR 0015](../Decisions/0015-lista-sem-realtime-reler-ao-voltar.md)). O
painel ("Perto de vocês", sugestão) lê o estado do casal **derivado** das
estadias do banco; até a Fase 5 gravar estadias, ele diz "sem registro" em vez
de adivinhar.

## Calendário (Fase 5)

**Estadia só se grava pintando** ([ADR 0018](../Decisions/0018-periodo-se-grava-pintando-estadias.md)).
`paint_stays(entries)` (RPC `security invoker`, 1–8 entradas, em ordem, com
`pg_advisory_xact_lock` por casal) aplica, para cada pessoa: apaga o que fica
inteiro dentro do intervalo, corta o que atravessa uma borda, parte em dois o
que cobre o intervalo (o pedaço de depois mantém o fim, inclusive aberto),
insere e funde com a vizinha imediata na mesma cidade. A rotina mora uma vez em
`private.paint_one`. `create_event(evento, pintar)` grava o evento e, para
viagem e visita, pinta os viajantes na mesma transação — **uma vez**: nenhuma
estadia referencia evento. `paintStays` (domínio) espelha a regra para a
prévia dos modais; `paintCases.ts` prova a paridade.

**O que a tela desenha é derivado**: `runs` (trechos: a maior sequência de dias
com a mesma chave `together:{cidade}` / `apart:{a}:{b}` / `unknown`), `bandOf`
(a cor, por slot: `home1`, `home2`, `away`, `apart`; `unknown` sem cor),
`nowSummary` (o _Agora_), `occurrences` (data especial anual e o aniversário de
namoro, sem linha por ano). Duas contagens: `countStates` (vivido) e
`countDrawn` (desenhado, planejado incluso).

**Cidades do mundo** ([ADR 0017](../Decisions/0017-cidades-do-mundo-por-casal.md)):
linha de `cities` com `couple_id` e `osm_ref`, visível só ao casal, única por
`(couple_id, osm_ref)`; `cities_scope` + `cities_br_has_ibge_code` garantem
que cidade brasileira é sempre a do IBGE. `search_cities` busca só o IBGE.

**💋** é `day_kisses`, uma linha por marca, ≤ 20 por casal por dia e nunca em
dia futuro (trigger com trava por dia). É dado íntimo: só a tela do Calendário
e o export o leem.

`calendar_events` tem os seis tipos num `CHECK` de formato
(`calendar_events_format`, espelhado por `validateEvent`). Triggers
`stays_members` e `calendar_events_members` (invoker) conferem que pessoa,
autor e cidade são do casal. Sem realtime: relê ao voltar ao foco (ADR 0015).
O botão _Adicionar_ da barra registra um pedido em memória (`addIntent.ts`) e a
tela dona o consome depois de ler os dados.

## Viagens (Fase 6)

**A viagem é o evento** ([ADR 0019](../Decisions/0019-viagem-e-o-evento-estendido-por-trips.md)):
um `calendar_events` com `kind = 'viagem'` e `travelers = 'both'`. Datas,
destino, título e nota moram só lá; `trips` estende o evento 1:1 pela mesma
chave (`event_id`) com capa e hospedagem, e sete filhas penduram em `trips`
(`trip_departures`, `trip_days`, `trip_itinerary_items`, `trip_prep_items`,
`trip_budget_lines`, `trip_memories`, `trip_photos`), cada uma com `couple_id` e
FK composta `(trip_id, couple_id)`. Apagar o evento leva tudo em cascata; as
estadias pintadas ficam (ADR 0018). `trips` não tem policy de delete: apagar a
viagem é apagar o evento.

Um trigger (`calendar_events_trip`, invoker) cria `trips` e os cinco itens de
preparação padrão quando um evento vira viagem dos dois — inclusive a criada pelo
_Novo evento_ do Calendário. `create_trip` (RPC **invoker**, não conta nas doze
`definer`) chama `create_event` com pintura e grava hospedagem e saídas na mesma
transação. Tetos por trigger com trava na linha de `trips` (200 itens de roteiro,
20 de preparação, 12 de orçamento, 500 fotos); item de roteiro fora das datas é
recusado ao gravar.

**O estado (planejada, em andamento, feita) é derivado de hoje**, nunca gravado
(`tripStatus`). Números, herói, recordes, _Há um ano_, roteiro com dias livres
colapsados e a nota da viagem (média das memórias, `ceil`) saem de
`tripDerive.ts`. Distâncias são linha reta **da casa de quem vê**. "Puxar itens
da lista" é leitura derivada (itens a ≤ 30 km do destino), não escrita.

Fotos em `couple-media/<casal>/trip/<uuid>.webp` (arquivo → linha; apagar é
arquivo → linha). URLs assinadas só do que está visível, em lote, re-assinadas
na releitura e a cada 50 min. Os mapas são a engine da Fase 7 (`TripMap`, sem
interação), com pins em React e arcos de grande círculo
([ADR 0022](../Decisions/0022-engine-do-mapa-mapbox.md), que supersede o 0021). `/viagens/:id` usa o roteador próprio
([ADR 0020](../Decisions/0020-rota-com-parametro-sem-biblioteca.md)).

Em DEV, `?preview` (ex. `/viagens?preview`) monta a casca com uma `TripsApi` em
memória semeada com a copy e as imagens dos frames — para comparar a tela com o
`.pen` sem login. `src/dev/` não entra no build de produção.

## Home e mapa (Fase 7)

`/` é a Home; o Calendário mora em `/calendario`
([ADR 0023](../Decisions/0023-home-na-raiz-calendario-em-calendario.md)). **A
Home só lê**: `HomeApi` compõe as leituras das Fases 3–6 (`loadSettings`,
`loadList`, `loadTrips`, `loadCalCities`) e nada de schema mudou. Tudo o que ela
mostra é derivado por `src/domain/map.ts` sobre as funções que já existiam —
`runs`/`runAround` (trecho de hoje), `countDrawn` (o mês desenhado) e
`countStates` (o vivido do ano), `heroTrip`/`tripTotals` (viagens).

**A engine fica atrás de `MapEngine`** (`src/map/engine.ts`); o Mapbox chega por
`import()` num chunk próprio, e os testes usam `fakeMapEngine` (jsdom não tem
WebGL). Uma instância por montagem de tela — é o que o Mapbox cobra como _map
load_ (50 mil/mês grátis). **Pins, grupos, rótulos e o cartão do lugar são React
por cima do mapa**, posicionados por `handle.project` a cada movimento
(`useMapTick`, que re-renderiza só eles); o agrupamento é `clusterPoints`
(guloso, 44 px). Assim nenhum dado do casal vira GeoJSON do provedor: o Mapbox só
vê pedidos de tile.

A navegação (`home/map/useMapNav.ts`) é estado da tela: nível (`world` →
`country` → `state` → `city`; país de fora pula `state`), caminho em foco,
seletor aberto, pin selecionado. A câmera de cada nível é `cameraFor` (puro). O
agrupamento por região vem do item (`country_code`, `state` → UF, `city` sem
acento), nunca gravado. Filme e série não viram pin.

Pedidos entre telas, todos em memória como `calendarFocus`: `mapFocus` (a Lista
e as Viagens abrem a Home num item, cidade ou no mundo), `listFocus` (a Home abre
a ficha de um item na Lista). O painel pede foco à área do mapa com a Home já
aberta por `FocusRequest` (`{focus, nonce}`), não por `mapFocus`.

O token é `VITE_MAPBOX_TOKEN`, **público** (`pk.`). Toda `VITE_*` vai para o
bundle: o `vite.config.ts` derruba o build com um `sk.`, e o adaptador recusa
qualquer token que não seja `pk.` (a tela mostra _"O mapa não carregou."_ e o
resto segue). Receita visual em `src/map/style.ts`; em DEV, `?receita=custom`
troca o Standard Satellite pelo estilo próprio.

## Fronteiras

| Fronteira | Onde | Regra |
| --- | --- | --- |
| Banco → domínio | `src/data/stays.ts` (`toDomainStay`) | snake_case só existe abaixo desta linha |
| Domínio | `src/domain/coupleState.ts` | função pura, sem import de Supabase; testável sem rede |
| Autorização | policies em `supabase/migrations/` | nunca no cliente |
| `Date` | `src/lib/date.ts` | não escapa deste arquivo |
| Mapa | `src/map/mapbox/adapter.ts` | único import de `mapbox-gl`; o resto fala com `MapEngine` |

## Schema

Vinte e duas tabelas, todas com RLS: `cities`, `couples`, `profiles`, `couple_members`,
`couple_invites`, `stays`, `couple_settings`, `profile_settings`,
`couple_saved_cities`, `list_items`, `list_memories`, `list_photos`,
`calendar_events`, `day_kisses`, `trips` e as sete `trip_*` da Fase 6; mais dois contadores de abuso em `private`, fora da API.
Dois buckets privados: `avatars` (por pessoa, ADR 0009) e `couple-media` (por
casal, ADR 0012). Detalhes nas specs das Fases 0, 2, 3, 4, 5 e 6 (seção 5). Dois pontos que não são óbvios lendo o
DDL:

- `stays_no_overlap` é um `EXCLUDE USING gist` sobre
  `daterange(starts_on, ends_on, '[]')`: uma pessoa não está em dois lugares no
  mesmo dia, e duas estadias em aberto da mesma pessoa colidem.
- `couple_members.slot` (`check (slot in (1,2))` + `unique (couple_id, slot)`)
  cobra "um casal tem dois integrantes" sem trigger e sem uma segunda função
  `security definer` — e de quebra é a faixa fixa de cada pessoa no calendário.

- `couple_members` tem `unique (profile_id)`: uma pessoa em no máximo um casal,
  por construção.
- `couples` tem trigger que recusa `started_on` futuro em qualquer caminho.
- `profiles.color` está na paleta do design (`CHECK`) e um trigger recusa a cor
  da outra pessoa do casal (`profiles_color_taken`).
- `profiles` se liga ao Auth por `user_id` (FK com cascade, `user_id = id`,
  imutável), não pelo `id`. `user_id` nulo é o **perfil provisório** da outra
  pessoa (ADR 0024): criado por `save_pending_partner` por quem está sozinho, e
  herdado no `accept_invite`, que troca o id dele pelo de quem entra em toda FK
  para `profiles` (lidas do catálogo) e o apaga. "Casal cheio" conta só quem
  tem conta (`private.real_member_count`).

`private.my_couple_ids()` é `security definer` em `private`, fora da API. Em
`public` há **exatamente treze** `security definer` — as sete RPCs do convite
(ADR 0008), mais `leave_couple`, `delete_couple`, `cancel_invite`,
`list_my_sessions` e `end_my_session` (Fase 3), e `save_pending_partner`
(ADR 0024); `mark_item_done` (Fase 4),
`paint_stays` e `create_event` (Fase 5) e `create_trip` (Fase 6) são `invoker` e não contam — e
`supabase/tests/onboarding.test.ts` (A20) falha se aparecer uma décima terceira. Todas têm `revoke execute ... from public, anon`, porque o Postgres
concede `EXECUTE` a `PUBLIC` por padrão. O `service_role` tem `USAGE` em
`private` para o trigger de `couples` funcionar em escrita administrativa.

## Contrato compartilhado

`src/lib/database.types.ts` é gerado do schema por `npm run types:gen` e
versionado. É a fonte única: renomear coluna sem regenerar quebra o
`typecheck`. Nunca editar à mão.
