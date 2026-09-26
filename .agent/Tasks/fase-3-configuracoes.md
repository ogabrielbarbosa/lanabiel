# Spec — Fase 3: Configurações

> **Gate 1.** Decide _o que_ construir, antes de escrever código.

- **Data:** 2026-09-26
- **Autor:** Gabriel Barbosa (com Claude)
- **Status:** 🟡 Implementada e verificada (2026-09-26) — A24 (manual, duas contas) pendente; contraste do tema como dívida (ledger)
- **Research (Gate 0):** N/A — o problema saiu claro do `/brainstorm` (2026-09-26); a dúvida é de desenho, não de mercado
- **ADR necessário?** Sim, quatro, no mesmo PR: 0011 (preferências em três escopos), 0012 (mídia do casal em bucket por casal), 0013 (casca do app e navegação por caminho, sem biblioteca), 0014 (testes de integração contra o projeto online enquanto o app não abre — supersede em parte o 0010)

---

## 1. What & Why

As Configurações são a **base** do app: é aqui que moram o perfil do casal, o de cada um, as cidades-casa de que a derivação depende, e as preferências que Calendário, Lista, Notificações e Home vão ler. Hoje nada disso é editável — dado errado do onboarding só se corrige no banco — e cada fase futura inventaria as próprias colunas, sem lugar comum.

Depois desta fase, Gabriel e Lana abrem **Configurações** pela barra lateral e usam as **nove abas desenhadas no Pencil**, todas gravando no Supabase. As preferências de telas que ainda não existem (visão padrão do Calendário, categorias visíveis da Lista, canais de aviso, contador na Home) **são gravadas agora e ganham efeito quando a fase dona da tela chegar** — a fase lê, e refina a coluna se precisar (decisão do brainstorm: contrato agora, efeito depois).

A fase também entrega a **casca do app** — a barra de navegação lateral e a navegação por caminho — em que as fases 4–7 vão se encaixar, e o **tema claro**, cujos tokens já existem no `.pen`.

## 2. Como funciona (um cenário real)

Lana abre o app em Marau. O portão chega a `ready`, a casca renderiza a barra lateral e, em `/`, a tela de hoje (a timeline antiga, até a Fase 5). Ela toca a engrenagem: o caminho vira `/configuracoes/perfil-do-casal`. A tela carrega em paralelo o casal (`couples` + membros), `couple_settings`, `profile_settings` dela e as estadias do ano; enquanto isso mostra esqueleto, não valores padrão.

No painel da direita ela lê _"Gabriel & Lana · juntos há 2 anos e 8 dias"_, as duas cidades, _"Distância entre as cidades · 861 km"_ (linha reta, de `cities.lat/lng`) e _"104 dias juntos em 2026"_ — `countStates` sobre as estadias de 1º de janeiro até hoje. _"Itens na lista"_ e _"viagens"_ mostram **—**: as tabelas nascem nas Fases 4 e 6.

Ela vai para **Calendário** e troca a cor de _"Juntos em Marau"_ para `#C3B3F2`. O cliente faz `update couple_settings set color_together_home_2 = '#C3B3F2'` — sem `where couple_id`, a policy decide — e só pinta o novo swatch quando o banco devolve a linha. No aparelho do Gabriel, a cor nova aparece na próxima leitura (sem realtime, seção 14).

Depois vai para **Cidades**, toca _Trocar cidade_ no card dela e escolhe _Passo Fundo, RS_ na busca do IBGE. O diálogo avisa: _"Isso recalcula a história inteira: dias em que vocês estavam juntos em Marau passam a contar como viajando juntos."_ Ela confirma; `profiles.home_city_id` muda; o painel refaz a distância e a contagem de 2026 com a cidade nova — nenhuma estadia foi reescrita (ADR 0002).

## 3. Requisitos (comportamentos observáveis)

**Casca e navegação**

- **R1** — Com `stage: 'ready'` (ou `awaiting_partner` depois de _Continuar pro app_), o app renderiza a barra lateral do frame (`Navbar`, `PajKz`) à direita e o conteúdo da rota. A barra mostra **só destinos que existem**: _Calendário_ (a timeline antiga) e _Configurações_. Home, Lista, Viagens e o botão _Adicionar_ aparecem quando as fases deles chegarem.
- **R2** — Rotas: `/` e `/calendario` → timeline antiga; `/configuracoes` → redireciona (substituindo a entrada do histórico) para `/configuracoes/perfil-do-casal`; `/configuracoes/<aba>` com os nove slugs da seção 6; qualquer outro caminho → `/`. Voltar/avançar do navegador trocam de aba; recarregar numa aba reabre nela.
- **R3** — A tela de Configurações segue o frame: título, menu das nove abas à esquerda (a ativa com `Settings Item Active`, a _Zona sensível_ em vermelho), a aba no centro e o painel _"O espaço de vocês"_ à direita. Acima de cada aba, o rótulo _"Espaço privado · só {nome 1} e {nome 2}"_.
- **R4** — Abaixo de 1100 px de largura o painel da direita some; abaixo de 760 px o menu vira uma faixa horizontal rolável acima da aba e a barra de navegação vai para o rodapé. Nenhuma largura tem rolagem horizontal da página.

**Painel "O espaço de vocês"** (igual em todas as abas)

- **R5** — Mostra: data de hoje por extenso (_"Sexta, 25 de setembro"_); nome do casal; _"juntos há …"_ (`togetherFor`); as duas cidades-casa; distância em linha reta (`distanceKm`, inteiro, separador de milhar); _Resumo rápido_ com _dias juntos em {ano}_ calculado, e **—** em _itens na lista_ e _viagens_; _Sobre o app_ com a versão (`package.json`) e o build (SHA curto do commit, injetado no build); _Enviar feedback_ como `mailto:` para `VITE_FEEDBACK_EMAIL` — linha ausente se a variável não existir. _Central de ajuda_ não aparece (não há destino).

**Perfil do casal** (`MzQxz`)

