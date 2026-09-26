# Ledger — Fase 3: Configurações

> Registro do que foi decidido **durante a execução**. Spec:
> [`fase-3-configuracoes.md`](./fase-3-configuracoes.md).

---

## Execução em sequência, não em subagentes

As tarefas são acopladas: as migrations vão em fila para o mesmo banco (o
online), e a tela depende da fronteira de dados. A skill `orchestrate` manda não
orquestrar esse caso. Tudo foi feito em sequência, numa sessão.

---

## T1 · Harness de volta, contra o projeto online (ADR 0014)

Feito: trava por host + `LANABIEL_DB_TESTS_ON_PROD=1`, chaves de `.env.local` e
`.env.test.local`, `sql()` pela Management API (`supabase db query --linked`),
`test:db` no `package.json`, `userFactory`/`rpc`/`coupleOfTwo` no harness.

Ruling: e-mails de teste continuam `…@test.local` (a spec dizia
`@test.lanabiel.invalid`) — é o domínio que o harness da Fase 2 já usa e limpa;
trocar mexeria nos testes antigos sem ganho. Custo se errado: nenhum além do
nome.

Ruling: A17 e A18 (`send-invite.test.ts`) ficam `skipIf(!MAILPIT_URL)`: leem a
caixa do Mailpit da stack local, que o ADR 0010 derrubou. A19 continua rodando.
Custo: o envio de e-mail não tem prova ponta a ponta até o Resend (fim do
roadmap) — já era assim desde o 0010.

A `service_role` de produção é credencial de administrador; não foi buscada
pelo agente — o Gabriel criou o `.env.test.local`.

Ruling: `sql()` embrulha a consulta em `json_agg(row_to_json(q))::text`. A
resposta da Management API vem com as chaves de cada linha em ordem ALFABÉTICA
e junta colunas de mesmo nome (dois `count(*)` viram um) — A15 e A20 falharam
assim na primeira rodada. `row_to_json` preserva a ordem; nomes iguais ainda
colidem, então as consultas usam `as`. Custo: nenhum.

Ruling (do Gabriel): o Auth online aceita 30 logins a cada 5 min por IP e a
suíte faz mais de 100. **Não** se afrouxa o limite de produção: o projeto `db`
roda um arquivo por vez (`fileParallelism: false`) e o `anonClient` do harness
espera 30 s e tenta de novo quando o login volta "rate limit". Custo: a suíte
leva ~20 min.

Ruling: `data-onboarding.test.ts` espera "não enviado" sem `MAILPIT_URL` — no
online a `send-invite` responde erro de propósito (Resend no fim do roadmap).

## T2 · Contrato de domínio

Concluído. Prova: `src/domain/settings.test.ts`, 28 passando.

Ruling: `formatThousands` e `formatCoord` sem `Intl` — o jsdom/Node pode vir sem
ICU completo, e o separador de milhar variaria por ambiente. Custo: nenhum.

## T3–T6 · Migrations 1–5

Escritas; `npx supabase db push --dry-run` listou as cinco. O `db push` pelo
agente foi bloqueado pelo classificador de permissões; o Gabriel aplicou
(`npm run db:push`, 2026-09-26) e o agente regenerou os tipos. Advisors depois
do push: só as 12 `security definer` intencionais (lint 0029, igual à Fase 2) e
`auth_leaked_password_protection`, pendente desde a Fase 1.

Ruling: `refreshed_at` de `auth.sessions` é `timestamp` SEM fuso (o resto é
`timestamptz`); `list_my_sessions` converte `at time zone 'UTC'`. Custo se
errado: "ativa há X" deslocado pelo fuso do servidor.

Ruling: a paleta de cores do casal muda de `#3b82f6/#ec4899` (Fase 2) para
`#7FD8C4/#F4A3B4` (design). Com 0 perfis em produção não há dado a converter,
mas a migration converte mesmo assim, antes do `CHECK`.

Ruling: `cancel_invite` é RPC (12ª `security definer`) e não policy de UPDATE em
`couple_invites` — uma policy não restringe colunas, e deixaria reescrever
`code`/`accepted_at`.

