# Ledger — Fase 5: Calendário

> Registro do que foi decidido **durante a execução**. Spec:
> [`fase-5-calendario.md`](./fase-5-calendario.md).

---

## Forma da execução

Branch `fase-5-calendario`. As tarefas são acopladas em cadeia (domínio →
migration → fronteira de dados → telas), então a paralelização é por onda, só
onde os arquivos são disjuntos. É a mesma forma da Fase 4.

- **Contrato compartilhado escrito pelo orquestrador antes de despachar**
  (commit `c23b75f`): os tipos e constantes de `src/domain/calendar.ts`,
  `paintCases.ts` (A2) e `eventValidationCases.ts` (A3). Isso destrava T2
  (domínio) e T3+T4 (migrations) em paralelo.
- **T3 e T4 num agente só.** As duas migrations saem juntas porque a segunda
  (`stays_members`, `create_event`) depende das colunas da primeira, e provar as
  duas no mesmo container é uma subida só.
- **`db:push` no online só depois de o orquestrador ler o SQL.** O agente da
  migration para no `--dry-run`. As duas migrations são aditivas (colunas,
  tabelas, policies e funções novas; a policy de `select` de `cities` é trocada
  por uma mais estreita). Antes do push: `select count(*) from cities where
  country_code <> 'BR'`.

Ruling: as duas primeiras frentes escrevem na mesma árvore, sem worktree, porque
os arquivos são disjuntos (`src/domain/` × `supabase/` + `src/data/calendarRow.ts`)
e nenhuma das duas faz commit. Custo se eu estiver errado: um `typecheck` de uma
vê o arquivo pela metade da outra e reporta erro que não é dela. É visível no
relatório e reversível rodando de novo.

Ruling: `eventValidationCases.ts` troca `travelerId` e `cityId` por marcadores
(`$traveler`, `$city`) que o lado do banco substitui. O domínio só confere
presença. Custo se eu estiver errado: nenhum no domínio. No banco, um marcador
esquecido vira erro de FK, e não um falso "aceito".

---

## T2 · Contrato de domínio

Concluído. Prova: `npx vitest run src/domain`, 316 passando (113 novos em
`calendar.test.ts`, com `it.each(PAINT_CASES)` e `it.each(EVENT_VALIDATION_CASES)`);
typecheck e lint limpos; `runs` sobre um ano com 200 estadias abaixo de 50 ms.
Revisão de conformidade do orquestrador: `paintOne`, `runs`, `runAround`,
`entriesForEdit` lidos contra I3–I5; a borda "cauda de trecho aberto encurtado"
não gera intervalo invertido (a condição `old.to > next.to` garante).

Correção do contrato, feita pelo agente: os casos de 366/367 dias de
`eventValidationCases.ts` estavam um dia errados (2026 não é bissexto). Erro do
orquestrador ao escrever o contrato. O agente das migrations foi avisado.

Mudanças de assinatura (spec atualizada): `entriesForPeriod(draft, members)`,
porque a forma da spec não tinha onde receber a cidade do "away";
`bandLabel(…, members)`, porque sem as casas "Lana em SJC" e "Juntos em SJC"
são indistinguíveis; `entriesForDelete` nova.

Ruling (do agente, aceito): `paintStays` lança em intervalo invertido e
`entriesForPeriod('away')` sem cidade lança. Engolir faria a prévia dizer "nada
muda" para algo que o banco recusa. Custo se errado: os modais (T10/T11) têm de
bloquear esses rascunhos antes de chamar a prévia, ou o modal quebra.

Ruling (do agente, aceito): `runs` deriva por borda de estadia, não dia a dia, e
`countDrawn` soma trechos. Uma derivação só para faixa, ano e contagem. Custo se
errado: nenhum visível; `unknown` no meio e trecho cruzando o mês estão testados.

Ruling (do agente, aceito): no `nowSummary`, o título usa o nome inteiro da
cidade ("Juntos em São José dos Campos há 4 dias"), e o subtítulo de separados e
os contadores usam o curto. O frame usa "SJC" no título. Custo se errado: uma
linha, e a revisão de tela (T9) decide olhando o frame.

Ruling (do agente, aceito): `upcoming` só pega ocorrências com `day >= hoje`
(viagem em curso não entra nos próximos). Custo se errado: o filtro vira
`endDay >= hoje`.

Correção da spec: o cenário da seção 2 dizia "Separados em novembro: 26 → 23";
com o primeiro período _Separados_ em aberto desde 26/09, é **30 → 27** (o teste
afirma isso). O número vinha do mock do frame.

---

## T3 + T4 · Migrations e testes de integração

Escritas e provadas **fora do online**, num container descartável
(`supabase/postgres:17.6.1.171`, as 20 migrations em ordem num banco limpo):
15/15 `PAINT_CASES` via `paint_stays` como `authenticated`; 36/36
`EVENT_VALIDATION_CASES` via `eventDraftToInsert`; 88/88 checagens à mão
(cidades, RLS entre casais, `paint_stays` e `create_event` com os caminhos de
erro, 💋 limite/futuro/corrida, catálogo com as doze `security definer`).
`npx supabase db push --dry-run`: as duas migrations e nada mais. Revisão do
orquestrador: SQL lido linha a linha; aprovado.

