# Ledger — `fase-0-fundacao`

> Registro do que foi decidido **durante a execução**. É ADR de baixo custo: o
> ruling que se mostrar estrutural é promovido a `/adr`.

---

## T1 · Ferramental de prova

Concluído. Prova: `.devkit/profile.sh` com `DEVKIT_CMD_TEST="npm run test"`, e
`npm run typecheck` limpo com `strict: true` ligado.

Ruling: **`strict: true` nos dois tsconfigs** — estava ausente, então
`strictNullChecks` estava desligado e `null` era atribuível a `string`. Sem
isso, `ends_on: string | null` (ADR 0002) e o resultado discriminado do R9 não
seriam cobrados por nada: o contrato existiria no papel e não no compilador.
Custo se eu estiver errado: nenhum — o `typecheck` passou limpo de primeira nas
1114 linhas existentes, então não houve dívida a pagar. Reversível apagando duas
linhas.

Ruling: **testes de domínio no gate, integração fora** — `npm run test` roda só
`src` (puro, sem rede nem Docker) e entra no hook `Stop`; `npm run test:db` roda
`supabase/tests` e é cobrado no Gate 3. Mesmo raciocínio que o `CLAUDE.md` já
aplica ao build: comando lento e dependente de ambiente dentro do hook falha
quando o Docker está parado, e gate que acusa o ambiente errado é gate que se
aprende a ignorar. Custo se eu estiver errado: RLS fica provada só no Gate 3 em
vez de a cada Stop — e o Gate 3 é obrigatório, então o risco é atraso, não
lacuna.

Ruling: **`DEVKIT_CMD_MIGRATE_CHECK="npm run db:reset"`**, que só dispara quando
um arquivo em `supabase/migrations/` muda. É a única prova de que o SQL no disco
aplica de verdade. Exige Docker; se ele estiver parado, o check **falha** em vez
de passar. Custo se eu estiver errado: alguns segundos a mais nos Stops em que
mexo em migração, contra a alternativa de um arquivo no disco que nunca rodou e
não acusa nada — que é literalmente a falha que o hook documenta.

Dívida: `DEVKIT_CMD_FORMAT_FILE` continua vazio (sem formatter). Não foi tocado
nesta fase.

---

## T2 · Supabase local e captura do estado anterior

Concluído. Prova: `supabase/config.toml` criado por `supabase init`; as quatro
migrations anteriores localizadas em `supabase_migrations.schema_migrations` e
documentadas em `supabase/baseline/README.md`.

Ruling: **não copiar o schema anterior para um arquivo.** A spec previa "a
primeira migration captura o estado atual antes de qualquer drop". Ao ir buscar,
descobri que o estado já está preservado: o Supabase guarda o SQL completo de
cada migration em `supabase_migrations.schema_migrations`, que vive em outro
schema e **não é afetada** pelo drop das tabelas de `public`. Então
`supabase/baseline/README.md` registra onde está e como ler, em vez de criar uma
segunda cópia de 11 mil caracteres que envelhece sozinha. Custo se eu estiver
errado: se alguém apagar o projeto inteiro no painel, o baseline vai com ele —
mas nesse cenário um arquivo no repo também não reconstruiria os dados, e dados
não há (zero linhas).

Ruling: **manter `my_couple_ids() returns setof uuid` em vez da
`is_couple_member(uuid) returns boolean` que a spec esboçou.** Duas razões, e
nenhuma é gosto: a forma `couple_id in (select public.my_couple_ids())` é
avaliada uma vez pelo planner (InitPlan), enquanto `is_couple_member(couple_id)`
roda por linha; e a função já existia aqui, com os grants já trancados. A
migration `00004_performance_lints` do schema anterior existe precisamente
porque o advisor do Supabase apontou essa classe de problema. Custo se eu
estiver errado: nenhum estrutural — as duas expressam a mesma regra, e trocar é
reescrever as policies, não migrar dado. A seção 5 da spec foi corrigida.

Ruling: **trazer três padrões do schema anterior para o novo**, em vez de
redescobri-los: `revoke execute ... from public, anon` em toda função
`security definer` (o Postgres concede `EXECUTE` a `PUBLIC` por padrão — sem o
revoke, a função é chamável por `anon`); `(select auth.uid())` dentro das
policies; e índice em **toda** coluna de FK. Os três vieram das migrations 3 e 4
do schema antigo, que foram escritas depois de o advisor reclamar. Custo se eu
estiver errado: nenhum — são endurecimentos sem contrapartida funcional.