Ruling: trigger `profiles_color_distinct` é `security invoker`: a policy de
`profiles` já deixa ler a outra pessoa do casal. Custo se errado: com uma
policy mais fechada no futuro, a checagem passaria a não ver a outra cor e
deixaria de recusar — nenhuma falha visível. Quem mexer na policy precisa olhar
aqui.

## T7 · Fronteira de dados

`src/data/settings.ts`, `sessions.ts`, `export.ts`; `cities.ts` ganhou
`loadCitiesByIds`; `avatar.ts` generalizou o redutor (`prepareCover`, 1600 px);
`auth/signIn.ts` ganhou `changePassword` e passou a exportar `MIN_PASSWORD`.

Ruling: `updateCoupleSettings` filtra `.not('couple_id','is',null)` porque o
PostgREST recusa UPDATE sem filtro; quem corta é a policy. Custo: nenhum.

## T8 · Casca e roteador (ADR 0013)

Concluído. Prova: `src/app/router.test.ts` e `src/app/Shell.test.tsx`.

Ruling: as classes da casca são `shell-*`, não `app-*` — `timeline.css` já usa
`.app`, `.app-main` e `.app-header`. Custo: nenhum.

Ruling: o `Shell` recebe a `SettingsApi` por parâmetro (o `App.tsx` monta), em
vez de importar `lib/supabase` — o módulo lança sem variáveis de ambiente e
quebraria o teste. Mesmo padrão do `AuthGate`.

Ruling: sair do casal/apagar o espaço recarregam o app em `/`
(`window.location.assign`) para o portão reavaliar o estágio. Custo: um reload.

## T9 · Aparência e tema claro

Concluído. Prova: `src/app/appearance.test.ts`; A19 em `Settings.test.tsx`.

Ruling: **Login e onboarding NÃO trocam de tema** (a spec dizia que sim, R18). O
`auth.css` registra por quê: o design só desenha essas telas no escuro, sobre um
globo noturno. O tema claro vale para a casca e as Configurações. Custo se
errado: acrescentar tokens claros ao `.auth`.

Ruling: `lucide-react` entra como dependência. A Fase 1 copiou seis caminhos à
mão para não trazer a biblioteca; as nove abas usam ~50 ícones do lucide (é o
que o `.pen` declara), e a biblioteca é tree-shaken. Custo: uma dependência de
UI, sem efeito estrutural.

## T10–T12 · A tela

Concluído, com a API injetada. Prova: `src/settings/Settings.test.tsx`, 32
passando; `src/data/export.test.ts`, 3.

Ruling: "Enviar feedback" vira `mailto:` de `VITE_FEEDBACK_EMAIL`; sem a
variável a linha some. "Central de ajuda" não aparece (não há destino).

Ruling: `startedOn` futuro é barrado no cliente antes de chamar o banco (o
trigger recusaria de qualquer jeito). A data do `<input type="date">` usa
`max={today}`.

Ruling: "Convidar outra pessoa" nas Configurações chama `createInvite` e depois
`sendInvite`; com o Resend desligado o envio falha, o convite existe e o código
aparece na tela Aguardando. Custo: a pessoa precisa passar o código à mão, como
hoje.

Dívida: a tela ainda não foi vista num navegador contra o banco real — depende
do `db push`. A23 (contraste do tema claro) e A24 (fluxo com duas contas) são
manuais e ficam para depois do push.

## Revisão (subagente, contexto novo) e correções

`npm run test:db`, primeira rodada completa: 110 passando, 1 falha (A19 limpava
a caixa do Mailpit antes de rodar — agora só com `MAILPIT_URL`), 4 pulados
(A17/A18). Depois da correção: A19 passa.

Achados corrigidos:

1. `color_taken` nunca chegava ao cliente: o `constraint` do RAISE não passa
   pelo PostgREST. Agora o trigger põe `hint = 'profiles_color_taken'` e
   `updateProfile` casa pelo hint (migration `…130500_review_fixes.sql`).
