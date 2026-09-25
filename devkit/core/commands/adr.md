# /adr — Registrar uma decisão arquitetural

Registra o **porquê** de uma escolha em `.agent/Decisions/`. O _como_ fica em
`.agent/System/` — são documentos diferentes com vidas diferentes: o ADR é
imutável, o System doc é reescrito sempre que o código muda.

Uso: `/adr <título>`

---

## Instruções para o agente

### 1. Verificar necessidade

Só existe ADR se houver **trade-off estrutural**: nova dependência estrutural,
mudança de fluxo de dados, escolha de segurança ou performance com custo do
outro lado, ou padrão novo que outras features vão ter de seguir.

Bugfix, copy, componente de UI isolado sem impacto arquitetural → **não** crie ADR.
Registro demais dilui: um diretório com 30 ADRs triviais não é consultado.

### 2. Atribuir número

1. Leia `.agent/Decisions/README.md` — o último número da tabela.
2. Próximo = último + 1. Nome do arquivo: `NNNN-titulo-em-kebab-case.md`.
3. **Confira colisão com as outras frentes** antes de escrever:
   ```bash
   ls .agent/Decisions/*.md | sed 's/.*\///;s/-.*//' | sort | uniq -d
   git branch -a --format='%(refname:short)'
   ```
   Dois ADRs com o mesmo número não dão conflito de merge — dão duas linhas
   iguais no índice que ninguém percebe.

### 3. Escrever

A partir de `.agent/Decisions/0000-template.md`. As duas seções que decidem se o
ADR vai servir para alguma coisa:

- **Alternativas descartadas.** Um ADR sem alternativa rejeitada não é uma
  decisão, é uma descrição. O valor de ler um ADR dois anos depois está quase
  todo aqui: saber o que já foi pensado e por que não colou.
- **Consequências negativas.** Se não há custo, não houve decisão — houve uma
  escolha óbvia que não precisava de documento. Escreva o custo real, inclusive
  o que você espera que doa depois.

Status: `Accepted` se já implementado; `Proposed` se só planejado.

### 4. Registrar no índice

Adicione a linha na tabela de `.agent/Decisions/README.md` (ou mova de Proposed
para Accepted). Se este ADR **supersede** um antigo: marque o antigo com
`Superseded by NNNN` e **não o reescreva**. ADR aceito é registro histórico; a
mudança de ideia é um documento novo.

### 5. Ancorar no código (recomendado)

Um comentário curto no topo do arquivo principal afetado:

```
// ADR: .agent/Decisions/NNNN-titulo.md
```

É o que faz alguém encontrar a decisão a partir do código, que é a direção em
que a pergunta costuma nascer.

### 6. Atualizar o System doc, se aplicável

Se a decisão altera o fluxo operacional, atualize o documento correspondente em
`.agent/System/`. ADR = por quê; System = como. Deixar só o ADR obriga quem lê a
reconstruir o funcionamento a partir de decisões espalhadas.

---

## ADR vs. Spec vs. Ledger

| Artefato                  | Conteúdo                                           | Vida     |
| ------------------------- | -------------------------------------------------- | -------- |
| **ADR**                   | Decisão cross-cutting, com alternativas rejeitadas | Imutável |
| **`.agent/Tasks/<f>.md`** | O que construir: contrato, invariantes, aceites    | Evolui   |
| **`<f>.ledger.md`**       | Decisões tomadas durante a execução (rulings)      | Evolui   |

Um ruling do ledger que se mostrar estrutural **vira ADR**. É o caminho barato:
decide-se em voo, promove-se depois, e nada se perde no meio.

---

## Related

- `.agent/Decisions/README.md` — índice e regras
- `.agent/Decisions/0000-template.md` — template
- Skill `finish-branch` — confere colisão de numeração antes do merge
