# Spec — `fase-1-login`

- **Data:** 2026-09-26
- **Autor:** Gabriel Barbosa
- **Status:** 🟢 Done (fechada em 2026-09-27, a pedido do Gabriel) — tudo implementado e provado (ledger, T10), com duas ressalvas explícitas: **A15** (`auth_leaked_password_protection`) segue desligado no projeto — o advisor de 2026-09-27 ainda o acusa; é toggle do painel, e no free tier o Supabase pode não oferecê-lo — e **A7** (vínculo de identidade pelo Google) não foi provado porque o Google está desligado (`VITE_AUTH_PROVIDERS` vazio); os dois moram no fim do roadmap, em `README.md`
- **Research (Gate 0):** N/A — as duas telas estão desenhadas (`Login [LMpij]`, `Escolha [UEca1]`) e a copy foi lida do `.pen`. A dúvida não era de produto; era de mecanismo de autenticação e de como se prova comportamento de tela, e as duas viraram ADR.
- **ADR necessário?** **Sim, dois, e já escritos** — [0004](../Decisions/0004-login-com-senha-e-oauth.md) (login com senha e OAuth, sem link mágico) e [0005](../Decisions/0005-interface-se-prova-em-jsdom.md) (interface se prova em jsdom). Esta spec os implementa.

---

## 1. What & Why

Hoje qualquer pessoa que abra o app vê o acervo, porque não há sessão nenhuma: a tela roda sobre `localStorage` e a única autenticação que existe no projeto é o helper `signIn()` de `supabase/tests/harness.ts`, que existe só para os testes. A Fase 0 construiu RLS e provou que ela corta — mas o app não tem como produzir a sessão que a RLS lê. É uma fechadura sem chave.

Esta fase entrega a chave: Gabriel e Lana criam conta e entram, de máquinas diferentes, e o app passa a saber **quem** está pedindo antes de pedir qualquer coisa. Duas telas desenhadas nascem aqui — `Login` e `Escolha` — mais uma que o desenho não tem e o [ADR 0004](../Decisions/0004-login-com-senha-e-oauth.md) exige (criar conta), mais o portão que decide, a cada carregamento, se a pessoa vai para o login, para o onboarding ou para o app.

O que o casal consegue fazer depois que isto existir: entrar. O que deixa de acontecer: o helper de sessão de teste sair do lugar dele, e o app renderizar conteúdo para quem não se identificou.

## 2. Como funciona (um cenário real)

A Lana abre o app no notebook dela, em Marau, pela primeira vez. Não há sessão guardada, então o portão resolve `signed_out` e ela vê o `Login`: o globo à esquerda, "Duas cidades. Um lugar só de vocês.", e o painel com _Continuar com Google_, o divisor _ou com e-mail_, os campos de e-mail e senha, e o rodapé _Primeira vez aqui? Criar conta_.

Ela clica em _Criar conta_, digita `urio.alana@gmail.com` e uma senha de 14 caracteres. O app chama `signUp`. Como a confirmação de e-mail está desligada (ADR 0004), o Supabase devolve sessão na hora — sem e-mail, sem espera, sem SMTP. Se a senha tivesse menos de 12 caracteres, ou aparecesse numa lista de vazamento conhecida, o retorno seria `weak_password` e a tela diria isso antes de qualquer coisa ser criada.

`onAuthStateChange` avisa o app, e o portão faz a pergunta que decide tudo: `loadAccountStage`. Ele lê `profiles` filtrando pelo próprio id — a policy `profiles_select_self_or_partner` sempre deixa a pessoa ler a si mesma, então zero linhas aqui significa mesmo "não tem perfil", e não "não tenho permissão". A Lana não tem perfil: o resultado é `{ status: 'ok', rows: { stage: 'needs_profile' } }`, e ela vê a `Escolha` — "Bem-vindo ao lanabiel. Como vocês vão começar?", com _Criar nosso espaço_ e _Tenho um código_.

Nesta fase os dois botões estão **desabilitados com motivo visível**: o fluxo atrás deles é a Fase 2. O que funciona é _Trocar de conta_, que encerra a sessão e devolve ao `Login`.

Uma semana depois ela entra pelo celular. Desta vez clica em _Continuar com Google_, com a mesma conta `urio.alana@gmail.com`. O navegador vai ao Google e volta com `?code=`; o cliente troca o código por sessão e limpa a URL. Como o e-mail bate, o Supabase resolve para **o mesmo** `auth.users` — não uma segunda conta — e portanto o mesmo perfil. Isso é a coisa que "deveria funcionar" e que o critério A7 prova em vez de assumir.

