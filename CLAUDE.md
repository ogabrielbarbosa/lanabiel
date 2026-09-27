# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# lanabiel

App do casal Gabriel & Lana, à distância entre São José dos Campos (SP) e Marau
(RS). SPA em React 19 + TypeScript servida pelo Vite 8, com **Supabase** como
backend (Postgres 17, Auth, Storage, Edge Functions) e autorização por **RLS por
casal**. Duas pessoas escrevem no mesmo acervo.

O produto está desenhado tela por tela no Pencil (~50 frames; Mapa, Calendário,
Lista, Viagens, Configurações, Login e onboarding) e é construído em oito fases.
A Fase 0 (Fundação) está pronta — ver `.agent/Tasks/fase-0-fundacao.md`.

## Comandos

| Comando             | Faz                                                        |
| ------------------- | ---------------------------------------------------------- |
| `npm run dev`       | Dev server com HMR                                         |
| `npm run typecheck` | `tsc -b --noEmit` (project refs: `app` + `node`)           |
| `npm run lint`      | oxlint (`react`, `typescript`, `oxc`)                      |
| `npm run build`     | `tsc -b && vite build`                                     |
| `npm run preview`   | Serve o `dist/` já construído                              |
| `npm run test`      | vitest sobre `src` — domínio, puro, sem rede                |
| `npm run db:push`   | aplica as migrations pendentes no projeto online (pede confirmação) |
| `npm run types:gen` | regenera `src/lib/database.types.ts` do projeto online (`--linked`) |

**O runner é vitest** (`vitest.config.ts`): `domain` (`src/**/*.test.ts`, node)
e `ui` (`src/**/*.test.tsx`, jsdom). `npm run test` roda os dois e entra no hook
`Stop` via `DEVKIT_CMD_TEST`; o recorte de ambiente é por padrão de arquivo para
a suíte de domínio não pagar o custo de DOM — ver
[ADR 0005](.agent/Decisions/0005-interface-se-prova-em-jsdom.md).
**Comportamento de tela se prova renderizando**, não lendo o código.

**Os testes de integração em `supabase/tests` (RLS, restrições, convite,
Configurações) rodam contra o projeto ONLINE**, com `npm run test:db` — só
enquanto o app não estiver aberto a outros casais
([ADR 0014](.agent/Decisions/0014-testes-de-integracao-no-projeto-online.md),
que supersede essa parte do 0010). Eles criam e apagam usuários `…@test.local`
com a `service_role`, que mora em `.env.test.local` (nunca no `.env.local`). Os
arquivos rodam em série e o login espera o limite do Auth (30 a cada 5 min por
IP), então a suíte leva minutos — está **fora** do hook `Stop`: rode-a no
verify sempre que mexer em policy, RPC ou migration. A17/A18 (Mailpit) só rodam
com `MAILPIT_URL`.

Formatter continua ausente (`DEVKIT_CMD_FORMAT_FILE` vazio ⇒ o hook `format.sh`
sai sem fazer nada).

### O banco: só o projeto online

Não existe banco local. O app — inclusive o `localhost` — fala **sempre** com o
projeto online `lanabiel` (`smdtcznadmnrdubeidyz`), via `.env.local`
([ADR 0010](.agent/Decisions/0010-banco-so-online-sem-stack-local.md)). O
repositório está linkado a ele (`supabase link`), e `supabase/config.toml` é a
declaração do remoto: mudou `[auth]`, sobe com `npx supabase config push` (ele
mostra o diff e pergunta por serviço — recuse o que não for decisão sua).

Migration nova: escreva o arquivo em `supabase/migrations/`, confira com
`npx supabase db push --dry-run`, aplique com `npm run db:push`, regenere com
`npm run types:gen` e rode o typecheck. **Ela vai direto para produção**, sem
ensaio — por isso: pequena, reversível quando der, e nunca destrutiva sem olhar
os dados antes (`select count(*)` na tabela afetada).

Edge function: `npx supabase functions deploy <nome>`. Segredos com
`npx supabase secrets set` — os do Resend ficaram para o fim do roadmap, então
`send-invite` hoje responde erro e a tela mostra o código para o WhatsApp.

O gate aceita `DEVKIT_SKIP_TEST=1`, `DEVKIT_RUN_BUILD=1` e `DEVKIT_FORCE=1`
(ignora o stamp de conteúdo em `.git/devkit-verify-stamp`). O build fica **fora**
do gate de propósito: leva minutos, não prova nada além do typecheck, e estourar
o timeout do hook é indistinguível de sucesso.