- **R6** — Cartão de capa: avatares dos dois (ou a foto do casal, se existir e _Usar foto do casal na capa_ estiver ligado), nome do casal, _"juntos há"_, _"desde {data} · {N} dias"_. _Trocar fotos_ sobe a foto do casal (seção 5, bucket `couple-media`).
- **R7** — Campos: _Nome do casal (opcional)_ (≤ 40, vazio grava `null`) e _Começo do namoro_ (não futuro; o trigger existente recusa). Três toggles: _Lembrar do aniversário de namoro_ (texto: _"Todo dia {dia de started_on}, às 9h, pros dois"_), _Mostrar contador na Home_, _Usar foto do casal na capa_.
- **R8** — Cartões dos dois integrantes: avatar, nome completo, _"Você · criou o espaço"_ / _"Entrou em {joined_at}"_ (slot 1 = criou; "Você" marca a própria pessoa), cidade-casa.

**Meu perfil** (`TXqEo`)

- **R9** — Foto (_Trocar foto_, reaproveitando `data/avatar.ts`), _Nome de exibição_ (≤ 30), _Cidade onde moro_ (mesmo fluxo e aviso de R12), _Sua cor_ entre as 7 da paleta pessoal, com a faixa de exemplo da semana pintando a própria cor e a da outra pessoa. A cor da outra pessoa aparece desabilitada (I4).
- **R10** — Conta: e-mail da sessão, só leitura. **Não existe troca de e-mail** — o botão _Trocar e-mail_ do frame não é renderizado (decisão do produto, seção 13). _Alterar senha_ abre um diálogo com senha nova + confirmação e chama `auth.updateUser({ password })`, com o mínimo de `MIN_PASSWORD` já usado no cadastro; funciona também para quem entrou só com Google (vira a primeira senha). A linha _"Alterada há 3 meses"_ não aparece — o Auth não expõe essa data ao cliente. _Sair desta conta_ chama `signOut` e volta ao Login.

**Cidades** (`dpzT3`)

- **R11** — Os dois cartões de cidade-casa. _Trocar cidade_ **só no próprio**: o da outra pessoa mostra a cidade sem botão (a policy `profiles_update_self` é a regra; ver 13).
- **R12** — _Trocar cidade_ abre a busca (`search_cities`, só Brasil — ADR 0007) e, antes de gravar, o aviso de que a história inteira é recalculada (texto em 2). Confirmado, grava `profiles.home_city_id`.
- **R13** — Cartão de distância: número grande em linha reta. _"De onde vem o número"_ mostra as duas opções do frame; _Em linha reta_ ativa, _Pela estrada (rodoviária)_ **desabilitada** com _"Precisa de um serviço de rotas — fica para depois"_.
- **R14** — _Cidades salvas_: primeiro as duas cidades-casa (marcadas _Casa de {nome}_, sem remover), depois as salvas pelo casal em ordem de inclusão, cada uma com UF/país e coordenadas no formato do frame (`23,18° S · 45,88° O`). _Adicionar cidade_ usa a mesma busca; o menu da linha tem _Remover_. Cidade já salva ou que é casa não é adicionada de novo (a busca a mostra marcada).

**Calendário** (`o1JAVm`)

- **R15** — _Visão padrão_ (Mês | Ano), _Primeiro dia da semana_ (Dom | Seg), _Mostrar dias dos meses vizinhos_, _Mostrar ♥ e 💋 nos dias_, e _Cores das faixas_: quatro estados (_Juntos em {casa do slot 1}_, _Juntos em {casa do slot 2}_, _Viajando juntos_, _Separados_), cada um com o hex e um seletor da paleta de faixas (8 cores, seção 5). _Sem registro_ aparece fixo, _"sem cor"_, sem seletor — é o `unknown` do ADR 0002 e não se pinta.

**Lista** (`MrIGB`)

- **R16** — _Ordenação padrão_ (Recentes | A–Z | Categoria), _Mostrar progresso por categoria_, _Categorias visíveis_ com os 8 chips do ADR 0003 (texto _"{n} de 8 ligadas · as desligadas somem da lista e dos filtros"_; **sem** os contadores por chip até a Fase 4), e _Mostrar sugestão do momento_ com as duas linhas explicativas (juntos → lugares perto; separados → filme ou série), que são texto fixo, não preferência. Não dá para desligar as 8: o último chip ligado fica travado.

**Notificações** (`Z84Ano`)

- **R17** — Matriz de 6 eventos × 3 canais (_No app_, _E-mail_, _Push_), por pessoa. A linha _Aniversário de namoro_ fica esmaecida e não editável enquanto _Lembrar do aniversário_ (R7) estiver desligado, com a legenda _"Desligado em Perfil do casal"_. Abaixo, _Marcar "Avisar {outra pessoa}" por padrão ao salvar evento_. Nada é enviado nesta fase (seção 14).

**Aparência** (`CZ3oK`)

- **R18** — _Tema_ (Escuro | Claro | Do sistema, com as três miniaturas), _Densidade_ (Confortável | Compacta), _Reduzir animações_. Tudo **por aparelho**, em `localStorage`, aplicado na hora e antes do primeiro paint (sem piscar o tema errado). _Do sistema_ acompanha `prefers-color-scheme` ao vivo. Na primeira vez, _Reduzir animações_ começa igual a `prefers-reduced-motion`. O tema vale para a casca e as Configurações. Login e onboarding ficam sempre escuros — o design só os desenha assim, sobre o globo noturno (ruling T9 do ledger); a timeline antiga tem tema próprio (morre na Fase 5).

**Dados e privacidade** (`mV5s2`)

- **R19** — Cartão fixo _"Espaço privado · só {1} e {2}"_ com o texto do frame. _Exportar tudo_ gera no navegador um JSON com tudo que a sessão lê (seção 5, formato) e baixa `lanabiel-{AAAA-MM-DD}.json`; o tamanho aparece depois de gerado, não antes.
- **R20** — _Fotos guardadas_: quantidade de arquivos em `avatars/` dos dois e em `couple-media/{couple_id}/`, com a legenda _"Fotos de perfil e do casal"_ até existirem memórias e viagens. _Espaço usado pelas fotos_: soma dos tamanhos, em GB com uma casa (ou MB abaixo de 0,1 GB), sobre `STORAGE_QUOTA_BYTES` (1 GB, o do plano grátis), com a barra de progresso.
- **R21** — _Sessões ativas_ da **própria** conta: aparelho e navegador lidos do `user_agent`, última atividade relativa, _"este aparelho"_ na sessão atual. _Encerrar_ numa outra sessão a derruba (seção 5); na atual, equivale a _Sair desta conta_. Sem cidade por sessão (seção 13).

