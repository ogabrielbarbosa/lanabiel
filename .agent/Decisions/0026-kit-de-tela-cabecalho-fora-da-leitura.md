# ADR 0026 — Kit de tela em `src/ui`, e o cabeçalho fora da leitura

- **Status:** Accepted
- **Data:** 2026-10-06
- **Área:** cliente, todas as telas

---

## Contexto

Cada tela (Lista, Calendário, Viagens, Configurações) escrevia o próprio
`*-area`, `*-header`, `*-title`, `*-kicker`, `*-controls` e o próprio
esqueleto, com o mesmo CSS copiado e já divergindo: respiro de cima 20 ou 24,
distância entre blocos 16 ou 24, margem do cabeçalho 8 ou 1, `line-height` do
título 1.05 ou 1.1, quatro `@keyframes` de pulso iguais. Não havia token de
espaço nem de raio.

Dois defeitos saíram daí. Os chips da Lista apareciam cortados: a faixa tem
`overflow-x: auto`, o que zera a altura mínima automática do item flex, e a
coluna da área a espremia para caber a grade. E o cabeçalho só aparecia com a
leitura: enquanto o banco não respondia (ou o projeto acordava da pausa do
free tier), a Lista mostrava só o título, as Viagens nem isso (A17 da Fase 6
mandava esconder o título), e os botões entravam depois, empurrando a tela.

## Decisão

1. **`src/ui/` é o kit de tela**, um arquivo de CSS (`ui.css`) e quatro peças:
   `PageArea` (a coluna que rola, com respiro e ritmo da página e nenhum filho
   encolhendo), `PageHeader` (título, aside do título, ações),
   `PageToolbar` (a linha de filtros) e `ChipRow` (a faixa de chips que rola,
   com respiro para o brilho e degradê na borda). Mais `Skeleton` (uma forma)
   e `Loading` (a região `aria-busy` com o rótulo para leitor de tela).
2. **Tokens de espaço e raio** em `ui.css`: `--space-1…10`, `--radius-sm…xl`,
   `--radius-pill`, `--page-pad`, `--page-gap`. A regra do ritmo: 16 entre
   blocos da área, 8 a mais sob o cabeçalho (24 até o primeiro bloco).
3. **O cabeçalho é texto e botão, não depende do banco: aparece desde o
   primeiro quadro.** Enquanto a tela lê, os botões estão no lugar e com a cara
   de sempre, com `aria-disabled` e sem ação. Só o corpo vira esqueleto.
   **Não há linha acima do título** (o antigo kicker: "22 dias juntos · 8
   separados", "5 viagens juntos desde 2025", "Espaço privado · só…"): era o
   único pedaço do cabeçalho que vinha do banco, e saiu de todas as telas — o
   que é dado mora no corpo e no painel. Isso
   revisa o A17 da Fase 6 na parte do título; a outra parte (nunca a Grade
   vazia antes do `ok`) continua.
4. As regras de base do kit vão em `:where()` (especificidade zero): a tela
   que precisa de outra coisa (a máscara e o `gap` de 24 das Viagens) escreve
   a sua e vence sem depender da ordem dos imports.

O CSS de cada tela continua num arquivo por feature (`list/list.css`…), agora
sem nada do que é ritmo de página.

## Alternativas descartadas

- **Consertar só os chips da Lista** (`flex: none` em `.ls-chips`): resolvia o
  sintoma, mas deixava as outras faixas expostas ao mesmo defeito e as quatro
  cópias continuariam divergindo.
- **Biblioteca de componentes ou CSS-in-JS** (Radix, Tailwind…): o projeto já
  decidiu por CSS puro por feature, sem framework. O que faltava era um lugar
  comum, não uma dependência.
- **Botões do cabeçalho com `disabled`**: o navegador e o CSS das telas
  esmaecem o `disabled`, o que diria "indisponível" por um segundo a cada
  abertura. `aria-disabled` diz o mesmo ao leitor de tela sem piscar.
- **Esqueleto do cabeçalho inteiro**: é o que havia, e é o que faz a tela
  pular quando a leitura chega.

## Consequências

### Positivas

- Mudar o respiro ou o tamanho do título passa a ser mudar um token.
- A tela já tem o título e os botões enquanto o banco acorda; nada se mexe
  quando os dados chegam.
- O teste não usa mais o título como sinal de "leu": usa algo que só existe
  com o `ok` (os números das Viagens, a grade do mês).

### Negativas / trade-offs

- O botão no cabeçalho em leitura parece clicável e não faz nada (o cursor
  vira `progress`). Se a leitura demorar muito, isso confunde mais que um
  esqueleto.
- Na leitura, o Calendário mostra o título do mês e nenhuma visão marcada: a
  visão padrão (Mês/Ano) é preferência do casal e está no banco. Quem tem Ano
  como padrão vê o título mudar de "Outubro 2026" para "2026".
- Botões e alternâncias (`*-btn`, `*-segmented`) continuam copiados por tela.
  São o próximo passo do kit, não feitos aqui.
