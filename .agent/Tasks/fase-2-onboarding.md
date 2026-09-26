# Spec — `fase-2-onboarding`

- **Data:** 2026-09-26
- **Autor:** Gabriel Barbosa
- **Status:** 🟡 Reviewed (pronta p/ implementar) — as cinco decisões da seção 13 aprovadas pelo Gabriel em 2026-09-26
- **Research (Gate 0):** N/A — os 23 frames estão desenhados e a copy foi lida do `.pen` pelo MCP do Pencil em 2026-09-26. O `/brainstorm` fechou escopo e dependências (Resend, IBGE); a dúvida que sobra é de contrato, não de produto.
- **ADR necessário?** **Sim, quatro, já escritos como `Proposed`** — [0006](../Decisions/0006-email-transacional-por-resend-em-edge-function.md) e-mail por Resend numa edge function · [0007](../Decisions/0007-cidades-brasileiras-por-seed-do-ibge.md) cidades do IBGE, escrita em `cities` fechada · [0008](../Decisions/0008-convite-portador-e-um-casal-por-pessoa.md) convite portador, uma pessoa em no máximo um casal · [0009](../Decisions/0009-fotos-em-bucket-privado-por-casal.md) fotos em bucket privado por casal. Esta spec os implementa.

---

## 1. What & Why

Hoje ninguém passa da `Escolha`. O app autentica (Fase 1), mas não tem como criar perfil, casal nem cidade-casa — e sem cidade-casa a derivação do [ADR 0002](../Decisions/0002-estadia-por-pessoa-estado-derivado.md) não roda. O único contorno é `INSERT` à mão no SQL, que funciona uma vez, para duas pessoas com acesso ao banco.

O casal que usa o app agora é Gabriel e Lana, mas **o critério desta fase é outro casal**: um par que o Gabriel não conhece cria o espaço, convida por e-mail ou por código, e os dois chegam ao app com perfil, foto e cidade-casa, sem ninguém tocar no banco. Por isso expiração, convite já usado, limite de tentativas e "a mesma pessoa em dois espaços" entram — são as defesas contra quem não é vocês.

O que existe depois: os dois botões da `Escolha` funcionam; um convite chega num e-mail de verdade, com link que já leva o código; o código também pode ser digitado ou colado do WhatsApp; e os três erros de código (inválido, expirado, já usado) têm tela própria.

## 2. Como funciona (um cenário real)

**Rafa** mora em Pelotas (RS) e **Duda** em Juiz de Fora (MG). Rafa abre o app, cria conta por senha (Fase 1), e cai na `Escolha` — com os dois botões habilitados agora. Toca em _Criar nosso espaço_.

**Passo 1 · Meu perfil.** Nome _Rafael Souza_, como te chamam _Rafa_, uma foto da galeria, e em _Cidade onde você mora_ digita "pelo" — a lista mostra _Pelotas, RS_ vindo da busca local sobre os 5.570 municípios do IBGE. A foto é reduzida no navegador para 512×512 em WebP e sobe para `avatars/<uid>/<aleatório>.webp`; ao continuar, a linha em `profiles` nasce com `full_name`, `display_name`, `home_city_id` e `avatar_path`. O portão agora diria `needs_couple`, mas o assistente segue no passo 2, porque o gesto foi _criar_.

**Passo 2 · Sobre a gente.** Começo do namoro _3 mar 2023_ ("juntos há 3 anos e 207 dias"), nome do casal _Rafa & Duda_. Continuar chama `create_couple`, que cria `couples` e a linha de `couple_members` com `slot = 1` na mesma transação. O estágio passa a `awaiting_partner`.

**Passo 3 · Convidar.** Nome _Duda_, e-mail `duda@exemplo.com`. _Enviar convite_ chama `create_invite`, que gera o código `7K4Q92` (Crockford base32, 6 caracteres) com validade de 7 dias, e em seguida a edge function `send-invite`, que confere pela RLS de quem chama que ele é membro do casal, registra a tentativa, envia pelo Resend com o link `https://<app>/#convite=7K4Q92`, e só então marca `last_sent_at`. O botão mostra _Enviando convite…_ enquanto isso.

**Passo 4 · Convite enviado.** A tela mostra o código `7K4-Q92`, _Copiar código_, _Enviar pelo WhatsApp_ e _Entrar no app_. Se o Resend tivesse recusado, a tela diria que **o e-mail não saiu** e ofereceria tentar de novo — o código continuaria válido e visível. Rafa fecha o notebook.

Duda recebe o e-mail no celular e toca em _Aceitar convite_. O app abre, lê `#convite=7K4Q92` do fragmento, guarda em `sessionStorage` e limpa a URL. Sem sessão, vê o Login com o cabeçalho _"Entre pra aceitar o convite"_; entra com Google. A volta do OAuth acontece na mesma aba, então o código ainda está guardado. O portão diz `needs_profile`, mas há código pendente: o app chama `lookup_invite('7K4Q92')` e mostra o convite — _"Rafa te convidou para o espaço Rafa & Duda · juntos desde 3 mar 2023 · espaço criado por Rafael Souza · Pelotas"_. Duda toca em _Aceitar convite_; falta perfil, então vem o passo _Seu perfil_ (Maria Eduarda Lima · Duda · Juiz de Fora, MG), e ao continuar o app cria o perfil e chama `accept_invite('7K4Q92')`. A função trava a linha do convite, confere que está pendente, insere Duda com `slot = 2`, dá a ela a segunda cor do casal, e marca o convite como aceito.

**Confirmar.** _"Confere se Rafa acertou a data."_ Duda corrige para 4 mar 2023 — é um `update` em `couples` que a policy de membro já permite. **Tudo pronto:** _"Lá fora são 1.424 km — aqui dentro, nenhum."_ (linha reta entre as coordenadas das duas cidades). _Entrar_ leva ao app, estágio `ready`.

No notebook, quando a janela do Rafa volta ao foco, o portão relê o estágio, encontra dois membros e sai de `awaiting_partner` para `ready`.

## 3. Requisitos (comportamentos observáveis)

