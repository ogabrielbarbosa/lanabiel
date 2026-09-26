-- Fase 2 · 2/5 — uma pessoa em no máximo um casal (I1).
--
-- Spec: .agent/Tasks/fase-2-onboarding.md, seção 4 (I1) e seção 7
-- ADR:  .agent/Decisions/0008-convite-portador-e-um-casal-por-pessoa.md
--
-- No schema, e não numa checagem dentro da RPC: duas abas clicando "Criar
-- nosso espaço" ao mesmo tempo passam as duas pela checagem e inserem as duas.
-- Com o unique, a segunda espera a primeira e recebe unique_violation.

alter table public.couple_members
  add constraint couple_members_one_couple_per_profile unique (profile_id);

-- O unique acima já cria um índice em profile_id. Dois índices iguais só
-- custam escrita.
drop index public.couple_members_profile_idx;

alter table public.couples
  add constraint couples_name_len
    check (name is null or char_length(btrim(name)) between 1 and 40);
