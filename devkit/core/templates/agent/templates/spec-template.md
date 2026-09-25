# Spec — `<feature>`

> **Gate 1.** Decide _o que_ construir, antes de escrever código. Salvar como
> `.agent/Tasks/<feature>.md`.
>
> **Princípio:** _encode process, not knowledge_ — descreva resultados
> observáveis, contratos e evidência exigida, não os passos de implementação.
> A Spec está **pronta** quando um agente novo consegue implementar sem fazer
> perguntas de produto nem de técnica.
>
> Prosa por padrão; bullets só para listas de verdade. Não repita o mesmo fato
> em duas seções. Seção que não agrega para esta feature: escrever
> `N/A — <razão>` — não apagar. A seção vazia é informação; a ausente é esquecimento.

- **Data:** YYYY-MM-DD
- **Autor:** <nome>
- **Status:** 🔴 Draft | 🟡 Reviewed (pronta p/ implementar) | 🟢 Done
- **Research (Gate 0):** `../Research/<tema>.md` ou `N/A — <razão>`
- **ADR necessário?** Sim → `/adr <título>` (mesmo PR) | Não

---

## 1. What & Why

O problema em uma frase e o impacto de resolvê-lo. Quem é o usuário e o que ele
consegue fazer depois que isto existir.

## 2. Como funciona (um cenário real)

O caminho **concreto** de ponta a ponta de UM cenário — do gesto do usuário até
o dado persistido e o que ele vê de volta. Não é lista de features; é um
walkthrough. Se você não consegue escrevê-lo, ainda não entendeu a feature.

## 3. Requisitos (comportamentos observáveis)

Verificáveis de fora, não implementação.

- **R1** — …
- **R2** — …

## 4. Invariantes

Afirmações numeradas que **sempre** têm de valer. Viram asserções e testes.

- **I1** — …
- **I2** — …

## 5. Contrato & dados

O coração da spec: a **fonte única de verdade**.

- **Schema / DTO** — esboce o shape aqui. A UI valida para dar feedback
  instantâneo; o servidor valida como autoridade; os dois leem o mesmo arquivo.
- **Endpoints / interfaces** — o que entra, o que sai, quem pode chamar.
- **Mudança de armazenamento** — tabelas, colunas, índices, migração,
  autorização a nível de linha.
- **Compatibilidade** — quebra contrato existente? O que precisa ser
  reconstruído ou versionado?

```
// esboço do contrato
```

## 6. Identidade & nomes

Como identificadores duráveis são derivados: ids externos, chaves de dedupe,
nomes de canal, chaves de idempotência. Se a feature cria nomes que outros
sistemas vão referenciar, a regra se define **aqui** — depois de existir dado
com o nome errado, mudar custa migração.

## 7. Comportamento em falha

Estados, retentativas, recuperação. Cubra falhas **em cascata**, não só a
isolada: a escrita deu certo e a notificação falhou? O provedor devolveu 429? A
fila estourou? O relógio do cliente está adiantado?

## 8. Limites & orçamentos

Recursos finitos compartilhados: paginação, tamanho de payload, rate limit, teto
de fan-out, custo por chamada, pressão em linha quente. Número, não adjetivo.

## 9. Segurança & permissões

Quem pode, quem não pode, e onde isso é cobrado. Escopo por tenant/usuário.
Dados sensíveis que não podem vazar para outra superfície.

## 10. Critérios de aceite (testáveis)

**O gate para "Done".** Cada critério mapeia para evidência executável. Critério
que não dá para provar não é critério — é desejo.

| #   | Critério (Dado/Quando/Então) | Como provar        |
| --- | ---------------------------- | ------------------ |
| A1  | Dado …, quando …, então …    | teste `<arquivo>`  |
| A2  | Dado …, quando …, então …    | teste de interface |
| A3  | …                            | typecheck + lint   |

## 11. Abordagem de teste

Como as invariantes e os requisitos viram prova. O que fica manual e **por quê**.
Comportamento de interface se prova em teste automatizado — não lendo o código.

## 12. Riscos & mitigações

| Risco | Impacto | Mitigação |
| ----- | ------- | --------- |
|       |         |           |

## 13. Open questions (bloqueiam a implementação)

Enquanto houver item aberto e bloqueante, a Spec fica `🔴 Draft`. Resolver →
mover para a seção que responde, ou virar ADR.

## 14. Fora de escopo

Trabalho relacionado deliberadamente excluído. É o que impede a feature de
crescer até virar impossível.

---

## Plano (Gate 2 — preencher depois que a Spec for aprovada)

> Só ordene tarefas depois de `🟡 Reviewed`. Verticais, ordenadas por
> dependência. Cada uma passa no mesmo teste da spec: "um agente novo termina
> isto sem perguntar".

1. [ ] Contrato compartilhado
2. [ ] Migração e permissões, se houver mudança de schema
3. [ ] Servidor
4. [ ] Cliente
5. [ ] Testes cobrindo os critérios de aceite da seção 10
6. [ ] ADR, se aplicável, + atualizar `.agent/System/` e mudar este doc para 🟢

---

## Related

- Research: `../Research/<tema>.md`
- ADR(s): `../Decisions/`
- Ledger da execução: `<feature>.ledger.md`