- **R1** — Os dois botões da `Escolha` funcionam: _Criar nosso espaço_ abre o assistente do Cenário 1; _Tenho um código_ abre a digitação do Cenário 3.
- **R2** — O perfil pede nome, como te chamam, cidade (obrigatórios) e foto (opcional). A cidade só pode ser escolhida da lista; texto livre não é aceito.
- **R3** — Criar o espaço pede começo do namoro (obrigatório, não futuro) e nome do casal (opcional).
- **R4** — Convidar pede e-mail (obrigatório) e nome de quem é convidado (opcional). O convite nasce **antes** do envio e sobrevive a um envio que falhou.
- **R5** — A tela só diz que o convite foi **enviado** quando o provedor aceitou a mensagem. Enquanto não, diz que o e-mail não saiu e oferece tentar de novo.
- **R6** — O link do e-mail leva o código no fragmento (`#convite=`). O código sobrevive ao login, inclusive a ida e volta do OAuth na mesma aba, e some da URL assim que é lido.
- **R7** — Digitar o código aceita maiúsculas e minúsculas, espaços e hífen, e trata `O` como `0` e `I`/`L` como `1`. _Colar do WhatsApp_ extrai o código de um texto colado.
- **R8** — Antes de entrar, a pessoa vê a quem pertence o espaço (nome do casal, quem criou com nome completo e cidade, desde quando) e confirma.
- **R9** — Código inexistente, expirado, já usado e revogado têm respostas distintas para quem digita — exceto revogado, que aparece como inexistente (seção 9).
- **R10** — Quem criou o espaço e ainda está sozinho vê a tela **Aguardando**: o código, copiar, WhatsApp, reenviar (mesmo código, mais 7 dias), trocar e-mail (código novo, o antigo deixa de valer), e o convite expirado com _Renovar_. Dali pode seguir para o app.
- **R11** — Quem acabou de entrar vê **Confirmar** (pode editar a data e o nome do casal) e **Tudo pronto** (com a distância em linha reta entre as cidades-casa).
- **R12** — Quem já está num casal não consegue criar outro nem aceitar convite; recebe explicação e _Trocar de conta_.
- **R13** — Nenhuma copy desta fase presume gênero de quem é convidado ou de quem convida (seção 6).
- **R14** — A `Escolha` continua **sem** a linha _"Não achamos convite pendente pra <e-mail>"_ (herda R8 da Fase 1 — seção 9 explica por que a busca por e-mail não nasce).

## 4. Invariantes

- **I1** — Uma pessoa está em **no máximo um** casal. Cobrado pelo schema (`unique (profile_id)` em `couple_members`), não por checagem na RPC — duas abas clicando _Criar_ juntas não podem produzir dois casais.
- **I2** — Um casal tem no máximo dois integrantes (já cobrado pelo `slot`, Fase 0). Dois aceites simultâneos do mesmo convite produzem **um** `joined` e um `used`.
- **I3** — Entrar num casal só acontece por `accept_invite` com código válido. Não há policy de `insert` em `couple_members`, e não haverá.
- **I4** — O código é portador: quem o tem entra, independentemente do e-mail da sessão. **Nenhum caminho do sistema casa convite por e-mail** — o e-mail da sessão não é verificado (Fase 1, seção 9).
- **I5** — Um casal tem no máximo **um convite aberto** (não aceito, não revogado — expirado conta como aberto, porque renovar o reabre). Cobrado por índice único parcial.
- **I6** — Código nunca é reutilizado: é único na tabela para sempre, inclusive depois de expirar ou ser revogado.
- **I7** — Resolver código exige sessão. `anon` não chama nenhuma função desta fase.
- **I8** — Falhas de código por pessoa são contadas no servidor; passado o limite, a função responde `rate_limited` **sem consultar** o código.
- **I9** — `cities` não aceita escrita de cliente. Toda cidade vem de migration.
- **I10** — Os dois integrantes de um casal têm cores diferentes.
- **I11** — Os limites de tamanho dos campos existem em dois lugares — `src/domain/onboarding.ts` (feedback da tela) e `CHECK` no schema (autoridade) — e um teste de paridade prova que o `CHECK` recusa `limite + 1`.
- **I12** — Toda data desta fase continua string ISO `YYYY-MM-DD` no cliente; `expires_at` é `timestamptz` no banco e só vira texto de tela em `America/Sao_Paulo`.

## 5. Contrato & dados

### Mudança de armazenamento

Cinco migrations novas, append-only, nesta ordem. Nenhuma edita as anteriores.

**1 · `profiles`: nome completo, foto, e o próprio insert.**

```sql
alter table public.profiles
  add column full_name   text,
  add column avatar_path text;                       -- nulo = sem foto (iniciais)
update public.profiles set full_name = display_name where full_name is null;
alter table public.profiles
  alter column full_name set not null,
  alter column color set default '#3b82f6',          -- cor do slot 1; o slot 2 é '#ec4899'
  add constraint profiles_full_name_len    check (char_length(btrim(full_name))    between 1 and 80),
  add constraint profiles_display_name_len check (char_length(btrim(display_name)) between 1 and 30);

create policy "profiles_insert_self" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
```

**2 · Uma pessoa, um casal (I1).**

```sql
alter table public.couple_members
  add constraint couple_members_one_couple_per_profile unique (profile_id);
drop index public.couple_members_profile_idx;          -- o unique já indexa
alter table public.couples
  add constraint couples_name_len check (name is null or char_length(btrim(name)) between 1 and 40);
```

**3 · Convites.** `couples.invite_code` **sai** — um código por casal, sem prazo nem estado, não expressa nenhum dos cinco estados do design.

```sql
alter table public.couples drop column invite_code;

create table public.couple_invites (
  id            uuid primary key default gen_random_uuid(),
  couple_id     uuid not null references public.couples  (id) on delete cascade,
  code          text not null,
  email         text not null,               -- lower(btrim()), só para ENVIAR — nunca para casar (I4)
  invitee_name  text,
  created_by    uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  accepted_at   timestamptz,
  accepted_by   uuid references public.profiles (id) on delete set null,
  revoked_at    timestamptz,
  send_count    integer not null default 0,
  last_sent_at  timestamptz,                 -- último envio ACEITO pelo provedor

  constraint couple_invites_code_format   check (code ~ '^[0-9A-HJKMNP-TV-Z]{6}$'),
  constraint couple_invites_code_unique   unique (code),                            -- I6
  constraint couple_invites_email_format  check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint couple_invites_invitee_len   check (invitee_name is null or char_length(btrim(invitee_name)) between 1 and 30),
  constraint couple_invites_accepted_pair check (accepted_by is null or accepted_at is not null),
  constraint couple_invites_one_outcome   check (accepted_at is null or revoked_at is null)
);

-- I5: um convite aberto por casal.
create unique index couple_invites_one_open_per_couple
  on public.couple_invites (couple_id) where accepted_at is null and revoked_at is null;
create index couple_invites_created_by_idx  on public.couple_invites (created_by);
create index couple_invites_accepted_by_idx on public.couple_invites (accepted_by);

alter table public.couple_invites enable row level security;
-- Membro lê os convites do próprio casal (a tela Aguardando). Nenhuma escrita direta:
-- tudo passa pelas funções abaixo.
create policy "couple_invites_select_member" on public.couple_invites
  for select to authenticated using (couple_id in (select private.my_couple_ids()));

-- Contadores de abuso. Schema `private`, fora da API.
create table private.invite_code_failures (user_id uuid not null, at timestamptz not null default now());
create index on private.invite_code_failures (user_id, at);
create table private.invite_send_log (couple_id uuid not null, at timestamptz not null default now());
create index on private.invite_send_log (couple_id, at);
```

`accepted_by` fica nulo se a pessoa for apagada; `accepted_at` preservado continua dizendo que o convite foi usado. O estado do convite **não é coluna** — é derivado, pelo mesmo motivo do ADR 0002:

| Estado | Condição |
| --- | --- |
| `accepted` | `accepted_at is not null` |
| `revoked` | `revoked_at is not null` |
| `expired` | nenhum dos dois, e `expires_at <= now()` |
| `pending` | nenhum dos dois, e `expires_at > now()` |

**4 · Cidades do IBGE (ADR 0007).**

