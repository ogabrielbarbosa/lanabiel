# ADR 0004 — Login com senha e OAuth, sem link mágico

- **Status:** Proposed
- **Data:** 2026-09-26
- **Área:** autenticação (Fase 1)

---

## Contexto

A Fase 0 construiu RLS e provou que ela corta, mas o app não tem como produzir a
sessão que a RLS lê: a única autenticação que existe é o helper `signIn()` de
`supabase/tests/harness.ts`, que usa `signInWithPassword` e existe só para os
testes. A Fase 1 tem de fechar isso, e a pergunta é por qual porta.

O desenho responde de um jeito: o frame `Login [LMpij]` mostra **Continuar com
Google**, **Continuar com Apple**, e um campo de e-mail com **Receber link
mágico**, sob a copy _"Mandamos um link pro seu e-mail — sem senha pra
lembrar."_ Não há campo de senha em tela nenhuma dos ~50 frames.

Ao especificar a fase, três coisas apareceram que o desenho não tinha como saber:

1. **O SMTP embutido do Supabase, em projeto novo, entrega só para membros da
   organização.** O link mágico para o e-mail da Lana sairia sem erro e não
   chegaria. Do lado do app tudo dá certo — `signInWithOtp` retorna sem erro e a
   tela diz "enviado" — e a pessoa espera para sempre.
2. **`auth.rate_limit.email_sent` é 2 por hora.** Mesmo com entrega funcionando,
   duas tentativas de login por hora é o teto.
3. **Resend, que resolveria os dois, depende de domínio verificado**, e essa
   pendência já está registrada no backlog de [`README.md`](./README.md) sem
   data. O backlog a trata como assunto do convite (Fase 2); na verdade o login
   depende dela primeiro, e login é dependência mais dura que convite.

Ou seja: adotar o desenho como está amarra a porta de entrada do app a uma
dependência externa sem data. Um app em que ninguém entra não tem fase seguinte.

Some-se a isso que o fluxo PKCE — escolhido para o `access_token` não circular no
fragmento da URL — guarda o verificador no navegador que pediu o link, então
pedir no notebook e abrir no celular falha.

Havia ainda um desconforto anterior, registrado na seção 9 da spec: **não existe
toggle no Supabase que desligue e-mail e senha preservando o link mágico.**
`[auth.email] enable_signup = true` habilita o endpoint de senha na API pública.
Quer dizer que a senha já estava lá, alcançável por quem chamasse a API direto,
sem tela nenhuma oferecendo — a pior configuração possível: superfície aberta que
ninguém revisa porque ninguém a vê.

A decisão de produto foi tomada em 2026-09-26: **senha ou OAuth, não link
mágico.**

## Decisão

A Fase 1 entrega **duas portas**: e-mail com senha, e OAuth (Google e Apple).
Nenhum link mágico.

- **E-mail e senha** é o caminho que não depende de nada externo. Funciona no
  primeiro dia, sem domínio verificado, sem SMTP, sem conta paga.
- **OAuth** é oferecido por provedor que tenha credencial configurada, lido de
  `VITE_AUTH_PROVIDERS`. Provedor sem credencial **não é renderizado** — botão
  que não pode funcionar é pior que botão ausente.
- O fluxo continua `pkce`, agora pelo retorno do OAuth, que volta ao mesmo
  navegador por construção. A limitação de dispositivo cruzado desaparece junto
  com o link mágico.

Como a senha passa a ser a porta principal, três configurações deixam de ser
opcionais e viram parte da decisão:

- `auth_leaked_password_protection` **ligado**. Era o último aviso de segurança
  em aberto do projeto e estava anotado como pendência solta; agora é a única
  defesa de primeira linha sobre a porta principal, e é a que pega o vetor real:
  senha reusada de outro serviço que já vazou.
- `minimum_password_length` de 6 para **12**.
- `password_requirements` fica **vazio**, de propósito. Exigir maiúscula, número
  e símbolo é o que a recomendação atual (NIST SP 800-63B) desaconselha: produz
  `Senha2026!` — que satisfaz a regra, é curta em entropia real e provavelmente
  já está numa lista de vazamento. Comprimento e checagem de vazamento fazem o
  trabalho; regra de composição só fabrica atrito.
- `[auth.email] enable_confirmations` fica **desligado**. Confirmar e-mail exige
  SMTP, que é exatamente a dependência que esta decisão existe para remover. O
  custo está nas consequências.

## Alternativas descartadas

- **Link mágico, como o desenho pede.** É a melhor experiência das quatro e a
  que o Pencil desenhou com cuidado. Foi descartada pelo contexto acima: a porta
  de entrada ficaria esperando um domínio verificado que não tem data, e, com o
  SMTP embutido, o login da Lana falharia **em silêncio** — sem erro nosso, com a
  tela dizendo "enviado". Não é que o link mágico seja pior; é que ele não é
  entregável agora.
- **OTP de 6 dígitos por e-mail** (o mesmo e-mail do Supabase já carrega
  `{{ .Token }}`). Resolve dispositivo cruzado, que era o defeito do PKCE. Não
  resolve nada do resto: continua sendo e-mail, continua preso ao SMTP e ao
  limite de duas mensagens por hora.
