# Spec — Perfil provisório da outra pessoa

- **Data:** 2026-09-27
- **Autor:** Gabriel Barbosa (com Claude)
- **Status:** 🟢 Done (2026-09-27): migration no online, A1–A13 provados. Falta o uso real (criar a Lana e o aceite dela)
- **Research (Gate 0):** N/A — mudança interna de schema e convite, sem opção de mercado a comparar
- **ADR necessário?** Sim → `0024-perfil-provisorio-herdado-no-aceite.md` (mesmo PR)

---

## 1. What & Why

Quem cria o espaço fica sozinho até a outra pessoa aceitar o convite, e nesse
intervalo o Mapa, o Calendário e as Viagens não abrem: todos precisam dos dois
integrantes, porque cada estadia é de uma pessoa (ADR 0002) e o evento pinta os
dias dos dois (ADR 0018). Hoje o Gabriel está nesse estado (casal
`7033976b-…`, um membro, convite aberto até 2026-10-05) e quer preencher o
histórico antes de a Lana entrar.

Depois disto, quem está sozinho cria um **perfil provisório** da outra pessoa
(nome, cidade-casa, cor), sem login. Com ele o casal passa a ter dois
integrantes, e todas as telas abrem e gravam normalmente. Quando a pessoa
convidada aceita o convite, tudo o que apontava para o provisório passa a
apontar para a conta dela, e o provisório deixa de existir.

## 2. Como funciona (um cenário real)

Gabriel abre Configurações → Casal. No lugar da vaga vazia há o convite aberto
e o botão _Preencher o perfil dela antes_ (o texto final está em R2). Ele digita
"Lana", escolhe Marau na busca de cidade e fica com a cor sugerida. O cliente
chama `save_pending_partner`, que cria em `profiles` uma linha com id aleatório
e `user_id` nulo e a coloca em `couple_members` no slot 2. O cartão da vaga
passa a mostrar a Lana com "Ainda não entrou", e o convite continua embaixo.

Ele vai ao Calendário, que agora abre com as duas faixas. Pinta Marau para a
Lana de janeiro a hoje, cria uma visita a SJC e uma viagem para Gramado. A RPC
`paint_stays` grava estadias com `profile_id` = provisório; o gatilho
`stays_members` aceita porque o provisório é integrante.

Na manhã seguinte a Lana abre o link do convite, cria a conta, preenche o
próprio perfil (o passo "Seu perfil" do onboarding, sem mudança) e aceita.
`accept_invite` vê que o slot 2 do casal é provisório e, numa transação: troca
o `profile_id` do slot 2 para o id dela e troca, em toda coluna que referencia
`profiles(id)`, o id provisório pelo dela. Depois apaga o provisório. Ela passa
por "Confirmar" e "Tudo pronto" e cai na Home com as estadias, a visita e a
viagem já dela. O nome, a cor e a cidade-casa que valem são os que ela escolheu.
Os dias já pintados não mudam.

## 3. Requisitos (comportamentos observáveis)

- **R1** — Em Configurações → Casal, quando o casal tem um só integrante com
  conta e nenhum provisório, o cartão da vaga mostra, além do convite (R22a da
  Fase 3), a ação de criar o perfil provisório.
- **R2** — O formulário pede **Nome** (vai para `display_name` e `full_name`),
  **Cidade-casa** (a mesma busca de `ChangeHomeCity`) e **Cor** (paleta de 7,
  sem a cor de quem cria; sugerida a outra cor padrão). Botão "Salvar". Título
  do diálogo: "Perfil de quem vai entrar". Texto de apoio: "Você pode preencher
  o calendário, a lista e as viagens com esta pessoa. Quando ela aceitar o
  convite, tudo passa para a conta dela, com o nome e a cor que ela escolher."
- **R3** — Com o provisório criado, o cartão do integrante mostra o nome, a
  cidade e "Ainda não entrou"; tem a ação "Editar", que abre o mesmo formulário
  preenchido. O convite aberto continua visível e operável abaixo dele.
- **R4** — Com o provisório criado, o estágio da conta de quem criou é `ready`:
  Home, Calendário, Viagens e Lista abrem e escrevem como com duas contas. Em
  nenhuma dessas telas o provisório se distingue de um integrante real (fora das
  Configurações).
- **R5** — Ao aceitar o convite de um casal com provisório, a pessoa entra no
  slot do provisório e herda toda referência a ele: estadias, eventos (inclusive
  `traveler_id`), viagens (`trip_departures`, `trip_memories`, fotos, roteiro),
  Lista (`added_by`, `done_solo_by`, memórias, fotos), beijos e cidades salvas.
