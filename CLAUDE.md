# lanabiel

SPA em React + TypeScript, servida pelo Vite. Ver
[`.agent/System/project_architecture.md`](.agent/System/project_architecture.md).

## Processo de desenvolvimento

O fluxo, os gates e o que cada comando faz estão em
[`.agent/System/ai-development-workflow.md`](.agent/System/ai-development-workflow.md).
O resumo que vale em todo turno:

```
/brainstorm → /research → /spec → plan → build → verify → /code-review → finish-branch
   Gate -1     Gate 0     Gate 1  Gate 2         Gate 3     Gate 4         Gate 5
```

**Dimensione à incerteza.** Bugfix, copy e UI isolada pulam os Gates −1 e 0, às
vezes o 1. **Ninguém pula o Gate 3** — a skill `verify`, cobrada pelo hook `Stop`.

**Afirmação sem saída de comando é previsão, não relatório.** Não escreva
"funciona", "pronto" ou "corrigido" sem colar o que provou. "Não verificado" é
resposta legítima; "presumo que funcione" não é.

### Onde cada coisa mora

| Pergunta                   | Onde                             |
| --------------------------- | --------------------------------- |
| Por que decidimos assim?   | `.agent/Decisions/` (ADRs)       |
| Como o sistema funciona?   | `.agent/System/`                 |
| O que a revisão cobra?     | `.agent/SOP/review-checklist.md` |
| O que estamos construindo? | `.agent/Tasks/<feature>.md`      |
| Como se prova algo aqui?   | `.devkit/profile.sh`             |

### Decisões arquiteturais exigem ADR

Dependência estrutural nova, mudança de fluxo de dados, trade-off de
segurança/performance, ou padrão novo que outras features vão seguir → `/adr`,
**no mesmo PR**. Mudar uma decisão passada é um ADR novo que supersede a antiga;
não se reescreve um `Accepted`.

### Antes de propor mudança estrutural

Leia `.agent/Decisions/README.md`. Propor o que já foi rejeitado, sem tratar do
porquê, desperdiça a rodada inteira.