**Zona sensível** (`wFxyC`)

- **R22** — _Sair do casal_: texto do frame; o botão abre a confirmação que pede o nome do casal digitado (ou _"{nome 1} & {nome 2}"_ quando o casal não tem nome). Confirmado, a pessoa sai e cai na `Escolha` (`needs_couple`) — a conta continua, e ela pode criar um espaço novo e convidar outra pessoa. Quem fica passa a `awaiting_partner`. Convite aberto do casal é **revogado** na saída: convite é da pessoa convidada, não da vaga (I11).
- **R22a** — **Convite pendente, gerido nas Configurações.** Em _Perfil do casal_, quando o casal tem um integrante só, o cartão da vaga mostra o convite aberto (_"Convite para {nome} · {e-mail} · expira em {data}"_) com _Cancelar convite_ e _Convidar outra pessoa_; sem convite aberto, mostra só _Convidar alguém_. _Cancelar_ pede confirmação e revoga (`cancel_invite`): o código deixa de valer na hora. _Convidar_ reaproveita o formulário e o `create_invite` da Fase 2 (que já revoga o anterior). As Configurações são alcançáveis nesse estado por _Continuar pro app_ na tela Aguardando.
- **R23** — _Apagar o espaço_: os quatro números (dias registrados, itens **—**, viagens **—**, fotos), o campo de confirmação com o nome, _Quer guardar uma cópia antes? Exportar tudo em JSON_ (R19), _Cancelar_ e _Apagar o espaço pra sempre_ — habilitado só com o nome exato. Confirmado, os dois caem na `Escolha` na próxima leitura de estágio.

**Gravação**

- **R24** — Toggle, segmento e cor gravam **no gesto**, sem botão _Salvar_; campo de texto e data gravam ao sair do campo ou com Enter. O controle mostra o valor novo só depois do `ok` do banco (atualização otimista não: o valor na tela é sempre o que está gravado). Falha volta o controle ao valor anterior e mostra a causa (seção 7).

## 4. Invariantes

- **I1** — Toda preferência tem **um** dono e um só lugar: casal → `couple_settings`, pessoa → `profile_settings` (ou `profiles`, para identidade), aparelho → `localStorage`. Nenhuma preferência é gravada em dois escopos, e nenhuma tela lê preferência de casal fora de `couple_settings`.
- **I2** — Os valores padrão moram **no banco** (`default` da coluna). O cliente não tem uma segunda tabela de padrões; linha ausente é erro, não "use o padrão" (o trigger garante que ela existe).
- **I3** — O cliente continua sem filtrar por `couple_id` (ADR 0001). As novas tabelas têm RLS com a mesma expressão em leitura e escrita.
- **I4** — As duas pessoas de um casal têm cores diferentes, cobrado no banco (trigger) e não só na tela.
- **I5** — Cor pessoal ∈ paleta pessoal (7); cor de faixa ∈ paleta de faixas (8). Cobrado por `CHECK`, e as paletas do cliente e do banco são as mesmas listas (paridade testada, como `LIMITS` na Fase 2).
- **I6** — As 8 chaves de categoria (`pais`, `cidade`, `restaurante`, `parque`, `comida`, `experiencia`, `filme`, `serie`) são **o** vocabulário: `hidden_categories` só aceita elas, e a Fase 4 usa as mesmas em `list_items.category`.
- **I7** — Trocar cidade-casa não reescreve estadia nenhuma (ADR 0002).
- **I8** — Sessões: uma pessoa lista e encerra **só as próprias**.
- **I9** — Sair do casal nunca apaga dado do casal; apagar o espaço apaga tudo do casal e **nada** de fora dele (perfis, fotos de perfil e as contas continuam).
- **I10** — Um casal nunca tem dois integrantes no mesmo slot, e depois de sair alguém, a vaga é a que o próximo aceite ocupa.
- **I11** — Um convite vale só para a pessoa a quem foi feito, enquanto o casal que o fez for o mesmo: quando alguém sai, os convites abertos do casal são revogados na mesma transação, e quem ficou convida de novo, explicitamente.

## 5. Contrato & dados

### Contrato compartilhado — `src/domain/settings.ts` (puro)

```ts
export const PERSON_COLORS = ['#7FD8C4','#9CCBF2','#C3B3F2','#F4A3B4','#EDA88A','#F6E3A1','#CBE68E'] as const
export const BAND_COLORS   = [...PERSON_COLORS, '#8E97BD'] as const
export const DEFAULT_COLOR_BY_SLOT = { 1: '#7FD8C4', 2: '#F4A3B4' } as const

export const LIST_CATEGORIES = ['pais','cidade','restaurante','parque','comida','experiencia','filme','serie'] as const
export const NOTIFY_EVENTS   = ['partner_list_item','partner_done','partner_event','anniversary','trip_eve','own_reminders'] as const
export const NOTIFY_CHANNELS = ['app','email','push'] as const

export const SETTINGS_TABS = ['perfil-do-casal','meu-perfil','cidades','calendario','lista',
  'notificacoes','aparencia','dados-e-privacidade','zona-sensivel'] as const

export const STORAGE_QUOTA_BYTES = 1_073_741_824  // plano grátis; mudou o plano, muda aqui

export function coupleLabel(name: string | null, members: { slot: 1|2; displayName: string }[]): string
export function formatCoord(lat: number, lng: number): string        // "23,18° S · 45,88° O"
export function daysTogetherInYear(stays, members, year, today): number // via countStates
export function parseUserAgent(ua: string | null): { device: string; browser: string }
```

Paletas e categorias viram `CHECK` no SQL; `supabase/tests/settings.test.ts` lê as duas e compara (I5, I6).

### Aparelho — `src/app/appearance.ts`

`localStorage['lanabiel:appearance'] = { theme: 'dark'|'light'|'system', density: 'comfortable'|'compact', reduceMotion: boolean }`. Leitura tolera ausência, JSON inválido e `localStorage` que lança (modo privado): cai no padrão (`dark`, `comfortable`, `matchMedia('(prefers-reduced-motion: reduce)')`). Aplicação: `data-theme`, `data-density`, `data-reduce-motion` no `<html>`; um script inline em `index.html` aplica o tema antes do bundle. Os tokens claros saem de `GetVariables()` do `.pen` (tema `mode: light`) para os CSS já existentes (`auth.css`, `onboarding.css`) e o novo `settings.css`.