- **R6** — Depois do aceite, o perfil da pessoa é o que ela preencheu no
  onboarding (nome, nome completo, foto, cidade-casa, cor). Se a cor dela for a
  mesma de quem criou, vale a regra de hoje: ela recebe a outra cor padrão.
- **R7** — Sair do espaço (`leave_couple`) quando o único outro integrante é
  provisório apaga o espaço, como hoje acontece quando se está sozinho. A aba
  Perigo usa o texto de "sozinho" nesse caso.
- **R8** — Apagar o espaço (`delete_couple`) apaga também o perfil provisório.
- **R9** — Criar convite (`create_invite`) continua permitido com provisório:
  "casal cheio" passa a contar só integrantes com conta. `renew_invite` não
  checa lotação e não muda. O convite aberto de hoje continua válido.

## 4. Invariantes

- **I1** — Um perfil é provisório se e somente se `profiles.user_id is null`.
  Perfil com conta tem `user_id = id`. `user_id` nunca muda depois do insert.
- **I2** — Um casal tem no máximo um provisório, e só quando tem exatamente um
  integrante com conta. Provisório sempre é integrante de um casal (nunca órfão
  fora de transação).
- **I3** — O aceite é atômico: ou todas as referências passam do provisório para
  a pessoa e o provisório some, ou nada muda e o convite continua aberto.
- **I4** — Depois do aceite não sobra nenhuma linha, em nenhuma tabela, apontando
  para o id provisório. A lista de colunas vem do catálogo (`pg_constraint`), não
  de uma lista escrita à mão, para que uma tabela nova com FK para `profiles`
  seja coberta sem editar o aceite.
- **I5** — Ninguém cria ou edita provisório pelo cliente direto: só pelas RPCs.
  `profiles_insert_self` e `profiles_update_self` continuam exigindo
  `id = auth.uid()`, o que um provisório nunca satisfaz.
- **I6** — A RLS não muda: tudo continua passando por `couple_members`. O
  provisório é lido por quem está no casal dele e por mais ninguém.
- **I7** — Apagar a conta do Auth de uma pessoa continua apagando o perfil dela
  (cascade via `user_id`).

## 5. Contrato & dados

### Schema (uma migration: `20260927130000_pending_partner.sql`)

```sql
-- profiles deixa de ter id = auth.users.id por FK. A ligação passa a user_id.
alter table public.profiles drop constraint profiles_id_fkey;
alter table public.profiles
  add column user_id uuid unique references auth.users(id) on delete cascade,
  add constraint profiles_user_is_id check (user_id is null or user_id = id);
update public.profiles set user_id = id;   -- todo perfil existente tem conta

-- BEFORE INSERT: preenche user_id := id quando existe auth.users com esse id
--   (cobre o insert do onboarding e o do harness com service_role).
-- BEFORE UPDATE: recusa mudança de user_id (I1), errcode 23514,
--   constraint 'profiles_user_immutable'.
```

Nenhuma FK para `profiles(id)` muda. O aceite troca as referências por
`update`, não por `on update cascade` (ver ADR 0024 e seção 12).

### RPCs (todas `security definer`, `search_path = ''`, `revoke` de `public, anon`, `grant` a `authenticated`)

```
save_pending_partner(p_display_name text, p_home_city_id uuid, p_color text) → jsonb
  status: 'created' | 'updated'           + profile_id
        | 'not_member'                     (quem chama não tem casal)
        | 'couple_full'                    (já há outro integrante com conta)
        | 'invalid', field: 'display_name' | 'home_city' | 'color'
          -- nome fora de LIMITS.displayName; cidade inexistente ou com couple_id
          -- (só cidade global, a mesma regra de profiles hoje); cor fora da
          -- paleta ou igual à de quem chama
  Cria: profiles (id = gen_random_uuid(), user_id null, full_name = display_name)
        + couple_members (slot livre). Edita: as três colunas do provisório.
  Trava o casal (select … for update em couples), como leave_couple.

accept_invite(p_code) → contrato de retorno inalterado.
  Se o casal tem provisório: em vez de inserir em couple_members,
    1. update couple_members set profile_id = <uid> where profile_id = <prov>;
    2. para cada FK de coluna única com confrelid = public.profiles, exceto
       couple_members e profile_settings (PK por perfil; a dela já existe):
         execute format('update %s set %I = $1 where %I = $2', …) using uid, prov;
    3. delete from profiles where id = <prov>;  (leva o profile_settings dele)
    4. ajuste de cor igual ao de hoje.
  Se não tem: comportamento atual.

private.invite_refusal: 'used' passa a contar integrantes com conta.
create_invite: 'couple_full' idem.
leave_couple: depois de sair, se não resta integrante com conta, apaga o casal
  e o provisório.
delete_couple: apaga o provisório do casal junto.
```

