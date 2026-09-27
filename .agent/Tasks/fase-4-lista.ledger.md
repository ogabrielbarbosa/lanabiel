# Ledger — Fase 4: Lista

> Registro do que foi decidido **durante a execução**. Spec:
> [`fase-4-lista.md`](./fase-4-lista.md).

---

## Forma da execução

Branch `fase-4-lista`. As tarefas são acopladas em cadeia (domínio → migration →
fronteira de dados → tela), então a paralelização é por onda, só onde os
arquivos são disjuntos:

- **Contrato compartilhado escrito pelo orquestrador antes de despachar**:
  `src/domain/list.ts` (tipos e constantes) e `src/domain/listValidationCases.ts`
  (a fixture de A2). Isso destrava T2 e T3 em paralelo sem um esperar o outro.
- **`db:push` no online só depois de o orquestrador revisar o SQL.** O agente da
  migration para no `--dry-run`. Aplicar schema no projeto de produção é efeito
  fora da worktree.

Ruling: a fixture de validação é expressa em `ItemDraft` (camelCase, domínio), e
o lado do banco a converte por `src/data/listRow.ts` (`draftToInsert`) — o mesmo
mapeador que a fronteira de dados usa. Custo se eu estiver errado: um bug de
mapeamento apareceria nos dois testes ao mesmo tempo, em vez de ser mascarado
por um mapeador só de teste.

---
## T2 · Contrato de domínio

Concluído. Prova: `src/domain/list.test.ts`, 131 passando; typecheck e lint limpos.
Revisão de conformidade: todos os `VALIDATION_CASES` batem com o `failsOn`; A3 e
A4 cobertos; R9 com tabela de corpos por (mídia × geográfico) × status × quem.

Ruling: o corpo do estado vazio começa pelo nome ("Gabriel ainda não marcou…"),
sem o artigo "O" do frame — artigo por pessoa seria inferir gênero pelo nome.
Custo se errado: uma palavra de copy.

Ruling: `whereWeAre` devolve `unknown` quando o casal não tem exatamente dois
integrantes (a derivação precisa do par). Custo: nenhum — casal de um só não
chega a `ready`.

Dívida (resolvida na tela, T6): `relativeAge` recebe `YYYY-MM-DD`; para
`created_at` (timestamptz) a tela precisa converter para a data **local** antes
(`lib/date.ts`), senão um item criado às 22h em SJC conta como "amanhã" em UTC.

---

## T3 · Migration da Lista

Escrita e provada **fora do online**: o agente rodou todas as migrations num
container descartável (`supabase/postgres:17.6.1.171`) e passou os 43
`VALIDATION_CASES` por `draftToInsert` (43/43), além de `mark_item_done` (feliz,
`already_done`, `not_found`, rollback, data futura, `solo` inválido, sem sessão),
a 11ª foto, caminhos de outro casal, memória alheia e cascade. Revisão do
orquestrador: SQL lido linha a linha; aprovado.

Ruling (do agente, aceito): `list_items_members` é `security invoker`, contra a
instrução de definer. Trigger BEFORE roda antes do `with check` da RLS; um
definer responderia "P é do casal X?" para qualquer X. Com invoker, casal alheio
é invisível e a resposta é sempre "não". Custo se errado: nenhum — o
service_role não passa por RLS, e o próprio casal enxerga os seus integrantes.

Ruling: `list_photos` sem `updated_at` (a spec dizia "nas três", mas o DDL e o
domínio não têm a coluna; foto não se edita, sai e entra outra). Custo: nenhum.

Ruling: as recusas de trigger saem com o nome da regra também no HINT
(`list_items_member`, `list_items_done_on_future`, `list_photos_limit`), porque o
PostgREST devolve o HINT e não o `constraint` do RAISE — mesma lição da
`review_fixes` da Fase 3.

**Bloqueio:** o `db:push` foi negado ao orquestrador pelo classificador de
permissões (aplicar schema em produção pede aprovação humana). Aguardando o
Gabriel rodar `npm run db:push`. Enquanto isso, T4/T5 seguem com tipos de linha
locais (`TODO(T4-types)`), e `test:db` fica para depois do push.

Desbloqueado: o Gabriel rodou `npm run db:push` (só `20260926140000_list.sql`,
aplicada). `types:gen` + typecheck limpos. Prova no online:
`npm run test:db -- list storage onboarding` → **3 arquivos, 138 testes
passando** (A1, A2 com os 43 casos, A5–A10, Storage de `item/` e `memory/`,
A20 das doze `security definer` intacto).

---

## T10 · Configurações e export (R26, R27)

