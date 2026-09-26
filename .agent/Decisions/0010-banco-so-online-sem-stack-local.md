# ADR 0010 — Banco só online, sem stack local

- **Status:** Accepted
- **Data:** 2026-09-26
- **Área:** infraestrutura de dados, processo de verificação

---

## Contexto

Até a Fase 2 o projeto tinha duas instâncias de Supabase: a stack local
(`npx supabase start`, Docker, portas 553xx), onde o app rodava em
desenvolvimento e onde viviam os testes de integração, e o projeto online
`lanabiel` (`smdtcznadmnrdubeidyz`), que tinha ficado para trás — estava no
schema da Fase 0 quando esta decisão foi tomada.

Duas instâncias divergem. O online estava sem as seis migrations da Fase 2,
aceitava senha de 6 caracteres (a Fase 1 decidiu 12, ADR 0004), não tinha
`localhost:5173` na lista de retorno do OAuth, e o histórico de migrations
ainda listava as quatro do schema anterior. Nada disso acusava erro: o app
local funcionava, e o online estava errado em silêncio.

Em 2026-09-26 o Gabriel decidiu: **o app — inclusive o `localhost` — usa só o
projeto online, e a stack local deixa de existir.**

## Decisão

- `.env.local` aponta para o projeto online, sempre. `.env.example` diz isso.
- O repositório está linkado ao projeto (`supabase link`), e
  `supabase/config.toml` passa a ser a **declaração do remoto**: `[auth]` sobe
  por `npx supabase config push`. Os valores que não eram decisão do projeto
  (MFA TOTP ligado, OTP de 8 dígitos, intervalo de 1 min entre e-mails, storage
  vetorial desligado) foram copiados do online para o arquivo, para o push não
  mudar nada por carona.
- Migrations sobem **só** pela CLI (`npm run db:push`), que grava a versão igual
  ao nome do arquivo. Tipos vêm do online (`npm run types:gen`, `--linked`).
- A stack local foi derrubada com os volumes (`supabase stop --no-backup`). Os
  scripts `test:db`, `db:reset` e `types:gen:local` saíram do `package.json`.
- Os testes de integração (`supabase/tests`) ficam **no repositório, dormentes**.
  O harness recusa qualquer URL que não seja local — eles criam e apagam
  usuários com a chave de administrador e não podem, em hipótese nenhuma, rodar
  contra produção. `DEVKIT_CMD_TEST_DB` e `DEVKIT_CMD_MIGRATE_CHECK` ficam vazios
  (o hook pula passo vazio).

## Alternativas descartadas

- **Manter a stack local como bancada de teste, sem o app usá-la.** Era a
  proposta intermediária: o app no online, os testes no local. Descartada pelo
  Gabriel — a stack é Docker, portas, containers e um segundo lugar para manter
  em dia, e a divergência que motivou a decisão nasceu justamente de ter dois.
- **Rodar os testes de integração contra o online.** Descartada sem discussão:
  eles apagam usuários e casais. Um prefixo errado num `deleteUserAndCouple`
  apagaria o casal de verdade.
- **Supabase Branching** (um banco efêmero por branch, com as migrations
  aplicadas). Resolve exatamente o problema, mas é recurso do plano pago. Fica
  como caminho de volta, abaixo.

## Consequências

### Positivas

- Um lugar só. O que o `localhost` mostra é o que existe.
- O online foi posto em dia no processo: seis migrations, função `send-invite`
  publicada, senha mínima 12, retornos do OAuth, histórico reparado.
- Sem Docker no dia a dia.

### Negativas / trade-offs

- **A RLS deixa de ter prova automática.** Os 87 testes de integração — isolamento
  entre casais, corridas de aceite, limite de tentativas, `anon` bloqueado, a
  lista fechada de funções `security definer` — não rodam em lugar nenhum. Uma
  policy quebrada numa fase futura passa typecheck, lint e testes de interface,
  e só aparece quando um casal vê o que não devia. É o custo mais alto desta
  decisão, e é por isso que o CLAUDE.md manda **dizer** "RLS não verificada" no
  relatório em vez de supor.
- **Migration vai direto para produção**, sem ensaio do zero. O que era pego
  pelo `db:reset` (arquivo que não aplica, ordem errada, dependência faltando)
  agora é pego pelo `db push` — em produção, já com dados.
- Desenvolvimento cria dados de teste no banco real (contas de teste, casais de
  teste). Precisam de convenção de nome e limpeza.
- O transporte `mailpit` da edge function e o teste que lê o Mailpit ficaram sem
  onde rodar; estão dormentes com o resto de `supabase/tests`.

## Caminho de volta

Religar a prova custa pouco e não exige a stack local:

1. Criar um segundo projeto Supabase, **só de teste** (grátis), e aplicar nele as
   migrations (`supabase db push` com ele linkado, ou `--db-url`).
2. Ajustar a trava do `supabase/tests/harness.ts` para aceitar **aquele** host, e
   nenhum outro — nunca o de produção.
3. Voltar `test:db` ao `package.json` e `DEVKIT_CMD_TEST_DB` /
   `DEVKIT_CMD_MIGRATE_CHECK` ao profile.

O gatilho para fazer isso é a primeira fase que mexer em policy ou RPC — a
Fase 3 (Configurações) já mexe em `couples`.

## Código / evidência

| Artefato | Caminho |
| -------- | ------- |
| Env | `.env.example`, `.env.local` (não versionado) |
| Declaração do remoto | `supabase/config.toml` |
| Trava dos testes | `supabase/tests/harness.ts` |
| Gate | `.devkit/profile.sh` |
| Procedimento de migration | `CLAUDE.md`, "O banco: só o projeto online" |

## Related

- [0001 — Supabase com RLS por casal](./0001-supabase-com-rls-por-casal.md) — a
  autorização continua na policy; o que se perde é a prova automática dela
- [0004 — Login com senha e OAuth](./0004-login-com-senha-e-oauth.md) — a senha
  mínima 12 só passou a valer no online com esta mudança
- [0006 — E-mail por Resend](./0006-email-transacional-por-resend-em-edge-function.md)