**Mas rode `npm run build` antes de dizer "pronto" sempre que mover ou renomear
arquivo.** Não é zelo: na Fase 1 um import de CSS quebrou num arquivo movido, e
`typecheck` e `lint` passaram limpos — TS não resolve caminho de CSS e o oxlint
não olha import de asset. Só o build pegou; o app abriria sem estilo nenhum com
70 testes verdes.

## O design

Fonte da verdade:
`~/.pencil/documents/6b52fae9-2ad1-40df-9cbc-425f5b02100c/pencil-new.pen`. É
encriptado — **só se lê pelo MCP do Pencil**, nunca com `Read` ou `grep`, e o
arquivo precisa estar aberto no editor. Tokens saem de `GetVariables()`; copy de
um frame sai de
`Get("<id>", (n) => n?.type === "text" ? n.content : undefined, {resolveInstances: true})`.
O export JSON da raiz está velho e mente sobre as cores.

## Arquitetura

O mapa completo está em
[`.agent/System/project_architecture.md`](.agent/System/project_architecture.md)
— estrutura, fronteiras, schema e fluxo de dados. O que vale ter na cabeça em
todo turno está abaixo.

```
src/domain/coupleState.ts  # derivação: estadias → juntos/separados/viajando
src/domain/onboarding.ts   # LIMITS (paridade com os CHECK), código de convite
src/domain/settings.ts     # paletas, categorias, abas (paridade com os CHECK)
src/domain/list.ts         # Lista: validação (espelho do CHECK), filtros, sugestão, onde estamos
src/domain/calendar.ts     # Calendário: pintura (espelho da RPC), trechos, as duas contagens, ocorrências
src/domain/trips.ts        # Viagens: contrato (+ tripValidation.ts espelho dos CHECK, tripDerive.ts derivações)
src/data/                  # result.ts (discriminado), stays, account, invites, couple, settings…
src/app/                   # casca: barra lateral, roteador por caminho, aparência (tema)
src/auth/                  # portão de sessão, Login, SignUp, StartChoice
src/onboarding/            # assistente de criar/entrar no espaço, recebe OnboardingApi
src/list/                  # a Lista (Fase 4), recebe ListApi
src/calendar/              # o Calendário (Fase 5), recebe CalendarApi
src/trips/                 # as Viagens (Fase 6), recebe TripsApi; detail/ é o Detalhe e a Galeria
src/home/                  # a Home (Fase 7), recebe HomeApi; map/ é a área do mapa, panel/ o painel
src/map/                   # a engine do mapa atrás de MapEngine; SÓ mapbox/adapter.ts importa mapbox-gl
src/domain/map.ts          # Home: pins, regiões, câmera, contagens do painel (puro)
src/dev/                   # SÓ DEV: harness `?preview` com os dados do .pen, sem login
src/settings/              # as nove abas das Configurações, recebe SettingsApi
src/lib/                   # supabase.ts, database.types.ts (GERADO), date.ts
supabase/functions/        # edge functions (send-invite)
supabase/migrations/       # o schema, append-only
supabase/tests/            # integração contra o online (ADR 0014): RLS, RPCs, Storage
```

### O modelo: `stays`, e "juntos" como derivação

Só existe **um** registro de posição: `stays` — uma pessoa, uma cidade, um
intervalo inclusivo, `ends_on` nulo = em aberto. O estado do casal
(`Juntos em SJC`, `Juntos em Marau`, `Viajando juntos`, `Separados`) **nunca é
gravado**: `coupleStateOn` (`src/domain/coupleState.ts`) o calcula comparando as
duas estadias vigentes com as duas cidades-casa. Duplicá-lo cria duas verdades
que divergem na primeira edição — e não é hipótese: a tentativa anterior neste
projeto persistiu seis rótulos numa coluna `location_type` com RS e SP chumbados
no `CHECK`, e não tinha coluna nenhuma dizendo onde cada pessoa estava. Ver
[ADR 0002](.agent/Decisions/0002-estadia-por-pessoa-estado-derivado.md).

Existe um quinto estado que o design não mostra: **`unknown`**, quando ao menos
um dos dois não tem estadia no dia. Não é "separados" — chamar lacuna de
separação faz a contagem afirmar o que não se sabe.

**A cidade é referência (`city_id`), nunca texto.** "SJC" e "São José dos
Campos" como duas strings fariam a derivação dizer `Separados` com os dois no
mesmo lugar, sem erro nenhum.

Três consequências que atravessam quase todo arquivo:

1. **Datas são strings ISO `YYYY-MM-DD`, comparadas lexicograficamente**
   (`a < b`). `Date` só aparece dentro de `lib/date.ts`, que parseia em horário
   **local** (`new Date(y, m-1, d)`) — `new Date('2026-08-01')` seria UTC e
   deslocaria o dia.
