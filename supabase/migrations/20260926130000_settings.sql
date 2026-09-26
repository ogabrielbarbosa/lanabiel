-- Fase 3 · 1/5 — preferências, em três escopos (ADR 0011).
--
-- Spec: .agent/Tasks/fase-3-configuracoes.md, seção 5 (migration 1), I1–I5
-- ADR:  .agent/Decisions/0011-preferencias-em-tres-escopos.md
--
-- Casal → couple_settings. Pessoa → profile_settings. Aparelho → localStorage
-- (não passa por aqui). Os PADRÕES moram nas colunas, e só nelas (I2): o
-- cliente não tem uma segunda tabela de padrões, e linha ausente é erro — o
-- trigger abaixo garante que ela existe desde o primeiro instante.
--
-- As listas dos CHECK são as de src/domain/settings.ts (PERSON_COLORS,
-- BAND_COLORS, LIST_CATEGORIES). supabase/tests/settings.test.ts prova a
-- paridade: mudou lá, muda aqui.

-- ---------------------------------------------------------------------------
-- couple_settings — um por casal. Os dois integrantes editam.
-- ---------------------------------------------------------------------------
create table public.couple_settings (
  couple_id              uuid primary key references public.couples (id) on delete cascade,

  -- Perfil do casal. Efeito com o agendador (lembrete) e com a Home (Fase 7).
  remind_anniversary     boolean not null default true,
  show_home_counter      boolean not null default true,
  use_couple_cover       boolean not null default false,

  -- Calendário (Fase 5 lê).
  calendar_default_view  text    not null default 'month',
  week_starts_on         text    not null default 'sun',
  show_adjacent_days     boolean not null default true,
  show_day_markers       boolean not null default true,
  -- Cores por SLOT, não por cidade: "juntos na casa de quem é slot 1". Trocar
  -- a cidade-casa não troca a cor. `unknown` não tem cor (ADR 0002).
  color_together_home_1  text    not null default '#7FD8C4',
  color_together_home_2  text    not null default '#9CCBF2',
  color_together_away    text    not null default '#F6E3A1',
  color_apart            text    not null default '#8E97BD',

  -- Lista (Fase 4 lê). As chaves são as de `list_items.category` (ADR 0003).
  list_default_sort      text    not null default 'recent',
  show_category_progress boolean not null default true,
  hidden_categories      text[]  not null default '{}',
  show_daily_suggestion  boolean not null default true,

  updated_at             timestamptz not null default now(),

  constraint couple_settings_calendar_view check (calendar_default_view in ('month', 'year')),
  constraint couple_settings_week_start    check (week_starts_on in ('sun', 'mon')),
  constraint couple_settings_list_sort     check (list_default_sort in ('recent', 'az', 'category')),
  constraint couple_settings_band_colors check (
    color_together_home_1 in ('#7FD8C4','#9CCBF2','#C3B3F2','#F4A3B4','#EDA88A','#F6E3A1','#CBE68E','#8E97BD')
    and color_together_home_2 in ('#7FD8C4','#9CCBF2','#C3B3F2','#F4A3B4','#EDA88A','#F6E3A1','#CBE68E','#8E97BD')
    and color_together_away   in ('#7FD8C4','#9CCBF2','#C3B3F2','#F4A3B4','#EDA88A','#F6E3A1','#CBE68E','#8E97BD')
    and color_apart           in ('#7FD8C4','#9CCBF2','#C3B3F2','#F4A3B4','#EDA88A','#F6E3A1','#CBE68E','#8E97BD')
  ),
  -- Só as oito chaves, e nunca as oito: a lista não pode sumir inteira.
  constraint couple_settings_hidden_categories check (
    hidden_categories <@ array['pais','cidade','restaurante','parque','comida','experiencia','filme','serie']::text[]
    and cardinality(hidden_categories) < 8
  )
);

