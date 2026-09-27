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

## Onda 3 · T8+T9 e T10+T11 em paralelo

Despachadas juntas enquanto o `db:push` espera o Gabriel: nenhuma das quatro
depende do banco (testam contra `CalendarApi` falsa).

Ruling: os modais (T10+T11) ganham um CSS próprio, `src/calendar/modals.css`,
em vez de uma seção de `calendar.css`. É uma exceção à convenção "um CSS por
feature", para duas frentes paralelas não editarem o mesmo arquivo ao mesmo
tempo. Custo se errado: dois arquivos de estilo na feature; fundir depois é
concatenar.

---

## Push e prova no online

O Gabriel aplicou as duas migrations (`npm run db:push`, 2026-09-26); um
segundo push confirmou "Remote database is up to date". `npm run types:gen`
regenerou os tipos (tabelas e RPCs novas presentes; typecheck limpo).

Prova: `supabase/tests/calendar.test.ts` + `onboarding.test.ts` contra o online,
130/130 passando (A1–A3 lado banco, A7–A11, a lista das doze `security
definer` intacta).

Nota: um disparo do hook `Stop` pegou `database.types.ts` truncado — o
`types:gen` escreve com `>`, que zera o arquivo antes de preencher, e o hook
rodou nesse meio. Rodado de novo, typecheck limpo. Não é bug do código; é
corrida entre o hook e a geração.

---

## T8 + T9 · Ano e painel

Concluído. Prova: `npx vitest run src/calendar src/domain`, 377 passando (7 em
`YearView.test.tsx`, 14 em `CalendarPanel.test.tsx`); typecheck e lint limpos
nos arquivos deles. Não visto no navegador (T6).

Ruling (do agente, aceito): o Ano reusa a legenda do Mês (`CalendarLegend`
exportado de `MonthView.tsx`) em vez de copiar. Custo: nenhum.

Ruling (do agente, aceito): o realce da linha no Ano segue o mês de hoje; o
atalho _Ano_ do resumo some na visão Ano; "Resumo de {mês}" só leva o ano quando
difere do de hoje. Custo: só visual.

