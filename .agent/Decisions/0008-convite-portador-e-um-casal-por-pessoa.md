# ADR 0008 — Convite como entidade com código portador; uma pessoa em no máximo um casal

- **Status:** Proposed
- **Data:** 2026-09-26
- **Área:** schema (`couple_invites`, `couple_members`), segurança do convite (Fase 2)

---

## Contexto

Até a Fase 1, o convite era uma coluna: `couples.invite_code text not null
unique`, preenchida no seed com qualquer valor. O design da Fase 2 pede muito
mais do que uma coluna expressa. O convite expira em 7 dias, pode estar "já
usado", o reenvio mantém o código e estende o prazo, e trocar o e-mail precisa
invalidar o que foi mandado para o endereço errado.

Três fatos do projeto restringem o desenho:

1. **O e-mail da sessão é afirmado, não verificado.** Com `enable_confirmations`
   desligado ([0004](./0004-login-com-senha-e-oauth.md)), qualquer pessoa se
   cadastra com o endereço de outra. A Fase 1 deixou isso escrito como restrição
   que a Fase 2 "não pode afrouxar".
2. **O código é o único segredo do schema.** Quem o tem entra num casal e lê a
   história de duas pessoas.
3. **O critério mudou.** O produto é para outros casais, não só para Gabriel e
   Lana. Força bruta, conta duplicada e dois espaços para a mesma pessoa deixam
   de ser hipótese.

O design também pressupunha duas coisas que colidem com os fatos acima: o frame
C2·1 mostra os dados do convite **antes** do login, e o C2 e a `Escolha` preveem
achar "convite pendente para o seu e-mail".

## Decisão

**O convite é uma tabela própria (`couple_invites`), com um código portador de 6
caracteres que só se resolve com sessão, sob limite de tentativas. Nenhum caminho
casa convite por e-mail. E uma pessoa está em no máximo um casal, cobrado pelo
schema.**

- **Estado derivado, não gravado.** `accepted_at`, `revoked_at` e `expires_at`
  existem; "pendente/expirado/aceito/revogado" é calculado, pelo mesmo motivo do
  [0002](./0002-estadia-por-pessoa-estado-derivado.md).
- **Código:** Crockford base32 (sem `I`, `L`, `O`, `U`), 6 caracteres, ~30 bits,
  gerado com `gen_random_bytes`, único na tabela para sempre (nunca reutilizado).
  A entrada é normalizada: maiúsculas e minúsculas, hífen e espaço aceitos,
  `O→0`, `I/L→1`.
- **Portador:** quem tem o código entra, com qualquer conta. O e-mail do convite
  serve só para **enviar**.
- **Um convite aberto por casal**, por índice único parcial. Reenviar estende o
  prazo do mesmo código; trocar o e-mail revoga o anterior e gera outro.
- **Resolver exige sessão.** `lookup_invite` e `accept_invite` são `security
  definer` com `revoke ... from anon`, e contam falhas por `auth.uid()` em
  `private.invite_code_failures`: 10 por hora, e a 11ª responde `rate_limited`
  sem consultar o código.
- **Revogado responde como inexistente.** Expirado e usado respondem com
  detalhe, porque quem tem o código legítimo precisa saber o que fazer.
- **Entrar num casal só por `accept_invite`**, que trava o convite com `FOR
  UPDATE`, insere `slot = 2` e marca o aceite na mesma transação. Não existe
  policy de escrita em `couple_members` nem em `couple_invites`.
- **`unique (profile_id)` em `couple_members`.** Duas abas criando espaço ao
  mesmo tempo produzem um casal e uma recusa, por construção.
- **Funções `security definer` em `public` são endpoints por desenho**, e o
  advisor vai listá-las (`authenticated_security_definer_function_executable`).
  A lista aceita é exatamente esta, e um teste (A20 da spec) prova que não há
  outra: `create_couple`, `create_invite`, `renew_invite`, `begin_invite_send`,
  `mark_invite_sent`, `lookup_invite`, `accept_invite`.

## Alternativas descartadas

- **Manter `couples.invite_code`, com colunas de prazo ao lado.** Não expressa
  "revogado" nem "trocar e-mail sem reaproveitar o código", e mistura o segredo
  com a linha que todo membro lê. Um casal teria um código para sempre, que é o
  oposto de expirar.