### Migrations (todas append-only, aplicadas no online por `npm run db:push`)

**1 · `…_settings.sql`** — preferências.

```sql
create table public.couple_settings (
  couple_id              uuid primary key references public.couples (id) on delete cascade,
  remind_anniversary     boolean not null default true,
  show_home_counter      boolean not null default true,
  use_couple_cover       boolean not null default false,
  calendar_default_view  text not null default 'month'  check (calendar_default_view in ('month','year')),
  week_starts_on         text not null default 'sun'    check (week_starts_on in ('sun','mon')),
  show_adjacent_days     boolean not null default true,
  show_day_markers       boolean not null default true,
  color_together_home_1  text not null default '#7FD8C4',   -- "Juntos em {casa do slot 1}"
  color_together_home_2  text not null default '#9CCBF2',   -- "Juntos em {casa do slot 2}"
  color_together_away    text not null default '#F6E3A1',   -- "Viajando juntos"
  color_apart            text not null default '#8E97BD',   -- "Separados"
  list_default_sort      text not null default 'recent' check (list_default_sort in ('recent','az','category')),
  show_category_progress boolean not null default true,
  hidden_categories      text[] not null default '{}'
    check (hidden_categories <@ array['pais','cidade','restaurante','parque','comida','experiencia','filme','serie']
           and cardinality(hidden_categories) < 8),
  show_daily_suggestion  boolean not null default true,
  updated_at             timestamptz not null default now()
  -- + CHECK de cada color_* em BAND_COLORS
);

create table public.profile_settings (
  profile_id  uuid primary key references public.profiles (id) on delete cascade,
  notify_partner_by_default boolean not null default true,
  -- 18 colunas notify_<evento>_<canal>, boolean not null.
  -- Padrão: app = true em todos; email = true só em anniversary e trip_eve; push = true em todos.
  updated_at  timestamptz not null default now()
);
```

Linhas nascem por trigger `after insert` em `couples` e em `profiles` (funções `security definer` em `private`, fora da API); a migration faz o backfill das linhas existentes (hoje zero). `updated_at` por trigger `before update`.

RLS: `couple_settings` → `select`/`update` com `couple_id in (select private.my_couple_ids())`, sem `insert`/`delete` (trigger e cascade). `profile_settings` → `select`/`update` com `profile_id = (select auth.uid())`; a outra pessoa **não** lê (ninguém precisa; o envio futuro lê no servidor).

`profiles`: `color` ganha `default '#7FD8C4'` e `CHECK (color in PERSON_COLORS)`; trigger `profiles_color_distinct` (`before update of color`, invoker) recusa com `23514` / `profiles_color_taken` a cor da outra pessoa do casal.

**2 · `…_couple_saved_cities.sql`**

```sql
create table public.couple_saved_cities (
  couple_id  uuid not null references public.couples (id) on delete cascade,
  city_id    uuid not null references public.cities (id),
  added_by   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (couple_id, city_id)
);
-- índices em city_id e added_by; RLS select/insert/delete por my_couple_ids, sem update.
```

Cidade-casa **não** é linha aqui: é derivada de `profiles.home_city_id` (uma verdade só). O cliente não impede salvar uma casa — a tela esconde; se acontecer, a lista deduplica por `city_id`.

**3 · `…_couple_media.sql`** — ADR 0012.

Bucket privado `couple-media` (`file_size_limit` 5 MB, `image/webp` e `image/jpeg`), caminho `{couple_id}/{tipo}/{uuid}.webp`; nesta fase só `tipo = cover`. Policies em `storage.objects`: `select`/`insert`/`update`/`delete` quando `(storage.foldername(name))[1]` ∈ `my_couple_ids()` — a mesma função que corta as tabelas. `couples.cover_path text` com `CHECK (cover_path is null or cover_path like id::text || '/cover/%')`. A foto é reduzida no cliente como a de perfil (reaproveitar o redutor de `data/avatar.ts`, 1600 px no lado maior).

**4 · `…_leave_and_delete_couple.sql`** — RPCs `security definer`, `set search_path = ''`, `revoke … from public, anon`, `grant … to authenticated`.

- `leave_couple() → jsonb`: sem sessão → `42501`. Não é membro → `{status:'not_member'}`. Apaga a própria linha de `couple_members`; se o casal ficar sem ninguém, apaga o casal (cascade). Senão, **revoga os convites abertos** do casal (`revoked_at = now()`, I11). `→ {status:'left', couple_deleted: bool}`. Estadias, cidades salvas, capa e preferências do casal ficam (I9). As estadias de quem saiu continuam no casal com o `profile_id` dele; a derivação só considera os membros atuais, então esses dias viram `unknown` para quem ficou — honesto, e a Fase 5 decide como desenhá-los.
- `delete_couple() → jsonb`: sem sessão → `42501`; não é membro → `not_member`; senão `delete from couples where id = <o do caller>` (cascade: membros, estadias, convites, preferências, cidades salvas). `→ {status:'deleted'}`. Arquivos do Storage **não** são apagados por SQL (o Storage recusa delete direto em `storage.objects`); o cliente apaga `couple-media/{couple_id}/` **antes** de chamar a RPC (seção 7).
- `cancel_invite() → jsonb`: sem sessão → `42501`; não é membro → `not_member`; revoga o convite aberto do casal do caller. Nenhum aberto → `{status:'none_open'}`, senão `{status:'cancelled'}`. Existe porque `couple_invites` não tem policy de `update` — e não ganha uma: uma policy não restringe quais colunas mudam, e a de `update` deixaria o cliente reescrever `code` ou `accepted_at`.
- `accept_invite` é recriada (`create or replace`) com duas mudanças: o slot é o **livre** (`3 - slot existente`), não `2` fixo; e o ajuste de cor de I4 usa `DEFAULT_COLOR_BY_SLOT` (`#F4A3B4` / `#7FD8C4`), não `#ec4899`/`#3b82f6`. O resto da função fica idêntico.

**5 · `…_my_sessions.sql`** — RPCs `security definer` sobre `auth.sessions`.