**Dívida para o fechamento** (duas trocas por TEXTO que dependem da frase do
domínio): o painel troca "Juntos em {nome inteiro}" pelo nome curto
compondo a string, e escolhe o ícone do contador pelo final do rótulo ("começa
em"). O certo é o domínio: `nowSummary` usar `shortCityName` no título e
`Countdown` ganhar `kind: 'trip' | 'home' | 'meet'`. Custo enquanto não
corrigir: se a frase do domínio mudar, o título volta ao nome inteiro e o ícone
erra, sem quebrar nada.

Aberto para o fechamento: um evento de vários dias que cobre o dia selecionado
aparece em "Eventos do dia" antes dos que começam no próprio dia (a ordenação é
por dia de início). Decidir olhando o frame.

---

## T5 · Fronteira de dados

Concluído. Prova: `npx vitest run src` inteiro, 720 passando no fim da T5 (38
novos em `src/data/calendar.test.ts`, 13 em `worldCities.test.ts`, 4 A12 em
`places.test.ts`); typecheck e lint limpos. As fixtures gravadas do Photon já
traziam `osm_type`/`osm_id`: nada inventado.

Ruling (do agente, aceito): 42501 numa RPC ou leitura é `unauthenticated`; numa
escrita direta, com a sessão já conferida, é o `with check` recusando, então
`not_member` ("recarregue"). A mesma leitura da Lista. Custo se errado: token
anônimo em escrita direta mostraria "recarregue" em vez do Login.

Ruling (do agente, aceito): `updateEvent` que muda zero linhas devolve `error`
("Este evento não existe mais — recarregue"), nunca `ok`. `paint([])` é `ok` sem
chamar o banco. `loadCalCities` é função nova (estender `City` quebraria as
fixtures da Lista e das Configurações).

Dívida: `insertStay` continua em `stays.ts`, porque `supabase/tests/rls.test.ts`
e `constraints.test.ts` ainda o importam. Sai quando eles passarem a gravar por
`paint_stays`.

## T10 + T11 · Seletor de cidade, período e evento

Concluído. Prova: 415 passando em `src/calendar src/domain` (7 CityPicker, 12
PeriodModal, 19 EventModal); build limpo. O `EventModal` monta fora da tela
(`loadModalEnv(api)` + `mode` + `onSaved`), para a Lista (R23).

Correção do orquestrador: o rótulo "casa da {nome}" presumia o gênero pelo nome
("casa da Gabriel"). Virou "casa de {nome}", neutro, na tela, nos testes e na
spec. O frame diz "casa da Lana"; a diferença é deliberada.

Ruling (do agente, aceito): casas iguais → 2 cartões (R13), não 3 (o A17 dizia 3
e contradizia o R13). A17 corrigido na leitura: vale o R13.

Ruling (do agente, aceito): o valor do seletor é `CalCity | { kind: 'world',
candidate }`; a prévia usa um id provisório `world:{osmRef}`, e
`ensureWorldCity` só roda ao salvar (período, evento e primeiro período). Custo
se errado: escolher de novo pelo Photon uma Lisboa já gravada não mostra na
prévia a fusão com a estadia vizinha; o banco deduplica igual.

Ruling (do agente, aceito): editar um trecho `unknown` vira Novo período no
primeiro dia dele (senão `entriesForEdit` mandaria esses dias "para casa").
Novo evento abre em Visita, como o frame. Confirmações de apagar ficam no
rodapé, não num segundo diálogo.

## T6 · Casca ligada, timeline apagada

Feito pelo orquestrador. `App.tsx` monta `calendarApi(supabase)` e remove a
chave `lanabiel:stays:v1` na carga; `Shell` recebe `calendarApi` e renderiza o
`CalendarScreen` em `/`; `src/timeline/` apagada (14 arquivos); o CSS
`.shell-main--legacy` saiu; `Shell.test.tsx` agora espera "Setembro 2026".

Prova (árvore inteira, depois de T5–T11): typecheck e lint limpos; `npx vitest
run src` 32 arquivos, 758 passando; `npm run build` limpo; `test ! -d
src/timeline`.

Pendente: o botão global _Adicionar_ (R1) e o `index.css` global, que ainda tem
tokens da timeline (só `--danger` é usado fora dele). Os dois ficam para a
passada no navegador.

---

## Dívida do painel paga (orquestrador)

`nowSummary` usa a cidade curta no título ("Juntos em SJC há 4 dias", como o
frame) e no "Em {cidade} desde"; `Countdown` ganhou `kind: 'trip' | 'home' |
'meet'`. O painel parou de trocar texto e de adivinhar o ícone pelo fim do
rótulo. Prova: 415 passando em `src/domain src/calendar`.

## T12 · Lista (Agendar) e export v3

Concluído. Prova: `npx vitest run src` 768 passando no fim da T12; typecheck,
lint e build limpos.

Ruling (do agente, aceito): a Lista recebe a `CalendarApi` por um campo novo
`calendar` na `ListApi` (o `listApi(db)` monta `calendarApi(db)`). Não mexe no
`Shell`, no `App` nem nas props do `ListScreen`. Custo: nenhum.

Ruling (do agente, aceito): o `EventModal` do _Agendar_ entra NO LUGAR do
detalhe, não por cima: os dois diálogos escutam Esc no `document`, e empilhados
um Esc fecharia os dois. Fechar volta ao detalhe, e salvar volta com "Agendado
para {d mmm}" no rodapé do detalhe. Custo se errado: empilhar exige tratar o Esc
do `CalDialog`.

Ruling (do agente, aceito): o evento sai no export sem o próprio `id`, e o
vínculo vai como o NOME do item. Evento cuja cidade ou item não é achado
derruba o export com a causa, como as estadias. Custo: um import futuro não
deduplica evento por id.

Ajuste da checagem de I12: o 💋 também é lido por `src/settings/api.ts` e
`exportAll.ts`, porque o export sai pelas Configurações. Nenhum dos dois mostra o
número na tela. O `grep` do fechamento aceita esses dois caminhos.

## R1 · O _Adicionar_ da barra (orquestrador)

`src/app/addIntent.ts`: a barra registra o pedido (`requestAdd`) e navega; a tela
de destino o consome com `useAddIntent` quando já tem os dados lidos, e consumir
apaga. O botão (`NVoXy`: 44px, gradiente 135° `#7FD8C4 → #F4A3B4`, ícone
`#08102A`) abre um menu com _Novo evento_ e _Item na lista_, fechável por Esc ou
clique fora. Prova: 3 testes novos em `Shell.test.tsx`; `npx vitest run src`
771 passando; typecheck, lint e build limpos.

Ruling: o pedido é um valor em memória, não um parâmetro na URL. O ADR 0013 põe
estado de tela fora do caminho enquanto não houver biblioteca de rotas. Custo se
errado: recarregar a página no meio do pedido perde o pedido (a pessoa toca de
novo).

---

## Revisão de código (`/code-review high`, branch inteira)

Seis achados. Corrigidos: o _Adicionar_ usava as cores do tema escuro chumbadas
(agora `--accent-gradient` / `--on-accent`); `loadModalEnv` não carregava as
cidades dos eventos (editar uma viagem pela Lista abriria o Destino vazio).
Refutado por teste: "o segundo pedido igual do _Adicionar_ não reabre" — o
`useSyncExternalStore` relê a cada render, e abrir o modal re-renderiza; o
teste que pede duas vezes passa com e sem a mudança, e ficou como regressão.
Justificados sem mudança: re-assinar os avatares a cada foco (as URLs expiram
em 1 h, e isso as mantém válidas); "hoje" congelado até a próxima releitura (o
mesmo trade do ADR 0015); `insertStay` fica, porque `rls.test.ts` e
`constraints.test.ts` testam a RLS da escrita direta que a policy `for all`
ainda permite.

## Revisão de conformidade com o `.pen` (sem navegador)

O Gabriel pediu para não depender do navegador: a prova foi comparar código e
`.pen` pelo MCP do Pencil. Um revisor só-leitura apontou 29 divergências (3
altas: dias passados esmaecidos, Separados com opacidade reduzida, célula de
hoje). Outro agente aplicou, lendo cada valor no `.pen` antes de mudar; onde o
`.pen` e o revisor discordaram, valeu o `.pen` (ícone das setas é 16 nas
instâncias; o Mês não esmaece o futuro no frame, mas R6 pede, então `--planned`
0.45 fica e o Ano usa 0.5). Prova: 774 passando, typecheck, lint e build limpos.
**A fidelidade visual não foi vista renderizada**; é conferência de valores.

Ruling (do agente, aceito): o 💋 some da célula com zero (o frame desliga o
emoji e só mostra o número rosa), com _+1_ ao passar o mouse; o nome acessível
continua "💋 {n} em {dia}".

Ruling (do agente, aceito): a distância de 12 px entre o painel e a barra vale
só no Calendário (`.shell:has(.cal)` em `calendar.css`); as outras telas mantêm
16. Custo: uma regra da casca morando no CSS da feature.

Ruling (do agente, aceito): o branco do coração virou o token `--on-heart` no
bloco de tokens de `calendar.css`, para nenhuma cor ficar fora de token.

Limpeza: `src/lib/date.ts` perdeu `WEEKDAYS_PT`, `monthLabel`, `formatDateBR`,
`GridDay` e `buildMonthGrid`, que só a timeline usava.

---