- **Casar convite pelo e-mail da sessão** (o "convite pendente" do design). É a
  melhor experiência: a Lana entra e o convite já está lá. Descartada porque o
  e-mail não é verificado — quem se cadastrasse primeiro com o endereço alheio
  receberia o convite. Até mostrar só a *existência* do convite vaza que alguém
  convidou aquele endereço, e quem foi. Reabrir exige confirmação de e-mail
  ligada, e isso seria ADR novo sobre o [0004](./0004-login-com-senha-e-oauth.md).
- **Resolver código sem sessão** (o preview antes do login, como no C2·1). Sem
  identidade não há contra quem contar tentativas, e a RPC viraria porta de força
  bruta aberta para a internet. Limite por IP não existe no Postgres, e colocá-lo
  numa edge function só para isso seria mais uma peça para proteger uma tela.
- **Código de 6 dígitos numéricos**, como diz a copy do design. 10⁶
  combinações; com 300 tentativas por IP a cada 5 minutos (30 contas × 10), cai
  em horas. O alfanumérico dá 1,07 × 10⁹ com o mesmo tamanho na tela.
- **Código longo (token de 128 bits) no link e nenhum código digitável.** Mais
  seguro, e mata o Cenário 3 (código pelo WhatsApp), que o design trata como
  caminho de primeira classe.
- **Exigir que o e-mail da conta seja igual ao do convite.** Fecharia a porta
  para quem entra com outra conta Google — o caso mais comum de "conta errada" — e
  não protegeria nada, porque o e-mail não é verificado.
- **Impedir dois casais por checagem dentro da RPC**, em vez de `unique`. Perde a
  corrida entre duas abas: as duas checam, as duas passam, as duas inserem.

## Consequências

### Positivas

- Os cinco estados do design (pendente, expirado, usado, reenviado, trocado) têm
  representação direta, sem coluna de estado para divergir.
- A força bruta tem teto calculável: 300 tentativas por IP a cada 5 minutos,
  contra ~10⁹ códigos. Com mil convites abertos, a chance de acerto por janela é
  ~3 × 10⁻⁴.
- "A mesma pessoa em dois casais" é impossível por construção, não por disciplina.
- `couple_members` continua sem nenhuma policy de escrita — só se entra num casal
  pela função que confere o convite.

### Negativas / trade-offs

- **O design perde duas conveniências.** A Lana vê o convite só **depois** de
  entrar, e ninguém encontra convite pendente pelo e-mail. Quem não abre o link e
  não recebe o código não tem como descobrir que foi convidado.
- **Portador significa que vazou, entrou.** Um código mandado no grupo errado do
  WhatsApp dá acesso ao casal a quem o usar primeiro. A defesa é o prazo (7 dias),
  o "já usado" depois do primeiro aceite, e a revogação ao trocar o e-mail.
- **Conta duplicada continua possível e silenciosa.** A pessoa aceita com uma
  conta e depois entra com outra, que não está em casal nenhum. Aqui a mitigação é
  só mensagem: o link, aberto na conta que já está num casal, diz em qual espaço
  ela está. Sair de um espaço para entrar em outro fica para a Fase 3.
- **Sete funções `security definer` em schema exposto.** Cada uma é uma porta que
  não passa por RLS, e o advisor vai reclamar delas para sempre. A lista nominal
  e o teste que a trava são o que impede a oitava de entrar sem ninguém ver.
- **Contadores em `private.*` crescem** sem limpeza até o agendador existir. Não
  mudam resultado (só a última hora e o último dia contam), só ocupam espaço.
- `couples.invite_code` sai: o harness de teste da Fase 0, que limpava casais
  pelo código, precisa mudar.

## Código / evidência

| Artefato | Caminho |
| -------- | ------- |
| Spec da fase | [`../Tasks/fase-2-onboarding.md`](../Tasks/fase-2-onboarding.md), seções 4, 5, 6 e 9 |
| Restrição herdada da Fase 1 | [`../Tasks/fase-1-login.md`](../Tasks/fase-1-login.md), seção 9 |
| Coluna que sai | `couples.invite_code`, em `supabase/migrations/20260925120100_core_schema.sql` |
| Ancestral de `accept_invite` | `join_couple`, descrito em `supabase/baseline/README.md` |
| Prova das corridas e do limite | `supabase/tests/onboarding.test.ts` — não existe ainda |

## Related

- [0001 — Supabase com RLS por casal](./0001-supabase-com-rls-por-casal.md)
- [0004 — Login com senha e OAuth](./0004-login-com-senha-e-oauth.md) — de onde
  vem o e-mail não verificado que molda esta decisão
- [0006 — E-mail transacional por Resend](./0006-email-transacional-por-resend-em-edge-function.md)