- `list_my_sessions() → table(id uuid, user_agent text, created_at timestamptz, last_active_at timestamptz, is_current boolean)` — `where user_id = auth.uid()`, `last_active_at = coalesce(refreshed_at, updated_at, created_at)`, `is_current = id = (auth.jwt() ->> 'session_id')::uuid`, ordenado por atividade. **Sem IP** na resposta (ninguém mostra, então não sai).
- `end_my_session(p_session_id uuid) → jsonb` — `delete from auth.sessions where id = p_session_id and user_id = auth.uid()`; zero linhas → `{status:'not_found'}`, senão `{status:'ended'}`. O refresh token morre na hora; o access token que o outro aparelho já tem vale até expirar (até 1 h, `jwt_expiry` padrão). A tela diz: _"O outro aparelho sai em até 1 hora."_

Com isto, `public` passa de **sete** para **doze** `security definer` (as sete do convite + `leave_couple`, `delete_couple`, `cancel_invite`, `list_my_sessions`, `end_my_session`). A20 da Fase 2 é atualizado para a lista nova, nome por nome.

### Cliente — fronteira de dados

`src/data/settings.ts` (`loadCoupleSettings`, `updateCoupleSettings(patch)`, `loadProfileSettings`, `updateProfileSettings(patch)`), `src/data/savedCities.ts`, `src/data/sessions.ts`, `src/data/couple.ts` ganha `leaveCouple`, `deleteCouple`, `uploadCover`, `src/data/profile.ts` ganha `updateProfile(patch)`, `src/data/export.ts` monta o JSON. Leituras devolvem `DataResult`; escritas, união discriminada com `ok` / `invalid` (CHECK) / `color_taken` / `unauthenticated` / `error`. snake_case não passa da fronteira. `updateX` usa `.update(patch).select().single()` sem `.eq('couple_id')` — no `profile_settings`, `.eq('profile_id', uid)` é identidade, não autorização (mesmo comentário de `account.ts`).

`SettingsApi` injetável (como `OnboardingApi`), para o teste de interface dirigir sem rede.

**Formato do export** (`version: 1`):

```json
{ "version": 1, "exported_at": "…", "couple": {…, "settings": {…}, "saved_cities": [{ "name", "state_code", "country_code", "lat", "lng" }]},
  "members": [{ "slot", "display_name", "full_name", "color", "home_city": {…} }],
  "my_settings": {…}, "stays": [{ "person_slot", "city": {…}, "starts_on", "ends_on" }] }
```

Cidade vai **resolvida** (nome, UF, coordenada), não como UUID: o arquivo precisa fazer sentido fora do banco. Cada fase que criar tabela acrescenta a chave dela e sobe `version`.

### Casca — ADR 0013

`src/app/router.ts`: ~50 linhas sobre `history.pushState`/`popstate`, `useRoute()` e `navigate(path, {replace})`, sem dependência. `src/app/Shell.tsx`: barra lateral + rota. `App.tsx` passa a ser `<AuthGate><Shell/></AuthGate>`. Hospedagem futura precisa reescrever todo caminho para `index.html` (o `vite dev` e o `preview` já fazem).

### Compatibilidade

- `account.ts`: o caso _"slot 2 sem slot 1"_ deixa de ser erro — casal com um integrante é `awaiting_partner` com `slot: 1 | 2`.
- `WaitingScreen` não depende do slot (verificar no build; se depender, ajustar).
- `profiles.color` padrão muda; não há linha em produção (conferido em 2026-09-26: 0 perfis, 0 casais), então não há dado a converter. **Antes do `db:push`, repetir o `select count(*)`** — se houver perfil, a migration converte `#3b82f6 → #7FD8C4` e `#ec4899 → #F4A3B4` antes do `CHECK`.
- `database.types.ts` regenerado; `supabase/tests/harness.ts` limpa as tabelas novas por cascade (nada a mudar além de A20).

## 6. Identidade & nomes

- **Slugs das abas** (URL, e o que outras telas usarão para linkar direto, ex.: a Lista abrindo _Configurações › Lista_): `perfil-do-casal`, `meu-perfil`, `cidades`, `calendario`, `lista`, `notificacoes`, `aparencia`, `dados-e-privacidade`, `zona-sensivel`. Em `SETTINGS_TABS`; mudar depois quebra link.
- **Chaves de categoria** (I6) e **de evento/canal** (`notify_{evento}_{canal}`) são nomes de coluna e de dado: mudar custa migration.
- **Cores de faixa por slot**, não por cidade: `color_together_home_1` é "juntos na casa de quem é slot 1". Trocar a cidade-casa não troca a cor. Se os dois morarem na mesma cidade, vale `home_1`.
- **Caminhos no Storage:** `couple-media/{couple_id}/{tipo}/{uuid}.webp`. O `uuid` novo por upload impede cache servindo a capa velha (mesma regra do ADR 0009). Fases 4 e 6 usam `tipo = memory` e `trip`.
- **Chave do `localStorage`:** `lanabiel:appearance`.

## 7. Comportamento em falha