2. Sozinho, "Sair do casal" apagava o casal por SQL e deixava a pasta
   `couple-media/<id>/` órfã e inalcançável. Agora, sozinho, o caminho é o de
   apagar (fotos primeiro, RPC depois), e o texto diz isso.
3. Convite criado nas Configurações não mostrava o código nem dizia que o
   e-mail não saiu. Agora mostra os dois.
4. Campo de texto/data recusado ficava com o valor rejeitado na tela (R24).
   Agora volta ao gravado.
5. `signOut` era `scope: 'global'` (padrão do supabase-js): "Sair desta conta"
   derrubava todos os aparelhos. Agora `local` — vale também para "Trocar de
   conta" da Fase 1, que sempre quis dizer este aparelho.
6. Corrida `leave_couple` × `accept_invite`: o aceite agora trava o casal
   `FOR SHARE` e refaz a checagem; casal apagado vira `not_found`.
7. Duas trocas de cor simultâneas passavam as duas (I4): o trigger pega
   `pg_advisory_xact_lock` por casal.
8. `useWrites.run` sem `try/finally` travava o controle em "pendente" numa
   exceção.
9. "criou o espaço" vinha de `slot === 1`, que depois de uma saída não é mais o
   criador. Agora é `joined_at = couples.created_at` (`isCreator`).
10. Export relê tudo na hora (não o retrato de quando a tela abriu); botão de
    export da Zona sensível com estado de espera; `revokeObjectURL` adiado;
    `useAppearance.update` funcional.

Adjudicado, não corrigido:

- "Este espaço mudou — recarregue" aparece como erro junto do controle, sem
  botão próprio de reler o estágio. Quem vê isso recarrega a página; e a
  próxima leitura já leva ao estágio certo. Dívida pequena.
- A20 prova a ORDEM (Storage → RPC) só pela API injetada; `deleteCouple` em
  `data/settings.ts` não tem teste próprio de ordem. A9 não confere que
  `avatars/` sobrevive (a RPC não toca em Storage, então só um arquivo
  apagado pelo cliente sumiria — e o cliente só apaga `couple-media`).
- `today` é fixado quando a tela abre: atravessar a meia-noite com a tela
  aberta mostra "hoje" de ontem até recarregar.
- A23 (`grep` de hex): os literais em `settings.css` são cores de DADO (texto
  sobre a faixa pastel da pessoa, botão do toggle branco como no `.pen`) ou as
  miniaturas de tema, que desenham os dois temas por definição. Documentado no
  próprio CSS.
- Layout da fronteira: a spec listava `savedCities.ts`, e extensões de
  `couple.ts`/`profile.ts`; ficou tudo em `data/settings.ts` (as funções só as
  Configurações usam).

**Pendente:** o Gabriel aplicar `…130500_review_fixes.sql` (`npm run db:push`) —
até lá, "a outra pessoa escolheu essa cor" aparece como erro genérico, e
`settings.test.ts` A5 falha no hint.

## Verificação (Gate 3)

typecheck, lint, `npm run test` (169), `npm run test:db` (111 + 4 pulados),
build e `db push --dry-run` ("up to date") limpos. A1–A22 e A25 provados;
tabela completa no relatório da sessão de 2026-09-26.

**Dívida (decisão do Gabriel, 2026-09-26): contraste dos tokens do `.pen`.**
Medido contra `--bg-deep`, critério AA de texto pequeno (4,5:1):
`--accent` no tema claro (`#1FA184`) dá 2,77:1 — é a cor dos links; e
`--text-tertiary` dá 3,35:1 no claro e 4,25:1 no escuro — as legendas de 12 px
(no escuro, o mesmo valor que Login e onboarding já usavam). Os valores saem do
design; a correção é escurecê-los no Pencil e copiar para `src/app/app.css`.

**Não verificado:** A24 (fluxo real com duas contas no app online) — o agente
não autentica no Supabase online, e o Gabriel seguiu para o fechamento sem ele.
Fica pendente para antes de a Fase 5 abrir o app ao uso diário.
