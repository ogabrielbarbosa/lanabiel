# Arquitetura do projeto

> Atualizado ao fim da Fase 0 (Fundação), 2026-09-25. O _como_ mora aqui e é
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
| Tipos | tsc, três project refs | `tsconfig.app.json` (navegador), `.node.json` (configs), `.tests.json` (integração) |
| Testes | vitest | domínio em `src`, integração em `supabase/tests` |

## Estrutura

```text
src/
├── main.tsx, App.tsx       # entrypoint e raiz
├── domain/
│   └── coupleState.ts      # derivação: estadias → juntos/separados/viajando
├── data/
│   ├── result.ts           # DataResult / WriteResult discriminados
│   └── stays.ts            # leitura e escrita de estadias, fronteira snake→camel
├── lib/
│   ├── supabase.ts         # cliente único
│   ├── database.types.ts   # GERADO — não editar à mão
│   └── date.ts             # datas ISO em horário local, grade do mês, rótulos pt-BR
└── timeline/               # a tela antiga, sobre localStorage — substituída na Fase 5

supabase/
├── config.toml             # portas em 553xx: outro projeto local ocupa a faixa padrão
├── migrations/             # o schema, append-only
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

## Fronteiras

| Fronteira | Onde | Regra |
| --- | --- | --- |
| Banco → domínio | `src/data/stays.ts` (`toDomainStay`) | snake_case só existe abaixo desta linha |
| Domínio | `src/domain/coupleState.ts` | função pura, sem import de Supabase; testável sem rede |
| Autorização | policies em `supabase/migrations/` | nunca no cliente |
| `Date` | `src/lib/date.ts` | não escapa deste arquivo |

## Schema

Cinco tabelas, todas com RLS: `cities`, `couples`, `profiles`, `couple_members`,
`stays`. Detalhes e invariantes na spec da Fase 0
(`../Tasks/fase-0-fundacao.md`, seção 5). Dois pontos que não são óbvios lendo o
DDL:

- `stays_no_overlap` é um `EXCLUDE USING gist` sobre
  `daterange(starts_on, ends_on, '[]')`: uma pessoa não está em dois lugares no
  mesmo dia, e duas estadias em aberto da mesma pessoa colidem.
- `couple_members.slot` (`check (slot in (1,2))` + `unique (couple_id, slot)`)
  cobra "um casal tem dois integrantes" sem trigger e sem uma segunda função
  `security definer` — e de quebra é a faixa fixa de cada pessoa no calendário.

`private.my_couple_ids()` é a **única** função `security definer`. Ela vive em
`private`, não em `public`, para não ser publicada como endpoint REST; e tem
`revoke execute ... from public, anon`, porque o Postgres concede `EXECUTE` a
`PUBLIC` por padrão.

## Contrato compartilhado

`src/lib/database.types.ts` é gerado do schema por `npm run types:gen` e
versionado. É a fonte única: renomear coluna sem regenerar quebra o
`typecheck`. Nunca editar à mão.
