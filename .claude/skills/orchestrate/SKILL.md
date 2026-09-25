---
name: orchestrate
description: Executar um plano aprovado despachando um subagente por tarefa, com revisão em duas etapas e registro de decisões num ledger. Use quando houver plano ou spec com tarefas independentes para executar de ponta a ponta, quando o trabalho for grande demais para um contexto só, ou quando o pedido for paralelizar. Triggers - executar o plano, tocar a spec, fazer em paralelo, despachar agentes, orquestrar, dividir o trabalho, subagentes, rodar tudo.
---

# Orquestrar execução por subagentes

**O mecanismo é a ferramenta de subagente/workflow do host; a política é esta
skill.** Ela existe para que a paralelização não vire um monte de código que
ninguém consegue revisar.

**Pré-requisito: um plano ou uma spec com aceites.** Sem isso, não orquestre —
faça `/brainstorm` ou `/spec` primeiro. Orquestração multiplica o que você já
tem; multiplicar ambiguidade dá ambiguidade em paralelo.

---

## Escolha do mecanismo

| Situação                                                          | Use                                                                        |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Tarefas independentes, fan-out fixo, quer determinismo e retomada | Workflow — controle de fluxo que executa de verdade, com schema e retomada |
| Poucas tarefas, ou o próximo passo depende de ler o resultado     | Subagentes: várias chamadas na MESMA resposta = paralelo                   |
| Tarefas acopladas (uma muda o que a outra vai encontrar)          | **Não orqueste.** Faça em sequência você mesmo.                            |

Toda escrita concorrente exige isolamento por worktree. Dois agentes editando a
mesma árvore produzem exatamente a colisão de recurso numerado que a skill
`finish-branch` passa o passo 2 inteiro tentando encontrar depois.

---

## O contexto de cada subagente é construído, não herdado

Um subagente **nunca** recebe o histórico da sua sessão. Você monta o que ele
precisa, e só isso. Isso não é economia de token — é o que faz o contexto fresco
valer: ele não herda as suas suposições erradas.

Cada despacho carrega, sem exceção:

1. **O objetivo em uma frase** — o que existe no fim que não existia no começo.
2. **Os caminhos exatos** de arquivo que ele vai ler e escrever.
3. **O contrato** — o schema/DTO/interface que é fonte única, se houver.
4. **As restrições deste projeto** — o arquivo de instruções da raiz e
   `.agent/SOP/review-checklist.md` são leitura obrigatória **dele**, não sua.
5. **A prova esperada** — qual comando ou teste demonstra que terminou.
6. **O que ele NÃO deve tocar.**

## O laço, por tarefa

```
despachar implementador
      ↓
revisar em DUAS etapas (separadas, nesta ordem)
   1. Conformidade: faz o que a spec pediu? Cada aceite, um veredito.
   2. Qualidade: está correto, seguro e parecido com o resto do código?
      ↓
aprovado?  → registrar no ledger, próxima tarefa
reprovado? → rodada de correção (escada abaixo)
```

**As duas etapas são separadas de propósito.** Conformidade e qualidade reprovam
por motivos diferentes, e misturá-las produz o pior dos dois: código bonito que
não faz o que foi pedido passa, porque o revisor gostou do código. Revise contra
a spec **primeiro** — é a etapa que uma revisão de diff não faz, porque ela olha
o diff, não o contrato.

### Escada de correção — teto de 5

| Rodada          | Ação                                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1–3             | Retome o **mesmo** implementador com os achados. Ele tem o contexto.                                                       |
| 4–5             | Implementador **novo**, modelo mais capaz. Se três rodadas não resolveram, o contexto dele é parte do problema.            |
| 5 sem convergir | Pare de girar. Adjudique cada achado em aberto: corrija você, aceite com justificativa, ou registre como dívida no ledger. |

Re-review depois de correção é **escopada**: revise os achados, não o diff
inteiro de novo.

## O ledger

Um arquivo por execução, em `.agent/Tasks/<feature>.ledger.md`. É o registro do
que foi decidido enquanto ninguém estava olhando.

```markdown
## T3 · Endpoint de listagem

Concluído. Prova: listagem.spec.ts, 8 passando.
Ruling: paginei por cursor e não por offset — a lista recebe item novo pelo topo
e o offset repetiria linha na página 2. Custo se eu estiver errado: o total
deixa de ser exato no rodapé; reversível trocando o schema da query.
Dívida: sem teto de janela na agregação. Vira issue.
```

Formato do ruling: **o que decidi — por quê — o que custa se eu estiver errado.**
A terceira parte é a que importa: é ela que diz a quem revisa se vale desfazer.

O ledger é ADR de baixo custo. Quando um ruling se mostrar estrutural, promova
para `/adr` — é assim que decisão em voo vira decisão registrada.

## Decidir, não travar

Um plano em execução não espera humano. Conflito entre plano e código,
ambiguidade na spec, um limite que você pediria para exceder: **decida e
registre**. A spec é a autoridade, o plano é o argumento dela, e o seu
julgamento resolve o que nenhum dos dois responde.

Uma decisão errada custa retrabalho que a pessoa vê e desfaz. Uma sessão parada
numa pergunta custa o dia inteiro dela e não compra nada.

**Quatro coisas param a execução, e só elas:**

1. Operação destrutiva ou irreversível.
2. Ação sensível de segurança (credencial, permissão, dado pessoal).
3. Efeito fora da worktree: merge, push para branch compartilhada, deploy, envio a terceiro.
4. Plano tão quebrado que todo caminho à frente é chute.

Fora disso: decida, registre o ruling, siga. E não pergunte "posso continuar?"
entre tarefas — pediram para executar o plano.

## Fechamento

Terminadas as tarefas:

1. **Uma** revisão ampla do branch inteiro (`/code-review`). Aqui é o lugar
   dela, não por tarefa.
2. **Uma** rodada de correção sobre os achados finais, uma re-review escopada,
   adjudicação do resto no ledger.
3. Skill `verify` contra os aceites da spec.
4. Skill `finish-branch`.

---

## Related

- `.agent/System/ai-development-workflow.md` — onde a orquestração entra no pipeline
- `.agent/SOP/review-checklist.md` — o que a etapa 2 da revisão cobra
- Skills `verify` e `finish-branch` — o fechamento
- Template do ledger: `.agent/templates/ledger-template.md`
