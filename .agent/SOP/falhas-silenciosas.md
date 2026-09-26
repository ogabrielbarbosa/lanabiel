# `vite-react-ts` + Supabase — o que quebra em silêncio

Falhas desta stack que **não** dão erro de compilação nem de lint: só aparecem em
runtime, em produção, ou no cliente que tem muitos dados.

É desta lista que nascem os primeiros `.devkit/checks/` — mas escreva o check só
depois que a falha acontecer **neste** projeto. Check preventivo contra bug
hipotético é ruído; check contra bug que já custou um dia é gate.

Formato por item: **sintoma** (o que a pessoa vê) · **causa** (o mecanismo) ·
**por que nada acusa**.

---

## 1. RLS devolve lista vazia, não erro

**Sintoma.** O app abre com o calendário limpo. O casal conclui que perdeu a
história.

**Causa.** Duas situações diferentes produzem o mesmo resultado: sessão ausente
ou expirada (a policy não casa, o `select` devolve zero linhas) e projeto pausado
por inatividade no free tier (o fetch falha). Nenhuma das duas é "não há dado".

**Por que nada acusa.** `select` sem permissão **não é erro** em Postgres com
RLS — é conjunto vazio. Uma função com assinatura `Promise<Stay[]>` devolve `[]`
nos três casos e o tipo está correto em todos.

**Como este projeto se defende.** `src/data/result.ts`: resultado discriminado,
com `rows` existindo só em `ok`. Provado em `supabase/tests/rls.test.ts`, que
testa os dois lados do par — sem sessão dá `unauthenticated`, e casal
autenticado sem estadia dá `ok` com lista vazia.

---

## 2. Os dois "fins efetivos" trocados

**Sintoma.** A barra de uma estadia em aberto desaparece de todo dia futuro no
calendário. Ou, na outra direção, o contador diz "104 dias juntos" contando dias
que ainda não aconteceram.

**Causa.** `ends_on` nulo significa "em aberto", e há duas perguntas diferentes
sobre ele. Para **contar** dias vividos, o fim efetivo é `min(ends_on ?? hoje,
hoje)`. Para **desenhar**, é `ends_on ?? fim da janela visível`. O código antigo
(`stayOnDay` em `timeline/together.ts`) tinha só a primeira e a usava para as
duas coisas.

**Por que nada acusa.** As duas devolvem `string`. Trocar uma pela outra
typecheck a, lint a, e produz um número plausível ou uma barra que só não
aparece.

**Como este projeto se defende.** `effectiveEndForCounting` e
`effectiveEndForDisplay` em `src/domain/coupleState.ts`, com teste separado para
cada uma.

---

## 3. Cidade como texto livre

**Sintoma.** Os dois estão em São José dos Campos e o app diz `Separados`.

**Causa.** "SJC" e "São José dos Campos" são strings diferentes. A derivação
compara identidade de cidade.

**Por que nada acusa.** Comparar duas strings diferentes é uma operação
perfeitamente válida que devolve `false`.

**Como este projeto se defende.** `stays.city_id` é FK para `cities`, que tem
`unique (name, state_code, country_code)`. Cidade não é digitada em `stays`.

---

## 4. Migration aplicada por fora registra `version` diferente do nome do arquivo

**Sintoma.** `supabase db push` decide que as migrations nunca foram aplicadas e
tenta recriar as tabelas, falhando com "already exists". Ou, pior, alguém
"conserta" apagando o que existe.

**Causa.** Aplicar migration pela API/MCP grava em
`supabase_migrations.schema_migrations` um `version` com o timestamp **do
momento da aplicação**, e põe o nome do arquivo inteiro no campo `name`. A CLI
espera `version` = o prefixo do nome do arquivo e `name` = o resto. Aconteceu
aqui em 2026-09-25: cinco arquivos `20260925120*` viraram versões
`20260926023*`. Corrigido por `update` na tabela de histórico.

**Por que nada acusa.** Tudo aplica, tudo funciona, o banco fica correto. A
divergência é só na contabilidade, e só aparece na primeira vez que alguém usa a
CLI.

**Sem check ainda.** `DEVKIT_CMD_MIGRATE_CHECK` roda `npm run db:reset`, que
prova que os arquivos aplicam **no banco local** e não vê o remoto. O check de
verdade é `supabase migration list`, que mostra as colunas Local e Remote lado a
lado — e exige a CLI linkada ao projeto, o que precisa de token de acesso. Até
lá: **ao aplicar migration por MCP, confira
`select version, name from supabase_migrations.schema_migrations` depois.**