- **Leitura inicial.** Qualquer `DataResult` que não seja `ok` substitui a aba por _"Não deu pra carregar as configurações: {causa}"_ com _Tentar de novo_; `unauthenticated` volta ao Login (o portão já faz). **Nunca** renderiza valores padrão no lugar de dado não lido — um toggle desligado por falta de leitura e depois gravado viraria verdade.
- **Escrita.** Falha devolve o controle ao valor anterior e mostra a causa junto dele. `color_taken` (a outra pessoa escolheu a mesma cor segundos antes, em outro aparelho) → _"A {nome} acabou de escolher essa cor"_ e relê o casal. `invalid` de nome/data → a mensagem do campo (a tela já valida; chegar aqui é divergência, e a causa aparece).
- **Dois gestos rápidos no mesmo controle.** Cada escrita carrega o valor inteiro do campo (não "inverter"); a última resposta vence e a tela mostra o valor da última escrita confirmada. Controles ficam desabilitados enquanto a escrita deles está em voo.
- **Edição simultânea dos dois** em `couple_settings`: `update` por coluna (`patch`), então mudanças em colunas diferentes não se sobrescrevem. Na mesma coluna, vence a última — aceitável para preferência.
- **Upload da capa.** Sobe o arquivo novo, grava `cover_path`, e só então apaga o antigo. Falhou o upload → nada muda. Falhou o `update` → apaga o arquivo recém-subido (melhor esforço) e mostra a causa. Falhou apagar o antigo → órfão aceito (mesma regra da Fase 2).
- **Apagar o espaço — cascata.** Ordem: (1) listar e apagar `couple-media/{couple_id}/`; (2) `delete_couple()`. Se (1) falha, nada foi apagado e a tela mostra a causa. Se (1) dá certo e (2) falha, o casal perdeu só a capa — a tela diz isso explicitamente (_"A foto do casal foi apagada, mas o espaço não. Tente de novo."_). As fotos de perfil ficam: são das pessoas, não do casal (I9).
- **Sair / apagar com a outra pessoa na tela.** Ela continua vendo a tela até a próxima leitura; a primeira escrita dela volta `error` (zero linhas pela policy) e a aba mostra _"Este espaço mudou — recarregue"_ com botão que relê o estágio.
- **Trocar a própria senha.** `weak_password` e `same_password` do GoTrue viram mensagem nomeada; rede → causa. A sessão atual continua.
- **Encerrar sessão já encerrada** → `not_found` → a lista é relida sem erro visível.
- **Export.** Monta tudo em memória; qualquer leitura não-`ok` aborta e diz qual parte falhou — **não** baixa um arquivo parcial que pareça completo.
- **`localStorage` indisponível.** A aparência funciona na sessão (estado em memória) e a aba diz _"Não dá pra guardar neste navegador"_.
- **Projeto pausado (free tier).** É o caso `error` da leitura inicial; mesma tela de erro.

## 8. Limites & orçamentos

- Leitura inicial da tela: **≤ 5 viagens** em paralelo (casal+membros, `couple_settings`, `profile_settings`, cidades salvas, estadias do ano). As abas não refazem leitura ao trocar; só _Dados e privacidade_ faz as dela (Storage e sessões) ao abrir.
- Estadias do ano: dois usuários, ≤ 366 dias × 2 — `countStates` em memória, sem paginação.
- Capa: ≤ 5 MB no bucket, 1600 px no lado maior depois da redução no cliente.
- Cidades salvas: sem teto no schema; a tela não pagina (uso real: dezenas).
- Export: tudo na memória; hoje < 1 MB. Reavaliar quando a Fase 4/6 entrarem com fotos (o export leva metadados, nunca as imagens).
- Listagem do Storage para R20: `list` com `limit 1000` por pasta; acima disso a contagem mostra _"1000+"_ (não acontece nesta fase).

## 9. Segurança & permissões

- **Casal:** `couple_settings`, `couple_saved_cities`, `couples` (nome, data, capa) e `couple-media` são editáveis pelos dois integrantes, cortados por `private.my_couple_ids()`.
- **Pessoa:** `profiles` e `profile_settings` só pela própria pessoa (`auth.uid()`). A outra pessoa lê o perfil (já era assim), **não** lê `profile_settings`.
- **Sessões:** as RPCs comparam `user_id = auth.uid()` dentro da função; o `security definer` é necessário porque `auth.sessions` não é exposto. A resposta não carrega IP nem token.
- **Sair/apagar:** qualquer integrante pode apagar o espaço inteiro sozinho — é o que o design diz (_"nem você nem a Lana conseguem recuperar"_). A digitação do nome é atrito de interface, cobrado só no cliente; não é controle de segurança, e a spec não finge que é.
- **Doze `security definer` em `public`**, todos com `revoke from public, anon`; os de gatilho novos ficam em `private`.
- **Trocar e-mail não existe** (decisão de produto). O e-mail é o da criação da conta; `auth.users.id` continua sendo a identidade (I5 da Fase 1), então nada no schema depende disso.
- **Senha:** `secure_password_change = false` (config atual) — trocar senha não pede a antiga. Com sessão roubada, isso deixa o atacante trocar a senha. Aceito nesta fase (dois usuários, app fechado); registrar no risco (12).

## 10. Critérios de aceite (testáveis)