### Cliente

- `database.types.ts` regenerado (`npm run types:gen`).
- `src/data/couple.ts` e `src/data/settings.ts` passam a ler `profiles.user_id`
  e expõem `pending: boolean` no integrante.
- `SettingsApi` ganha `savePendingPartner({ displayName, homeCityId, color })`
  com resultado discriminado espelhando os status da RPC.
- `CoupleTab`: `alone` passa a ser "sem outro integrante com conta"; o
  provisório aparece como integrante com a marca de R3.
- `DangerTab`: `alone` idem (R7).
- Validação do formulário lê `LIMITS.displayName` e `PERSON_COLORS` de
  `src/domain/settings.ts` (mesma fonte dos `CHECK`).

### Compatibilidade

Nenhum contrato de leitura existente quebra: um provisório é um integrante com
perfil completo. Os dados de hoje (um perfil, com conta) recebem `user_id`
pelo backfill. O convite aberto do casal real continua válido.

## 6. Identidade & nomes

O id do provisório é `gen_random_uuid()`, nunca derivado de e-mail ou convite, e
não sobrevive ao aceite: quem referencia um perfil tem que aceitar que esse id
some e é trocado pelo `auth.uid()` de quem entra. Nenhum id de perfil é gravado
fora de colunas com FK (conferido no catálogo em 2026-09-27: `travelers` e
`done_with` guardam slot, não id; `private.invite_code_failures.user_id` é o
usuário do Auth). Storage: o provisório não tem foto (`avatar_path` nulo), então
nenhum caminho de bucket carrega o id dele.

## 7. Comportamento em falha

- O aceite falha no meio (violação de unicidade inesperada, gatilho de
  integrante recusando): a transação inteira volta (I3), `accept_invite`
  propaga o erro, e a tela de onboarding mostra o erro genérico que já existe. O
  provisório e os dados seguem no casal; o convite segue aberto; dá para tentar
  de novo.
- Duas abas: o criador edita o provisório enquanto a convidada aceita. Os dois
  travam a linha de `couples` (`for update`); quem chega depois ou vê o
  provisório já apagado (`save_pending_partner` responde `couple_full`) ou
  espera o aceite terminar.
- O criador sai do espaço com o provisório e o convite abertos: o casal é
  apagado, o convite some com ele (cascade), e o link passa a responder
  `not_found`, como hoje.
- A convidada já é de outro casal: `already_member`, sem tocar no provisório.

## 8. Limites & orçamentos

O aceite roda um `update` por FK (hoje 17 colunas, fora `couple_members`), cada
um sobre as linhas de um casal. Com os volumes do app (milhares de estadias no
máximo), fica abaixo de 1 s. Nenhuma paginação, nenhuma chamada externa.

## 9. Segurança & permissões

Só quem é integrante com conta de um casal cria ou edita o provisório daquele
casal. O provisório não tem conta, então não autentica nem é alvo de
`auth.uid()`; `my_couple_ids()` nunca o devolve. O loop do aceite usa
identificadores do catálogo com `%I` e `regclass`, sem texto vindo do cliente.
Quem aceita herda dados que outra pessoa escreveu no nome dela: é o propósito,
e o convite portador (ADR 0008) continua sendo a única porta de entrada.

## 10. Critérios de aceite (testáveis)

| #   | Critério (Dado/Quando/Então) | Como provar |
| --- | ---------------------------- | ----------- |
| A1  | Dado um casal com um integrante, quando ele chama `save_pending_partner` válido, então há dois `couple_members`, o novo com `user_id` nulo, e `loadAccountStage` devolve `ready` | `supabase/tests/pending-partner.test.ts` |
| A2  | Dado o provisório, quando o criador grava estadia, evento com `traveler_id`, viagem com partida e memória, e item da Lista feito pelo provisório, então tudo é aceito | idem |
| A3  | Dado A2 e um convite aberto, quando outra conta com perfil aceita, então todas as linhas de A2 apontam para o id dela, nenhuma linha em nenhuma FK para `profiles` aponta para o provisório (consulta ao catálogo), e o provisório não existe | idem |
| A4  | Depois de A3, o perfil dela mantém nome, cidade e cor escolhidos; cor igual à do criador vira a outra cor padrão | idem |
| A5  | `save_pending_partner` recusa: sem casal (`not_member`), casal com dois integrantes com conta (`couple_full`), nome vazio ou com 31 caracteres, cidade de casal, cor igual à do criador | idem |
| A6  | Cliente autenticado não consegue `insert`/`update` em `profiles` com id diferente do seu nem mudar `user_id` do próprio perfil | idem |
| A7  | `leave_couple` com provisório apaga casal e provisório; `delete_couple` idem | idem |
| A8  | `create_invite` e `lookup_invite`/`accept_invite` funcionam com provisório (não respondem `couple_full`/`used`) | idem |
| A9  | Integrante de outro casal não lê o provisório (`select` em `profiles` devolve zero linhas) | idem |
| A10 | Aba Casal sozinho: mostra convite e "Perfil de quem vai entrar"; salvar chama a API com os três campos e mostra o integrante com "Ainda não entrou" e "Editar" | `src/settings/tabs/CoupleTab.test.tsx` (jsdom) |
| A11 | Aba Perigo com provisório usa o texto e o fluxo de "sozinho" | teste de interface da aba Perigo |
| A12 | Migration aplicada no online e o perfil real do Gabriel tem `user_id = id`; tipos regenerados | `select` no online + `npm run typecheck` |
| A13 | `npm run test`, `npm run lint`, `npm run build` limpos | saída dos comandos |