- **Só OAuth, sem senha.** Nada para lembrar, nada para vazar, e o Google
  provavelmente cobriria os dois. Descartada por dois motivos: o acervo passa a
  depender inteiramente de uma conta de terceiro — perder o Google é perder o
  diário do casal — e a Apple exige conta paga do Apple Developer Program
  (US$ 99/ano), que hoje não existe. Ficaria uma porta só, de um fornecedor só,
  em cima do fornecedor que já hospeda tudo.
- **Híbrido: senha e link mágico lado a lado.** Tentador, porque não exige jogar
  o desenho fora. Descartada porque, enquanto o SMTP não existir, o botão do link
  mágico fica na tela **parecendo funcionar** e não funcionando — a pessoa que
  escolher esse caminho não entra e não descobre por quê. Uma opção de login que
  não entrega é pior que uma que não está lá. Nada impede acrescentá-la depois:
  não muda schema, não muda migration, não muda este ADR — vira um ADR novo
  quando o domínio estiver verificado.
- **Manter o `signInWithPassword` só no harness e não expor senha no produto**
  (o que a spec previa antes desta decisão). Descartada porque era o pior dos
  dois mundos: a superfície de senha continuava aberta na API, sem tela, sem
  teste e sem proteção contra senha vazada.

## Consequências

### Positivas

- **O login funciona no primeiro dia**, sem domínio verificado, sem SMTP e sem
  conta paga. Nenhuma fase seguinte fica esperando um fornecedor.
- A superfície de senha, que já estava aberta na API e não era testada por
  ninguém, passa a ser caminho oficial, coberto por teste e protegido contra
  senha vazada. O buraco vira porta.
- O harness da Fase 0 deixa de ser contradição: `supabase/tests/harness.ts` já
  entra por senha, e agora o teste exercita **o mesmo caminho** que o casal usa.
- Dispositivo cruzado deixa de ser um caso de falha: não há link para abrir no
  aparelho errado.
- `auth_leaked_password_protection`, que era aviso pendente sem dono, ganha
  motivo e critério.

### Negativas / trade-offs

- **A dependência de e-mail não some, só muda de lugar.** "Esqueci minha senha"
  precisa de SMTP exatamente como o link mágico precisava. A diferença é a
  frequência: login acontece sempre, recuperação quase nunca. Até o Resend
  existir, senha perdida se resolve **à mão, pelo painel do Supabase** — o que é
  aceitável para duas pessoas e seria inaceitável para vinte.
- **Senha é um segredo que o casal tem de guardar**, e reuso de senha entre
  serviços é o vetor real, não força bruta. É por isso que a proteção contra
  senha vazada entra junto e não depois; sem ela esta decisão fica pior que a
  descartada.
- **O e-mail passa a ser afirmado, não verificado.** Com a confirmação
  desligada, o Supabase marca `email_confirmed_at` no cadastro sem ninguém ter
  provado nada — o que é bom para a vinculação de identidades (o OAuth casa com
  a conta de senha) e ruim porque qualquer pessoa pode se cadastrar com o e-mail
  de outra. O controle compensatório já existe no desenho e a Fase 2 **não pode
  afrouxá-lo**: o convite exige o link ou o código de 6 dígitos, nunca só o
  e-mail. Se algum dia o convite casar por e-mail sozinho, este trade-off vira
  buraco.
- **O desenho passa a divergir do produto em três pontos**, e o Pencil tem de ser
  ajustado: a copy _"sem senha pra lembrar"_ vira mentira; não existe tela de
  criar conta com senha, embora o rodapé do Login já ofereça _"Criar conta"_; e
  não existe tela de recuperar senha. As duas telas novas saem do padrão das
  vizinhas, o que é aceitável, mas é escopo que o desenho não cobre — e a Fase 3
  também é assim, por outro motivo.
- **Mais superfície de ataque que a alternativa descartada.** Link mágico não tem
  senha para vazar nem para adivinhar. O que contém isso aqui é configuração, não
  código: o limite de 30 tentativas por 5 minutos por IP que já existe, mais o
  comprimento mínimo e a checagem de vazamento.
- Perde-se a melhor experiência das quatro, e perde-se contra um problema de
  infraestrutura, não de produto. Se o domínio for verificado antes de a Fase 2
  fechar, vale reabrir — como ADR novo, não como edição deste.

## Código / evidência

| Artefato | Caminho |
| -------- | ------- |
| Spec da fase | [`../Tasks/fase-1-login.md`](../Tasks/fase-1-login.md) |
| Cliente único, onde `flowType` é decidido | `src/lib/supabase.ts` |
| Entrada e provedores habilitados | `src/auth/signIn.ts` — não existe ainda |
| Harness que já entra por senha | `supabase/tests/harness.ts` |
| Configuração de auth | `supabase/config.toml`, seção `[auth]` |
| Frame que diverge | `Login [LMpij]` no `.pen` — copy _"sem senha pra lembrar"_ |
| Pendência de SMTP que motivou a troca | [`README.md`](./README.md), backlog |

## Related

- [0001 — Supabase com RLS por casal](./0001-supabase-com-rls-por-casal.md) — a
  autorização não muda: senha ou OAuth, quem corta continua sendo a policy
- [0005 — Comportamento de interface se prova em jsdom](./0005-interface-se-prova-em-jsdom.md)
- `../System/project_architecture.md` — atualizar com `src/auth/` ao fim da fase
