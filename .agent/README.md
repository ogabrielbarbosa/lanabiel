# `.agent/` — a memória do projeto

O que o código não conta: por que foi decidido assim, como o sistema funciona,
o que estamos construindo agora.

## Onde procurar

| Pergunta                               | Arquivo                         |
| -------------------------------------- | ------------------------------- |
| Por que decidimos assim?               | `Decisions/` — ADRs, imutáveis  |
| Como o sistema funciona?               | `System/`                       |
| O que a revisão cobra?                 | `SOP/review-checklist.md`       |
| Como faço X passo a passo?             | `SOP/`                          |
| O que estamos construindo?             | `Tasks/<feature>.md`            |
| O que foi decidido durante a execução? | `Tasks/<feature>.ledger.md`     |
| Vale a pena existir?                   | `Research/<tema>.md`            |
| O que vale em **todo** turno?          | `CLAUDE.md` da raiz — e só isso |

## A regra de lugar

O arquivo de instruções da raiz é carregado em **todo** turno e em **todo**
subagente. Só pode conter o que vale sempre. O que se consulta uma vez por
tarefa mora aqui e é linkado de lá.

Ignorar isso tem um custo concreto: o arquivo cresce até ninguém ler, e cada
subagente passa a carregar centenas de linhas de catálogo que não usa.

## Índice

<!-- Mantenha esta lista atualizada. `/update-doc` faz isso no fim de cada rodada. -->

- `Tasks/README.md` — o roadmap das oito fases, e o que cada spec tem de decidir
- `System/project_architecture.md` — stack, camadas, fluxo de dados
- `System/ai-development-workflow.md` — o processo: gates, comandos, skills
- `Decisions/README.md` — índice dos ADRs
- `SOP/review-checklist.md` — o que a revisão cobra neste projeto
- `SOP/falhas-silenciosas.md` — o que esta stack quebra sem dar erro
