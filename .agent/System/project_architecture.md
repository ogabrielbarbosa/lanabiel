# Arquitetura do projeto

> Atualizado ao fim da Fase 2 (Onboarding), 2026-09-26. O _como_ mora aqui e é
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
| UI | React 19 + TS 6 | componentes e estado |
| Backend | Supabase (Postgres 17, Auth, Storage, Edge Functions) | persistência e autorização |
| Autorização | RLS por casal | a única porta — ver [ADR 0001](../Decisions/0001-supabase-com-rls-por-casal.md) |
| Tipos do banco | `supabase gen types` → `src/lib/database.types.ts` | versionado; coluna renomeada quebra o typecheck |
| Lint | oxlint | verificação estática |
| Autenticação | Supabase Auth: senha + OAuth | [ADR 0004](../Decisions/0004-login-com-senha-e-oauth.md) — sem link mágico |
| Tipos | tsc, três project refs | `tsconfig.app.json` (navegador), `.node.json` (configs), `.tests.json` (integração) |
| Testes | vitest, três projetos | `domain` (node) · `ui` (jsdom, [ADR 0005](../Decisions/0005-interface-se-prova-em-jsdom.md)) · `db` (node, exige stack local) |

## Estrutura

```text
src/
├── main.tsx                # entrypoint
├── App.tsx                 # só o portão de sessão; nada mais mora aqui
├── auth/
│   ├── AuthGate.tsx        # decide: esqueleto / Login / onboarding / domínio; lê `#convite=`
│   ├── session.ts          # AuthState, com `loading` distinto de `signed_out`
│   ├── signIn.ts           # senha e OAuth; traduz erro do GoTrue em causa nomeada
│   ├── callback.ts         # volta do OAuth, e limpeza da URL
│   ├── Login.tsx · CriarConta.tsx · Escolha.tsx · AuthShell.tsx
│   └── auth.css            # tokens lidos do .pen; escuro é o padrão
├── domain/
│   ├── coupleState.ts      # derivação: estadias → juntos/separados/viajando
│   └── onboarding.ts       # LIMITS (paridade com os CHECK), código Crockford, "juntos há", distância
├── data/
│   ├── result.ts           # DataResult / WriteResult discriminados
│   ├── rpc.ts              # chamada de RPC: 42501 → unauthenticated, resto → error
│   ├── account.ts          # estágio: needs_profile / needs_couple / awaiting_partner / ready
│   ├── profile.ts · couple.ts · invites.ts · cities.ts · avatar.ts   # Fase 2
│   └── stays.ts            # leitura e escrita de estadias, fronteira snake→camel
├── onboarding/             # Fase 2: o assistente e as telas; recebe `OnboardingApi` injetada
│   ├── Onboarding.tsx      # a máquina de passos; o banco é a verdade, o passo é local
│   ├── pendingInvite.ts    # código pendente em sessionStorage (sobrevive ao OAuth)
│   ├── Perfil · SobreAGente · Aguardando · Codigo · Convite · Confirmar (+TudoPronto)
│   └── onboarding.css
├── lib/
│   ├── supabase.ts         # cliente ÚNICO, com as opções de auth explícitas
│   ├── database.types.ts   # GERADO — não editar à mão
│   └── date.ts             # datas ISO em horário local, grade do mês, rótulos pt-BR
├── test/setup.ts           # só o projeto `ui` do vitest carrega
└── timeline/               # a tela antiga, sobre localStorage — substituída na Fase 5
    └── TimelineScreen.tsx  # saiu de App.tsx na Fase 1, sem mudar de conteúdo

supabase/
├── config.toml             # portas em 553xx; segredos LOCAIS da função (transporte mailpit)
├── functions/send-invite/  # edge function do convite: handler.ts (regra) · email.ts · index.ts (Deno)
├── migrations/             # o schema, append-only (a das cidades é GERADA por scripts/gen-cities-seed.mjs)
├── baseline/README.md      # onde está o schema anterior e o que se aproveitou dele
└── tests/                  # integração: RLS e restrições, com dois casais reais
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
Local: transporte `mailpit`; o teste lê a mensagem pela API do Mailpit.

Cidades são os municípios do IBGE, por migration; o cliente não insere cidade
([ADR 0007](../Decisions/0007-cidades-brasileiras-por-seed-do-ibge.md)). Fotos
em bucket privado `avatars/<uid>/…`, legíveis pelo casal
([ADR 0009](../Decisions/0009-fotos-em-bucket-privado-por-casal.md)).

## Fronteiras

| Fronteira | Onde | Regra |
| --- | --- | --- |
| Banco → domínio | `src/data/stays.ts` (`toDomainStay`) | snake_case só existe abaixo desta linha |
| Domínio | `src/domain/coupleState.ts` | função pura, sem import de Supabase; testável sem rede |
| Autorização | policies em `supabase/migrations/` | nunca no cliente |
| `Date` | `src/lib/date.ts` | não escapa deste arquivo |

## Schema

Seis tabelas, todas com RLS: `cities`, `couples`, `profiles`, `couple_members`,
`couple_invites`, `stays`; mais dois contadores de abuso em `private`, fora da
API. Detalhes nas specs da Fase 0 (seção 5) e da Fase 2 (seção 5). Dois pontos que não são óbvios lendo o
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

`private.my_couple_ids()` é `security definer` em `private`, fora da API. Em
`public` há **exatamente sete** `security definer` — as RPCs do convite, listadas
no ADR 0008 — e `supabase/tests/onboarding.test.ts` (A20) falha se aparecer uma
oitava. Todas têm `revoke execute ... from public, anon`, porque o Postgres
concede `EXECUTE` a `PUBLIC` por padrão. O `service_role` tem `USAGE` em
`private` para o trigger de `couples` funcionar em escrita administrativa.

## Contrato compartilhado

`src/lib/database.types.ts` é gerado do schema por `npm run types:gen` e
versionado. É a fonte única: renomear coluna sem regenerar quebra o
`typecheck`. Nunca editar à mão.
