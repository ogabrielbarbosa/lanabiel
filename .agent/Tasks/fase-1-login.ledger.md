# Ledger — `fase-1-login`

> Rulings tomados durante a execução. Spec: [`fase-1-login.md`](./fase-1-login.md).
> ADRs: [0004](../Decisions/0004-login-com-senha-e-oauth.md) · [0005](../Decisions/0005-interface-se-prova-em-jsdom.md).

---

## T1 · Configuração de auth

Concluído. Prova: A13 em `supabase/tests/auth.test.ts`, duas asserções — a URL de autorização carrega `redirect_to=http://127.0.0.1:5173`, e o `config.toml` não tem mais `:3000`.

Ruling: `flowType: 'pkce'` escrito junto com as três opções que já eram padrão. Padrão implícito é decisão que ninguém revisa, e num arquivo de 40 linhas o custo de escrever é zero. Custo se eu estiver errado: nenhum — as três são idênticas ao default.

**Achado que não estava na spec:** mudar `config.toml` e rodar `supabase start` **não aplica** a mudança se a stack já estiver de pé — o CLI reaproveita os containers. O primeiro teste de A2 passou uma senha de 11 caracteres porque o `minimum_password_length = 12` não tinha chegado ao container do GoTrue. Só `supabase stop && supabase start` aplica. Isso vale para toda fase que mexer em `[auth]`, e é candidato a linha no `.agent/SOP/falhas-silenciosas.md` — o sintoma é um teste que passa contra uma configuração que você acha que mudou.

---

## T2 · Ferramental de prova de interface

Concluído. Prova: 14 testes em `src/auth/AuthGate.test.tsx`; suíte rápida em **717 ms** com 44 testes.

Ruling: `test.projects` em vez de `environmentMatchGlobs`. Não foi preferência — `environmentMatchGlobs` foi **removido no Vitest 4**, que é a versão deste projeto (4.1.11). O ADR 0005 descreve o resultado (ambiente por padrão de arquivo), não o mecanismo, então isto não o contradiz.

Ruling: `setupFiles` só no projeto `ui`. A primeira versão carregava o setup nos dois e usava `typeof document !== 'undefined'` como guarda — funcionava, mas fazia a suíte de domínio importar coisa que ela não usa. Custo se eu estiver errado: nenhum; é reversível em uma linha.

Dívida: nenhuma. O orçamento do ADR 0005 (não deixar o gate lento) está cumprido com folga — 717 ms, dos quais 392 ms são o ambiente jsdom que só o projeto `ui` paga.

---

## T3 · `src/data/account.ts`

Concluído. Prova: A4, A5, A6 e A8 em `supabase/tests/auth.test.ts`, 6 testes.

Ruling: `.eq('profile_id', userId)` na leitura de `couple_members`. A policy devolve as linhas dos **dois** integrantes, e o que interessa é a própria. Isso parece "filtro no cliente", que o ADR 0001 proíbe — não é: a proibição é sobre `couple_id`, que é autorização. Filtrar pelo próprio `auth.uid()` é identidade. A distinção está escrita no arquivo, porque sem ela o próximo leitor desfaz.

Ruling: `slot` fora de `(1,2)` devolve `error`, não é estreitado na marra. O `CHECK` do schema garante hoje; se um dia não garantir, a faixa do calendário sairia errada sem ninguém saber por quê. Custo se eu estiver errado: um erro visível onde poderia haver um valor plausível — que é a direção certa de errar.

---

## T4/T5 · Sessão, entrada e volta do OAuth

Concluído. Prova: A1, A2, A3 em `supabase/tests/auth.test.ts`.

Ruling: os códigos de erro do GoTrue foram **lidos de `node_modules/@supabase/auth-js`**, não deduzidos. `invalid_credentials`, `user_already_exists`, `over_request_rate_limit`, `email_address_invalid`, e `AuthWeakPasswordError` com `reasons: ('length' | 'characters' | 'pwned')[]`. Traduzir errado aqui produziria a tela dizendo "algo deu errado" no caso mais comum de todos.

Ruling: `reasons` contendo `characters` devolve **erro genérico**, não `too_short`. `characters` só existe com `password_requirements` preenchido, que o ADR 0004 deixa vazio — chegar lá é deriva de configuração, e rotulá-la de "curta demais" mandaria a pessoa aumentar uma senha que já tem tamanho. Custo se eu estiver errado: uma mensagem feia num caso que não deveria existir.

Ruling: cadastro que volta **sem sessão** devolve erro explícito apontando `enable_confirmations`. Com a confirmação desligada isso não acontece; se alguém religar, o cadastro passaria a "dar certo" sem ninguém entrar. É a falha silenciosa que a própria decisão do ADR 0004 cria, e a guarda a converte em erro legível.

Ruling: `window` **saiu** de `signIn.ts` e `callback.ts` — `origin` e `replaceUrl` entram por parâmetro. Motivo concreto: `tsconfig.tests.json` não carrega a lib de DOM, e o teste de integração importa esses módulos, então `window` quebrava o `typecheck`. O efeito colateral é bom: a origem virou coisa que o teste consegue afirmar (A13).

---

## T6 · Telas

Concluído. Prova: A9, A10, A11, A14 em `src/auth/AuthGate.test.tsx`.

