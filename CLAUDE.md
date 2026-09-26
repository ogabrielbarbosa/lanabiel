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
| `npm run test:db`   | vitest sobre `supabase/tests` — RLS e restrições, exige stack local |
| `npm run db:reset`  | derruba e reaplica todas as migrations no Postgres local    |
| `npm run types:gen` | regenera `src/lib/database.types.ts` do schema local        |

**O runner é vitest, com três projetos** (`vitest.config.ts`): `domain`
(`src/**/*.test.ts`, node), `ui` (`src/**/*.test.tsx`, jsdom) e `db`
(`supabase/tests`, node). `npm run test` roda os dois primeiros e entra no hook
`Stop` via `DEVKIT_CMD_TEST`; o recorte de ambiente é por padrão de arquivo para
a suíte de domínio não pagar o custo de DOM — ver
[ADR 0005](.agent/Decisions/0005-interface-se-prova-em-jsdom.md).
**Comportamento de tela se prova renderizando**, não lendo o código.
`npm run test:db`
(`supabase/tests`) exige `npx supabase start` de pé e é cobrado no Gate 3 pela
skill `verify` — mesmo raciocínio que mantém o build fora do gate: comando lento
e dependente de ambiente falha quando o Docker está parado, e gate que acusa o
ambiente errado é gate que se aprende a ignorar. **RLS só se prova ali**, com
dois casais de verdade, então rodar `test:db` antes de dizer "pronto" não é
opcional.

`DEVKIT_CMD_MIGRATE_CHECK="npm run db:reset"` dispara só quando um arquivo em
`supabase/migrations/` muda. Se o Docker estiver parado ele **falha** em vez de
passar — "não consegui provar" não é "está ok".

Formatter continua ausente (`DEVKIT_CMD_FORMAT_FILE` vazio ⇒ o hook `format.sh`
sai sem fazer nada).

**As portas locais são 553xx**, não a faixa padrão 543xx: outro projeto Supabase
local já ocupa aquela. Está em `supabase/config.toml`.

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
src/data/                  # result.ts (discriminado), stays, account, invites, couple…
src/auth/                  # portão de sessão, Login, SignUp, StartChoice
src/onboarding/            # assistente de criar/entrar no espaço, recebe OnboardingApi
src/lib/                   # supabase.ts, database.types.ts (GERADO), date.ts
src/timeline/              # a tela antiga, sobre localStorage — cai na Fase 5
supabase/functions/        # edge functions (send-invite)
supabase/migrations/       # o schema, append-only
supabase/tests/            # integração: RLS e restrições
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

### Renderização e arrasto

`Calendar.tsx` monta cada semana como uma grade de 7 colunas e recorta as
estadias em segmentos por semana (`weekSegments`), com faixa fixa por pessoa
(Gabriel = lane 0, Lana = lane 1). `capStart`/`capEnd` dizem se aquela ponta é o
começo/fim real da estadia ou só a borda da semana — só as pontas reais ganham
alça de redimensionamento.

`useBarDrag.ts` resolve o dia sob o ponteiro por **geometria**, lendo
`data-week-start` das linhas de semana dentro do `.month-grid` de origem. O
escopo ao mês onde o arrasto começou é deliberado: com dois meses lado a lado,
arrastar para fora da borda cairia no mês vizinho e pularia semanas de uma vez.
O clique disparado logo após um arrasto é descartado por `consumeClick()`.

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

O caminho antigo (`timeline/storage.ts` sobre `localStorage`, com `SEED_STAYS`)
**ainda existe e ainda funciona**: a Fase 0 foi aditiva de propósito, para manter
`typecheck` e `lint` verdes sem construir interface. Ele cai na Fase 5, quando o
Calendário desenhado substituir a tela de hoje. Até lá, **não construa nada novo
sobre ele** — o que é novo vai em `src/domain/` e `src/data/`.

### Convenções

Identificadores em inglês, texto de interface em português. CSS é arquivo único
por feature (`timeline/timeline.css`), sem framework nem CSS-in-JS.

## Estado atual do repositório

Fases 0, 1 e 2 na `main`. A Fase 1 entregou `src/auth/` (portão de sessão,
login por senha e OAuth); a Fase 2, o onboarding (`src/onboarding/`), o convite
(`couple_invites`, edge function `supabase/functions/send-invite`), os
municípios do IBGE e as fotos em bucket privado. `App.tsx` continua sendo só o
portão; com `ready`, ele ainda renderiza a timeline antiga sobre `localStorage`
— até a Fase 5, **nenhum casal de fora deve usar o app**.

Adiado de propósito para o fim do roadmap: e-mail real pelo Resend (A29), Google
no celular (A30), avisos ao outro e o agendador. Localmente o e-mail vai para o
Mailpit da stack (`http://127.0.0.1:55324`).

**Uma edge function editada pode não recarregar** na stack local
(`policy = "per_worker"`): se o teste falhar com o comportamento antigo,
`docker restart supabase_edge_runtime_lanabiel`.

`.agent/System/project_architecture.md` está atualizado ao fim da Fase 2.

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