| # | Critério (Dado/Quando/Então) | Como provar |
| --- | --- | --- |
| A1 | Paletas, categorias, abas e padrões de cor por slot do cliente são idênticos aos `CHECK`/defaults do SQL | `supabase/tests/settings.test.ts` (lê `pg_constraint`) + `src/domain/settings.test.ts` |
| A2 | `coupleLabel`, `formatCoord` (4 hemisférios), `daysTogetherInYear` (ano parcial, `unknown` não conta), `parseUserAgent` (Chrome/Safari/Edge/Firefox, macOS/iOS/Windows/Android, nulo) | `src/domain/settings.test.ts` |
| A3 | Dado um casal novo e um perfil novo, as linhas de `couple_settings`/`profile_settings` existem com os padrões | `settings.test.ts` (db) |
| A4 | Dada a pessoa A do casal 1, quando lê/atualiza `couple_settings`, `couple_saved_cities` e `profile_settings` de B (casal 2) e `profile_settings` do próprio parceiro, então zero linhas | `settings.test.ts` (db), padrão de `rls.test.ts` |
| A5 | Quando A escolhe a cor de B, então `23514`/`profiles_color_taken`; cor fora da paleta → `check_violation` | `settings.test.ts` (db) |
| A6 | Upload em `couple-media/{outro casal}/…` falha; leitura da capa do próprio casal pelo parceiro funciona | `supabase/tests/storage.test.ts` estendido |
| A7 | `leave_couple` por A: A vira `needs_couple`, B vira `awaiting_partner` com `slot` de B, estadias e preferências do casal continuam, e o convite aberto do casal fica revogado (`lookup_invite` do código antigo → `not_found`); `leave_couple` pelo último integrante apaga o casal | `supabase/tests/couple-lifecycle.test.ts` |
| A7a | `cancel_invite` revoga o aberto (o código deixa de resolver); sem aberto → `none_open`; por quem não é do casal → `not_member`; e `create_invite` depois do cancelamento gera código novo | `couple-lifecycle.test.ts` |
| A8 | Depois de A (slot 1) sair, `accept_invite` de C entra no **slot 1**, e a cor de C é ajustada se coincidir com a de B | `couple-lifecycle.test.ts` |
| A9 | `delete_couple` apaga casal, membros, estadias, convites, preferências e cidades salvas; perfis e `avatars/` dos dois continuam | `couple-lifecycle.test.ts` |
| A10 | `list_my_sessions` devolve só as sessões do caller, sem IP, com `is_current` certo; `end_my_session` de sessão alheia → `not_found`; da própria → a sessão some e o refresh daquele cliente falha | `supabase/tests/sessions.test.ts` |
| A11 | `public` tem exatamente as doze `security definer` nomeadas, todas sem `EXECUTE` para `anon` | A20 atualizado em `onboarding.test.ts` |
| A12 | Rotas: `/configuracoes` → `…/perfil-do-casal` com `replace`; slug inválido → `/`; `popstate` troca a aba; menu marca a ativa | `src/app/router.test.ts` + `src/settings/Settings.test.tsx` |
| A13 | Barra lateral mostra só Calendário e Configurações | `src/app/Shell.test.tsx` |
| A14 | Com a leitura em voo → esqueleto; com `error` → mensagem e _Tentar de novo_; **nenhum** toggle renderizado antes do `ok` | `Settings.test.tsx` |
| A15 | Toggle/segmento/cor chamam a API com o patch da coluna certa; com `error` voltam ao valor anterior e mostram a causa; com `color_taken` mostram o nome da outra pessoa | `Settings.test.tsx`, uma asserção por aba (Perfil do casal, Meu perfil, Calendário, Lista, Notificações) |
| A16 | Linha _Aniversário_ das Notificações desabilitada quando `remind_anniversary = false` | `Settings.test.tsx` |
| A16a | Perfil do casal com um integrante: mostra o convite aberto com _Cancelar_ e _Convidar outra pessoa_; cancelar pede confirmação e chama `cancelInvite`; sem convite, só _Convidar alguém_; com dois integrantes, nada disso aparece. Meu perfil não tem _Trocar e-mail_ | `Settings.test.tsx` |
| A17 | Cidades: _Trocar cidade_ só no próprio cartão; o aviso de recálculo aparece antes de gravar; _Adicionar cidade_ não oferece casa nem cidade já salva; casas não têm _Remover_ | `Settings.test.tsx` |
| A18 | Lista: o 8º chip não desliga | `Settings.test.tsx` |
| A19 | Aparência: escolher _Claro_ grava `lanabiel:appearance` e põe `data-theme="light"` no `<html>`; `localStorage` que lança não quebra a aba e mostra o aviso; _Do sistema_ reage a `matchMedia` | `src/app/appearance.test.ts` + `Settings.test.tsx` |
| A20 | Zona sensível: _Apagar pra sempre_ só habilita com o nome exato; a ordem é apagar Storage → RPC; falha no Storage não chama a RPC; falha na RPC mostra a mensagem da capa | `Settings.test.tsx` |
| A21 | Export: gera JSON `version: 1` com cidades resolvidas; leitura com `error` aborta sem baixar | `src/data/export.test.ts` |
| A22 | Alterar senha: senha curta bloqueada no cliente; confirmação diferente bloqueada; `weak_password` vira mensagem | `Settings.test.tsx` |
| A23 | Tema claro renderiza a casca e as nove abas sem cor fixa de tema escuro (nenhum hex literal de fundo/texto nos CSS, só tokens) | check por `grep` no verify + inspeção com screenshot no navegador (manual, ver 11) |
| A24 | Fluxo real no online: editar nome do casal, trocar cor, trocar cidade, salvar cidade, alternar tema, exportar, e a outra conta vê as mudanças do casal ao recarregar | roteiro manual com duas contas de teste, prints no ledger |
| A25 | `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:db` e `npm run build` limpos | saída dos comandos no verify |

## 11. Abordagem de teste

Domínio puro (`src/domain/settings.ts`, `src/app/appearance.ts`, `router.ts`) em vitest `domain`. Interface em jsdom (ADR 0005) com `SettingsApi` injetada: cada aba se prova renderizando e clicando, não lendo o código. Banco: os testes de `supabase/tests` **voltam a rodar**, contra o projeto online, pelo ADR 0014 — o harness aceita o host de produção só com `LANABIEL_DB_TESTS_ON_PROD=1`, só enquanto o app não estiver aberto a outros casais, e cria/apaga só usuários `…@test.local`, limpando por `id`. `npm run test:db` volta ao `package.json`; ele **não** entra no hook `Stop` (rede e usuários reais), roda no verify.

Manual, e por quê: A23 (cor é julgamento visual — o `grep` pega hex literal, não contraste ruim) e A24 (fluxo com duas contas em dois navegadores, que é o que o casal faz de verdade). Os dois ficam no ledger com print.

## 12. Riscos & mitigações

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Trocar o Storage do Supabase por R2/S3 (planejado) | Reescrever upload, leitura e contagem de fotos | Todo acesso a arquivo passa por `src/data/` (`avatar.ts`, a capa, a contagem de R20); nenhuma tela chama `db.storage`. O ADR 0012 registra o caminho `{couple_id}/{tipo}/{uuid}` como o contrato que sobrevive à troca, e `STORAGE_QUOTA_BYTES` muda junto |
| O formato das preferências travado agora não servir para Lista/Calendário | `ALTER` numa fase futura | Aceito no brainstorm. Colunas com `CHECK` + tipos gerados: a mudança quebra o typecheck no lugar certo, não em silêncio |
| Testes de integração em produção apagarem dado real | Perda de história do casal | Harness só apaga usuários criados por ele (`@test.local`), por `id`; flag explícita; ADR 0014 amarra ao "app fechado" e diz quando parar |
| Trocar a cidade-casa mudar a contagem do passado | Casal estranha "perdemos 200 dias juntos em Marau" | É a regra do ADR 0002; o aviso em R12 diz antes de gravar |
| Estadias de quem saiu viram `unknown` para quem fica | Contagem de quem fica cai | Documentado (seção 5); a Fase 5 decide o desenho; nada é apagado, então é reversível |
| Senha trocável sem a antiga | Sessão roubada troca a senha | Dois usuários, app fechado. Ligar `secure_password_change` junto com o SMTP próprio (fim do roadmap) |
| `end_my_session` não derruba o access token | O outro aparelho continua até 1 h | Texto na tela diz; é o comportamento do Supabase |
| Tema claro com contraste ruim em telas feitas só no escuro | Texto ilegível | Tokens do `.pen`, não cores inventadas; A23 com print das nove abas + Login + onboarding |
| Router caseiro crescer até virar biblioteca | Manutenção | ADR 0013 fixa o gatilho de troca: rota com parâmetro além do slug, ou loader de dados por rota |

