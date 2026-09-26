-- RLS por casal. O cliente NUNCA filtra por couple_id: ele pede a tabela e
-- recebe o que é dele. Uma query que esqueça o filtro tem de voltar vazia.
--
-- ADR: .agent/Decisions/0001-supabase-com-rls-por-casal.md

-- ---------------------------------------------------------------------------
-- my_couple_ids — devolve o CONJUNTO de casais, não um booleano.
--
-- Usada como `couple_id in (select public.my_couple_ids())`, o planner a
-- avalia uma vez por query (InitPlan). Uma função booleana recebendo a coluna
-- (`is_couple_member(couple_id)`) rodaria por linha — é a classe de problema
-- que o advisor do Supabase aponta e que a migration 00004 do schema anterior
-- existiu para corrigir.
--
-- security definer para quebrar a recursão: policy em couple_members que
-- consulta couple_members não termina.
-- ---------------------------------------------------------------------------
create function public.my_couple_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select couple_id from public.couple_members where profile_id = (select auth.uid());
$$;

-- O Postgres concede EXECUTE a PUBLIC por padrão. Sem este revoke a função
-- fica chamável por `anon` — e ela é security definer, ou seja, uma porta que
-- não passa por RLS. Foi o que a migration 00003 do schema anterior corrigiu.
revoke execute on function public.my_couple_ids() from public, anon;
grant  execute on function public.my_couple_ids() to authenticated;

alter table public.cities         enable row level security;
alter table public.couples        enable row level security;
alter table public.profiles       enable row level security;
alter table public.couple_members enable row level security;
alter table public.stays          enable row level security;

-- ---------------------------------------------------------------------------
-- cities — referência global, legível por qualquer sessão autenticada.
-- Trade-off registrado na spec: dá para saber que "Marau, RS" existe na tabela,
-- não de quem é. A alternativa (cidades por casal) duplicaria coordenadas para
-- ganhar sigilo sobre nome de cidade, que não é segredo.
-- Sem update e sem delete: cidade errada se corrige por migração, não por
-- UPDATE que reescreve a história de quem já a referencia.
-- ---------------------------------------------------------------------------
create policy "cities_select_authenticated" on public.cities
  for select to authenticated using (true);

create policy "cities_insert_authenticated" on public.cities
  for insert to authenticated with check (true);

-- ---------------------------------------------------------------------------
-- couples — só membros. NENHUMA policy expõe couples por invite_code: o código
-- é o único segredo do schema, e quem o tem entra no casal. A busca por código
-- é RPC security definer com escopo mínimo, e nasce na Fase 2.
-- ---------------------------------------------------------------------------
create policy "couples_select_member" on public.couples
  for select to authenticated
  using (id in (select public.my_couple_ids()));

create policy "couples_update_member" on public.couples
  for update to authenticated
  using      (id in (select public.my_couple_ids()))
  with check (id in (select public.my_couple_ids()));

-- ---------------------------------------------------------------------------
-- profiles — o próprio, e o de quem compartilha casal.
-- ---------------------------------------------------------------------------
create policy "profiles_select_self_or_partner" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or id in (
      select cm.profile_id from public.couple_members cm
      where cm.couple_id in (select public.my_couple_ids())
    )
  );

create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using      (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- couple_members — leitura por membro. Sem insert/update/delete nesta fase:
-- entrar num casal é fluxo de convite (Fase 2), e vai ser RPC, não INSERT
-- direto. Porta que não existe não precisa de tranca.
-- ---------------------------------------------------------------------------
create policy "couple_members_select_member" on public.couple_members
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or couple_id in (select public.my_couple_ids())
  );

-- ---------------------------------------------------------------------------
-- stays — leitura e escrita com a MESMA expressão. Policies assimétricas
-- produzem a falha silenciosa clássica: o INSERT passa, o SELECT seguinte não
-- devolve a linha, e o usuário vê o registro "desaparecer" sem erro nenhum.
-- ---------------------------------------------------------------------------
create policy "stays_all_couple_member" on public.stays
  for all to authenticated
  using      (couple_id in (select public.my_couple_ids()))
  with check (couple_id in (select public.my_couple_ids()));