```sql
create extension if not exists unaccent with schema extensions;
alter table public.cities add column ibge_code integer unique;   -- nulo para cidade fora do Brasil (futuro)
drop policy "cities_insert_authenticated" on public.cities;      -- I9
-- 5.570 linhas, geradas por script versionado. As três cidades do seed da Fase 0
-- mantêm os UUIDs fixos: o upsert casa pela chave natural (name, state_code, country_code)
-- e só preenche ibge_code, lat e lng.
insert into public.cities (name, state_code, country_code, lat, lng, ibge_code) values (...)
on conflict on constraint cities_natural_key do update set ibge_code = excluded.ibge_code;
```

A fonte é o código IBGE, nome e UF da API de Localidades do IBGE, cruzados por `codigo_ibge` com as coordenadas do dataset `kelvins/municipios-brasileiros`. O script que gera a migration fica em `scripts/gen-cities-seed.ts`, com a URL e o SHA-256 dos dois arquivos de origem no cabeçalho do SQL gerado, para que regerar dê o mesmo arquivo.

**5 · Fotos (ADR 0009).** Bucket `avatars`, **privado**, `file_size_limit = 1MB`, `allowed_mime_types = {image/webp, image/jpeg}`. Caminho `<auth.uid()>/<uuid aleatório>.webp` — aleatório para trocar de foto não servir a antiga de cache. Policies em `storage.objects`, todas com `bucket_id = 'avatars'`:

- `insert`, `update`, `delete`: `(storage.foldername(name))[1] = (select auth.uid())::text`.
- `select`: a pasta é a própria, **ou** é de alguém que divide casal — `(storage.foldername(name))[1]::uuid in (select profile_id from couple_members where couple_id in (select private.my_couple_ids()))`.

Leitura por URL assinada de 1 hora. Trocar de foto apaga o objeto antigo depois de gravar o novo `avatar_path`.

### Funções (RPC)

Todas `security definer`, `set search_path = ''`, `revoke execute ... from public, anon`, `grant ... to authenticated` (I7). Todas as falhas **esperadas** voltam como `{ status: ... }` e não como exceção — exceção fica para o inesperado, e o cliente as distingue (seção 7).

```sql
-- Cria casal + membro slot 1, atômico.
create_couple(p_started_on date, p_name text) returns jsonb
  -- {status:'created', couple_id} | {status:'no_profile'} | {status:'already_member'}
  -- | {status:'invalid', field:'started_on'|'name'}          -- started_on > hoje (America/Sao_Paulo) ou < 1900-01-01

-- Cria o convite aberto do casal. Se já houver um aberto, REVOGA e cria outro (trocar e-mail).
create_invite(p_email text, p_invitee_name text) returns jsonb
  -- {status:'created', invite_id, code, expires_at}
  -- | {status:'not_member'} | {status:'couple_full'}
  -- | {status:'invalid', field:'email'|'invitee_name'} | {status:'own_email'}   -- e-mail do próprio auth.users

-- Reenviar/renovar: mesmo código, expires_at = now() + 7 dias. Vale para pendente e expirado.
renew_invite() returns jsonb
  -- {status:'renewed', invite_id, code, expires_at} | {status:'no_open_invite'} | {status:'not_member'}

-- Chamada pela edge function, com o JWT de quem pediu. Checa limites, registra a tentativa,
-- incrementa send_count e devolve o necessário para montar o e-mail.
begin_invite_send(p_invite_id uuid) returns jsonb
  -- {status:'ok', code, email, invitee_name, inviter_display_name, inviter_full_name,
  --   inviter_email, couple_name, started_on, expires_at, send_count}
  -- | {status:'not_member'} | {status:'not_pending'} | {status:'rate_limited', retry_after_s}

mark_invite_sent(p_invite_id uuid) returns void            -- last_sent_at = now()

-- Resolver código. Não exige perfil. Normaliza a entrada (R7) antes de tudo.
lookup_invite(p_code text) returns jsonb
  -- {status:'valid', couple_name, started_on, inviter_display_name, inviter_full_name,
  --   inviter_city, inviter_avatar_path, expires_at}
  -- | {status:'not_found'}                       -- inexistente OU revogado (seção 9); conta falha (I8)
  -- | {status:'expired', inviter_display_name, created_at, expires_at}
  -- | {status:'used', couple_name}
  -- | {status:'own_couple'} | {status:'already_member'}
  -- | {status:'rate_limited', retry_after_s}

-- Entrar. Exige perfil. SELECT ... FOR UPDATE no convite; o unique do slot resolve a corrida (I2).
accept_invite(p_code text) returns jsonb
  -- {status:'joined', couple_id} | {status:'no_profile'}
  -- | os mesmos not_found / expired / used / own_couple / already_member / rate_limited

-- Busca de cidade. security INVOKER (cities já é legível), sem efeito colateral.
search_cities(p_query text, p_limit int default 8) returns setof public.cities
  -- unaccent + lower, prefixo primeiro e depois contém; empate por nome. p_query < 2 chars → vazio.
```

`accept_invite` faz, na mesma transação: insere `couple_members (slot = 2)`; se a cor do novo integrante for igual à do outro, troca a dele para a outra cor da paleta (I10); marca `accepted_at`/`accepted_by`. Qualquer outro caminho de entrada num casal viola I3.