## 13. Open questions (bloqueiam a implementação)

Nenhuma. As decisões de produto tomadas na spec foram aprovadas pelo Gabriel em 2026-09-26:

1. **Cidade-casa: cada um troca a própria**, no próprio perfil (R11). O cartão da outra pessoa só mostra.
2. **Não existe troca de e-mail** (R10) — nem desabilitada: o botão sai.
3. **Distância só em linha reta** (R13).
4. **Sessões sem cidade** (R21).
5. **Cota de 1 GB** (R20). O Storage vai migrar para R2 ou S3 depois — ver risco na seção 12.
6. **Itens e viagens como —** até as Fases 4 e 6 (R5, R23).
7. **Convite é da pessoa convidada** (I11, R22, R22a). Sair do casal revoga o convite aberto; quem fica cancela e convida outra pessoa explicitamente, pelas Configurações. Quem saiu mantém a conta e pode criar um espaço novo. _(Mudou em relação ao rascunho, que deixava o convite valendo para a vaga.)_
8. **Testes de banco contra produção** (ADR 0014).

## 14. Fora de escopo

- **Enviar qualquer aviso** (no app, e-mail ou push), o agendador do aniversário e a _véspera de viagem_. As preferências são gravadas; o envio vai para o fim do roadmap, com o Resend.
- **Efeito das preferências nas telas que não existem**: Calendário (Fase 5), Lista (Fase 4), Home (Fase 7). Cada fase lê a coluna e pode refiná-la.
- **Trocar e-mail** — não existe, por decisão de produto (não é adiamento).
- **Confirmação de e-mail** e **_Esqueci minha senha_** — SMTP próprio (backlog do ADR 0004/0006).
- **Distância rodoviária** e **geolocalização de sessão**.
- **Cidades fora do Brasil** em _Cidades salvas_ (Lisboa do frame) — vêm com o geocoding das Viagens (ADR 0007).
- **Editar o nome completo** (`full_name`): o frame não tem o campo. A Fase 2 prometia "editável na Fase 3"; fica para quando uma tela pedir.
- **Central de ajuda**, e o número de versão/build do design (`1.4.0 · build 214`) — a tela mostra o real.
- **Realtime**: a mudança de um aparece para o outro na próxima leitura (ADR de realtime segue na Fase 4).
- **Home, Lista e Viagens na barra lateral**, e o botão _Adicionar_.
- **Tema claro na timeline antiga.**
- **Limpeza de fotos órfãs** (capas e avatares antigos cujo delete falhou) — vai com o agendador.

---

## Plano (Gate 2)

> Toda tarefa que toca `supabase/migrations/` termina com `npx supabase db push --dry-run`, `npm run db:push`, `npm run types:gen` e `npm run typecheck` limpos.

1. [ ] **ADR 0014 + harness.** Religar `test:db` contra o online com a flag e o domínio de e-mail; rodar a suíte existente verde antes de mudar schema. → base para A3–A11
2. [ ] **Contrato de domínio.** `src/domain/settings.ts` + testes. → A1 (lado cliente), A2
3. [ ] **Migrations 1–2** (preferências, cor, cidades salvas) + `settings.test.ts`. ADR 0011. → A1, A3, A4, A5
4. [ ] **Migration 3** (`couple-media`, `cover_path`) + storage test. ADR 0012. → A6
5. [ ] **Migration 4** (sair revogando convite, apagar, `cancel_invite`, `accept_invite` slot livre) + `couple-lifecycle.test.ts`; `account.ts` sem o erro do slot 2. → A7, A7a, A8, A9
6. [ ] **Migration 5** (sessões) + `sessions.test.ts`; A20 → doze. → A10, A11
7. [ ] **Fronteira de dados** (`data/settings.ts`, `savedCities.ts`, `sessions.ts`, `export.ts`, extensões de `couple.ts`/`profile.ts`) + `SettingsApi`. → A21
8. [ ] **Casca e roteador** (`src/app/`), `App.tsx`; ADR 0013. → A12, A13
9. [ ] **Aparência e tema claro** (tokens claros do `.pen`, script inline, `appearance.ts`). → A19, A23
10. [ ] **Tela: estrutura + painel + Perfil do casal (com o convite pendente) + Meu perfil.** → A14, A15, A16a, A22
11. [ ] **Tela: Cidades, Calendário, Lista, Notificações.** → A15–A18
12. [ ] **Tela: Dados e privacidade + Zona sensível.** → A20, A21
13. [ ] **Fechar.** A24 manual, A25, skill `verify`, `.agent/System/project_architecture.md`, `CLAUDE.md` (estado atual), `Tasks/README.md`, ledger, spec → 🟢.

---

## Related

- Brainstorm: conversa de 2026-09-26 (bloco de cinco linhas aprovado)
- ADRs desta fase: 0011 · 0012 · 0013 · 0014 (a escrever no mesmo PR)
- ADRs que esta fase não pode violar: [0001](../Decisions/0001-supabase-com-rls-por-casal.md) · [0002](../Decisions/0002-estadia-por-pessoa-estado-derivado.md) · [0003](../Decisions/0003-lista-tabela-unica-com-check-por-categoria.md) (chaves de categoria) · [0005](../Decisions/0005-interface-se-prova-em-jsdom.md) · [0007](../Decisions/0007-cidades-brasileiras-por-seed-do-ibge.md) · [0008](../Decisions/0008-convite-portador-e-um-casal-por-pessoa.md) (lista de `security definer`) · [0009](../Decisions/0009-fotos-em-bucket-privado-por-casal.md)
- Parcialmente superseded: [0010](../Decisions/0010-banco-so-online-sem-stack-local.md) pelo 0014 (só a regra dos testes)
- Design: frames `MzQxz`, `TXqEo`, `dpzT3`, `o1JAVm`, `MrIGB`, `Z84Ano`, `CZ3oK`, `mV5s2`, `wFxyC`, e `Navbar` (`PajKz`), lidos do `.pen` pelo MCP do Pencil em 2026-09-26. Tokens claros: `GetVariables()`, tema `mode: light`
- Ledger da execução: `fase-3-configuracoes.ledger.md`
