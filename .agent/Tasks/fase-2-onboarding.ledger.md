# Ledger — `fase-2-onboarding`

> Registro do que foi decidido **durante a execução**. Spec:
> [`fase-2-onboarding.md`](./fase-2-onboarding.md). Branch: `fase-2-onboarding`.
>
> Execução em sequência, sem subagentes paralelos: o plano é acoplado (schema →
> tipos gerados → dados → telas), e worktrees paralelas colidiriam em
> `database.types.ts` e na numeração das migrations — o caso "tarefas
> acopladas" da skill `orchestrate`.

---

## T1 · Contrato de domínio

Concluído. Prova: `src/domain/onboarding.test.ts`, 15 passando.

Ruling: `extractInviteCode` prefere, nesta ordem, o formato com hífen, depois
um bloco com dígito, e só por último um bloco só de letras — porque "codigo",
sem acento, normaliza para `C0D1G0`, que é um código Crockford válido. Custo se
eu estiver errado: uma mensagem com um código só de letras e sem hífen **e**
uma palavra de 6 letras antes dele extrai a palavra; a pessoa vê o preview
errado (`not_found`) e digita à mão. Reversível na função.

## T2 · Schema de perfil, casal e convite

Concluído. Prova: `supabase/tests/onboarding.test.ts` (A1–A12, A20) e
`supabase/tests/rls.test.ts` (A13). Suíte de banco: 60 passando ao fim da
tarefa.

Ruling: toda falha esperada das RPCs volta como `jsonb` com `status`, nunca como
exceção; exceção fica para "sem sessão" (`42501`) e para o inesperado. Por quê:
o cliente precisa distinguir "código expirado" de "rede caiu", e mensagem de
exceção do PostgREST não é contrato. Custo se eu estiver errado: o tipo do
retorno é `Json` no `database.types.ts`, então o formato só é garantido pelos
testes e pelos tipos escritos à mão em `src/data/`.

Ruling: a corrida de duas abas em `create_couple` é resolvida pelo
`unique (profile_id)` e por um `exception when unique_violation` que **apaga o
casal que a aba perdedora acabou de criar**. O teste A3 não consegue forçar
qual dos dois caminhos roda (checagem prévia ou unique), então o ramo do unique
foi provado à parte, numa transação com `rollback` no `psql` local: o NOTICE
confirmou a captura e zero casais órfãos. Custo se eu estiver errado: um casal
órfão sem membros por corrida — sem efeito visível, só lixo.

Ruling: `private.invite_refusal` concentra as checagens comuns a
`lookup_invite` e `accept_invite` (próprio casal, já membro, usado, expirado).
Por quê: o preview não é autorização, e o aceite **tem** de repetir tudo; duas
cópias da mesma regra divergem. Não é `security definer` — roda dentro das
duas, como dono.

Ruling: `renew_invite` não recebe `invite_id`; renova o convite aberto do casal
de quem chama. Com I5 há no máximo um, e não receber id é uma superfície a
menos.

Ruling: o harness de teste ganhou `deleteUserAndCouple` (apaga o casal antes do
usuário, porque `couples` não cai em cascata) e `sql()` (psql no container
local, para o catálogo do A20). A limpeza por `invite_code` deixou de existir
junto com a coluna.

## T3 · Cidades do IBGE

Concluído. Prova: A14 e A15 em `supabase/tests/onboarding.test.ts`; busca de
"pelo" em 3,8 ms (`explain analyze`).

Ruling: **5.571 municípios, não os 5.570 da spec.** Boa Esperança do Norte (MT)
foi criado em 2023 e está nas duas fontes; é também o único sem `microrregiao`
na API do IBGE, então a UF sai de `regiao-imediata`. Custo se eu estiver
errado: nenhum — o número vem da fonte, e o A15 afirma o número da migration.

Ruling: gerador em `scripts/gen-cities-seed.mjs`, não `.ts` como dizia a spec. O
projeto roda Node 20, que não executa TypeScript sem uma dependência nova
(`tsx`), e um script que roda uma vez por ano não paga isso. Custo: o script não
passa pelo typecheck. Reversível quando o Node subir para 22+.

Ruling: o upsert atualiza também `lat`/`lng` das três cidades da Fase 0, não só
`ibge_code`. Por quê: uma fonte só de coordenada para a tabela inteira. As
diferenças são de centésimos de grau (SJC: −23,1791 → −23,1896), e a derivação
compara identidade de cidade, não posição.