Pré-checagem no online (2026-09-26): 0 cidades fora do Brasil; a policy
`cities_select_authenticated` existe com esse nome; `private.today_br` e
`private.touch_updated_at` existem; 6 estadias (o trigger `stays_members` só
confere escrita nova, então elas não são afetadas).

**`db:push` bloqueado** pela permissão do modo automático ("Blind Apply").
Não contornado. Fica com o Gabriel: `npm run db:push`, depois `npm run
types:gen`. T5 (fronteira de dados) depende dos tipos gerados.

Ruling (do agente, aceito): todos os triggers novos são `security invoker`,
inclusive `calendar_events_members`, que a spec dizia definer. É o mesmo
raciocínio de `list_items_members` na Fase 4: um definer responderia "P é do
casal X?" para qualquer X. Custo se errado: nenhum.

Ruling (do agente, aceito): os triggers de integrante e de cidade só conferem o
valor NOVO (insert, ou coluna que mudou). `paint_one` corta estadias antigas
com `update` de datas, e isso não pode falhar porque o autor saiu do casal.
Custo se errado: nenhum.

Ruling (do agente, aceito): `cities_scope` também exige `state_code` e
`ibge_code` nulos na linha do casal. Sem isso, `cities_natural_key` viraria
uma colisão entre casais, e o erro revelaria que a linha invisível do outro
existe. Custo se errado: cidade estrangeira com UF é recusada; a região vai em
`region`.

Ruling (do agente, aceito): `paint_stays` exige a chave `to` presente (mesmo
nula). Pintar em aberto apaga o futuro, e não pode acontecer por campo
esquecido. Custo: a fronteira de dados (T5) sempre manda `to`.

Ruling (do agente, aceito): `paint_stays` não cobra o teto de 366 dias por
entrada. _Apagar período_ num trecho longo gera entrada maior, e a escrita
direta em `stays` já tem esse poder. Custo: nenhum novo.

Ruling (do agente, aceito): `paint_one` põe `created_by` = quem pinta também no
pedaço partido. O autor original pode ter saído do casal. Custo: autoria
informativa perdida na metade de depois.

Ruling (do agente, aceito): a trava do 💋 é consultiva por (casal, dia), e o
"futuro" usa `private.today_br() + 1`, como o `done_on` da Lista. Custo: nenhum.

Dívida: `profiles.home_city_id` e `couple_saved_cities.city_id` não conferem se
a cidade é de outro casal. Só afetaria a tela de quem aponta (a linha é
ilegível para ela), mas não é cobrado. Fora do escopo da Fase 5.

---

## T7 · Tela: mês, primeiro período, 💋, carga/erro, releitura

Concluído. Prova: `npx vitest run src/calendar src/domain`, 356 passando (40
novos: 21 em `CalendarScreen.test.tsx`, 19 em `MonthView.test.tsx`); typecheck e
lint limpos. Não visto no navegador ainda: a tela só é ligada à casca no T6,
que depende dos tipos gerados.

Antes de despachar, o orquestrador escreveu `src/calendar/api.ts` (a interface
`CalendarApi`, à mão): as telas começam contra ela enquanto a migration espera o
push. `calendarApi(db)` a liga no T5. Custo se errado: a implementação do T5 tem
de caber na interface, ou a interface muda e os fakes dos testes junto.

Contrato publicado para T8–T11 (`context.ts`): `CalendarContextValue` com api,
casal, pessoas por slot, estadias, eventos, itens da lista, cidades,
preferências, `kisses` (`null` = não lido), seleção do dia, mês visível, visão,
`reload()` que nunca rejeita, e o estado `modal` com os `open*`/`closeModal`.

Ruling (do agente, aceito): a opção "Juntos em outra cidade" do primeiro período
recebe um `renderCityPicker` opcional, e sem ele fica desabilitada ("Em breve").
Nenhum seletor falso para jogar fora; o T10 passa uma prop. Custo: nenhum.

Ruling (do agente, aceito): com um integrante só, a tela mostra o cabeçalho, a
mensagem e uma grade só com números (`BareMonthGrid`), em vez de deixar
`members` anulável para todo mundo. Custo se errado: o caso raro mostra menos
que "calendário sem faixas".

Ruling (do agente, aceito): chips de vários dias não contam no "até 2 chips"
da célula; cada um tem a própria linha na semana. Custo se errado: mudar o teto.

Ruling (do agente, aceito): o cartão de primeiro período não tem o × do frame.
Fechá-lo com zero estadias deixaria o casal sem entrada. Custo: nenhum.

Ruling (do agente, aceito): `kiss_future` diz "Esse dia ainda não chegou" (a
spec não tinha texto).

---
