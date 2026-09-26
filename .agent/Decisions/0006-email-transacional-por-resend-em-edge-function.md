# ADR 0006 — E-mail transacional por Resend, numa edge function que não usa `service_role`

- **Status:** Proposed
- **Data:** 2026-09-26
- **Área:** infraestrutura de e-mail, edge functions (Fase 2)

---

## Contexto

A Fase 2 manda o primeiro e-mail do produto: o convite, com link que já leva o
código. O design gira em torno dele — o Cenário 2 inteiro começa na caixa de
entrada, e a tela de espera oferece _Reenviar_.

O SMTP embutido do Supabase não serve, pelo motivo que já tirou o link mágico
da Fase 1 ([0004](./0004-login-com-senha-e-oauth.md)): em projeto novo ele
entrega só para membros da organização, com teto de 2 mensagens por hora, e
falha **em silêncio** — a chamada volta sem erro, a tela diz "enviado", e a
mensagem não chega. O Resend estava escolhido no backlog desde a Fase 0,
esperando domínio verificado. Em 2026-09-26 o Gabriel informou que o domínio
está pronto no Resend.

Havia ainda uma exigência nova: o critério da Fase 2 não é mais "a Lana entrou",
é "um casal que não conhecemos atravessa o fluxo". Um app que manda e-mail para
endereço arbitrário, com nome e texto escolhidos pelo usuário, é vetor de spam
e de phishing com a nossa marca. A decisão de onde o envio mora tem de responder
a isso, e não só a "como se manda um e-mail".

## Decisão

**O envio passa pelo Resend, dentro de uma edge function (`send-invite`) que
repassa o JWT de quem chamou e nunca usa `service_role`.**

- A função cria o cliente Supabase com o `Authorization` do pedido e chama a RPC
  `begin_invite_send`, que, sob RLS, confere que quem pede é membro do casal,
  aplica o limite (10 envios por casal por 24 h, 60 s entre envios do mesmo
  convite), incrementa `send_count` e devolve os dados do e-mail. **A autorização
  continua na policy**, como decide o [0001](./0001-supabase-com-rls-por-casal.md).
- O convite existe **antes** do envio. O envio é uma tentativa sobre um convite
  que já está gravado, então falhar ao enviar nunca perde o convite.
- `last_sent_at` só é gravado depois que o provedor aceita a mensagem, e é ele que
  a interface usa para dizer "enviado". A tela nunca afirma o envio antes disso.
- Idempotência por `Idempotency-Key: <invite_id>:<send_count>`: repetir a mesma
  tentativa não gera dois e-mails, e um reenvio legítimo gera.
- **Dois transportes**, escolhidos por `INVITE_EMAIL_TRANSPORT`: `resend` em
  produção e `mailpit` local (`POST /api/v1/send` no Mailpit da stack do
  Supabase, verificado em 2026-09-26 na v1.30.2). O teste de integração lê a
  mensagem pela API do Mailpit.
- `RESEND_API_KEY` existe só como segredo da função. Nunca vai para o bundle.

## Alternativas descartadas

- **SMTP embutido do Supabase.** Descartado pelo contexto: entrega só para a
  organização, 2 por hora, e falha sem erro.
- **Resend como SMTP customizado do Auth, mandando o convite por um template de
  Auth** (por exemplo, via `inviteUserByEmail`). Parece reaproveitar o que já
  existe, mas `inviteUserByEmail` **cria o usuário** no `auth.users` e exige
  `service_role` — o convite viraria uma conta criada em nome de alguém que
  ainda não disse sim, e a porta passaria a depender de uma chave que ignora RLS.
  Os templates de Auth também não carregam os dados do casal (nome, data, quem
  convidou) sem gambiarra em `user_metadata`.
- **Chamar a API do Resend direto do navegador.** Exporia a chave e tiraria o
  limite de abuso do servidor. Não há versão segura disso.