Ruling: `CHECK (country_code <> 'BR' or ibge_code is not null)` criado **depois**
do seed. Transforma o A15 em invariante do schema, não só em teste.

Ruling: `unaccent` na forma de dois argumentos
(`'extensions.unaccent'::regdictionary`). A de um argumento resolve o
dicionário pelo `search_path`, que nas funções deste projeto é `''` — e falharia
em tempo de execução, não de criação.

## T4 · Bucket de fotos

Concluído. Prova: `supabase/tests/storage.test.ts`, 5 passando (grava na
própria pasta; não grava na de outro; parceiro lê, de fora não; de fora não
assina URL; tipo fora da lista recusado).

Ruling: `profiles_avatar_in_own_folder` (`avatar_path like id || '/%'`) entrou
na migration 1, além do que a spec pedia. Um `avatar_path` apontando para a
pasta de outra pessoa não vazaria nada (a policy do bucket corta), mas faria a
tela mostrar a foto quebrada sem erro nenhum. Custo: nenhum.

## T5 · Edge function `send-invite`

Concluído. Prova: `supabase/tests/send-invite.test.ts`, 6 passando — A17 e A18
pela função de verdade, servida pela stack local, lendo a mensagem pela API do
Mailpit; A19 pelo `handler.ts` com transporte que falha, contra as RPCs reais.

Ruling: a função foi partida em três arquivos — `handler.ts` (regra, sem Deno e
sem supabase-js, dependências por parâmetro), `email.ts` (template) e
`index.ts` (só a ligação com o Deno). Por quê: o A19 precisa de um transporte
que falha, e derrubar o Mailpit compartilhado derrubaria os outros testes.
Custo: `index.ts` não passa pelo `tsc` do projeto (usa `Deno.*`); ele é fino de
propósito, e é exercitado inteiro pelo A17/A18.

Ruling: a função responde **200** para todos os `status` esperados
(`not_member`, `rate_limited`…), 400 só para corpo inválido e 500 para o
inesperado. Por quê: `functions.invoke` do supabase-js trata não-2xx como erro
genérico e esconde o corpo; o cliente precisa do `status`.

Achado: o teste pegou "te convidou **pro o** espaço" no assunto. Corrigido.

Achado operacional: com `policy = "per_worker"`, o edge runtime local **não
recarregou** `email.ts` depois da edição; foi preciso
`docker restart supabase_edge_runtime_lanabiel`. Quem editar a função e vir o
teste falhar com o comportamento antigo: é isso.

Dívida: segredos de produção (`RESEND_API_KEY`, `INVITE_FROM`, `APP_URL`) por
`supabase secrets set` no remoto — ação sua, parte do A29.

## Ajustes em testes da Fase 1 causados por esta fase

- `auth.test.ts` A2 contava **todos** os `auth.users` antes e depois. Com os
  arquivos novos criando usuários em paralelo, o total oscila e o teste ficou
  intermitente. Agora afirma que **o e-mail tentado** não existe — é o que o
  critério queria dizer.
- `auth.test.ts` usava `listUsers()` sem paginação: primeira página, 50
  usuários. Com mais que isso, `deleteByEmail` e o `find` do A1 deixariam de
  achar o usuário em silêncio. Agora `perPage: 1000`.
- `constraints.test.ts` A11 esperava **exatamente** três cidades. Agora afirma
  as três, uma vez cada, com o UUID fixo.

## T6 · Fronteira de dados

Concluído. Prova: `supabase/tests/data-onboarding.test.ts`, 11 passando — o
cenário da seção 2 (Rafa cria, Duda entra) pelas MESMAS funções de `src/data/`
que as telas chamam, contra o banco local e a edge function.

Ruling: **migration nova, `couples_started_on_guard`**, que a spec não previa. A
tela Confirmar edita a data por UPDATE direto em `couples` (a policy de membro
permite), e ali nada recusava data futura — só `create_couple` checava. Um
CHECK não serve (`now()` não é imutável); uma `update_couple` security definer
seria a oitava porta sem RLS só para isso. Trigger comum (security invoker)
cobre os dois caminhos. Custo se eu estiver errado: nenhum além do trigger.