Concluído. Prova: `vitest run src/data/export.test.ts src/settings` verde (export
47 → settings 43 após a correção), lint limpo. Uma rodada de correção: o chip de
_Categorias visíveis_ tinha "Países · 7" em texto único; o frame `MrIGB` (lido
pelo orquestrador no Pencil) mostra nome e selo de contagem separados, e o
subtítulo da aba com o total ("Como os 86 itens aparecem…").

Ruling: a contagem da lista é lida **fora** de `loadSettings` e a falha dela
mostra **—**, não derruba a tela. É número de resumo, não valor editável — a
regra "nunca renderizar padrão no lugar de dado não lido" é sobre controle que
grava. Custo se errado: um — na tela quando o banco falha só nessa leitura.

Ruling: `select('category')` paginado de 1000 em 1000, não `count` com `head:
true` (que a spec citava). Dá o total e as oito contagens numa ida, e a
paginação evita que o `max-rows` do PostgREST corte o total em silêncio. Custo:
lê uma coluna por item — irrelevante até dezenas de milhares.

Ruling: o export leva o `id` do item (liga memórias e contagem de fotos ao
item); ids de perfil e `couple_id` ficam fora, com teste que varre o JSON por
UUIDs. A foto do item vai como `has_photo`, nunca caminho. Custo: nenhum.

Ruling: com um item só, "Como o 1 item aparece…" (o frame não mostra o caso).

---

## T4 + T5 · Fronteira de dados, Photon, `ListApi` e casca

Concluído. Prova: `vitest run src/data/places.test.ts src/data/list.test.ts
src/app` → 65 passando; suíte inteira 363; typecheck, lint e **build** limpos.
Depois do `types:gen`, o orquestrador trocou os tipos de linha locais pelos
gerados (`listRow.ts`) e removeu o `listDb` sem tipo de `list.ts`: typecheck,
lint e `src/data` (54) limpos.

Ruling: `removePhoto` apaga a **linha** antes do arquivo — a ordem inversa
deixaria a galeria dos dois apontando para arquivo inexistente; assim o pior
caso é arquivo órfão que ninguém vê (a mesma troca da capa, Fase 3). Custo:
órfãos, que vão com o agendador.

Ruling: busca de país (`mode: 'country'`) **não** cai no IBGE quando o Photon
falha — o IBGE não tem país, e uma cidade no lugar violaria `list_items_format`
em `pais`. Custo: sem Photon, país não entra; a tela diz que a busca está fora.

Ruling: argumentos da RPC vão com cast para `Functions['mark_item_done']['Args']`
— o gerador não marca argumento de função como anulável, e o SQL aceita null em
`p_solo_by`, `p_rating` e `p_memory`. Custo: um cast comentado; renomear
argumento ainda quebra o typecheck.

