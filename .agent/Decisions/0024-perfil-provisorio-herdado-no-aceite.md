# ADR 0024 — Perfil provisório da outra pessoa, herdado no aceite do convite

- **Status:** Proposed
- **Data:** 2026-09-27
- **Área:** schema (`profiles`), convite, Configurações

---

## Contexto

Até aqui `profiles.id` era chave estrangeira para `auth.users(id)`: só existia
perfil depois de existir conta. Como cada estadia é de uma pessoa (0002) e o
evento pinta os dias dos dois (0018), Home, Calendário e Viagens não abrem com
um integrante só. Quem cria o espaço fica sem poder preencher nada até a outra
pessoa aceitar o convite. É o caso real do casal que usa o app hoje: o Gabriel
quer deixar o histórico pronto antes de a Lana entrar.

Dezessete colunas de outras tabelas referenciam `profiles(id)`, e várias têm
gatilho `BEFORE INSERT OR UPDATE` que confere se o perfil é integrante do casal
(`stays_members`, `calendar_events_members`, `trip_member`,
`list_items_members`).

## Decisão

Um perfil pode existir sem conta. A ligação com o Auth sai do `id` e vai para a
coluna `profiles.user_id` (`unique`, FK para `auth.users` com `on delete
cascade`, e `check (user_id is null or user_id = id)`). `user_id` nulo é o
**provisório**: criado e editado só por `save_pending_partner`, por quem está
sozinho no casal, no slot livre.

No aceite do convite, se o casal tem provisório, `accept_invite` troca o
`profile_id` do slot em `couple_members` para o id de quem entra e depois, para
cada FK de coluna única que aponta para `profiles` (lida de `pg_constraint`,
menos `couple_members` e `profile_settings`), faz `update … set col = novo where
col = provisório`. Por fim apaga o provisório. Tudo numa transação. Vale o
perfil que a pessoa preencheu ao entrar; o do provisório é descartado.

## Alternativas descartadas

- **`on update cascade` nas FKs e `update profiles set id = auth.uid()`** — o
  cascade dispara os gatilhos de integrante das tabelas-filhas numa ordem que o
  Postgres não garante; se `stays` for atualizada antes de `couple_members`, o
  gatilho recusa e o aceite falha ao acaso. Exigiria ainda recriar 17 FKs no
  banco de produção.
- **Criar uma conta no Auth para a outra pessoa** — alguém escolheria senha e
  e-mail no nome de outra pessoa, e o convite (0008) deixaria de ser a porta de
  entrada.
- **Estadias e eventos "do slot 2" sem perfil** — mudaria o modelo de 0002
  inteiro (toda coluna de pessoa passaria a aceitar slot ou perfil) para
  resolver um intervalo de dias.
- **Lista escrita à mão das colunas a trocar** — uma tabela nova com FK para
  `profiles` seria esquecida, e o `on delete cascade` do provisório apagaria os
  dados dela sem erro.

## Consequências

### Positivas

- As telas não mudam: o provisório é um integrante com perfil completo.
- A RLS não muda: tudo continua passando por `couple_members`.
- Tabela nova com FK para `profiles` é herdada sem editar o aceite.

### Negativas / trade-offs

- `profiles.id` deixa de garantir, por si só, que existe conta. Quem precisar
  disso lê `user_id`.
- Uma pessoa grava dados no nome da outra antes de ela existir. É o propósito,
  mas o histórico da convidada começa com o que outra pessoa escreveu.
- O aceite usa SQL dinâmico sobre o catálogo. Identificadores saem de
  `regclass` e `%I`, nunca do cliente.
- Uma tabela nova com unicidade por perfil (tipo `profile_settings`) precisa
  entrar na exceção do loop, senão o aceite falha (e volta inteiro).

## Código / evidência

| Artefato | Caminho |
| -------- | ------- |
| Migration | `supabase/migrations/20260927130000_pending_partner.sql` |
| Testes de integração | `supabase/tests/pending-partner.test.ts` |
| Spec | `.agent/Tasks/perfil-provisorio.md` |

## Related

- [0002 — Estadia por pessoa](./0002-estadia-por-pessoa-estado-derivado.md)
- [0008 — Convite portador](./0008-convite-portador-e-um-casal-por-pessoa.md)
- [0018 — Período se grava pintando estadias](./0018-periodo-se-grava-pintando-estadias.md)
