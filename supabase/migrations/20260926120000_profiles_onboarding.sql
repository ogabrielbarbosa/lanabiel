-- Fase 2 · 1/5 — perfil criado pelo onboarding.
--
-- Spec: .agent/Tasks/fase-2-onboarding.md, seção 5 (migration 1) e seção 6
--
-- Dois campos de nome, revertendo a Fase 0: a tela de perfil agora pede
-- "Nome" e "Como te chamam". display_name vale em toda a interface; full_name
-- só onde identificar é defesa (preview do convite, rodapé do e-mail).
--
-- Os limites de tamanho aqui são os de `LIMITS` em src/domain/onboarding.ts.
-- supabase/tests/onboarding.test.ts prova a paridade (I11): mudou lá, muda aqui.

alter table public.profiles
  add column full_name   text,
  add column avatar_path text;          -- nulo = sem foto; a tela mostra iniciais

-- Linhas que já existem (o harness de teste, e o remoto se houver) recebem o
-- nome de exibição como nome completo. Melhor que nulo, e editável na Fase 3.
update public.profiles set full_name = display_name where full_name is null;

alter table public.profiles
  alter column full_name set not null,
  -- Cor do slot 1. `accept_invite` dá ao slot 2 a outra cor da paleta quando
  -- as duas coincidem (I10). Escolher a própria cor é da Fase 3.
  alter column color set default '#3b82f6',
  add constraint profiles_full_name_len    check (char_length(btrim(full_name))    between 1 and 80),
  add constraint profiles_display_name_len check (char_length(btrim(display_name)) between 1 and 30),
  -- A foto mora na pasta do dono (ADR 0009). Um caminho fora dela apontaria
  -- para o arquivo de outra pessoa — que a policy do bucket nem deixaria ler.
  add constraint profiles_avatar_in_own_folder
    check (avatar_path is null or avatar_path like id::text || '/%');

-- Até aqui ninguém criava perfil pelo app — só o harness, com service_role.
-- `id = auth.uid()` é o único corte que importa: cada um cria o próprio.
create policy "profiles_insert_self" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));