Achado (o mais sutil da fase): o trigger precisou de `USAGE` no schema
`private` e `EXECUTE` para o `service_role`, senão toda escrita administrativa
em `couples` falha. E a falha era **intermitente**: o USAGE de schema é checado
na análise do nome, e o plpgsql guarda o plano por conexão — numa conexão do
pool do PostgREST em que `authenticated` já tinha compilado o trigger, o
`service_role` reaproveitava o plano e passava. Apareceu como "24 skipped" logo
depois de um `db:reset`, e sumiu na rodada seguinte. Provado determinístico
depois do grant: duas rodadas de `db:reset` + `test:db`, 86/86 as duas.

Ruling: `callRpc` em `src/data/rpc.ts` mapeia `42501` para `unauthenticated` e
todo o resto de erro para `error`; os `status` do jsonb chegam às telas como
uniões discriminadas escritas à mão (o tipo gerado das RPCs é `Json`).

Ruling: `loadAccountStage` continua em duas viagens — a segunda lê
`couple_members` SEM `.eq('profile_id')` e conta as linhas do casal.
`awaiting_partner` é sempre slot 1; slot 2 sozinho vira `error`, porque não há
fluxo nesta fase que produza isso (sair do casal é da Fase 3).

## T7 · Código pendente e portão

Concluído. Prova: A24 em `src/onboarding/Onboarding.test.tsx` (link na carga e
link colado com a aba aberta).

Ruling: o assistente é montado com `key={userId:pendingCode}`. Um código que
chega com a tela aberta (link colado, `hashchange`) precisa recomeçar o fluxo
pelo convite, e o passo inicial é calculado ao montar. Os passos pós-entrada
sobrevivem porque `postJoin` é lido no passo inicial.

Ruling: `onSignOut(keepInvite)`. "Trocar de conta" apaga o código pendente —
exceto na recusa `already_member`, em que sair é justamente para aceitar o
convite com a outra conta. Custo se eu estiver errado: um código fica em
`sessionStorage` depois de sair; morre com a aba.

Achado no navegador (não previsto na spec): o link colado numa aba em que o app
já estava aberto muda só o fragmento — sem recarga, o portão não relia e o
código ficava esquecido na barra. Escuta de `hashchange` + teste.

## T8 · Criar o espaço

Concluído. Prova: A21, A22, A23 em `src/onboarding/Onboarding.test.tsx`, e o
fluxo inteiro no navegador contra a stack local (perfil → casal → convite →
e-mail no Mailpit com `#convite=ZTQKW6`), com as linhas conferidas no banco.

Achados no navegador, que o jsdom não tem como pegar:

- a segunda coluna do perfil vazava do painel (item de grade sem `min-width: 0`);
- o `margin-top: auto` do Login vencia a regra do onboarding, porque `auth.css`
  é importado depois com a mesma especificidade — seletor composto;
- **o `.auth` rolava 75px para dentro ao focar a busca de cidade.** Ele tem
  `overflow: hidden`, o globo decorativo passa da borda (altura rolável 1175px
  numa janela de 820), e `hidden` ainda deixa o navegador rolar por programa.
  `overflow: clip` resolve.

Dívida: a regra `div.auth { overflow: clip }` mora em `onboarding.css`, com
seletor mais específico, porque `auth.css` tem mudanças da Fase 1 não
commitadas que não são desta branch. O lugar certo é `auth.css`; mover quando
aquelas mudanças entrarem.

Ruling: a tela Aguardando ganhou o rodapé "Não é você? · Trocar de conta". Quem
está esperando não tinha saída nenhuma: a timeline antiga não tem logout.

## T9 · Entrar num espaço

Concluído. Prova: A25 e A28 em `src/onboarding/Onboarding.test.tsx`, e no
navegador: link → Login de convite → cadastro → preview com dados do banco →
perfil com foto → aceite → Confirmar (data editada) → Tudo pronto (1.425 km) →
app. No banco: a foto de 913 KB (PNG) virou WebP de 2.826 bytes na pasta da
Duda; slot 2; cor `#ec4899` (I10); convite aceito.

**Achado no navegador, o mais grave da fase:** as seis caixas do código vêm
depois do `<input>` invisível no DOM e ficavam POR CIMA dele — tocar no código
não focava o campo, no celular e no desktop. O A28 passava porque o
`user.click` da Testing Library clica no elemento sem teste de acerto. Corrigido
com `pointer-events: none` nas caixas; provado com `elementFromPoint` nos três
pontos do campo e digitação real a 375px. Não há teste automatizado que pegue
isto sem navegador real — é o limite registrado no ADR 0005.