O contraste é o Gabriel, que já é membro do casal montado pelo harness. Para ele `loadAccountStage` devolve `{ stage: 'ready', profileId, coupleId, slot: 1 }`, e só então o app renderiza a tela do calendário. Se a sessão dele morrer no meio do uso — token revogado, projeto pausado, logout na outra aba — `onAuthStateChange` dispara e o app inteiro volta para o `Login`. Ele **nunca** fica na tela do calendário com a lista vazia, que é a falha que o [SOP de falhas silenciosas](../SOP/falhas-silenciosas.md#1-rls-devolve-lista-vazia-não-erro) descreve.

## 3. Requisitos (comportamentos observáveis)

- **R1** — Existe uma tela de Login com entrada por **e-mail e senha** e por **OAuth**. Provedor sem credencial configurada não é renderizado — botão que não pode funcionar é pior que botão ausente. **Não há link mágico** ([ADR 0004](../Decisions/0004-login-com-senha-e-oauth.md)).
- **R2** — Existe uma tela de criar conta com e-mail e senha, alcançada pelo rodapé do Login. Ela devolve sessão imediatamente, sem passo de confirmação por e-mail.
- **R3** — Senha abaixo do mínimo, ou constante em lista de vazamento conhecida, é recusada **antes** de a conta existir, com causa distinta de "credencial inválida".
- **R4** — O retorno do OAuth estabelece a sessão e limpa a URL. Nenhum token ou código sobra na barra de endereços.
- **R5** — A sessão sobrevive a recarregar a página e se renova sozinha. Enquanto ela está sendo restaurada, o app não renderiza nem o Login nem o conteúdo — nenhum piscar de Login para quem já está logado.
- **R6** — Em todo carregamento o app resolve o estágio da conta antes de renderizar qualquer tela de domínio: sem perfil, sem casal, ou pronto.
- **R7** — Quem está autenticado e ainda não tem casal vê a `Escolha`, com as duas opções do desenho e a saída _Trocar de conta_.
- **R8** — A `Escolha` da Fase 1 **não afirma** ter procurado convite pendente. A linha _"Não achamos convite pendente pra <e-mail>"_ só entra quando a busca existir (Fase 2).
- **R9** — Perder a sessão durante o uso leva ao Login. O app não continua renderizado com dados vazios.
- **R10** — Cada falha do caminho de entrada tem causa nomeada e distinguível: credencial inválida, senha fraca ou vazada, e-mail já cadastrado, limite de tentativas, erro do provedor OAuth, falha de rede.
- **R11** — Nenhuma leitura de domínio acontece antes de `stage: 'ready'`.
- **R12** — Entrar por senha e entrar por OAuth **com o mesmo e-mail** produz um único usuário, e portanto um único perfil.

## 4. Invariantes

- **I1** — Nenhuma tela de domínio renderiza sem `stage: 'ready'`. Não é zelo: `listStays` para quem não tem casal devolve `{ status: 'ok', rows: [] }`, que é indistinguível de "o casal não tem estadias".
- **I2** — `signed_out`, "falha de rede" e "lista vazia legítima" produzem três telas diferentes. Nunca a mesma.
- **I3** — `ok` com zero linhas em `profiles` significa "esta pessoa não tem perfil", nunca "não deu para saber". Isso só é verdade porque a leitura é do **próprio** id, que a policy sempre permite; um dia em que essa policy mudar, esta invariante cai junto.
- **I4** — Existe **um** cliente Supabase na aplicação, o de `src/lib/supabase.ts`. Dois clientes são dois armazenamentos de sessão e duas rotações de refresh token disputando o mesmo registro.
- **I5** — A identidade durável é `auth.users.id`, que é `profiles.id`. **E-mail nunca é chave** em nenhuma tabela nossa. Trocar de e-mail depois (Fase 3) não pode mudar o id.
- **I6** — A senha existe apenas em trânsito, do campo do formulário à chamada do cliente Supabase. Nunca é guardada em estado global, em `localStorage`, em log, nem em mensagem de erro. Nenhuma tabela nossa tem coluna de senha, e `auth.users` não é lida por nós.
- **I7** — `getSession()` lê armazenamento local e **não valida a sessão contra o servidor**. Nenhuma decisão de autorização se apoia só nele; quem valida é a primeira leitura, cujo resultado discriminado governa a tela.
- **I8** — O estado da sessão tem quatro valores, e `loading` é um deles. Tratar "ainda não sei" como "deslogado" é o que faz o Login piscar a cada recarga.
- **I9** — Todo redirecionamento de autenticação volta para uma origem que está em `site_url` ou `additional_redirect_urls`. Origem fora da lista é rejeitada pelo GoTrue, sem erro nosso.
- **I10** — "Credencial inválida" é uma mensagem só, para e-mail inexistente e para senha errada. Distinguir os dois na tela entrega ao atacante a lista de quem tem conta.

## 5. Contrato & dados

### Mudança de armazenamento: nenhuma

**Não há migration nesta fase.** Nenhuma tabela nova, nenhuma coluna nova, nenhuma policy nova. `auth.users` é do Supabase; `profiles` e `couple_members` já existem e já têm policy de leitura que serve. É de propósito que a Fase 1 só **lê**: escrever perfil e criar casal é o onboarding, e as policies de `insert` para isso não existem justamente porque a porta ainda não foi aberta — ver a tabela de RLS na [spec da Fase 0](./fase-0-fundacao.md#rls).

Muda **configuração**, não schema — e a mudança de configuração é parte do contrato, não detalhe de ambiente:

| Chave | De | Para | Por quê |
| --- | --- | --- | --- |
| `[auth] site_url` | `http://127.0.0.1:3000` | origem do Vite (`5173`) e, em produção, a origem publicada | Hoje o retorno do OAuth volta para um lugar sem app |
| `[auth] additional_redirect_urls` | `https://127.0.0.1:3000` | as mesmas origens, sem curinga | É controle de segurança, não conveniência |
| `[auth] minimum_password_length` | `6` | `12` | ADR 0004 |
| `[auth] password_requirements` | `""` | `""` (mantém) | Regra de composição fabrica atrito sem entropia — ADR 0004 |
| `[auth.email] enable_confirmations` | `false` | `false` (mantém, agora deliberado) | Confirmar exige SMTP, que é a dependência que o ADR 0004 remove |
| `auth_leaked_password_protection` (painel) | desligado | **ligado** | Única defesa de primeira linha sobre a porta principal |

### O cliente único

`src/lib/supabase.ts` ganha opções de auth explícitas. As três primeiras já são o padrão do `@supabase/supabase-js` 2.109; estão escritas mesmo assim porque padrão implícito é decisão que ninguém revisa. A quarta **não** é o padrão — `auth-js` 2.109 usa `flowType: 'implicit'`.

```ts
createClient<Database>(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})
```

`pkce` em vez de `implicit` porque `implicit` devolve o `access_token` no **fragmento da URL**, onde ele entra no histórico do navegador e em qualquer `Referer` que a página dispare. Com o link mágico fora, o único fluxo que volta pela URL é o OAuth — e esse volta ao mesmo navegador por construção, então PKCE aqui não tem o custo de dispositivo cruzado que teria com link mágico.

### Estado da sessão

```ts
// src/auth/session.ts — nenhum import de componente; testável sem DOM.

export type AuthState =
  /** Ainda restaurando do armazenamento. NÃO é 'signed_out' (I8). */
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'signed_in'; userId: string; email: string | null }

/** Assina `onAuthStateChange` e devolve a função de cancelamento. */
export function subscribeToAuth(db: Db, onChange: (state: AuthState) => void): () => void
```

### Entrada e cadastro

```ts
// src/auth/signIn.ts

export type Provider = 'google' | 'apple'

export type Credentials = { email: string; password: string }

export type SignInResult =
  | { status: 'signed_in' }
  /** E-mail inexistente OU senha errada. Um caso só, de propósito (I10). */
  | { status: 'invalid_credentials' }
  | { status: 'rate_limited'; retryAfterSeconds: number | null }
  | { status: 'error'; cause: string }

export type SignUpResult =
  | { status: 'signed_in' }
  | { status: 'email_taken' }
  /** Curta demais, ou em lista de vazamento conhecida (R3). */
  | { status: 'weak_password'; reason: 'too_short' | 'leaked' }
  | { status: 'invalid_email' }
  | { status: 'rate_limited'; retryAfterSeconds: number | null }
  | { status: 'error'; cause: string }

export function signInWithPassword(db: Db, creds: Credentials): Promise<SignInResult>
export function signUpWithPassword(db: Db, creds: Credentials): Promise<SignUpResult>

/** Redireciona o navegador; não há resultado a renderizar depois. */
export function signInWithProvider(db: Db, provider: Provider): Promise<{ status: 'redirecting' } | { status: 'error'; cause: string }>
export function signOut(db: Db): Promise<void>

/** Provedores com credencial configurada. Vazio é resposta válida (R1). */
export function enabledProviders(): readonly Provider[]
```

`enabledProviders()` lê `VITE_AUTH_PROVIDERS` (lista separada por vírgula, ex. `google`). Ausente ⇒ vazio ⇒ só e-mail e senha aparecem. É o que impede o botão da Apple de ser renderizado enquanto não houver conta paga do Apple Developer Program.

`weak_password` carrega o motivo porque as duas causas pedem textos diferentes: "curta demais" é regra nossa e a pessoa corrige aumentando; "vazada" é a checagem do Supabase contra listas conhecidas, e a pessoa precisa entender que a senha não é ruim — é **conhecida**.

### Volta do OAuth

```ts
// src/auth/callback.ts

export type CallbackResult =
  /** Não havia nada de autenticação na URL — carregamento normal. */
  | { status: 'none' }
  | { status: 'signed_in' }
  /** O provedor recusou ou a pessoa cancelou. */
  | { status: 'provider_denied'; cause: string }
  | { status: 'error'; cause: string }

/** Consome os parâmetros da URL e os remove da barra de endereços (R4). */
export function consumeAuthCallback(db: Db, url: URL): Promise<CallbackResult>
```

### O portão — a ponte para a Fase 2

Esta é a resposta à pergunta que o [roadmap](./README.md#fase-1--login) deixou em aberto: _o que acontece quando alguém se autentica e ainda não tem perfil?_

```ts
// src/data/account.ts — fronteira de banco, como `stays.ts`.

export type AccountStage =
  /** Autenticado, sem linha em `profiles`. O onboarding começa do passo 1. */
  | { stage: 'needs_profile' }
  /** Perfil existe, mas nenhuma linha em `couple_members`. */
  | { stage: 'needs_couple'; profileId: string }
  | { stage: 'ready'; profileId: string; coupleId: string; slot: 1 | 2 }

export function loadAccountStage(db: Db): Promise<DataResult<AccountStage>>
```

Reaproveita `DataResult` de `src/data/result.ts` sem mudá-lo: `unauthenticated` e `error` continuam sendo casos irmãos de `ok`, e `rows` continua existindo só em `ok`. É o mesmo contrato de `listStays`, pelo mesmo motivo.

**Dois estágios, não um**, porque as duas lacunas são diferentes: sem perfil, o onboarding pede nome e cidade; com perfil e sem casal, ele pula direto para criar ou entrar num espaço. Colapsar os dois em `needs_onboarding` faria a Fase 2 perguntar de novo o que já foi respondido.

Nenhuma query filtra por `couple_id` nem por `profile_id`: a de `profiles` filtra pelo próprio `auth.uid()` — que é **identidade, não autorização** — e a de `couple_members` não filtra nada, porque a policy resolve.

### Compatibilidade

**Aditiva, como a Fase 0.** `src/timeline/` continua inteiro e continua sobre `localStorage`; o que muda é que ele passa a ser renderizado só com `stage: 'ready'`. Nenhuma tela de domínio lê do Supabase ainda, então o portão é roteamento, não dado — mas ele nasce agora porque a Fase 5 vai depender dele já provado.

O `signIn()` de `supabase/tests/harness.ts` **fica, e deixa de ser contradição**: ele já entra por `signInWithPassword`, que agora é o caminho do produto. O teste passa a exercitar a mesma porta que o casal usa.

## 6. Identidade & nomes

A identidade durável é `auth.users.id`, e `profiles.id` é ela (`references auth.users (id) on delete cascade`). **E-mail não é chave em nenhuma tabela nossa** (I5) — ele mora só em `auth.users`, e a Fase 3 vai permitir trocá-lo sem tocar em nada.

Há exatamente uma exceção prevista, e ela é da Fase 2: o convite casa por e-mail, porque é o único identificador que o Gabriel tem da Lana antes de ela existir no sistema. Fase 1 não faz essa busca (R8).

**Vinculação de identidades.** Entrar por senha e entrar por OAuth com o mesmo e-mail tem de resolver para um único `auth.users`. Se não resolver, o Gabriel vira dois usuários, dois perfis, e um casal com o membro errado — e nada acusa. Vira o critério A7. Com `enable_confirmations` desligado o Supabase marca o e-mail como confirmado no cadastro, que é a condição da vinculação; o custo disso está na seção 9.

**Origem de redirecionamento.** O nome durável aqui é a URL: o OAuth volta para `redirectTo`, e o GoTrue só aceita o que estiver em `site_url` ou `additional_redirect_urls`. Hoje o `supabase/config.toml` diz `127.0.0.1:3000` e o Vite serve em `5173` — a volta cairia num lugar onde não há app. Corrigir isso é parte da fase (A13).

## 7. Comportamento em falha

**Sessão restaurando.** Entre o `createClient` e a primeira resposta de `onAuthStateChange` não se sabe nada. Esse intervalo é `loading` (I8), e nele o app renderiza o esqueleto da tela, não o Login. Tratar como `signed_out` faz o Login aparecer por um instante em toda recarga de quem já está logado.

**Sessão que parece viva e não está.** `getSession()` lê o armazenamento local (I7). Um token ainda dentro da validade cujo usuário foi removido do casal continua "logado" por até uma hora — `jwt_expiry` é 3600. A defesa não é validar a sessão: é que **a decisão de renderizar vem de `loadAccountStage`**, e não de `getSession()`. Quem perdeu o casal cai em `needs_couple` e vai para a `Escolha`; não fica no calendário vendo lista vazia.

**Sessão que morre no meio do uso.** Refresh token revogado, logout na outra aba, projeto pausado por inatividade. `onAuthStateChange` emite `SIGNED_OUT` e o app inteiro volta para o Login (R9). Sem isso, o sintoma é o do SOP: o calendário continua na tela, as queries seguintes devolvem zero linhas, e o casal conclui que perdeu a história.

**Credencial inválida.** Uma mensagem só para e-mail inexistente e para senha errada (I10). Distinguir seria informar a quem tentasse quais e-mails têm conta neste app — que, num app de duas pessoas, é informação sobre duas pessoas específicas.

**Senha recusada no cadastro.** Curta demais é regra nossa e o Supabase devolve antes de criar nada. Vazada é a checagem contra listas conhecidas, e a mensagem precisa dizer que a senha é **conhecida**, não fraca — senão a pessoa troca `abcdefghijkl` por `abcdefghijkm` e não entende a recusa.

**E-mail já cadastrado.** Com confirmação desligada, `signUp` para um e-mail existente **não** cria conta nova. A tela oferece entrar em vez de cadastrar, e não diz mais do que isso.

**Limite de tentativas.** `auth.rate_limit.sign_in_sign_ups` é 30 por 5 minutos por IP. Estourar devolve 429, que vira `rate_limited` com o tempo de espera quando o servidor informa. Sem tratamento, o botão parece não fazer nada — e a pessoa clica de novo, o que não ajuda.

**Falha em cascata: senha esquecida, e nenhum caminho de volta.** É o buraco conhecido desta fase, e ele é consequência direta do [ADR 0004](../Decisions/0004-login-com-senha-e-oauth.md): `resetPasswordForEmail` precisa de SMTP, que é justamente a dependência que a decisão removeu do login. Até o Resend existir, **senha perdida se resolve à mão pelo painel do Supabase**. A tela não oferece _Esqueci minha senha_ — botão que abre um caminho inexistente é pior que a ausência dele. Isso é aceitável para duas pessoas e deixaria de ser para vinte; o gatilho para mudar é o domínio verificado, não o volume.

**Falha em cascata: OAuth cria uma segunda conta.** A Lana entra com uma conta Google cujo e-mail é diferente do que ela cadastrou com senha. Não há erro: o Supabase cria um segundo usuário, ela cai em `needs_profile` e vê a `Escolha` de novo, com o espaço dela aparentemente sumido. A saída é _Trocar de conta_, que existe na tela exatamente para isso. A Fase 2 herda o caso na forma mais séria — entrar com o e-mail errado e criar um segundo espaço vazio.

**OAuth cancelado ou recusado.** O provedor devolve `error` e `error_description` na URL de volta. Vira `provider_denied` visível, não tela em branco.

**Relógio do cliente adiantado.** O cliente acha que o token expirou antes da hora e renova cedo — inofensivo. Atrasado, ele envia um token que o servidor já recusa, recebe 401, e o `auth-js` renova e repete. Nenhum dos dois casos precisa de código nosso; o que precisaria é confiar em `exp` lido no cliente para decidir autorização, e I7 proíbe.

**Duas abas.** Elas compartilham o mesmo `localStorage` e o mesmo cliente por aba. `enable_refresh_token_rotation` com `refresh_token_reuse_interval = 10` cobre a corrida das duas renovando junto. O que **não** estaria coberto é I4 sendo violada: dois clientes na mesma aba rodam duas rotações sobre o mesmo registro e derrubam a sessão um do outro.

**Projeto pausado.** `loadAccountStage` devolve `{ status: 'error' }` e o app mostra falha, nunca `Escolha`. Mandar quem tem casal para a tela de onboarding porque a rede caiu seria a versão desta fase de "chamar lacuna de separação".

## 8. Limites & orçamentos

Dois usuários. Login acontece algumas vezes por semana, e a sessão dura enquanto o refresh token for renovado.

| Limite | Valor | Onde morde |
| --- | --- | --- |
| `minimum_password_length` | **12** | Cadastro; ADR 0004 |
| `jwt_expiry` | 3600 s | Janela em que uma sessão revogada ainda parece viva (I7) |
| `auth.rate_limit.sign_in_sign_ups` | 30 / 5 min / IP | O que morde aqui — e o que contém força bruta |
| `refresh_token_reuse_interval` | 10 s | Corrida entre abas |
| `auth.rate_limit.email_sent` | 2 / hora | **Não morde mais nesta fase.** Nenhum caminho de login manda e-mail |

`loadAccountStage` faz **no máximo duas viagens de rede** (uma em `profiles`, uma em `couple_members`), e resolve antes da primeira pintura de tela de domínio. Orçamento: **abaixo de 500 ms na stack local**. Não é um número apertado — é o teto acima do qual o portão precisa de tela de carregamento própria em vez do esqueleto.

## 9. Segurança & permissões

Autenticação é o portão; **autorização continua sendo RLS** e não muda nesta fase. O que muda é que a RLS passa a receber um `auth.uid()` que veio de uma pessoa, não de um harness.

**A senha é a porta principal agora, e isso reordena as defesas.** O vetor real não é força bruta contra dois e-mails — é reuso de senha que já vazou em outro serviço. Daí a ordem: `auth_leaked_password_protection` ligado (era o último aviso em aberto do projeto, e agora tem dono e critério), comprimento mínimo 12, e **nenhuma regra de composição**, pela razão registrada no [ADR 0004](../Decisions/0004-login-com-senha-e-oauth.md). O limite de 30 tentativas por 5 minutos por IP, que já existe, cobre o resto.

**O e-mail é afirmado, não verificado.** Com `enable_confirmations` desligado, o Supabase marca `email_confirmed_at` no cadastro sem ninguém ter provado nada. É o preço de não depender de SMTP, e tem uma consequência que **a Fase 2 não pode afrouxar**: o convite exige o link ou o código de 6 dígitos, nunca só o e-mail. O desenho já é assim (_"Só quem tiver o link ou o código entra"_). Se algum dia o convite casar por e-mail sozinho, alguém que se cadastre com o endereço da Lana entra no espaço do casal.

**A chave publishable continua pública** e continua não protegendo nada — é o que o [ADR 0001](../Decisions/0001-supabase-com-rls-por-casal.md) já registra. O que esta fase acrescenta é que o `access_token` **não** circula na URL, porque PKCE substitui o fluxo implícito.

**Lista de redirecionamento é controle de segurança, não configuração.** `additional_redirect_urls` é o que impede o retorno do OAuth de ser desviado para um domínio de terceiro levando o código junto. Ela recebe a origem de desenvolvimento e a de produção, e nada além — em particular, nada com curinga.

**A senha nunca encosta em estado nosso** (I6): sai do campo, vai para a chamada do cliente, e acaba ali. Não entra em log, não entra em mensagem de erro, não entra em `localStorage`.

`enable_anonymous_sign_ins` fica `false`, como está. Sessão anônima criaria `auth.uid()` sem pessoa por trás, e todo o portão desta fase passa a ter um quarto estágio que ninguém especificou.

## 10. Critérios de aceite (testáveis)

| # | Critério (Dado/Quando/Então) | Como provar |
| --- | --- | --- |
| A1 | Dado um e-mail sem conta, quando se cadastra com senha de 12+ caracteres, então há sessão imediata e **nenhum** e-mail de confirmação é exigido (R2) | teste `supabase/tests/auth.test.ts` |
| A2 | Dada uma senha de 11 caracteres, quando se tenta cadastrar, então `weak_password` com `reason: 'too_short'` e **nenhum** usuário é criado (R3) | teste `supabase/tests/auth.test.ts`, com contagem de `auth.users` antes e depois |
| A3 | Dado um e-mail inexistente e uma senha errada de uma conta existente, quando se tenta entrar em cada caso, então os dois devolvem `invalid_credentials` — a mesma causa (I10) | teste `supabase/tests/auth.test.ts` |
| A4 | Dado um usuário autenticado sem linha em `profiles`, quando se resolve o estágio, então `{ status: 'ok', rows: { stage: 'needs_profile' } }` — nunca `error` nem `unauthenticated` (I3) | teste `supabase/tests/auth.test.ts` |
| A5 | Dado um usuário com perfil e sem `couple_members`, quando se resolve o estágio, então `needs_couple` com o `profileId`; e dado um membro do casal do harness, então `ready` com `coupleId` e `slot` | teste `supabase/tests/auth.test.ts` |
| A6 | Dada a ausência de sessão, quando se resolve o estágio, então `{ status: 'unauthenticated' }` — **nunca** `ok` com `needs_profile` (I2) | teste `supabase/tests/auth.test.ts` |
| A7 | Dada uma conta criada por senha, quando a mesma pessoa entra pelo provedor OAuth com o mesmo e-mail, então `auth.users` tem **uma** linha e `profiles` tem **uma** linha (R12) | **parcial.** Automatizado: a precondição (`email_confirmed_at` preenchido no cadastro, que é o que o GoTrue checa para vincular) em `supabase/tests/auth.test.ts`. A vinculação em si exige identidade OAuth real e fica **manual** — ver seção 11 |
| A8 | Dada uma falha de rede (cliente apontado para porta morta), quando se resolve o estágio, então `{ status: 'error' }` distinguível de vazio (I2) | teste `supabase/tests/auth.test.ts` |
| A9 | Dado `signed_out`, quando o app renderiza, então aparece o Login e **nenhuma** tela de domínio (I1) | teste de interface `src/auth/Login.test.tsx` |
| A10 | Dado `needs_profile` ou `needs_couple`, quando o app renderiza, então aparece a `Escolha`, e o texto renderizado **não contém** afirmação sobre convite pendente (R8) | teste de interface `src/auth/Escolha.test.tsx`, asserção sobre a copy |
| A11 | Dado `loading`, quando o app renderiza, então não aparece nem o Login nem a tela de domínio (I8, R5) | teste de interface |
| A12 | Dada uma sessão viva e o app renderizado, quando `onAuthStateChange` emite `SIGNED_OUT`, então a tela volta ao Login sem recarregar (R9) | teste de interface, dirigindo o callback |
| A13 | Dado o `config.toml`, quando se inicia o fluxo OAuth, então o `redirect_to` é a origem do app — e não `127.0.0.1:3000` | teste `supabase/tests/auth.test.ts`, sobre a URL devolvida por `signInWithOAuth({ skipBrowserRedirect: true })` |
| A14 | Dado `VITE_AUTH_PROVIDERS` sem `apple`, quando o Login renderiza, então o botão da Apple não existe na árvore (R1) | teste de interface `src/auth/Login.test.tsx` |
| A15 | Dado o projeto remoto, quando se consultam os advisors de segurança, então `auth_leaked_password_protection` não aparece mais | saída do advisor do Supabase, colada no ledger |
| A16 | Dado o código da fase, quando se roda `npm run typecheck` e `npm run lint`, então ambos passam limpos | saída dos dois comandos |

## 11. Abordagem de teste

**O que é sessão se prova contra a stack local, não contra mock.** Um mock do cliente Supabase aqui provaria que o mock funciona — é a mesma razão pela qual RLS virou teste de integração na Fase 0. O caminho de senha é particularmente fácil de provar de verdade: não há e-mail no meio, então cadastro, entrada e falha são três chamadas determinísticas.

A2 merece nota: ele afirma sobre o **efeito colateral ausente**. Não basta ver `weak_password` voltando; é preciso ver que `auth.users` não cresceu. Uma implementação que criasse o usuário e só então recusasse passaria no teste ingênuo e deixaria contas órfãs.

**Comportamento de tela se prova em jsdom**, como decide o [ADR 0005](../Decisions/0005-interface-se-prova-em-jsdom.md). Isso é ferramental novo: hoje `vitest.config.ts` roda com `environment: 'node'` e não há jsdom nem Testing Library. A fase instala os dois e separa o ambiente por padrão de arquivo, de modo que a suíte rápida do gate continue rápida onde DOM não faz falta.

As asserções de tela são sobre **o que a pessoa vê e faz** — texto renderizado, papel acessível, botão presente ou não. A11 e A12 existem porque são os dois comportamentos que "parecem óbvios" e são os que quebram: o piscar do Login e a tela que não reage à sessão morrendo.

Fica **manual**, e com motivo declarado:

- **OAuth de ponta a ponta, e com ele a vinculação de identidades (A7).** Precisa de credencial real e de um navegador de verdade indo a domínio de terceiro. O que é automatizável fica do nosso lado: a URL de autorização (A13), o que se renderiza conforme o provedor está configurado (A14), a volta com erro virando `provider_denied`, e a precondição da vinculação. O passo manual é um só e vale escrever: **entrar pelo Google com o mesmo e-mail de uma conta de senha e conferir que `auth.users` não cresceu.** Se crescer, o Gabriel vira dois usuários e dois perfis, e nada acusa.
- **A15**, que é toggle de painel, e cuja prova é a saída do advisor.
- **Regressão visual e responsividade.** jsdom não tem layout nem CSS aplicado. O ADR 0005 registra isso como limite conhecido; fingir que o teste cobre é o risco real.

## 12. Riscos & mitigações

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Senha esquecida sem caminho de volta | A pessoa fica fora do próprio diário até alguém mexer no painel | Consciente e registrado (seção 7, ADR 0004). A tela **não** oferece _Esqueci minha senha_, porque o botão abriria caminho inexistente. Gatilho para mudar: domínio verificado |
| Senha reusada de um serviço que já vazou | Comprometimento da conta sem nenhuma falha nossa | `auth_leaked_password_protection` ligado, com critério próprio (A15), e mensagem que diz "conhecida", não "fraca" |
| E-mail afirmado e não verificado | Alguém se cadastra com o e-mail da Lana | Controle compensatório: o convite exige link ou código, nunca só o e-mail (seção 9). É restrição que a Fase 2 herda e não pode afrouxar |
| `loading` tratado como `signed_out` | Login pisca em toda recarga; no pior caso, sessão válida é descartada | I8 e A11. É o bug mais comum desta classe de tela, e por isso tem critério próprio |
| Vinculação de identidades não acontecer | Gabriel vira dois usuários e dois perfis; o casal fica com o membro errado e nada acusa | A7 prova, em vez de assumir. Se falhar, a decisão sobe para o ADR 0004 antes de a Fase 2 começar |
| Tela de domínio renderizada para quem não tem casal | `listStays` devolve `ok` com zero linhas, e a tela diz "nada por aqui" para quem só não terminou o cadastro | I1 e A9/A10: o portão resolve antes da primeira pintura |
| `Escolha` com dois botões inertes | Tela que não faz nada parece quebrada | Botões desabilitados **com motivo visível**, não desabilitados em silêncio. Fase 2 remove o estado |
| Desenho e produto divergirem sem ninguém notar | A próxima fase implementa a partir de um frame que já não vale | Registrado na seção 13 como pendência de Pencil, com os três pontos exatos |
| jsdom e Testing Library deixarem a suíte do gate lenta | O gate que roda a cada `Stop` incomoda e alguém o desliga | Ambiente por padrão de arquivo (ADR 0005): só `*.test.tsx` paga o custo de DOM |

## 13. Open questions (bloqueiam a implementação)

**Bloqueantes: nenhum.** Todas as 16 provas da seção 10 rodam contra a stack local, sem credencial externa.

**Decidido em 2026-09-26, e não se re-discute nesta fase:**

- **Provedores OAuth: só Google.** A Apple sai do escopo (ver seção 14). `VITE_AUTH_PROVIDERS=google`.
- **Recuperação de senha: manual.** Não há _Esqueci minha senha_ na tela; senha perdida se reseta pelo painel do Supabase. O gatilho para reabrir é o domínio verificado, não o incômodo.

**Pendências externas — não bloqueiam implementar, bloqueiam partes de "pronto":**

1. **Credencial do Google OAuth.** Client id e secret de um projeto GCP, grátis. Enquanto não existirem, `VITE_AUTH_PROVIDERS` fica vazio e a tela mostra só e-mail e senha — comportamento especificado (R1) e coberto por A14, não falha. Quer dizer: a fase pode ser escrita e provada inteira antes de a credencial existir.
2. **Domínio verificado para o Resend.** Não bloqueia mais o login — é o que o [ADR 0004](../Decisions/0004-login-com-senha-e-oauth.md) resolveu. Continua bloqueando a recuperação de senha automática e o convite da Fase 2.
3. **`auth_leaked_password_protection`** é toggle de painel, feito por você, e é o único item desta lista que a fase **não pode declarar pronta sem** (A15).
4. **Stack local de pé.** `npx supabase start` com Docker rodando. Oito dos 16 critérios são integração, e o `DEVKIT_CMD_MIGRATE_CHECK` roda `db:reset`. Com o Docker parado eles **falham** em vez de passar, que é o comportamento certo — mas travam a prova.

**Pendência de desenho — o Pencil diverge do produto em três pontos, e o ajuste é seu:**

5. A copy do Login diz _"Mandamos um link pro seu e-mail — sem senha pra lembrar."_ Não vale mais.
6. Não existe tela de **criar conta**, embora o rodapé do Login já ofereça _"Criar conta"_. A fase constrói uma no padrão do painel vizinho.
7. Não existe tela de **recuperar senha** — e, por ora, não deve existir (seção 7).

**Não bloqueante — implementável com o valor abaixo:** comprimento mínimo de senha **12**, escolhido no ADR 0004 contra a recomendação de comprimento-sobre-composição, não medido em uso.

## 14. Fora de escopo

**Link mágico.** Descartado pelo [ADR 0004](../Decisions/0004-login-com-senha-e-oauth.md), não esquecido. Voltar a ele depois não muda schema nem migration — é um ADR novo quando o domínio estiver verificado.

**Recuperação de senha.** `resetPasswordForEmail` depende do mesmo SMTP. Confirmado em 2026-09-26: até o domínio estar verificado, reset é **manual pelo painel**, e não há botão na tela — um _Esqueci minha senha_ que não manda e-mail é pior que a ausência dele.

**OAuth da Apple.** Decidido em 2026-09-26: fora da Fase 1. Exige Apple Developer Program a US$ 99/ano, que é custo recorrente por um botão num app de duas pessoas. Não é trabalho adiado e sim configuração ausente: `signInWithProvider` já aceita `'apple'`, e ligar depois é acrescentar o provedor a `VITE_AUTH_PROVIDERS`. O desenho perde um botão até lá (seção 13).

**Tudo que está atrás dos dois botões da `Escolha`.** Criar o espaço, digitar o código, o e-mail de convite e os estados de erro de convite são os 23 frames da Fase 2. A Fase 1 entrega a tela e a saída (_Trocar de conta_); os dois caminhos ficam desabilitados com motivo visível.

**A busca por convite pendente.** O frame do Login traz a nota _"depois do login: tem convite pendente pro e-mail → Cenário 2 · não tem → Escolha"_, e a `Escolha` traz _"Não achamos convite pendente pra <e-mail>"_. Nada disso nasce aqui: não existe tabela de convites, e a busca por e-mail é RPC `security definer`, que é da Fase 2 pelo mesmo motivo que a busca por código é. O que a Fase 1 faz é **não mentir**: a linha sai da tela em vez de aparecer sem que ninguém tenha procurado (R8). O desenho já tem o texto que cobre a lacuna — _"Recebeu um e-mail de convite? Abra o link por lá — o código já vai junto."_

**Biblioteca de rotas.** O app é uma máquina de estados de `AuthState` × `AccountStage`, e o retorno do OAuth é resolvido pelo próprio cliente Supabase, que limpa a URL. Adicionar `react-router` agora seria dependência estrutural — e portanto ADR — para resolver um problema que ainda não existe. A conversa é da Fase 7, quando houver cinco áreas navegáveis.

**Sair da conta pelas Configurações.** `signOut` nasce aqui, mas a única superfície que o expõe é _Trocar de conta_, na `Escolha`. O item _"Sair desta conta"_ do frame de Configurações é da Fase 3.

**Trocar de e-mail e alterar senha pelas Configurações.** O frame mostra os dois. São da Fase 3, e o segundo agora existe de verdade — antes desta decisão ele seria um item para uma senha que não existia.

**Avatar e foto.** `profiles` não tem `avatar_path`, pela razão registrada na Fase 0: coluna sem quem a escreva fica nula para sempre. Quem escreve é o onboarding.

**Realtime e notificação de entrada.** _"a Lana recebe um aviso"_ atravessa várias telas e continua no backlog, com ADR previsto para a Fase 4.

---

## Plano (Gate 2)

> Verticais, ordenadas por dependência. Cada uma cita os critérios da seção 10 que precisa deixar prováveis.

1. [ ] **Configuração de auth.** `src/lib/supabase.ts` com as quatro opções explícitas; `supabase/config.toml` com a tabela da seção 5 aplicada; `.env.example` com `VITE_AUTH_PROVIDERS`. → A13
2. [ ] **Ferramental de prova de interface.** jsdom e Testing Library instalados, `vitest.config.ts` com ambiente por padrão de arquivo (ADR 0005), e um teste de fumaça que roda no gate. Instalar sem separar o ambiente torna a suíte rápida lenta, que é o que faz alguém desligá-la. → habilita A9–A12, A14
3. [ ] **`src/data/account.ts`.** `loadAccountStage` sobre `DataResult`, com os três estágios e as duas viagens de rede. → A4, A5, A6, A8
4. [ ] **`src/auth/session.ts` e `signIn.ts`.** `AuthState` com `loading`, assinatura de `onAuthStateChange`, entrada e cadastro por senha, `signInWithProvider`, `enabledProviders()`. → A1, A2, A3
5. [ ] **`src/auth/callback.ts`.** Consumo dos parâmetros da URL com as quatro saídas nomeadas. → R4, R10
6. [ ] **Telas.** `Login.tsx`, `CriarConta.tsx`, `Escolha.tsx` e `auth.css` (arquivo único por feature), com os dois botões da `Escolha` desabilitados com motivo. → A9, A10, A11, A14
7. [ ] **O portão no `App.tsx`.** `AuthState` × `AccountStage` decidindo entre esqueleto, Login, `Escolha` e a tela de domínio existente — que continua sobre `localStorage`, intacta. → A12, I1
8. [ ] **Testes de integração de auth.** `supabase/tests/auth.test.ts` com os estágios, cadastro e entrada por senha, recusa sem efeito colateral, e a vinculação de identidades. → A1–A8, A13
9. [ ] **`auth_leaked_password_protection`.** Ligar no painel e colar a saída do advisor no ledger. → A15
10. [ ] **Fechar.** A16 limpo, skill `verify` (Gate 3), os dois ADRs para `Accepted`, `../System/project_architecture.md` atualizado com `src/auth/` e o portão, os três pontos de divergência do Pencil ajustados (seção 13), e esta spec para 🟢.

---

## Related

- Research: N/A — ver cabeçalho
- ADRs desta fase: [0004](../Decisions/0004-login-com-senha-e-oauth.md) · [0005](../Decisions/0005-interface-se-prova-em-jsdom.md)
- ADR que esta fase não pode violar: [0001](../Decisions/0001-supabase-com-rls-por-casal.md) — RLS é a única porta e o cliente nunca filtra
- Fase anterior: [`fase-0-fundacao.md`](./fase-0-fundacao.md) · Fase seguinte: Onboarding, ver [`README.md`](./README.md#fase-2--onboarding)
- SOP: [`../SOP/falhas-silenciosas.md`](../SOP/falhas-silenciosas.md) — o item 1 é o eixo das seções 7 e 10
- Ledger da execução: `fase-1-login.ledger.md` — criado quando a implementação começar
- Design: frames `Login [LMpij]` e `Escolha [UEca1]`, lidos do `.pen` pelo MCP do Pencil em 2026-09-26. Divergem do produto em três pontos — seção 13