A geração de código usa `extensions.gen_random_bytes`, mapeia para o alfabeto Crockford (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`) e tenta de novo em colisão, até 5 vezes. Com 32⁶ ≈ 1,07 bilhão de códigos, a quinta tentativa não acontece na prática; se acontecer, a função levanta exceção, que é o certo.

### Edge function `send-invite` (ADR 0006)

`POST /functions/v1/send-invite`, `verify_jwt = true`, corpo `{ invite_id }`. Cria um cliente Supabase **com o `Authorization` de quem chamou** — nunca com `service_role` — e chama `begin_invite_send`, de modo que quem autoriza continua sendo a RLS. Monta o e-mail a partir do frame `E-mail de convite [YinSr]` (HTML e texto), com todo campo do usuário escapado. Envia por um de dois transportes, escolhido por `INVITE_EMAIL_TRANSPORT`:

- `resend` — `POST https://api.resend.com/emails`, com `Idempotency-Key: <invite_id>:<send_count>`, remetente `INVITE_FROM` (`convite@<domínio>`).
- `mailpit` — `POST $MAILPIT_URL/api/v1/send`. **Só local.** Verificado em 2026-09-26: o Mailpit v1.30.2 da stack local aceita o envio e expõe a busca por API.

Se o transporte aceitar, chama `mark_invite_sent`. Resposta: `{ status: 'sent' } | { status: 'send_failed', cause } | { status: 'not_member' } | { status: 'not_pending' } | { status: 'rate_limited', retry_after_s }`. Segredos: `RESEND_API_KEY`, `INVITE_FROM`, `APP_URL`, `INVITE_EMAIL_TRANSPORT`, `MAILPIT_URL`.

### Cliente

```ts
// src/domain/onboarding.ts — puro, sem rede. A UI valida daqui; o CHECK valida no banco (I11).
export const LIMITS = { fullName: 80, displayName: 30, coupleName: 40, inviteeName: 30 } as const
export const INVITE_TTL_DAYS = 7
export function normalizeInviteCode(raw: string): string | null   // 'k7 4-q9o2'? → null; '7k4-q92' → '7K4Q92'
export function extractInviteCode(pasted: string): string | null  // acha o código num texto colado do WhatsApp
export function formatInviteCode(code: string): string            // '7K4Q92' → '7K4-Q92'
export function togetherFor(startedOn: string, today: string): string // 'juntos há 2 anos e 8 dias'
export function distanceKm(a: LatLng, b: LatLng): number          // haversine, arredondado para km

// src/data/invites.ts, src/data/couple.ts, src/data/profile.ts, src/data/cities.ts —
// fronteira de banco. Cada RPC vira uma união discriminada que espelha o jsonb acima,
// mais { status: 'error', cause } para falha de rede/exceção. Nunca `null` para "deu errado".

// src/data/account.ts — um estágio a mais.
export type AccountStage =
  | { stage: 'needs_profile' }
  | { stage: 'needs_couple'; profileId: string }
  | { stage: 'awaiting_partner'; profileId: string; coupleId: string; slot: 1 }
  | { stage: 'ready'; profileId: string; coupleId: string; slot: 1 | 2 }
```

`loadAccountStage` continua com **duas** viagens: a segunda lê `couple_members` **sem** o `.eq('profile_id')` e recebe as linhas do casal inteiro (a policy devolve as dos dois), acha a própria, e conta. Uma linha = `awaiting_partner`; duas = `ready`. Com I1, não há como a pessoa ver linhas de dois casais.

**O código pendente** mora em `sessionStorage['lanabiel.pendingInvite']` — sessão, não `localStorage`, para não sobreviver ao fechamento da aba num computador compartilhado. É gravado ao ler `#convite=` ou ao digitar/colar, e apagado em `joined`, em `not_found`/`used`/`expired` confirmados, e em _Trocar de conta_.

### O portão

`AuthGate` decide a tela pela tupla `(auth, stage, pendingInvite, fluxo local)`:

| Estado | Tela |
| --- | --- |
| `signed_out`, com código pendente | Login da Fase 1 com cabeçalho _"Entre pra aceitar o convite"_ |
| `needs_profile` ou `needs_couple`, com código | Convite (preview via `lookup_invite`) → Seu perfil, se faltar → `accept_invite` → Confirmar → Tudo pronto |
| `needs_profile` ou `needs_couple`, sem código | `Escolha` → _Criar_: Meu perfil (se faltar) → Sobre a gente → Convidar → Enviado · _Tenho um código_: Digitar → Convite → … |
| `awaiting_partner` | Aguardando (R10), que também é o passo 3/4 do assistente quando se chega por ele |
| `ready` | App — exceto logo após `joined`, quando Confirmar e Tudo pronto vêm antes |

O contador _"Passo N de M"_ conta só os passos que vão aparecer: quem já tem perfil vê "Passo 1 de 3". O assistente é estado local: recarregar no meio retoma pelo estágio do banco, não pela tela — quem recarrega depois de `create_couple` cai em Aguardando, e Aguardando sem convite aberto mostra o formulário de convidar. Confirmar e Tudo pronto **não** são retomáveis: recarregar depois de `joined` leva direto ao app, e a data continua editável na Fase 3.

`awaiting_partner` e `ready` releem o estágio em `visibilitychange`/`focus` — é assim que Aguardando percebe que a outra pessoa entrou. Sem realtime (seção 14).

Todas as telas novas moram em `src/onboarding/`, com `onboarding.css` (arquivo único por feature), e reusam `AuthShell` da Fase 1.

### Compatibilidade

- `couples.invite_code` sai. Quebra `supabase/tests/harness.ts` (que limpa casais por código) — o harness passa a limpar por `id`. `npm run types:gen` regenera `database.types.ts`.
- `couple_members_profile_idx` sai, substituído pelo índice do `unique`.
- A policy `cities_insert_authenticated` sai. Nada no código de hoje insere em `cities`.
- `loadAccountStage` ganha um estágio. Todo `switch` sobre `AccountStage` falha no typecheck até tratar `awaiting_partner` — é o que se quer.
- **A tela de domínio de `ready` continua sendo a timeline antiga sobre `localStorage`**, com os dados de Gabriel e Lana. Um casal estranho que chegue a `ready` antes da Fase 5 vê a história de outro casal. Não é defeito desta fase, mas define quando o produto pode ser mostrado a alguém de fora: **depois da Fase 5** (seção 12).

## 6. Identidade & nomes

**Pessoa:** `auth.users.id` = `profiles.id`, como na Fase 1. **Convite:** `couple_invites.id` é a chave interna; `code` é o identificador **público** e portador, único para sempre (I6), e nunca reaproveitado. **Idempotência do envio:** `<invite_id>:<send_count>` — duas chamadas da mesma tentativa não mandam dois e-mails; um reenvio legítimo tem `send_count` novo.

**Formato do código.** 6 caracteres de Crockford base32, gravados sem hífen e em maiúsculas; mostrados como `7K4-Q92`. O design diz "6 dígitos" e mostra letras; a copy passa a dizer **"código de 6 caracteres"**. Crockford porque o design já nomeou o problema — _"Letras O e número 0 costumam confundir"_ — e o alfabeto elimina a confusão em vez de explicá-la: `I`, `L`, `O` e `U` não existem, e a normalização aceita `O→0` e `I/L→1`. A frase do estado de código inválido sobre O e 0 sai, porque deixa de ser verdade.

**Dois campos de nome — muda a decisão da Fase 0.** A Fase 0 escolheu um campo só porque um segundo "existiria para uma tela que não existe". A tela agora existe: o perfil pede _Nome_ e _Como te chamam_. Os dois têm uso distinto:

- `display_name` ("Rafa") — **toda a interface**: saudações, _"Rafa te convidou"_, assunto do e-mail.
- `full_name` ("Rafael Souza") — só onde a identificação é **defesa**: _"Espaço criado por Rafael Souza"_ no preview e _"Você recebeu este e-mail porque Rafael Souza (rafa@…) te convidou"_ no rodapé. Um estranho recebendo um convite de "Rafa" não sabe quem é Rafa.

**Cor.** `profiles.color` nasce com a cor do slot 1 (`#3b82f6`, a de `timeline/people.ts`); `accept_invite` dá ao slot 2 `#ec4899` se as duas coincidirem (I10). Escolher a própria cor é da Fase 3.

**Copy sem gênero (R13).** O design foi desenhado para Gabriel e Lana; para um casal qualquer, "ela", "ele", "o Gabi" e "Nome dela" erram metade das vezes. As substituições, todas com `display_name` sem artigo:

| Design | Produto |
| --- | --- |
| Falta só ela. / Pode ir entrando, ela chega depois. | Falta só seu amor. / Pode ir entrando, seu amor chega depois. |
| Nome dela (opcional) | Nome de quem você vai convidar (opcional) |
| O código de 6 dígitos vai junto, pra ela nem precisar digitar. | O código vai junto, pra ninguém precisar digitar. |
| ele confirma esses dados quando entrar | seu amor confirma esses dados ao entrar |
| O Gabriel te convidou… / O Gabi te passou o código. | {display_name} te convidou… / {display_name} te passou o código. |
| Confere se o Gabi acertou a data. / O Gabriel preencheu isso… ele recebe um aviso. | Confere se {display_name} acertou a data. / {display_name} preencheu isso. Se algo estiver diferente, é só editar. |
| Não é ele? | Não é essa pessoa? |
| Aguardando a Lana entrar | Aguardando {invitee_name ?? 'seu amor'} entrar |
| Peça um novo — ele recebe o pedido na hora. [Pedir novo convite] | Peça um novo a {display_name}. (sem botão — seção 14) |
| [Falar com o Gabriel] | (sai — seção 14) |
| Lá fora são 960 km | Lá fora são {distanceKm} km · mesma cidade: "Vocês estão na mesma cidade — melhor ainda." |

Nome do casal ausente vira _"o espaço de vocês"_.

## 7. Comportamento em falha

**E-mail que não sai.** O convite já existe quando o envio começa, então falha de envio **nunca** perde o convite: a tela mostra o código, diz que o e-mail não saiu, e oferece _Tentar de novo_ (que conta como tentativa). `last_sent_at` só é gravado depois de o transporte aceitar, e é ele — não `send_count` — que a tela Aguardando usa para dizer _"enviado há 2 min"_. Se `mark_invite_sent` falhar depois de o Resend aceitar, a pessoa recebe o e-mail e a tela diz que ele não saiu; tentar de novo manda um segundo e-mail, com `send_count` novo. É o lado seguro do erro: dizer "enviado" sem ter enviado é o bug que o [ADR 0004](../Decisions/0004-login-com-senha-e-oauth.md) existiu para evitar.

**Aceito pelo provedor não é entregue.** Bounce, spam e caixa cheia ficam invisíveis. A mitigação é de desenho: o código está **sempre** na tela de quem convidou, com _Copiar_ e _WhatsApp_, então o e-mail é uma conveniência e não um ponto único de falha.

**Resend fora do ar ou com 429.** Vira `send_failed` com a causa. O limite nosso (seção 8) é mais apertado que o deles, então 429 do Resend significa cota da conta estourada, não abuso de um usuário.

**Duas abas criando o espaço.** A segunda `create_couple` bate no `unique (profile_id)` e devolve `already_member`; a tela relê o estágio e segue em Aguardando. Nenhum casal órfão (I1).

**Dois aceites do mesmo convite ao mesmo tempo.** O `FOR UPDATE` serializa; o segundo encontra `accepted_at` preenchido e devolve `used`. Se por algum caminho os dois chegassem ao `insert`, `couple_members_slot_unique` recusaria o segundo, e a função mapeia a violação para `used` (I2).

**Aceitar com a conta errada — o risco do brainstorm.** Duda aceita com uma conta Google cujo e-mail não é o do convite. **Funciona**, porque o código é portador (I4): ela entra no espaço com essa conta. O que pode dar errado é ela ter **duas** contas e depois entrar pela outra — que cai em `needs_profile` e vê a `Escolha`. Se nessa conta ela criar um espaço novo, fica com um espaço vazio e sozinha nele. A defesa não é impedir (não há como saber que duas contas são a mesma pessoa), é **não deixar o erro ser silencioso**: o link do convite, aberto na conta que já está num casal, responde `already_member` com o nome do espaço em que ela está (_"Você já está no espaço Rafa & Duda"_) e _Trocar de conta_. Sair de um espaço para entrar em outro é da Fase 3 (seção 14).

**Quem criou tenta aceitar o próprio código.** `own_couple`, com a copy _"Esse é o código do seu espaço — mande pra seu amor."_

**Código expirado na mão de quem foi convidado.** A tela diz quando expirou e de quem pedir outro. Quem convidou vê o convite como expirado em Aguardando, com _Renovar_ — mesmo código, mais 7 dias, e um novo envio.

**Trocar e-mail com o e-mail anterior errado.** O convite antigo é revogado e o código antigo passa a responder `not_found`. Um estranho que tenha recebido o e-mail errado não entra, e não descobre que havia um convite ali.

**`lookup` válido e `accept` falha.** Entre a pessoa ver o preview e tocar em _Aceitar_, o convite pode expirar ou ser usado. `accept_invite` repete todas as checagens e devolve o estado atual; a tela troca para o erro correspondente. O preview nunca é tratado como autorização.

**Foto que falha no upload.** A foto é opcional: falhou, o perfil é criado sem ela e a tela avisa. Objeto enviado sem `profiles` gravado fica órfão no bucket — aceitável e raro; limpeza é da Fase 3.

**Cidade que não aparece na busca.** Com 5.570 municípios, o caso real é grafia ("Sao Jose" funciona pelo `unaccent`; "SJC" não). A lista vazia diz _"Não achamos essa cidade. Por enquanto só cidades do Brasil."_ — o recorte da seção 14, dito na tela.

**Rede caída no meio do assistente.** Cada passo é uma chamada que devolve `error` distinto de `ok`; a tela mostra falha e mantém o que foi digitado. Nada é gravado em `localStorage`.

**Relógio do cliente errado.** Nenhuma decisão de validade usa o relógio do cliente: `expires_at` e "hoje" para `started_on` são do servidor. O cliente só formata.

## 8. Limites & orçamentos

| Limite | Valor | Onde morde |
| --- | --- | --- |
| Falhas de código por pessoa | **10 por hora** (`not_found`) | `lookup_invite` e `accept_invite` (I8) |
| Cadastro por IP (Fase 1) | 30 / 5 min | Multiplica o limite acima: 30 contas × 10 = 300 tentativas / 5 min por IP, contra 1,07 × 10⁹ códigos. Com 1.000 convites abertos, a chance de acerto por janela é ~3 × 10⁻⁴ |
| Envios por casal | **10 por 24 h**, e **60 s** entre envios do mesmo convite | `begin_invite_send`. É o teto contra usar o app de relay de spam |
| Resend, plano grátis | 100 / dia, 3.000 / mês | Conta inteira. Com 10 por casal, 10 casais ativos esgotam o dia |
| Validade do convite | 7 dias | `INVITE_TTL_DAYS`, e `expires_at` no servidor |
| Foto | entrada até 10 MB; gravada ≤ 1 MB, 512×512 WebP | Cliente reduz; o bucket recusa acima de 1 MB |
| Busca de cidade | 8 resultados; ≥ 2 caracteres; debounce 200 ms | 5.570 linhas: `unaccent` com varredura sequencial fica abaixo de 20 ms, sem índice |
| Migration das cidades | ~5.570 linhas, ~450 KB de SQL | `db:reset` fica alguns segundos mais lento |
| `loadAccountStage` | continua em 2 viagens, < 500 ms local | Orçamento da Fase 1, mantido |

## 9. Segurança & permissões

**O código é o único segredo, e esta fase define como ele é protegido.** Portador (quem tem entra), gerado com `gen_random_bytes`, 30 bits de espaço, resolução só com sessão (I7) e com limite de falhas por pessoa (I8). Resolver sem sessão não entra porque não haveria contra quem contar tentativas — seria uma porta de força bruta aberta para a internet. **Consequência para o design:** o frame C2·1 mostra o convite com nomes **antes** do login; no produto, o login vem primeiro e o preview depois.

**Por que não existe a busca por e-mail (R14).** O frame C2 prevê "e-mail com convite pendente" e a `Escolha` prevê _"Não achamos convite pendente pra <e-mail>"_. Com `enable_confirmations` desligado (Fase 1), o e-mail da sessão é **afirmado, não provado**: qualquer um se cadastra com `duda@exemplo.com` sem ter a caixa. Uma busca por e-mail entregaria o convite — ou só a existência dele e o nome de quem convidou — a quem se cadastrasse primeiro com o endereço alheio. A posse da caixa só se prova pelo **link**, e é por ele que o convite chega. A Fase 1 já tinha deixado isso como restrição que a Fase 2 não pode afrouxar; esta spec cumpre.

**Revogado responde como inexistente.** Quem recebeu um convite por engano (trocar e-mail) não deve saber que ele existiu. Expirado e usado respondem com detalhe porque quem tem o código legítimo precisa saber o que fazer.

**O app manda e-mail para endereço arbitrário com texto do usuário.** É vetor de spam e de phishing com a nossa marca. Mitigações: limite por casal (seção 8); todo campo do usuário (nomes, nome do casal) escapado no HTML e limitado em tamanho pelo `CHECK`; nenhum link no corpo além do nosso `APP_URL`; o rodapé identifica o remetente real pelo nome completo e e-mail.

**A edge function não usa `service_role`.** Ela repassa o JWT de quem chamou, e a autorização acontece em `begin_invite_send`, sob RLS — o mesmo princípio do [ADR 0001](../Decisions/0001-supabase-com-rls-por-casal.md). `RESEND_API_KEY` só existe como segredo da função, nunca no bundle do cliente.

**Funções `security definer` em schema exposto.** Sete funções novas em `public` são endpoints por desenho, e o advisor vai listá-las (`authenticated_security_definer_function_executable`). Isso é esperado e fica registrado no [ADR 0008](../Decisions/0008-convite-portador-e-um-casal-por-pessoa.md) com a lista nominal. O critério A20 prova que **nenhuma outra** aparece e que `anon` não executa nenhuma delas.

**Escrita fechada.** `couple_members` continua sem policy de escrita (I3); `couple_invites` só tem `select`; `cities` perde o `insert` (I9) — com cidades vindas do IBGE, deixar qualquer autenticado inserir em tabela global seria abrir espaço para lixo compartilhado entre casais, sem ganho.

**Fotos.** Bucket privado; ninguém fora do casal lê a foto, nem sabendo o caminho. A pasta é o `auth.uid()`, então ninguém grava na pasta de outro.

**O fragmento, não a query.** `#convite=` não vai ao servidor em nenhuma requisição, não entra em log de acesso e não vaza em `Referer`. O app o apaga da barra de endereços assim que o lê.

## 10. Critérios de aceite (testáveis)

| # | Critério (Dado/Quando/Então) | Como provar |
| --- | --- | --- |
| A1 | Dado um usuário sem perfil, quando insere o próprio perfil com cidade do IBGE, então a linha existe; e quando tenta inserir com `id` de outro, é recusado | `supabase/tests/onboarding.test.ts` |
| A2 | Dados `full_name` de 81 e `display_name` de 31 caracteres, quando se insere, então o `CHECK` recusa; com 80 e 30, aceita (I11) | `supabase/tests/onboarding.test.ts`, lendo os limites de `src/domain/onboarding.ts` |
| A3 | Dado um perfil sem casal, quando chama `create_couple` duas vezes **em paralelo**, então existe exatamente um casal e um `created` + um `already_member` (I1) | `supabase/tests/onboarding.test.ts` |
| A4 | Dado `started_on` amanhã, quando `create_couple`, então `invalid` com `field: 'started_on'` e nenhum casal criado | `supabase/tests/onboarding.test.ts` |
| A5 | Dado um casal com um membro, quando `create_invite`, então o código casa `^[0-9A-HJKMNP-TV-Z]{6}$` e `expires_at` fica a 7 dias; e um segundo `create_invite` revoga o primeiro (I5) | `supabase/tests/onboarding.test.ts` |
| A6 | Dado um convite pendente, quando outro usuário chama `lookup_invite` com o código em minúsculas, com hífen e com `O` no lugar de `0`, então `valid` com nome do casal e nome completo de quem convidou | `supabase/tests/onboarding.test.ts` + `src/domain/onboarding.test.ts` para a normalização |
| A7 | Dados um código inexistente, um revogado, um expirado (via `admin`) e um aceito, quando `lookup_invite`, então `not_found`, `not_found`, `expired`, `used` | `supabase/tests/onboarding.test.ts` |
| A8 | Dadas 10 falhas na última hora, quando a 11ª chamada vem com um código **válido**, então `rate_limited` (I8) | `supabase/tests/onboarding.test.ts` |
| A9 | Dado um cliente `anon`, quando chama cada função desta fase, então todas são recusadas por permissão (I7) | `supabase/tests/onboarding.test.ts` |
| A10 | Dado um convite pendente, quando dois usuários chamam `accept_invite` **em paralelo**, então um `joined` e um `used`, e o casal tem dois membros com cores diferentes (I2, I10) | `supabase/tests/onboarding.test.ts` |
| A11 | Dado um usuário já em casal, quando `accept_invite` de outro casal, então `already_member` e nada muda; e quem criou, com o próprio código, recebe `own_couple` | `supabase/tests/onboarding.test.ts` |
| A12 | Dado um membro autenticado, quando tenta `insert` direto em `couple_members` ou em `couple_invites`, então é recusado (I3) | `supabase/tests/onboarding.test.ts` |
| A13 | Dado um usuário de fora, quando lê `couple_invites` de outro casal, então zero linhas | `supabase/tests/rls.test.ts`, no padrão dos dois casais |
| A14 | Dado um usuário autenticado, quando insere em `cities`, então é recusado (I9); e `search_cities('sao jose dos')` devolve São José dos Campos com o UUID fixo da Fase 0 | `supabase/tests/onboarding.test.ts` |
| A15 | Dada a migration das cidades, quando se conta `cities where country_code = 'BR'`, então 5.571 (5.570 na escrita da spec; Boa Esperança do Norte/MT, criado em 2023, está nas duas fontes — ledger T3), e todo `ibge_code` é único e não nulo | `supabase/tests/onboarding.test.ts` |
| A16 | Dados dois membros de um casal e um de fora, quando cada um tenta ler a foto do outro, então o parceiro lê e o de fora não; e ninguém grava na pasta de outro | `supabase/tests/storage.test.ts` |
| A17 | Dado um convite pendente e o transporte `mailpit`, quando um membro chama `send-invite`, então o Mailpit tem **uma** mensagem para o e-mail do convite contendo o código e `#convite=<código>`, e `last_sent_at` está preenchido | `supabase/tests/send-invite.test.ts`, contra a edge function local e a API do Mailpit |
| A18 | Dado um usuário de fora do casal, quando chama `send-invite` com o `invite_id`, então `not_member` e nenhuma mensagem no Mailpit; e duas chamadas em menos de 60 s dão `rate_limited` na segunda | `supabase/tests/send-invite.test.ts` |
| A19 | Dado um transporte que falha (`MAILPIT_URL` para porta morta), quando `send-invite`, então `send_failed`, `last_sent_at` continua nulo, e o convite continua `pending` | `supabase/tests/send-invite.test.ts` |
| A20 | Dado o schema, quando se lista `security definer` executável por `authenticated` em `public`, então exatamente as sete funções da seção 5; e nenhuma executável por `anon` | `supabase/tests/onboarding.test.ts`, consultando `pg_proc` e `has_function_privilege` |
| A21 | Dado `needs_couple`, quando a `Escolha` renderiza, então os dois botões estão habilitados, não há texto "Chega na próxima etapa", e não há afirmação sobre convite pendente (R1, R14) | `src/auth/Escolha.test.tsx` |
| A22 | Dado o assistente de criação, quando a pessoa preenche perfil, casal e convite com dados falsos injetados, então as chamadas saem na ordem perfil → `create_couple` → `create_invite` → `send-invite`, e a tela final mostra o código formatado | `src/onboarding/CriarEspaco.test.tsx` |
| A23 | Dado `send-invite` devolvendo `send_failed`, quando a tela renderiza, então o texto **não contém** "enviado" e mostra o código e _Tentar de novo_ (R5) | `src/onboarding/CriarEspaco.test.tsx` |
| A24 | Dada a URL `/#convite=7k4-q92` e sessão ausente, quando o app carrega, então o código normalizado está em `sessionStorage`, a URL não tem mais fragmento, e o Login mostra _"Entre pra aceitar o convite"_ (R6) | `src/onboarding/pendingInvite.test.tsx` |
| A25 | Para cada resposta de `lookup_invite`/`accept_invite` (`not_found`, `expired`, `used`, `own_couple`, `already_member`, `rate_limited`), quando a tela renderiza, então aparece a copy própria, sem troca de gênero (R9, R13) | `src/onboarding/Convite.test.tsx`, uma asserção por estado |
| A26 | Dado `awaiting_partner` com convite pendente, expirado e sem convite, quando Aguardando renderiza, então mostra respectivamente _Reenviar/Trocar e-mail_, _Renovar_, e o formulário de convidar (R10) | `src/onboarding/Aguardando.test.tsx` |
| A27 | Dado `awaiting_partner`, quando a janela volta ao foco e o estágio agora é `ready`, então a tela troca para o app sem recarregar | `src/onboarding/Aguardando.test.tsx`, dirigindo `loadStage` |
| A28 | Dado o texto colado `"entra aí: 7K4-Q92 ❤️"`, quando _Colar do WhatsApp_, então os campos recebem `7K4Q92` (R7) | `src/domain/onboarding.test.ts` + teste de interface do campo |
| A29 | Dado o domínio verificado no Resend, quando Gabriel cria um espaço de teste e convida **um endereço que não é o dele**, então o e-mail chega, o link abre o app com o código e o aceite funciona | **manual** — ID da mensagem do Resend e captura da caixa de entrada coladas no ledger |
| A30 | Dado o convite aberto no celular, quando a pessoa entra **pelo Google** a partir do link, então volta à mesma aba com o código preservado e chega ao preview | **manual** — exige OAuth real; passos no ledger |
| A31 | Dado o código da fase, quando se rodam `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:db` e `npm run build`, então todos passam | saída dos cinco comandos no ledger |

## 11. Abordagem de teste

**O que é banco se prova contra a stack local.** Toda regra de convite mora em funções SQL justamente para ser provada ali, com usuários de verdade e sem mock: estados, corrida, limite de tentativas, permissão de `anon`. As duas corridas (A3, A10) precisam de chamadas **realmente paralelas** (`Promise.all` de dois clientes) — em série elas passam sempre e não provam nada.

**O e-mail se prova pelo Mailpit.** A edge function roda na stack local com o transporte `mailpit`, e o teste lê a mensagem pela API de busca do Mailpit. Isso prova o que é nosso — autorização, contagem, idempotência, conteúdo, link — e deixa para o manual só o que é do Resend: que um e-mail real chega num endereço real (A29). O teste limpa o Mailpit por destinatário, não por tudo, porque ele é compartilhado com o login da Fase 1.

**Interface em jsdom** ([ADR 0005](../Decisions/0005-interface-se-prova-em-jsdom.md)), com as funções de dados injetadas por parâmetro, como `AuthGate` já recebe `loadStage`. As asserções são sobre o que a pessoa lê: "não contém 'enviado'" (A23) é o critério que pegaria a mentira central que esta fase existe para evitar.

**Paridade de limites (A2)** importa o `LIMITS` do TypeScript dentro do teste de banco. Se alguém muda um lado só, o teste quebra — é a única forma de "os dois leem o mesmo arquivo" sem gerar SQL a partir de TS.

**Manual, com motivo:** A29 (Resend real, domínio real, caixa de terceiro) e A30 (OAuth real). Regressão visual e responsividade seguem fora do jsdom, como na Fase 1.

## 12. Riscos & mitigações

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Casal estranho chega a `ready` antes da Fase 5 | Vê a timeline sobre `localStorage`, com a história de Gabriel e Lana | Registrado na Compatibilidade: o produto não é mostrado a ninguém de fora antes da Fase 5. Os critérios desta fase param em `ready` |
| O domínio do Resend não estar de fato verificado | O convite só chega no e-mail do Gabriel, e o teste que o Gabriel faz em si mesmo passa | A29 exige **endereço que não é o dele**. O backlog de ADRs ainda diz "pendente" e é corrigido no ADR 0006 com a evidência |
| Pessoa com duas contas cria um segundo espaço vazio | Fica sozinha num espaço, sem erro | `already_member` com nome do espaço e _Trocar de conta_ (seção 7). Sair de espaço é da Fase 3 |
| Força bruta de código | Estranho entra num casal | 30 bits, só com sessão, 10 falhas/h por pessoa, cadastro limitado por IP (seção 8) |
| App usado como relay de spam | Reputação do domínio, conta do Resend suspensa | 10 envios/casal/dia, 60 s entre envios, campos escapados e limitados |
| Dataset de coordenadas de terceiro errado ou fora do ar | Cidade no lugar errado; seed não regenera | SHA-256 no cabeçalho da migration; a migration gerada é versionada, então regenerar é opcional. A derivação compara identidade, não coordenada — erro de coordenada só afeta a distância |
| Mudança de `display_name` único para dois campos confundir a Fase 3 | Tela de perfil com um campo só | Seção 6 registra o uso de cada um; a Fase 3 herda |
| `awaiting_partner` quebrar código que assume três estágios | Tela errada para quem está sozinho | Typecheck falha em todo `switch` não exaustivo — é a proteção |

## 13. Open questions (bloqueiam a implementação)

**Bloqueantes: nenhuma.** As cinco decisões abaixo mudam o design ou uma decisão anterior e foram **aprovadas em 2026-09-26** — não se re-discutem nesta fase:

1. **Login antes do preview do convite** (seção 9). O frame C2·1 mostra nomes antes do login; resolver código sem sessão abriria força bruta anônima.
2. **Nenhuma busca de convite por e-mail** (seção 9, R14). Sai o "e-mail com convite pendente" do C2 e a linha da `Escolha`, porque o e-mail da sessão não é verificado.
3. **Dois campos de nome** (seção 6), revertendo a decisão da Fase 0.
4. **Copy sem gênero** (tabela da seção 6), e "código de 6 caracteres" no lugar de "6 dígitos".
5. **Sem avisos ao outro** — somem "ele recebe um aviso", _Pedir novo convite_ e _Falar com o Gabriel_ (acordado no brainstorm; listado aqui porque muda três frames).

**Pendências externas — não bloqueiam implementar, bloqueiam partes de "pronto":**

6. **Resend:** `RESEND_API_KEY` e `INVITE_FROM` como segredos da função no projeto remoto. Você disse que o domínio está pronto; A29 é a prova.
7. **Stack local de pé**, com o edge runtime e o Mailpit (já rodando em 2026-09-26: `supabase_edge_runtime_lanabiel`, `supabase_inbucket_lanabiel` em `:55324`).

**Pendência de desenho — ajuste seu no Pencil:** os cinco pontos acima, o fluxo C2 com o login antes do convite, e a tela Aguardando como tela própria (o design a tem como banner na Home).

## 14. Fora de escopo

**Casais fora do Brasil.** `cities` recebe só municípios do IBGE. A tela diz isso quando a busca volta vazia. Cidade estrangeira chega com as Viagens, e com ela o geocoding — `ibge_code` nulo já está previsto no schema.

**Avisos ao outro.** Edição da data avisando quem criou, _Pedir novo convite_, _Falar com o Gabriel_, e _"A Lana entrou no espaço de vocês"_ na Home. Vão juntos com o agendador do aniversário, porque são o mesmo problema: um sistema de notificação.

**O primeiro período na Home.** _"Onde vocês estão hoje?"_ cria estadias — é a Fase 5.

**A Home desenhada** e o banner de espera nela. Aguardando é tela própria e mínima até a Home existir.

**Sair de um espaço, apagar o espaço, trocar de casal.** É a "Zona sensível" das Configurações (Fase 3). Até lá, quem está num casal está nele.

**Realtime.** Aguardando percebe a entrada da outra pessoa ao voltar o foco, não em tempo real.

**Confirmação de e-mail no cadastro** e **_Esqueci minha senha_.** Com o Resend existindo, os dois ficam possíveis (SMTP customizado no Auth). Mudam o fluxo da Fase 1 e merecem ADR que supersede parte do 0004 — não entram de carona aqui.

**Escolher a própria cor.** Fase 3.

**Limpeza de fotos órfãs e de contadores antigos** em `private.*`. Os contadores só olham a última hora/dia; as linhas antigas não mudam resultado, só ocupam espaço. Limpeza agendada vai com o agendador.

**Biblioteca de rotas.** O assistente é estado local dentro do portão, como a Fase 1 decidiu; a conversa segue na Fase 7.

---

## Plano (Gate 2)

> Verticais, ordenadas por dependência. Cada uma cita os critérios da seção 10 que precisa deixar prováveis. Toda tarefa que toca `supabase/migrations/` termina com `npm run db:reset` e `npm run types:gen` limpos.

1. [x] **Contrato de domínio.** `src/domain/onboarding.ts` puro: `LIMITS`, `INVITE_TTL_DAYS`, `CODE_ALPHABET`, `normalizeInviteCode`, `extractInviteCode`, `formatInviteCode`, `togetherFor`, `distanceKm`. Testes em `src/domain/onboarding.test.ts`. → A6 (normalização), A28 (extração)
2. [x] **Schema de perfil, casal e convite.** Migrations 1–3 da seção 5 (profiles + insert próprio; `unique (profile_id)`; `couple_invites`, contadores em `private`, as sete RPCs). `couples.invite_code` sai e `supabase/tests/harness.ts` passa a limpar por `id`. Testes em `supabase/tests/onboarding.test.ts` e o caso de fora em `rls.test.ts`. → A1–A13, A20
3. [x] **Cidades do IBGE.** `scripts/gen-cities-seed.ts`, a migration 4 gerada, `search_cities`, a policy de insert removida. → A14, A15
4. [x] **Bucket de fotos.** Migration 5 (bucket `avatars` + policies em `storage.objects`). Teste em `supabase/tests/storage.test.ts`. → A16
5. [x] **Edge function `send-invite`.** `supabase/functions/send-invite/` com os dois transportes e o e-mail do frame `YinSr`; segredos locais apontando para o Mailpit; `verify_jwt = true`. Teste em `supabase/tests/send-invite.test.ts`. → A17–A19
6. [x] **Fronteira de dados.** `src/data/profile.ts`, `couple.ts`, `invites.ts`, `cities.ts`, `avatar.ts` (redução para 512×512 WebP + upload + URL assinada), cada RPC como união discriminada + `error`; `account.ts` com `awaiting_partner` em duas viagens; `auth.test.ts` estendido para o estágio novo.
7. [x] **Código pendente e portão.** `src/onboarding/pendingInvite.ts` (fragmento → `sessionStorage` → limpa URL), `AuthGate` roteando pela tabela da seção 5, Login com cabeçalho de convite. → A24
8. [x] **Criar o espaço.** `Escolha` habilitada; assistente Meu perfil → Sobre a gente → Convidar → Enviado, com busca de cidade e foto; `onboarding.css`. → A21, A22, A23
9. [x] **Entrar num espaço.** Digitar/colar código, Convite (preview), os seis estados de erro, Seu perfil quando falta, Confirmar e Tudo pronto. → A25, A28 (interface)
10. [x] **Aguardando.** Convidar/pendente/expirado, Reenviar, Trocar e-mail, Renovar, _Continuar pro app_, releitura do estágio no foco. → A26, A27
11. [ ] **Fechar.** A31 (typecheck, lint, test, test:db, build), skill `verify`, `../System/project_architecture.md` atualizado, âncoras `// ADR:` nos arquivos principais, roteiro manual de A29/A30 no ledger, esta spec para 🟢 quando A29/A30 forem feitos.

---

## Related

- Research: N/A — ver cabeçalho
- ADRs desta fase: [0006](../Decisions/0006-email-transacional-por-resend-em-edge-function.md) · [0007](../Decisions/0007-cidades-brasileiras-por-seed-do-ibge.md) · [0008](../Decisions/0008-convite-portador-e-um-casal-por-pessoa.md) · [0009](../Decisions/0009-fotos-em-bucket-privado-por-casal.md)
- ADRs que esta fase não pode violar: [0001](../Decisions/0001-supabase-com-rls-por-casal.md) · [0002](../Decisions/0002-estadia-por-pessoa-estado-derivado.md) · [0004](../Decisions/0004-login-com-senha-e-oauth.md) · [0005](../Decisions/0005-interface-se-prova-em-jsdom.md)
- Fase anterior: [`fase-1-login.md`](./fase-1-login.md) — seção 9 (o e-mail é afirmado, não verificado) é a restrição que molda a seção 9 daqui
- Baseline: `supabase/baseline/README.md` — `join_couple` é o ancestral de `accept_invite`
- Design: frames `rjqp1`, `JYDLA`, `Sa41c`, `S6AT2`, `YinSr`, `pVDY4`, lidos do `.pen` pelo MCP do Pencil em 2026-09-26. Divergências na seção 13
- Ledger da execução: [`fase-2-onboarding.ledger.md`](./fase-2-onboarding.ledger.md)