Ruling (do agente, conferido): a coordenada do Gramado no frame ("−29,37,
−50,88") não é o arredondamento real do OSM ("−29,38, −50,87"); o teste afirma
o real. Custo: nenhum — o frame é ilustração.

Não é pendência: o agente apontou que "a RPC não grava a nota". Em I7, "nota" é
a nota de corações (`rating`), que a RPC grava; o `note` (lembrete) não muda ao
marcar feito.

Pendência para T7: não há "remover foto do item sem trocar". Resolver no modal
se o design pedir.

---

## T6 + T9 · Tela da Lista e painel

Concluído. Prova: `src/list` 33 + `src/lib` 12; suíte 399; typecheck, lint e
build limpos. Os três sobrepostos entram como stubs com props definitivas
(`AddItemModal`, `ItemSheet`, `MarkDoneModal`) e `useList()` como contexto. A
dívida do T2 (data local de `created_at`) foi paga com `localDateOf` em
`lib/date.ts`, testado com `TZ=America/Sao_Paulo`.

Rodada de correção (orquestrador): o agente mostrava distância em km inteiros
("menos de 1 km", "1 km") porque `distanceKm` arredonda; o frame mostra
"1,2 km". Criei `distanceKmExact` em `domain/onboarding.ts` (o `distanceKm`
passou a arredondá-la — nenhum chamador antigo muda) e `formatDistance` em
`domain/list.ts` (uma casa abaixo de 10 km, "menos de 100 m" colado); `nearby`
passa a medir sem arredondar. `domain` + `list` 235 passando, build limpo.

Ruling (do agente, aceito): o resumo do filtro diz "só Gabriel", não "do
Gabriel" — é o que o filtro faz (feito só por ele) e não infere gênero.

Ruling (do agente, aceito): se `loadCitiesByIds` falha, a leitura inteira falha
— mostrar "Sem registro" afirmaria o que não se sabe (I9). Custo: uma falha a
mais possível na abertura.

Ruling (do agente, aceito): tokens `cat-*` do `.pen` declarados em `list.css`
(não existiam em `app.css`), no mesmo formato `:root[data-theme]`. Custo: se
outra fase precisar das cores de categoria, move ~20 linhas para `app.css`.

Pendente para a verificação: nenhum screenshot contra o frame — o dev server
exige login com conta real. Fica para o A21 (manual) e para o verify.

---

## T8 · Detalhe do item e Marcar como feito

Concluído. Prova: `ItemSheet.test.tsx` (24) + `MarkDoneModal.test.tsx` (15);
suíte 444; typecheck, lint e build limpos. Correção do orquestrador: o agente
criou `src/list/dates.ts` com `parseISODate(...).getDay()` — `Date` fora de
`lib/date.ts`, contra o CLAUDE.md. As duas funções (`dayMonthYear`,
`weekdayDayMonthYear`) foram movidas para `lib/date.ts`; `src/list` + `src/lib`
116 passando, typecheck limpo.

Ruling (do agente, aceito): tocar o coração igual à nota atual limpa a nota
(`setRating(null)`) — sem isso não há como desfazer uma nota. Custo: um toque
acidental apaga a nota (o valor na tela mostra na hora).

Ruling (do agente, aceito): salvar a própria memória vazia = `deleteMemory`, e
_Escrever a minha_ volta. Custo: nenhum — memória vazia é recusada pelo CHECK.

Ruling (do agente, aceito): `already_done` troca o conteúdo do modal pelo aviso
com o nome da outra pessoa; Fechar chama `onDone()` (fecha e relê). As props do
contrato não permitiam levar o aviso para fora do modal.

Ruling (do agente, aceito): legenda "{meu nome} escrevendo · {outro nome} pode
completar", sem o artigo "a" do frame — mesmo ruling do T2 sobre gênero.

Ruling (do agente, aceito): o nome do item vai no título acessível do
`ListDialog`, acima da foto; no frame ele vem abaixo. Custo: diferença visual
pequena, conferir no verify.

---

## T7 · Modal de adicionar/editar

Concluído. Prova: `AddItemModal.test.tsx` 32; depois de T7 + T8 e da mudança do
orquestrador em `lib/date.ts`: suíte **476**, typecheck, lint e build limpos.

Ruling (do agente, aceito): quando o item grava e a foto falha, o modal NÃO
chama `onSaved` na hora (o pai fecharia e o aviso sumiria); mostra o aviso,
trava os campos (um segundo salvar duplicaria o item) e chama `onSaved` em
"Entendi"/Esc/×. Custo: um clique a mais no caso raro.

Ruling (do agente, aceito): em País, o frame não tem campo _Local_ separado —
o próprio _Nome_ é a busca de país (`mode: 'country'`), e escolher grava o nome
em português. Custo: um país com apelido ("Japão ✈️") exige editar o nome depois.

Ruling (do agente, aceito): trocar de categoria ao criar limpa lugar, região,
onde comer, cidades de interesse, plataforma e temporadas; mantém nome, link,
nota, ênfase e foto. Evita gravar campo de outro formato (o CHECK recusaria).

Ruling (do agente, aceito): o crédito "© OpenStreetMap" some no fallback do
IBGE — esses resultados não vêm do OSM.

---

## Fechamento · revisão ampla (`/code-review`, high) e rodada de correção

Dez achados; nove corrigidos numa rodada única, re-review escopada pelo
orquestrador. Prova depois da correção: suíte **489**, typecheck, lint e build
limpos.

- `loadList` sem paginação (corte silencioso de 1000 do PostgREST) → helper
  único `src/data/paginate.ts` (`selectAll`), usado por `loadList` e
  `listSummary`; o export passou a reaproveitar `loadList` (um leitor só).
- `deleteItem` com lista de fotos velha → relê os `path` do item no banco antes
  de apagar os arquivos; falha na leitura não apaga nada.
- `today` congelado na montagem → relido a cada leitura (inclusive ao voltar ao
  foco).
- `markDone` apagava as fotos em erro ambíguo → só apaga quando o erro prova que
  a transação não comitou (`code` do Postgres/PGRST, `already_done`,
  `not_found`); queda de conexão devolve _"A conexão caiu — confira se o item
  ficou marcado antes de tentar de novo"_ e mantém os arquivos.
- R10 com categorias todas ocultas → estado vazio com o aviso e link para
  _Configurações › Lista_.
- URLs assinadas expirando com a aba visível → releitura agendada 50 min depois
  de cada leitura bem-sucedida.
- `Date.now()` fora de `lib/date.ts` → contador em `useRef`; `ListApi.now`
  removido (ninguém usava).
- Comentário órfão removido.

Dívida (não corrigida, de propósito): cada releitura assina as URLs de TODAS as
fotos de memória, embora a grade só mostre as capas. Com 80 itens feitos × 10
fotos são ~880 URLs num lote. Corrigir mexe no contrato do contexto (assinar ao
abrir o detalhe); reabrir quando a releitura for medida lenta.

Ruling: se a releitura automática dos 50 min falhar, não há nova tentativa — a
tela mostra o aviso de desatualizada e relê no próximo foco ou escrita. Custo:
fotos quebradas até o próximo gesto, com o aviso na tela explicando.

---

## Verificação (Gate 3)

typecheck ✅ · lint ✅ · `npm run test` ✅ **489** (22 arquivos) · `npm run build`
✅ · `npm run test:db` (online, suíte inteira) ✅ **203 passando, 4 pulados** (os
A17/A18 do Mailpit, Fase 2 — `skipIf(!MAILPIT_URL)`, como antes).

| Aceite | Veredito | Prova |
| --- | --- | --- |
| A1 paridade categorias/limites | ✅ | `supabase/tests/list.test.ts` "A1 — paridade…" + `src/domain/list.test.ts` |
| A2 validação nos dois lados | ✅ | `list.test.ts` (db) "A2 — os VALIDATION_CASES…" + `domain/list.test.ts` "validateItem — a fixture…" |
| A3 funções puras | ✅ | `src/domain/list.test.ts` (secondaryLine, applyFilters, sortItems, progress, relativeAge) |
| A4 onde estamos / sugestão | ✅ | `domain/list.test.ts` "whereWeAre (I9, A4)", "nearby, suggestionPool…" |
| A5 isolamento por casal | ✅ | `list.test.ts` (db) "A5 — isolamento por casal…" |
| A6 memória: cada um a sua | ✅ | `list.test.ts` (db) "A6 — memória…" |
| A7 fotos ≤ 10, pasta do casal | ✅ | `list.test.ts` (db) "A7 — fotos…" + `storage.test.ts` "A7 (Fase 4)…" |
| A8 `mark_item_done` | ✅ | `list.test.ts` (db) "A8 — mark_item_done" |
| A9 casal imutável, cascade | ✅ | `list.test.ts` (db) "A9 — …" |
| A10 doze `security definer`, RPC invoker | ✅ | `list.test.ts` "A10 — …" + `onboarding.test.ts` "A20 — a lista fechada…" |
| A11 Photon → GeoPlace, fallback, abort | ✅ | `src/data/places.test.ts` (fixtures reais gravadas) |
| A12 leitura: esqueleto/erro/vazio | ✅ | `src/list/ListScreen.test.tsx` "A12 — …" |
| A13 chips, filtros, estado sem resultado | ✅ | `ListScreen.test.tsx` "A13 — …" |
| A14 modal por categoria, busca | ✅ | `src/list/AddItemModal.test.tsx` "A14 — …" (3 blocos) |
| A15 marcar como feito | ✅ | `src/list/MarkDoneModal.test.tsx` "A15 — …" |
| A16 detalhe | ✅ | `src/list/ItemSheet.test.tsx` "A16 — …" (5 blocos) |
| A17 painel por estado do casal | ✅ | `src/list/ListPanel.test.tsx` "A17 — …" |
| A18 releitura ao voltar ao foco | ✅ | `ListScreen.test.tsx` "A18 — releitura…" |
| A19 casca e `/lista` | ✅ | `src/app/Shell.test.tsx`, `router.test.ts` "A19 — /lista" |
| A20 Configurações e export v2 | ✅ | `Settings.test.tsx` "A20 (Fase 4) — …", `src/data/export.test.ts` |
| A21 fluxo real com duas contas | ⚠️ | **não verificado** — exige login com contas reais no online; o agente não entra com credencial. Roteiro na spec (seção 10) |
| A22 comandos limpos | ✅ | saídas acima |

**Não verificado:**
- A21 (acima).
- Visual contra os frames (medidas, cores nos dois temas): não houve
  screenshot — o dev server exige login. Nenhum hex literal nas regras de
  `list.css` (só nas definições dos tokens `cat-*`).
- Photon no navegador: o CORS (`Access-Control-Allow-Origin: *`) foi provado
  por `curl` com `Origin`, não por uma busca real no app.
- A corrida real de duas pessoas subindo fotos ao mesmo tempo: a trava
  `for no key update` existe e o limite foi testado em série; a concorrência
  não foi exercitada.