2. **`ends_on` nulo = em aberto, e há DOIS "fins efetivos".** Confundi-los é bug
   silencioso, e o código antigo confundia. `effectiveEndForCounting` devolve
   `min(ends_on ?? hoje, hoje)` — para somar dias vividos sem contar futuro.
   `effectiveEndForDisplay` devolve `ends_on ?? fim da janela` — para a barra de
   uma estadia em aberto ir até a borda da tela em vez de parar em hoje. Nenhuma
   das duas serve para os dois usos; usar a de contagem ao desenhar faz a barra
   sumir de todo dia futuro, sem erro nenhum.
3. **Intervalos são inclusivos nas duas pontas** — daí `daysInclusive` somar 1.

### Escrita de estadia: sempre por pintura

Ninguém grava estadia com `insert`/`update` solto. Toda escrita é uma
**pintura** ("a pessoa esteve na cidade C de `de` até `até`"), aplicada pela
RPC `paint_stays` numa transação: corta, parte ou apaga o que havia no
intervalo, insere, e funde com a vizinha na mesma cidade
([ADR 0018](.agent/Decisions/0018-periodo-se-grava-pintando-estadias.md)). A
visita e a viagem pintam junto com o evento (`create_event`), **uma vez**:
depois disso editar o evento não mexe no período. Os dias tirados de um período
voltam para a casa de cada um.

A regra existe em dois lugares (`paintStays` no domínio, para a prévia; a RPC,
como autoridade) e `src/domain/paintCases.ts` roda contra os dois. Mudou um,
mude o outro e acrescente o caso.

**As faixas são trechos derivados** (`runs`): a maior sequência de dias com o
mesmo estado. Não há arrasto de faixa; edita-se pelo modal. E há **duas
contagens com nomes diferentes**: `countStates` (vivido, nunca passa de hoje)
e `countDrawn` (o desenhado numa janela, planejado incluso). Usar uma no lugar
da outra dá um número plausível e errado.

**Cidade estrangeira é linha do casal em `cities`**, vinda do Photon e
deduplicada por `osm_ref`; cidade brasileira é sempre a do IBGE
([ADR 0017](.agent/Decisions/0017-cidades-do-mundo-por-casal.md)).

### Persistência

Postgres no Supabase, com **RLS na policy — nunca filtro no cliente**. O cliente
pede a tabela e a policy resolve `auth.uid()` → `couple_members` → `couple_id`.
Uma query que precisasse do filtro daria o mesmo resultado com RLS desligada, e
aí a autorização estaria no lugar errado.

**Leitura devolve resultado discriminado** (`src/data/result.ts`): `rows` só
existe no caso `ok`. Isso não é zelo abstrato — com RLS, sessão ausente devolve
**zero linhas, não erro**, e o projeto no free tier pausa por inatividade,
devolvendo falha de rede. Uma função que devolvesse `[]` nos dois casos ruins
faria o app abrir com o calendário limpo e o casal concluir que perdeu a
história.

### Convenções

Identificadores em inglês, texto de interface em português. CSS é arquivo único
por feature (`list/list.css`), sem framework nem CSS-in-JS. Exceções registradas:
o Calendário tem `calendar.css` e `modals.css`; as Viagens, `trips.css` e
`detail/trip-detail.css`; a Home, `home.css` (área do mapa) e `panel.css`.

## Estado atual do repositório

Fases 0 a 7 (a 7 na branch `fase-7-mapa`). A Fase 1
entregou `src/auth/` (portão de sessão, login por senha e OAuth); a Fase 2, o
onboarding (`src/onboarding/`), o convite (`couple_invites`, edge function
`supabase/functions/send-invite`), os municípios do IBGE e as fotos em bucket
privado. A Fase 3 entregou a casca (`src/app/`: barra lateral e navegação por
caminho, ADR 0013), as Configurações (`src/settings/`), as preferências em três
escopos (`couple_settings`, `profile_settings`, `localStorage` — ADR 0011), a
mídia do casal (`couple-media`, ADR 0012) e sair/apagar o espaço.

A Fase 4 entregou a Lista (`src/list/`, `/lista`): `list_items` em tabela única
com dois formatos por `CHECK` (ADR 0003 revisado), memórias por pessoa e fotos
do feito (`list_memories`, `list_photos`), `mark_item_done` (RPC `invoker`),
busca de lugar no Photon/OSM com fallback IBGE (ADR 0016) e releitura ao voltar
ao foco em vez de realtime (ADR 0015). O painel "Perto de vocês" lê as estadias
do banco.