## 11. Abordagem de teste

O risco está no banco, então a prova principal é a suíte de integração contra o
online (ADR 0014), num arquivo novo que cria dois usuários `…@test.local`. A3
verifica "nenhuma referência sobrando" pelo mesmo catálogo que o aceite usa,
para o teste não repetir a lista à mão. A interface se prova em jsdom (ADR
0005). A checagem manual final é o Gabriel criar a Lana provisória no app real;
o aceite de verdade só acontece quando ela entrar, e por isso A3 roda com
contas de teste.

## 12. Riscos & mitigações

| Risco | Impacto | Mitigação |
| ----- | ------- | --------- |
| Migration vai direto para produção com um casal real | Perder o casal do Gabriel | Migration só adiciona coluna, gatilhos e troca uma FK; antes, `select count(*)` em `profiles`; `--dry-run` antes do push |
| `on update cascade` dispararia os gatilhos de integrante em ordem indefinida | Aceite falhando ao acaso | Não usar cascade: trocar `couple_members` primeiro e depois as demais tabelas, explicitamente |
| Tabela nova com FK para `profiles` esquecida no aceite | Dado apagado pelo `on delete cascade` do provisório | Loop pelo catálogo (I4) e A3 conferindo pelo catálogo |
| Unicidade por perfil (ex.: uma memória por pessoa por item) colidir no aceite | Aceite falha | A convidada é nova e não tem linhas; se colidir, a transação volta (I3) e o erro aparece |
| Testes de integração rodam no online com casal real | Teste mexer no casal real | O harness só toca usuários `…@test.local` (ADR 0014) |

## 13. Open questions (bloqueiam a implementação)

Nenhuma. Decididos com o Gabriel em 2026-09-27: vale o perfil que a pessoa
preencher ao entrar; dias pintados não mudam; provisório sem foto.

## 14. Fora de escopo

- Pré-preencher o passo "Seu perfil" da convidada com os dados do provisório.
- Apagar o provisório sem apagar o espaço (dá para editar).
- Foto do provisório.
- Marcar o provisório nas telas fora das Configurações.

---

## Plano (Gate 2)

1. [x] ADR 0024 (perfil provisório, herança por troca explícita e não cascade).
2. [x] Migration `20260927130000_pending_partner.sql`: `user_id`, gatilhos,
       `save_pending_partner`, `accept_invite`, `invite_refusal`,
       `create_invite`, `leave_couple`, `delete_couple`
       recriadas. `select count(*) from profiles` antes; `db push --dry-run`;
       `npm run db:push`; `npm run types:gen`.
3. [x] `supabase/tests/pending-partner.test.ts` cobrindo A1–A9; `npm run test:db`
       só desse arquivo, depois da suíte de convite e ciclo do casal
       (`couple-lifecycle`, `onboarding`, `data-onboarding`).
4. [x] Dados: `pending` em `data/couple.ts` e `data/settings.ts`;
       `savePendingPartner` na `SettingsApi` e nos fakes/harness.
5. [x] Interface: formulário e cartão na `CoupleTab`, `alone` na `DangerTab`;
       testes A10–A11; conferir copy com `.agent/SOP/copy.md`.
6. [x] Verify (A12–A13) e o teste manual: criar a Lana provisória no app real.
7. [x] Atualizar `.agent/System/project_architecture.md` e marcar 🟢.

---

## Related

- ADR(s): 0002, 0008, 0014, 0018, 0024
- Fase 2: `fase-2-onboarding.md` (convite), Fase 3: `fase-3-configuracoes.md` (R22a, leave/delete)