Dívida: `join_couple(code)` do schema antigo já resolvia a busca por código de
convite com `security definer` e já cobrava o máximo de dois membros (I8). Não
foi portada nesta fase porque o fluxo de convite é da Fase 2 — mas ela é o ponto
de partida de lá, não folha em branco. Anotado em `supabase/baseline/README.md`.

---

## T3 · Migrations do schema e das policies

Concluído. Prova: `npm run db:reset` aplicando as cinco migrations em ordem, sem
intervenção; `npm run test:db` com 13 testes passando.

Ruling: **`couple_members.slot smallint check (slot in (1,2))` +
`unique (couple_id, slot)`** para cobrar I8, em vez de trigger contando linhas.
Um trigger precisaria consultar `couple_members` de dentro de si, e com RLS
ativa a contagem viria filtrada — o que o faria nunca disparar; a saída seria
`security definer`, ou seja, uma segunda porta que não passa por RLS só para
contar até dois. O par check+unique cobra o mesmo limite de forma declarativa. De
quebra, `slot` é a faixa fixa de cada pessoa no calendário, que hoje está
chumbada no componente. Custo se eu estiver errado: se um dia o app precisar de
mais de dois integrantes, é migration — mas aí a derivação inteira muda também,
então a restrição não é o que estaria no caminho.