Ruling: o título da recusa virou `<h2>` (era `<strong>`): é o título da
situação para leitor de tela, abaixo do `h1` que o desenho mantém.

## T10 · Aguardando

Concluído. Prova: A26 e A27 em `src/onboarding/Onboarding.test.tsx`.

Ruling: "enviado" só com `lastSentAt` preenchido ou `sent` agora; o estado sem
envio diz "O e-mail não saiu" e oferece "Tentar de novo". O A23 afirma que o
texto inteiro da tela não contém `/enviado/i`.

Ruling: "Expirou?" se decide contra o instante da leitura guardado na view, e
não contra `Date.now()` no render — que o lint (`react/purity`) apontou e que
faria a tela mudar a cada renderização.

## Fechamento · revisão ampla (`/code-review high`)

Dez achados; nove corrigidos, cada um com teste de regressão:

- Remontar o assistente a cada mudança do código pendente perdia estado (o aviso
  da foto no caminho de quem entra; a contagem de passos do Confirmar, que
  passava a depender da corrida com a releitura do estágio). **Ruling:** a
  `key` passou a ser `userId:chegadasDeLink` — só um código que chega de fora
  (`hashchange` com `#convite=`) remonta; as mudanças internas já definem o passo.
- `hashchange` com um `#` qualquer marcava o código guardado como "veio do link".
- Tudo pronto mostrava "· juntos desde hoje" para casal que começou hoje.
- `renew_invite` mantinha `last_sent_at`: depois de renovar e o envio falhar,
  recarregar dizia "Convite enviado!" para um prazo que nenhum e-mail tinha.
  Agora renovar zera `last_sent_at`.
- `createProfile` em `already_exists` (corrida de abas) descartava a foto recém-
  subida. Agora liga a foto ao perfil existente.
- `lookup_invite` devolvia `inviter_avatar_path`, cujo primeiro segmento é o
  `auth.uid()` de quem convidou, a quem só tem o código. Saiu.
- `updateCouple` chamava "sessão caiu" o que era "linha não encontrada".
- Confirmar e Tudo pronto liam o casal duas vezes; agora o Confirmar passa adiante.

Adjudicado, não corrigido — **dívida**: componentes com nome em português
(`Perfil`, `SobreAGente`, `Aguardando`…) contra a regra do CLAUDE.md
"Identificadores em inglês". A Fase 1 já abriu o precedente (`Escolha`,
`CriarConta`); renomear só metade deixa o código menos consistente que hoje.
Renomear as duas fases juntas, num commit só de renome.

## Pendências para 🟢

- **A29** (manual): com `RESEND_API_KEY`, `INVITE_FROM` e `APP_URL` como
  segredos da função no remoto (`supabase secrets set`) e a função publicada,
  criar um espaço de teste e convidar **um endereço que não é o do Gabriel**.
  Colar aqui o ID da mensagem no Resend e a captura da caixa de entrada.
- **A30** (manual): no celular, abrir o link do convite, entrar pelo Google e
  conferir que volta à mesma aba com o código preservado e chega ao preview.
  Exige `VITE_AUTH_PROVIDERS=google` com credencial real.
- ~~Mover `div.auth { overflow: clip }` para `auth.css`~~ — feito depois do
  merge do redesenho: `.auth` agora é `overflow: clip` no próprio `auth.css`.

## Depois do PR · dívidas pagas

- **Renome para inglês**, Fases 1 e 2 juntas, como a regra do CLAUDE.md pede:
  `Escolha` → `StartChoice`, `CriarConta` → `SignUp`, `Perfil` → `ProfileStep`,
  `SobreAGente` → `CoupleStep`, `Aguardando` → `WaitingScreen`, `Codigo` →
  `CodeEntry`, `Convite` → `InviteScreen`, `Confirmar` → `ConfirmCouple`,
  `TudoPronto` → `AllSet`; e os passos do assistente (`'perfil-criar'` →
  `'profile-create'` etc.). O fragmento `#convite=` fica: é parte do link que já
  sai no e-mail, não identificador de código.
- `overflow: clip` movido para `auth.css`.
- A29, A30, avisos e agendador: adiados para o fim do roadmap por decisão do
  Gabriel (2026-09-26).