A Fase 5 entregou o Calendário (`src/calendar/`, `/`): mês, ano, o painel
"Onde a gente está", Novo/Editar período e Novo/Editar evento (seis tipos),
`calendar_events`, o contador 💋 (`day_kisses`, só na tela do Calendário e no
export — é dado íntimo, I12 da spec), cidades do mundo (ADR 0017) e a pintura
de estadias (ADR 0018). A timeline antiga sobre `localStorage` foi apagada, sem
import. O botão _Adicionar_ da barra abre evento ou item (`app/addIntent.ts`).

A Fase 6 entregou as Viagens (`src/trips/`, `/viagens` e `/viagens/:id`):
**a viagem é o evento `viagem` dos dois**, estendido 1:1 por `trips` e sete
tabelas-filhas (ADR 0019) — datas e destino moram só no evento, e o estado
(planejada/em andamento/feita) é derivado de hoje. `create_trip` (invoker) cria
e pinta; editar não repinta. Grade, Linha do tempo, painel _Pelo mundo_, Detalhe
(feita/futura), Galeria em tela cheia e Nova/Editar viagem. Rota com parâmetro no
roteador próprio (ADR 0020); mapas são a imagem do `.pen` com pins projetados
até a Fase 7 (ADR 0021). **Para comparar tela com o `.pen`:** `npm run dev` e
`/viagens?preview` (harness em `src/dev/`, só DEV, dados do design, sem login).
Enquanto os testes de integração rodarem contra o projeto online (ADR 0014),
**nenhum casal de fora deve usar o app**.

A Fase 7 entregou a Home (`src/home/`, em `/`; o Calendário passou a
`/calendario`, ADR 0023): globo 3D de satélite no **Mapbox GL JS v3** (ADR 0022,
supersede o 0021), navegação Mundo → País → Estado → Cidade com seletores,
filtros, _Aqui por perto_ e o painel da direita — e os mapas das Viagens na
mesma engine. **Ela só lê**: nenhuma tabela nova. Pins e cartões são React por
cima do mapa (`handle.project`), nunca camada do provedor. O token é
`VITE_MAPBOX_TOKEN`, **público** (`pk.`): o build para com um `sk.`, e o
adaptador o recusa. Harness: `/?preview`.

As preferências de telas que ainda não existem (Notificações) já estão gravadas: **cada fase lê a coluna que a Fase 3 criou** e
a refina, em vez de inventar a sua.

Adiado de propósito para o fim do roadmap: e-mail real pelo Resend (A29), Google
no celular (A30), avisos ao outro e o agendador.

`.agent/System/project_architecture.md` está atualizado ao fim da Fase 7.

**O arquivo `lanabiel` (sem extensão) na raiz é um export JSON ANTIGO do design,
e não é fonte da verdade.** Ele tem 4 telas e um conjunto de tokens
(`bg-primary`, `accent-green`, `font-serif`) que o design já não usa. A fonte da
verdade é o `.pen` — ver a próxima seção.

## Processo de desenvolvimento

O fluxo, os gates e o que cada comando faz estão em
[`.agent/System/ai-development-workflow.md`](.agent/System/ai-development-workflow.md).
O resumo que vale em todo turno:

```
/brainstorm → /research → /spec → plan → build → verify → /code-review → finish-branch
   Gate -1     Gate 0     Gate 1  Gate 2         Gate 3     Gate 4         Gate 5
```

**Dimensione à incerteza.** Bugfix, copy e UI isolada pulam os Gates −1 e 0, às
vezes o 1. **Ninguém pula o Gate 3** — a skill `verify`, cobrada pelo hook `Stop`.

**Afirmação sem saída de comando é previsão, não relatório.** Não escreva
"funciona", "pronto" ou "corrigido" sem colar o que provou. "Não verificado" é
resposta legítima; "presumo que funcione" não é.

### Onde cada coisa mora

| Pergunta                   | Onde                             |
| --------------------------- | --------------------------------- |
| Por que decidimos assim?   | `.agent/Decisions/` (ADRs)       |
| Como o sistema funciona?   | `.agent/System/`                 |
| O que a revisão cobra?     | `.agent/SOP/review-checklist.md` |
| O que estamos construindo? | `.agent/Tasks/<feature>.md`      |
| Como se prova algo aqui?   | `.devkit/profile.sh`             |

### Decisões arquiteturais exigem ADR

Dependência estrutural nova, mudança de fluxo de dados, trade-off de
segurança/performance, ou padrão novo que outras features vão seguir → `/adr`,
**no mesmo PR**. Mudar uma decisão passada é um ADR novo que supersede a antiga;
não se reescreve um `Accepted`.

### Antes de propor mudança estrutural

Leia `.agent/Decisions/README.md`. Propor o que já foi rejeitado, sem tratar do
porquê, desperdiça a rodada inteira.