Ruling: **o bucket `mementos` do schema antigo não é removido.** O Supabase
bloqueia DML direto em `storage.objects`/`storage.buckets` ("Direct deletion from
storage tables is not allowed") e removê-lo exigiria a Storage API de dentro de
uma migration. As três policies dele foram derrubadas, então ninguém alcança
nada lá dentro; o bucket fica vazio e privado. Custo se eu estiver errado:
nenhum — é um bucket órfão sem policy. A Fase 4 define os buckets que vai usar.

Dívida: nenhuma migration cria os perfis reais de vocês dois, porque
`profiles.id` referencia `auth.users` e as contas ainda não existem. O histórico
de estadias segue só como fixture de teste até a Fase 1 ter login. Ver T5.

---

## T4 · Tipos gerados

Concluído. Prova: `src/lib/database.types.ts` (268 linhas) com
`"ends_on": string | null` e `"home_city_id": string` — o contrato do ADR 0002
passou a ser cobrado pelo compilador, não pela boa vontade de quem escreve.

Ruling: **o teste de I1 é feito contra o arquivo gerado, não contra o
`information_schema`.** O arquivo é gerado do schema, então afirmar sobre ele é
afirmar sobre o banco — e sem precisar de banco de pé, o que põe a prova de I1
na suíte rápida do gate em vez da lenta. Custo se eu estiver errado: se alguém
alterar o schema e não rodar `types:gen`, o teste afirma sobre o passado. Mitigado
por `DEVKIT_CMD_MIGRATE_CHECK`, que roda `db:reset` quando uma migration muda, e
por A12.

Ruling: **o teste importa o gerado com `?raw`, não com `node:fs`.** O arquivo
vive sob `src`, tipado como código de navegador (`types: ["vite/client"]`); trazer
os tipos do Node para o tsconfig da aplicação por causa de um teste poluiria o
que a aplicação enxerga. Custo se eu estiver errado: nenhum, `?raw` é do Vite e o
vitest usa o mesmo pipeline.

---

## T5 · Módulo de derivação

Concluído. Prova: `src/domain/coupleState.test.ts`, 21 testes passando. Setembro
de 2026 sobre o histórico real dá 21 juntos (11 em SJC, 10 em Marau), 4
separados, 0 desconhecidos nos 25 dias decorridos — números calculados por
script independente **antes** de existir código, para o teste não confirmar o
próprio erro.

Ruling: **`stayOn` trata `endsOn` nulo como ILIMITADO, não como "até hoje".** O
`stayOnDay` antigo capava em hoje, e isso fazia a estadia em aberto desaparecer
de todo dia futuro do calendário, sem erro nenhum. O corte em hoje é assunto de
contagem e virou função própria. Custo se eu estiver errado: nenhum — são duas
perguntas diferentes e agora têm duas funções, cada uma com teste. É a correção
de um bug real, não preferência.

Ruling: **existe um quinto estado, `unknown`**, para o dia em que ao menos um dos
dois não tem estadia. O design não o mostra porque os dados do Pencil cobrem
todos os dias; dados reais terão lacuna. Chamá-la de "Separados" faria a
contagem afirmar o que não se sabe. Custo se eu estiver errado: a interface
precisa de um tratamento visual que o design não tem — o que é informação a levar
para o Pencil, não dívida de código.

Ruling: **`hostProfileIds` é uma lista, não um id.** Vazia = viajando juntos; com
um = casa de alguém; com dois = moram juntos. Evita hardcodar "RS/SP" ou "casa do
Gabriel" como o schema anterior fazia, e sobrevive a eles mudarem de cidade.

---

## T6 · Camada de dados

Concluído. Prova: `supabase/tests/rls.test.ts`, incluindo o caso "sem login o
resultado é `unauthenticated`, nunca `{ ok, rows: [] }`".

Ruling: **resultado discriminado, com `rows` existindo só no caso `ok`.** Não é
estilo: com RLS, sessão ausente devolve zero linhas **sem erro**, e o projeto no
free tier pausa por inatividade devolvendo falha de rede. Uma função com
assinatura `Promise<Stay[]>` devolveria `[]` nos três casos, e o app abriria com
o calendário limpo — o casal concluindo que perdeu a história. O tipo é o que
impede o consumidor de tratar os três como um. Custo se eu estiver errado: mais
verboso no ponto de uso. Aceito.

Ruling: **a violação de `stays_no_overlap` é traduzida num caso nomeado
(`overlapping_stay`) na fronteira.** O erro do Postgres é opaco para quem lê a
tela; sem a tradução, a UI da Fase 5 só conseguiria dizer "algo deu errado".

---

## T7 · Testes de integração

Concluído. Prova: `npm run test:db`, 13 testes em 2 arquivos.

Ruling: **cada arquivo de teste monta o cenário com um prefixo próprio.** O
vitest roda arquivos em paralelo e `auth.users` é global: dois arquivos criando
`gabriel@test.local` ao mesmo tempo apagam o usuário um do outro no meio do
caminho — foi exatamente o que aconteceu na primeira execução. Prefixo por
arquivo preserva o paralelismo. Custo se eu estiver errado: nenhum.

Ruling: **`globalThis.WebSocket` preenchido com `ws`, em vez de
`realtime: { transport: ws }`.** Node 20 não tem `WebSocket` nativo e o cliente
de realtime exige um. Passar a opção muda a inferência do genérico de schema do
`createClient` e o cliente deixa de ser atribuível a `SupabaseClient<Database>` —
erro que eu só vi porque rodei `typecheck` depois. Custo se eu estiver errado:
nenhum; o navegador tem `WebSocket` nativo e `src/lib/supabase.ts` não é tocado.

Ruling: **o perfil é criado explicitamente, não por trigger.** O schema antigo
tinha `handle_new_user` criando o `profile` no cadastro. Isso é impossível agora:
`home_city_id` é `NOT NULL` e um trigger não tem cidade para pôr. Quem sabe a
cidade é o onboarding, então é ele que cria o perfil — e é a Fase 2. Custo se eu
estiver errado: um usuário criado pelo painel do Supabase fica sem perfil e o app
não sabe quem ele é; aceitável, porque criar usuário pelo painel não é fluxo do
produto.

---

## T8 · Aplicação no remoto e endurecimento

Concluído. Prova: cinco migrations aplicadas em `smdtcznadmnrdubeidyz`; cinco
tabelas com RLS ativa e as três cidades no lugar; advisor de segurança sem
nenhum achado de SQL.

Ruling: **os avisos dos advisors foram corrigidos numa migration NOVA (a 5ª), não
editando as anteriores.** As de cima já estavam aplicadas no remoto, e histórico
aplicado não se reescreve — vale a mesma regra dos ADRs.

Ruling: **`private.my_couple_ids()` em vez de `public.my_couple_ids()`.** Em
`public`, uma função é publicada como endpoint REST
(`/rest/v1/rpc/my_couple_ids`), e o advisor aponta isso. O `grant` para
`authenticated` é obrigatório — expressão de policy é avaliada com as permissões
de quem consulta — mas estar num schema exposto não é. Mover mantém as policies
funcionando, o que foi **verificado**: os 13 testes de integração passaram depois
da mudança. Custo se eu estiver errado: nenhum; é redução de superfície com
comportamento provado igual.

Ruling: **`btree_gist` movida de `public` para `extensions`.** Lint
`extension_in_public`. A restrição de exclusão sobrevive porque referencia a
opclass por OID; migrations futuras que criem `exclude using gist` dependem de
`extensions` estar no `search_path`, o que é o padrão do Supabase. Custo se eu
estiver errado: uma migration futura falha na hora de criar, de forma alta e
óbvia — não silenciosa.

Dívida: sobrou **um** aviso de segurança, `auth_leaked_password_protection`. Não
é SQL, é um toggle de Auth no painel (checagem contra HaveIBeenPwned). Pertence à
Fase 1, com o Login.

---

## T9 · Documentação

Concluído. Prova: `.agent/System/project_architecture.md` reescrito (descrevia o
esqueleto do template Vite) e `CLAUDE.md` atualizado — ele afirmava "não há test
runner" e descrevia `localStorage` como a verdade da persistência.

Ruling: **a Fase 0 é aditiva: `src/timeline/` e `localStorage` continuam de pé.**
A spec previa substituição. Duas razões mudaram isso: no momento da decisão
`src/timeline/` e `src/lib/` estavam **untracked**, então apagar seria perda
definitiva e não reversão; e manter a tela compilando é o que sustenta
`typecheck` e `lint` verdes (A14) sem construir interface nesta fase.

**Correção posterior:** a primeira razão caiu — o Gabriel commitou
`src/timeline/` e `src/lib/date.ts` durante a sessão (`5989254`, `f469d99`), então
aqueles arquivos são recuperáveis agora. A decisão continua valendo pela segunda
razão, que é a que importava. A remoção
acontece na Fase 5, quando o Calendário desenhado substituir a tela. A seção 5 da
spec foi corrigida para dizer isso. Custo se eu estiver errado: dois caminhos de
persistência convivendo por algumas fases, com o risco de alguém construir sobre
o antigo — mitigado por um aviso explícito no `CLAUDE.md`.

Dívida: `strict: true` foi ligado nos três tsconfigs e o `typecheck` passou
limpo, mas **nenhum dos arquivos em `src/timeline/` foi revisto** à luz disso.
Eles passam; não foram lidos procurando null-safety real.

---

## T10 · Verificação (Gate 3)

Concluído. typecheck ✅ · lint ✅ (27 arquivos) · domínio ✅ 30 · integração ✅ 14
· `db:reset` ✅ cinco migrations.

Ruling: **o orçamento da seção 8 virou teste, mas com limite folgado (80 ms para
um orçamento de 16 ms).** Medido: **1,5 ms** para derivar 365 dias sobre 366
estadias — dez vezes de margem. O limite do teste é 5x o orçamento porque a
máquina que roda o gate está sempre com outra coisa aberta, e teste de tempo
apertado vira falha intermitente, que treina a pessoa a ignorar o gate. Custo se
eu estiver errado: uma regressão de performance entre 16 e 80 ms passa — mas o
número medido fica no log do teste, então a degradação é visível para quem olhar.

**Descoberto na verificação:** `supabase db push` teria tentado recriar as
tabelas. Aplicar migration por MCP grava em
`supabase_migrations.schema_migrations` um `version` com o timestamp **da
aplicação** (`20260926023510`) e joga o nome do arquivo inteiro no campo `name` —
a CLI espera `version` = prefixo do arquivo. Disco e índice divergiram sem nada
acusar: o banco ficou correto, só a contabilidade errada. Corrigido por `update`
na tabela de histórico; as cinco versões agora batem com os nomes de arquivo.

Ruling: **essa cicatriz foi para `.agent/SOP/falhas-silenciosas.md` e não para
`.devkit/checks/`.** O check de verdade é `supabase migration list`, que compara
as colunas Local e Remote — e exige a CLI linkada, o que precisa de token de
acesso que o gate não tem. Um check que não consegue olhar o remoto daria falso
verde, que é pior que check nenhum. Custo se eu estiver errado: a divergência
pode voltar na próxima migration aplicada por MCP; mitigado pela instrução
explícita no fim daquele arquivo.

Dívida — **três coisas não verificadas**, e nenhuma é presunção:

1. **Projeto pausado por inatividade.** A seção 7 da spec diz que isso tem de
   virar `{ status: 'error' }` visível e não lista vazia. O caminho de código
   existe e está tipado, mas pausar o projeto de propósito para ver não foi
   feito. **Não verificado.**
2. **`auth_leaked_password_protection`** continua desligado no remoto. É toggle
   de Auth no painel, não SQL. Pertence à Fase 1.
3. **`src/timeline/` sob `strict: true`.** O `typecheck` passa, mas nenhum
   arquivo de lá foi lido procurando null-safety real. Eles caem na Fase 5.
