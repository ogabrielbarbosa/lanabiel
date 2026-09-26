-- Fase 3 · 2/5 — cidades salvas pelo casal.
--
-- Spec: .agent/Tasks/fase-3-configuracoes.md, R14 e seção 5 (migration 2)
--
-- Atalhos que o Calendário (Fase 5) e a Lista (Fase 4) oferecem primeiro na
-- busca. Cidade-casa NÃO é linha aqui: ela é `profiles.home_city_id`, e
-- guardá-la duas vezes daria duas verdades. A tela junta as duas listas.
--
-- Só municípios brasileiros por enquanto — `cities` é o seed do IBGE e o
-- cliente não cria cidade (ADR 0007). Lisboa chega com o geocoding das Viagens.

create table public.couple_saved_cities (
  couple_id  uuid not null references public.couples  (id) on delete cascade,
  city_id    uuid not null references public.cities    (id),
  added_by   uuid          references public.profiles  (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (couple_id, city_id)
);

create index couple_saved_cities_city_idx     on public.couple_saved_cities (city_id);
create index couple_saved_cities_added_by_idx on public.couple_saved_cities (added_by);

alter table public.couple_saved_cities enable row level security;

create policy "couple_saved_cities_select_member" on public.couple_saved_cities
  for select to authenticated
  using (couple_id in (select private.my_couple_ids()));

-- `added_by` é de quem insere, não de quem a pessoa quiser dizer.
create policy "couple_saved_cities_insert_member" on public.couple_saved_cities
  for insert to authenticated
  with check (
    couple_id in (select private.my_couple_ids())
    and added_by = (select auth.uid())
  );

create policy "couple_saved_cities_delete_member" on public.couple_saved_cities
  for delete to authenticated
  using (couple_id in (select private.my_couple_ids()));