-- ---------------------------------------------------------------------------
-- profile_settings — uma por pessoa. Só a própria lê e edita: o envio futuro
-- lê no servidor, e a outra pessoa não tem por que ver.
--
-- Colunas `notify_<evento>_<canal>`, e não uma tabela (perfil, evento, canal):
-- o padrão de cada combinação fica no DDL, onde I2 o quer, e os tipos gerados
-- dão nome a cada uma. Evento novo = três colunas novas.
-- ---------------------------------------------------------------------------
create table public.profile_settings (
  profile_id                     uuid primary key references public.profiles (id) on delete cascade,

  notify_partner_by_default      boolean not null default true,

  notify_partner_list_item_app   boolean not null default true,
  notify_partner_list_item_email boolean not null default false,
  notify_partner_list_item_push  boolean not null default true,
  notify_partner_done_app        boolean not null default true,
  notify_partner_done_email      boolean not null default false,
  notify_partner_done_push       boolean not null default true,
  notify_partner_event_app       boolean not null default true,
  notify_partner_event_email     boolean not null default false,
  notify_partner_event_push      boolean not null default true,
  notify_anniversary_app         boolean not null default true,
  notify_anniversary_email       boolean not null default true,
  notify_anniversary_push        boolean not null default true,
  notify_trip_eve_app            boolean not null default true,
  notify_trip_eve_email          boolean not null default true,
  notify_trip_eve_push           boolean not null default true,
  notify_own_reminders_app       boolean not null default true,
  notify_own_reminders_email     boolean not null default false,
  notify_own_reminders_push      boolean not null default true,

  updated_at                     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- As linhas nascem junto com o casal e com o perfil. security definer porque
-- nenhuma das duas tabelas tem policy de INSERT — de propósito: a porta que o
-- cliente não precisa não existe. Em `private`, fora da API.
-- ---------------------------------------------------------------------------
create function private.create_couple_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.couple_settings (couple_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create function private.create_profile_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profile_settings (profile_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function private.create_couple_settings()  from public, anon;
revoke execute on function private.create_profile_settings() from public, anon;
revoke execute on function private.touch_updated_at()        from public, anon;
-- Mesmo motivo do `couples_started_on_not_future`: quem escreve na tabela
-- precisa poder executar o trigger — o app e o service_role (painel, testes).
grant execute on function private.create_couple_settings()  to authenticated, service_role;
grant execute on function private.create_profile_settings() to authenticated, service_role;
grant execute on function private.touch_updated_at()        to authenticated, service_role;

create trigger couples_create_settings
  after insert on public.couples
  for each row execute function private.create_couple_settings();

create trigger profiles_create_settings
  after insert on public.profiles
  for each row execute function private.create_profile_settings();

create trigger couple_settings_touch
  before update on public.couple_settings
  for each row execute function private.touch_updated_at();

create trigger profile_settings_touch
  before update on public.profile_settings
  for each row execute function private.touch_updated_at();

-- Backfill: casais e perfis que já existem (hoje nenhum; o harness recria os
-- dele depois desta migration).
insert into public.couple_settings (couple_id) select id from public.couples on conflict do nothing;
insert into public.profile_settings (profile_id) select id from public.profiles on conflict do nothing;

-- ---------------------------------------------------------------------------
-- RLS. Leitura e escrita com a MESMA expressão (a falha silenciosa clássica
-- é o UPDATE passar e o SELECT seguinte não devolver a linha). Sem INSERT e
-- sem DELETE: nascem pelo trigger, morrem pelo cascade.
-- ---------------------------------------------------------------------------
alter table public.couple_settings  enable row level security;
alter table public.profile_settings enable row level security;

create policy "couple_settings_select_member" on public.couple_settings
  for select to authenticated
  using (couple_id in (select private.my_couple_ids()));

create policy "couple_settings_update_member" on public.couple_settings
  for update to authenticated
  using      (couple_id in (select private.my_couple_ids()))
  with check (couple_id in (select private.my_couple_ids()));

create policy "profile_settings_select_self" on public.profile_settings
  for select to authenticated
  using (profile_id = (select auth.uid()));

create policy "profile_settings_update_self" on public.profile_settings
  for update to authenticated
  using      (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- profiles.color — a paleta pessoal do design (I5), e as duas pessoas de um
-- casal com cores diferentes (I4).
-- ---------------------------------------------------------------------------

-- As cores da Fase 2 viram as do design. Em 2026-09-26 não havia perfil no
-- projeto; isto existe para o caso de haver quando a migration subir.
update public.profiles set color = '#7FD8C4' where color = '#3b82f6';
update public.profiles set color = '#F4A3B4' where color = '#ec4899';
update public.profiles set color = '#7FD8C4'
 where color not in ('#7FD8C4','#9CCBF2','#C3B3F2','#F4A3B4','#EDA88A','#F6E3A1','#CBE68E');

alter table public.profiles
  alter column color set default '#7FD8C4',
  add constraint profiles_color_palette
    check (color in ('#7FD8C4','#9CCBF2','#C3B3F2','#F4A3B4','#EDA88A','#F6E3A1','#CBE68E'));

-- Trigger comum (security invoker): a policy de profiles já deixa ler a outra
-- pessoa do casal, então não precisa furar RLS. Escolher a cor que a outra
-- pessoa acabou de escolher, em outro aparelho, bate aqui — a tela mostra o
-- nome dela (spec, seção 7).
create function private.profiles_color_distinct()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
      from public.couple_members mine
      join public.couple_members other
        on other.couple_id = mine.couple_id and other.profile_id <> mine.profile_id
      join public.profiles p on p.id = other.profile_id
     where mine.profile_id = new.id
       and p.color = new.color
  ) then
    raise exception 'a outra pessoa do casal já usa a cor %', new.color
      using errcode = '23514', constraint = 'profiles_color_taken';
  end if;
  return new;
end;
$$;

revoke execute on function private.profiles_color_distinct() from public, anon;
grant  execute on function private.profiles_color_distinct() to authenticated, service_role;

create trigger profiles_color_distinct
  before update of color on public.profiles
  for each row
  when (new.color is distinct from old.color)
  execute function private.profiles_color_distinct();
