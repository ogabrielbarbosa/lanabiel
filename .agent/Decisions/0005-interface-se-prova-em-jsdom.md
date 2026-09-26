# ADR 0005 — Comportamento de interface se prova em jsdom, não lendo o código

- **Status:** Proposed
- **Data:** 2026-09-26
- **Área:** ferramental de teste, todas as fases com tela (1, 3–7)

---

## Contexto

O `CLAUDE.md` e a spec da Fase 0 já dizem a regra: _"comportamento de interface
se prova em teste automatizado — não lendo o código"_. A Fase 0 pôde escrevê-la
sem cumpri-la, porque não tinha tela nenhuma; a seção 11 daquela spec registra
isso explicitamente — _"a partir da Fase 1 haverá tela, e aí a regra vale"_.

A Fase 1 é a primeira com tela, e as fases 3 a 7 são todas de tela. Então a
pergunta "como se prova" não é desta fase: é de seis, e quem responder primeiro
define o padrão que as outras vão seguir. Responder por omissão — cada fase
escolhendo o seu jeito — é o caminho para cinco jeitos e nenhum confiável.

O ferramental hoje não cobre isso. `vitest.config.ts` roda com
`environment: 'node'`, e não há jsdom nem nenhuma biblioteca de renderização
instalada. A suíte rápida (`npm run test`, sobre `src`) é o que o hook `Stop`
executa a cada parada, e ela é rápida justamente por ser pura e sem DOM — uma
propriedade que vale preservar, porque gate lento é gate que alguém desliga.

Dois dos comportamentos que a Fase 1 precisa provar deixam claro por que ler o
código não basta:

- O Login **piscando** em toda recarga, quando `loading` é tratado como
  `signed_out`. O código dos dois casos é quase idêntico e ambos compilam.
- A tela **não reagindo** à sessão morrer no meio do uso, continuando renderizada
  com dados vazios. É a falha nº 1 do [SOP](../SOP/falhas-silenciosas.md), agora
  em forma de composição de componentes.

Nenhum dos dois é detectável por tipo, por lint ou por leitura atenta. Os dois
são triviais de detectar renderizando.

## Decisão

Comportamento de interface se prova renderizando em **jsdom**, com
**Testing Library**, e as asserções são sobre **o que a pessoa vê e faz** —
texto renderizado, papel acessível, botão habilitado ou não, para onde se vai
depois. Nunca sobre estado interno de componente.

O ambiente é escolhido **por padrão de arquivo**, não globalmente:

| Padrão | Ambiente | Onde roda |
| --- | --- | --- |
| `src/**/*.test.ts` | `node` | suíte rápida, gate a cada `Stop` |
| `src/**/*.test.tsx` | `jsdom` | suíte rápida, gate a cada `Stop` |
| `supabase/tests/**/*.test.ts` | `node` | Gate 3, exige stack local |

Assim o teste de domínio continua sem pagar o custo de DOM, e o teste de tela
continua dentro do gate em vez de virar uma suíte à parte que ninguém roda.

O arquivo de teste mora **ao lado do componente** (`Login.tsx` e
`Login.test.tsx`), como `coupleState.ts` e `coupleState.test.ts` já fazem.

## Alternativas descartadas

- **Playwright, ou qualquer navegador de verdade.** É a única prova que cobre
  CSS, layout e pintura — coisas que jsdom simplesmente não tem. Descartada
  **agora**, não em definitivo: exige app de pé, stack do Supabase de pé e
  binários de navegador, o que a põe fora do gate pelo mesmo motivo que o `build`
  já está fora (`.devkit/profile.sh`: comando lento e dependente de ambiente
  falha quando o Docker está parado, e gate que acusa o ambiente errado é gate
  que se aprende a ignorar). O gatilho para reabrir é um fluxo que valha
  ponta a ponta — o onboarding de três cenários da Fase 2 é o candidato óbvio.