- **Disparar o envio de dentro do Postgres** (trigger + `pg_net` chamando o
  Resend). Mantém tudo no banco, mas a chave vira segredo do banco, a falha de
  envio fica assíncrona e invisível para a tela que precisa dizer se enviou, e o
  teste local teria que interceptar `pg_net`. Perde a propriedade central, "só
  diz enviado quando enviou".
- **Uma edge function com `service_role` que faz tudo** (autorizar, gravar,
  enviar). É o caminho mais curto e o mais comum nos exemplos. Descartada porque
  move a autorização da policy para o código TypeScript da função: um `if`
  esquecido ali e qualquer usuário manda convite de qualquer casal.
- **Resend através de fila** (job assíncrono com retentativa). Faria sentido com
  volume, e esconderia exatamente a informação que a tela precisa na hora.
  Reabrir se o volume pedir.

## Consequências

### Positivas

- O primeiro e-mail do produto não depende de SMTP de terceiro com limite
  escondido, e falhar é visível.
- A autorização de "quem pode mandar convite de quem" fica numa função SQL
  provada contra a stack local, como o resto do projeto.
- O ciclo inteiro (autorizar, contar, montar, enviar, marcar) é testável
  localmente e sem rede externa, graças ao transporte `mailpit`.
- Destrava, para depois, "esqueci minha senha" e confirmação de e-mail — o mesmo
  domínio pode virar SMTP customizado do Auth. **Não** entra nesta decisão
  (seria ADR novo, porque mexe no [0004](./0004-login-com-senha-e-oauth.md)).

### Negativas / trade-offs

- **Primeira edge function do projeto**: Deno no lugar de Node, outro runtime,
  outro jeito de rodar e publicar, segredos em outro lugar. É ferramental novo
  para uma função de cem linhas.
- **Dois transportes são dois caminhos de código.** O teste local prova o
  `mailpit`; o `resend` só se prova manualmente, contra um endereço real que
  **não seja o do Gabriel** — caso contrário um domínio não verificado passa no
  teste, porque o Resend entrega ao dono da conta.
- **Aceito não é entregue.** Bounce e spam ficam invisíveis. A mitigação é de
  produto, não de infraestrutura: o código fica sempre na tela de quem convidou,
  com _Copiar_ e _WhatsApp_, então o e-mail é conveniência e não ponto único de
  falha.
- **Se o Resend aceitar e `mark_invite_sent` falhar**, a tela diz "não saiu" e o
  segundo clique manda outro e-mail. O erro fica do lado que duplica, de
  propósito, e não do lado que mente.
- **Cota do plano grátis** (100 por dia, 3.000 por mês) é da conta inteira. Com o
  limite de 10 por casal, dez casais ativos esgotam o dia. Irrelevante hoje;
  vira custo mensal no dia em que houver casais de verdade.

## Código / evidência

| Artefato | Caminho |
| -------- | ------- |
| Spec da fase | [`../Tasks/fase-2-onboarding.md`](../Tasks/fase-2-onboarding.md), seções 5, 7 e 9 |
| Edge function | `supabase/functions/send-invite/` — não existe ainda |
| RPCs de envio | `begin_invite_send`, `mark_invite_sent` — migration da Fase 2, não existe ainda |
| Prova local do transporte | `supabase/tests/send-invite.test.ts` — não existe ainda |
| Mailpit local | `supabase/config.toml`, `[local_smtp]`, porta `55324` |

## Related

- [0001 — Supabase com RLS por casal](./0001-supabase-com-rls-por-casal.md) — a
  função repassa o JWT para a autorização continuar na policy
- [0004 — Login com senha e OAuth, sem link mágico](./0004-login-com-senha-e-oauth.md) —
  o mesmo problema de SMTP, resolvido pela porta oposta
- [0008 — Convite como entidade com código portador](./0008-convite-portador-e-um-casal-por-pessoa.md)
