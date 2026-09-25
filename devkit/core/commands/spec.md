# /spec — Especificação de feature (Gate 1)

Decide _o que_ construir — com contrato, invariantes e **critérios de aceite
testáveis** — **antes** de qualquer código.

Saída: `.agent/Tasks/<feature>.md`, a partir de `.agent/templates/spec-template.md`.

---

## Instruções para o agente

### 1. Contexto (nesta ordem, antes de escrever uma linha)

1. O Research (Gate 0), se existir: `.agent/Research/<tema>.md`.
2. `.agent/Decisions/README.md` — os ADRs que esta feature **não pode violar**.
   Se a spec contradiz um ADR aceito, ou ela muda, ou o ADR é superseded por um
   novo. Não existe terceira opção, e descobrir isso depois do código custa a
   feature inteira.
3. A arquitetura relevante em `.agent/System/`, e os contratos existentes que
   podem ser reaproveitados.
4. Se já existe `.agent/Tasks/<feature>.md`: **estender, não duplicar**.

### 2. Escrever a Spec

Preencha o template. Prioridade nas três seções que dão o rigor:

- **Contrato & dados** — o schema que é **fonte única de verdade**, os
  endpoints, a mudança de armazenamento. É o coração do processo: a UI valida
  para dar feedback instantâneo, o servidor valida como autoridade, e os dois
  leem o mesmo arquivo. Regra de negócio que mora em dois lugares não dá erro —
  dá divergência silenciosa.
- **Invariantes** e **Comportamento em falha** — o que sempre vale e o que
  acontece quando quebra. Cubra falhas **em cascata**, não só a isolada.
- **Critérios de aceite** — cada um mapeado a evidência executável. Critério que
  não dá para provar não é critério, é desejo: corte ou reescreva.

**Princípio:** _encode process, not knowledge_ — descreva resultados
observáveis, contratos e evidência exigida, não os passos de implementação.
Prosa por padrão; bullets só para listas de verdade.

### 3. Decisão arquitetural?

Se a feature introduz trade-off estrutural (fila, cache, auth, tempo real,
schema, tenancy, novo padrão obrigatório), marque "ADR necessário: Sim" e crie
via `/adr <título>` **no mesmo PR**.

### 4. Gate 1 — critério de passagem

A Spec vai para `🟡 Reviewed` só quando:

- **Zero open questions bloqueantes.**
- Contrato definido e esboçado.
- Critérios de aceite testáveis, cada um com a forma de prova ao lado.
- Um agente novo conseguiria implementar **sem perguntar** produto nem técnica.

Enquanto faltar algo, fica `🔴 Draft` — e **não se começa a implementar**.

### 5. Handoff

Só depois de `🟡 Reviewed`: preencha a seção **Plano (Gate 2)** com tarefas
verticais ordenadas por dependência, ou entre em Plan Mode. Cada tarefa tem que
passar no mesmo teste da spec: "um agente novo termina isto sem perguntar".

---

## O que vem depois (não reinvente)

| Fase            | Ferramenta                                             |
| --------------- | ------------------------------------------------------ |
| Plan (Gate 2)   | Plan Mode + seção Plano da Spec                        |
| Build           | skill `orchestrate` se as tarefas forem independentes  |
| Verify (Gate 3) | skill **`verify`** — cada aceite com prova de execução |
| Review (Gate 4) | `/code-review` + `.agent/SOP/review-checklist.md`      |
| Finish (Gate 5) | skill **`finish-branch`**                              |

---

## Related

- Template: `.agent/templates/spec-template.md`
- Fase anterior: `/research` · ADR: `/adr`
- Guia: `.agent/System/ai-development-workflow.md`