- **happy-dom em vez de jsdom.** Mais rápido, e a diferença aparece numa suíte
  grande. Descartada porque a economia é de segundos e o custo é de fidelidade: o
  modo de falha é um teste que passa sobre algo que o navegador faz diferente,
  que é exatamente o tipo de erro que este projeto não quer comprar. A
  velocidade aqui se resolve recortando o ambiente por arquivo, não afrouxando o
  DOM.
- **Extrair a lógica para hooks e funções puras e testar só elas, sem
  renderizar.** Barato, rápido, sem dependência nova, e cobre boa parte. Não
  cobre o que importa: os dois defeitos que motivaram esta decisão são de
  **composição** — qual estado leva a qual tela — e não de lógica isolada. Um
  `useAuthState` perfeitamente testado convive com um `App.tsx` que renderiza a
  tela errada.
- **Snapshot testing.** Descartada com prejuízo: um snapshot registra o que o
  código faz, não o que ele deveria fazer, e a forma padrão de lidar com um
  snapshot quebrado é atualizá-lo — ou seja, o fluxo de trabalho normal da
  ferramenta é aceitar a regressão.
- **Não testar interface e confiar em revisão manual.** É o que o projeto já
  recusou por escrito, antes de ter tela. Mantê-lo agora que tem seria decidir
  por cansaço.

## Consequências

### Positivas

- O gate do `Stop` continua provando comportamento depois que o projeto passa a
  ter tela, em vez de virar um verificador de tipos com nome de teste.
- As consultas da Testing Library são por papel e por texto, então escrever o
  teste empurra a marcação para algo acessível. O benefício é de lado, mas é
  real: `getByRole('button', { name: 'Entrar' })` não funciona sobre uma `div`
  com `onClick`.
- As fases 3 a 7 não re-discutem isto. Uma decisão, seis fases.
- O custo de DOM fica contido no padrão `.tsx`, então a suíte de domínio não
  desacelera.

### Negativas / trade-offs

- **jsdom não é um navegador.** Não há layout, não há CSS aplicado, não há
  pintura. Regressão visual, responsividade e contraste **não são provados
  aqui** — e o risco de verdade é achar que são. Enquanto não houver navegador
  no processo, isso continua sendo verificação manual, e a spec de cada fase
  precisa dizê-lo em vez de deixar implícito.
- Quatro dependências de desenvolvimento novas (jsdom e o trio da Testing
  Library) numa árvore que hoje tem doze. Não é peso de runtime, mas é mais uma
  coisa que envelhece e quebra em atualização de major.
- **Os testes ficam acoplados à copy em português.** Mudar _"Criar nosso
  espaço"_ quebra teste. É custo e é recurso ao mesmo tempo: a spec da Fase 1
  tem um critério (A10) que afirma justamente sobre a copy renderizada, porque a
  tela não pode dizer que procurou convite pendente sem ter procurado.
- A suíte rápida deixa de ser puramente pura. Hoje ela não toca DOM nem relógio;
  a partir daqui, parte dela monta uma árvore e desmonta. É pouco, mas é o
  primeiro passo na direção em que suítes ficam lentas, e vale medir antes de
  reclamar.

## Código / evidência

| Artefato | Caminho |
| -------- | ------- |
| Regra que este ADR implementa | `CLAUDE.md`; [`../Tasks/fase-0-fundacao.md`](../Tasks/fase-0-fundacao.md), seção 11 |
| Configuração a mudar | `vitest.config.ts` — hoje `environment: 'node'` global |
| Comandos do gate | `.devkit/profile.sh` — `DEVKIT_CMD_TEST`, `DEVKIT_CMD_TEST_DB` |
| Primeiros testes de tela | `src/auth/Login.test.tsx`, `src/auth/Escolha.test.tsx` — não existem ainda |
| Falha que motivou | [`../SOP/falhas-silenciosas.md`](../SOP/falhas-silenciosas.md), item 1 |

## Related

- [0004 — Login com senha e OAuth](./0004-login-com-senha-e-oauth.md) — a fase que
  força a decisão
- [`../Tasks/fase-1-login.md`](../Tasks/fase-1-login.md), seção 11
- `../System/ai-development-workflow.md` — o Gate 3 passa a ter o que cobrar em tela
