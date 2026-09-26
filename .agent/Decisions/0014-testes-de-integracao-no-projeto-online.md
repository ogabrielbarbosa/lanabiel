# ADR 0014 — Testes de integração contra o projeto online, enquanto o app não abre

- **Status:** Proposed
- **Data:** 2026-09-26
- **Área:** verificação, infraestrutura de dados
- **Supersede em parte:** [0010](./0010-banco-so-online-sem-stack-local.md) — só a regra dos testes

---

## Contexto

O [0010](./0010-banco-so-online-sem-stack-local.md) derrubou a stack local e
deixou `supabase/tests` dormente, com a regra de que os testes **jamais** rodam
contra produção, e o caminho de volta: um segundo projeto Supabase só de teste.
O gatilho era "a primeira fase que mexer em policy ou RPC" — a Fase 3.

No brainstorm da Fase 3 o Gabriel decidiu não criar o projeto de teste: _o app
não está online ainda_, então fazer tudo no banco de produção não tem problema.
Em 2026-09-26 o projeto tinha 0 casais e 0 perfis.

## Decisão

- `supabase/tests` volta a rodar, **contra o projeto `lanabiel` online**, por
  `npm run test:db`, que exporta `LANABIEL_DB_TESTS_ON_PROD=1`.
- O harness recusa qualquer host que não seja o do projeto, e recusa o do
  projeto sem a flag.
- A chave `service_role` fica em `.env.test.local` (ignorado pelo git), nunca no
  `.env.local` do app.
- Os testes só criam e apagam usuários `…@test.local`, com prefixo por arquivo,
  limpando **por id**. Nada é apagado por padrão de nome fora desse domínio.
- SQL de catálogo vai pela Management API (`supabase db query --linked`), com a
  sessão da CLI — sem senha de banco no repositório.
- `test:db` **não** entra no hook `Stop` (rede e usuários reais); roda no verify.

**Gatilho para parar:** o primeiro casal que não seja de teste (Gabriel e Lana
usando de verdade, ou qualquer outro). A partir dali, ou o projeto de teste do
0010 sai do papel, ou os testes voltam a dormir.

## Alternativas descartadas

- **Projeto de teste agora** (o caminho do 0010). Mais seguro, mas é um segundo
  projeto para manter em dia com as migrations — a divergência que motivou o
  0010 — e o Gabriel preferiu não ter, enquanto não há usuário.
- **Continuar sem prova de RLS.** A Fase 3 cria doze funções `security definer`,
  três tabelas com RLS e um bucket; sair sem prova seria afirmar autorização
  lendo SQL.

## Consequências

### Positivas

- RLS, RPCs e Storage da Fase 3 têm prova executável.
- Sem segundo projeto para sincronizar.

### Negativas / trade-offs

- Os testes rodam em produção: um bug no harness de limpeza apagaria dado real.
  A defesa é o domínio `@test.local` + limpeza por id, e o gatilho de parada.
- Deixam rastro: sessões e linhas de `private.invite_*` dos usuários de teste.
- A17 e A18 (Mailpit) ficam pulados sem `MAILPIT_URL`.

## Código / evidência

| Artefato | Caminho |
| -------- | ------- |
| Trava e fábrica de usuários | `supabase/tests/harness.ts` |
| Script | `package.json` → `test:db` |

## Related

- [0010 — Banco só online, sem stack local](./0010-banco-so-online-sem-stack-local.md)
