# Schema anterior — como recuperar

O schema que existia neste projeto antes da Fase 0 **não foi copiado para cá**,
porque ele já está preservado onde o Supabase o guarda: a tabela
`supabase_migrations.schema_migrations` no projeto remoto. Dropar as tabelas de
`public` não a apaga — ela é de outro schema. Duplicar 11 mil caracteres de SQL
num arquivo criaria uma segunda cópia que envelhece sem ninguém notar.

Projeto: `smdtcznadmnrdubeidyz` (`sa-east-1`). As quatro migrations aplicadas em
2026-09-15, todas com o SQL completo na coluna `statements`:

| Versão | Nome | Chars de SQL |
| --- | --- | --- |
| `20260915192845` | `00001_core_schema` | 8033 |
| `20260915192855` | `00002_mementos_storage` | 1009 |
| `20260915192921` | `00003_lock_down_function_grants` | 516 |
| `20260915192955` | `00004_performance_lints` | 1606 |

Para ler qualquer uma:

```sql
select version, name, array_to_string(statements, E'\n') as sql
from supabase_migrations.schema_migrations
order by version;
```

## O que havia, em uma tela

Seis tabelas (`profiles`, `couples`, `couple_members`, `places`,
`calendar_events`, `mementos`), todas com RLS e **zero linhas**; um bucket
privado `mementos` com policies por pasta `{couple_id}/`; quatro funções
`security definer` (`handle_new_user` como trigger em `auth.users`,
`my_couple_ids`, `create_couple`, `join_couple`).

## O que foi aproveitado, e o que foi descartado

**Aproveitado** — três padrões que estavam certos e voltam no schema novo:

- `my_couple_ids() returns setof uuid`, usada como `couple_id in (select
  public.my_couple_ids())`. É a forma que o planner avalia uma vez (InitPlan),
  não por linha.
- `revoke execute ... from public, anon` em toda função `security definer`. O
  Postgres concede `EXECUTE` a `PUBLIC` por padrão; sem o revoke, a função é
  chamável por quem não está autenticado.
- `(select auth.uid())` dentro das policies, em vez de `auth.uid()` direto —
  mesmo motivo do InitPlan. Foi o que a migration `00004_performance_lints`
  corrigiu depois de o advisor apontar.

Índice em toda coluna de chave estrangeira também vem de lá (mesma migration).

**Descartado** — dois erros que o novo schema não repete:

- `profiles.home_city text check (home_city in ('RS','SP','other'))`. Não é
  cidade: são dois códigos de estado chumbados no schema. A derivação do estado
  do casal precisa de cidade com coordenada, daí a tabela `cities`.
- `calendar_events.location_type check (location_type in ('together_rs',
  'together_sp','together_other','alone_rs','alone_sp','alone_other'))`. É o
  estado do casal **persistido**, com RS e SP no `CHECK` — exatamente o que o
  [ADR 0002](../../.agent/Decisions/0002-estadia-por-pessoa-estado-derivado.md)
  proíbe, e a prova de que a decisão tinha o que decidir. Não havia coluna
  alguma dizendo onde cada pessoa estava: só o rótulo do par.