Ruling: os tokens visuais vieram de `GetVariables()` no `.pen` **aberto**, não do export JSON da raiz do repo. Boa coisa ter conferido: o export está desatualizado e usa outro vocabulário (`bg-primary`, `accent-green`, `font-serif`), enquanto as telas de login usam `bg-deep`, `glass`, `accent`, `on-accent` e a fonte **Geist**. Ter confiado no export teria produzido uma tela com as cores de outra parte do app.

Ruling: o globo é **aproximação em gradiente CSS**. O design usa `IMAGEFILL` com `images/generated.webp`, que não foi exportado para o repo. Está marcado `aria-hidden` e é decorativo. Dívida: exportar o asset e trocar — não muda estrutura nem teste.

Ruling: os dois caminhos da `Escolha` estão desabilitados **com "Chega na próxima etapa" visível**, e o teste afirma sobre isso. Botão inerte em silêncio parece defeito; o motivo visível é o que diz que a tela está certa e a fase é que não chegou lá.

Ruling: a `Escolha` **não** renderiza "Não achamos convite pendente pra <e-mail>". Dois testes afirmam a ausência. É R8: não existe tabela de convites, ninguém procurou, e a tela não pode afirmar que procurou.

---

## T7 · O portão

Concluído. Prova: A12 e os testes de I1 e I2 em `src/auth/AuthGate.test.tsx`.

Ruling: o estágio é guardado como `{ userId, result }` e **derivado** na renderização, em vez de guardado sozinho e limpo por efeito. Nasceu de um aviso do oxlint (`react(set-state-in-effect)`), e o aviso estava certo por um motivo maior que o dele: limpar por efeito deixa uma janela em que a tela mostra o estágio de quem já saiu. Assim a obsolescência é impossível por construção. Custo se eu estiver errado: nenhum — é menos código.

Ruling: `db` e `loadStage` entram por parâmetro no `AuthGate`. É o que permite o teste dirigir a assinatura de sessão sem rede e sem mockar o cliente Supabase inteiro. O que o banco responde de fato continua provado em integração; o que o portão decide é provado aqui. Cada prova cobre o que consegue cobrir.

Ruling: `App.tsx` virou só o portão, e a tela antiga foi para `src/timeline/TimelineScreen.tsx` **sem mudar de conteúdo**. A Fase 5 vai apagá-la; mover agora é mais barato que embrulhar.

**Achado, e é o mais importante desta fase:** o movimento do arquivo quebrou `import './timeline/timeline.css'`, e **`typecheck` e `lint` passaram limpos** — TypeScript não resolve caminho de CSS (`allowArbitraryExtensions`), e o oxlint não olha imports de asset. Só o `build` pegou. Isso é exatamente a classe de falha do `.agent/SOP/falhas-silenciosas.md`: o app compila, os 70 testes passam, e a tela abre sem estilo nenhum. O `CLAUDE.md` mantém o build fora do gate por boas razões (lento, e estourar timeout é indistinguível de sucesso), mas esta fase é evidência de que **mover ou renomear arquivo pede `npm run build` antes de dizer "pronto"**, e vale virar linha no SOP.

---

## T8 · Testes de integração de auth

Concluído. Prova: `supabase/tests/auth.test.ts`, 12 passando; suíte de integração inteira 26 passando, inclusive depois de `db:reset`.

Ruling: A8 injeta a sessão pelo **armazenamento**, não por `setSession`. A primeira versão usava `setSession` contra o host morto, e o teste falhou devolvendo `unauthenticated` — porque `setSession` não valida contra host morto e não guarda nada. O teste estaria provando outro caso. Com o token no armazenamento e dentro da validade, `getSession()` resolve local e a falha aparece onde tem de aparecer: na primeira query.

Ruling: **A7 fica parcialmente automatizado, e a spec foi corrigida para dizer isso.** A vinculação de identidades só acontece quando uma identidade OAuth real chega com e-mail confirmado, e não há como disparar isso sem credencial do Google. O que o teste prova é a **precondição** — `enable_confirmations` desligado marca `email_confirmed_at` no cadastro, que é a condição que o GoTrue checa. A vinculação em si é verificação manual, listada na seção 11. Custo se eu estiver errado: o Gabriel vira dois usuários e dois perfis na primeira vez que entrar pelo Google, e nada acusa — por isso está na lista de manual em vez de dado como feito.

---

## T9 · `auth_leaked_password_protection`

**Não concluído.** Depende de toggle no painel do projeto remoto (Authentication), que é ação do Gabriel. É o único critério (A15) que impede esta fase de ir para 🟢.

---

## T10 · Fechar

`typecheck`, `lint`, `test` (44), `test:db` (26), `db:reset` e `build` — todos verdes, saídas na conversa. A spec fica **🟡 Reviewed** e não 🟢: A15 pendente (T9), e a vinculação de identidades (A7) pendente de verificação manual com credencial real.

Dívida aberta ao fim da fase:

1. **A15** — toggle no painel.
2. **A7 manual** — entrar pelo Google com o mesmo e-mail de uma conta de senha e conferir que `auth.users` não cresceu. Precisa da credencial do Google.
3. **Asset do globo** — exportar do Pencil e trocar o gradiente.
4. **Três divergências do Pencil** — seção 13 da spec.
5. **Duas linhas candidatas ao SOP** — o `supabase start` que não reaplica config, e o import de CSS que só o build pega.
