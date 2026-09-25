# /update-doc — Inicializar ou atualizar a documentação do projeto

Mantém `.agent/` fiel ao código. Documentação que mente é pior que documentação
ausente: a ausente faz a pessoa ler o código, a que mente faz ela agir errado
com confiança.

Uso: `/update-doc` · `/update-doc <área>`

---

## A estrutura

```
.agent/
  README.md       — índice de tudo; a porta de entrada
  Decisions/      — ADRs: o "porquê" imutável (índice em README.md)
  System/         — como o sistema funciona: arquitetura, dados, subsistemas
  SOP/            — passo a passo de tarefas recorrentes
  Tasks/          — spec + plano por feature (e `<feature>.ledger.md`)
  Research/       — pesquisa de mercado
  templates/      — os modelos de spec, research e ledger
```

---

## Ao inicializar

1. **Varra o código de verdade** — frente e fundo, antes de escrever qualquer
   coisa. Documentação escrita a partir do README existente herda os erros dele.
2. Gere, em `System/`: objetivo do projeto, estrutura, stack, pontos de
   integração, modelo de dados. Subsistema crítico ou não óbvio ganha documento
   próprio.
3. Preencha `.agent/README.md` com o índice de tudo que foi criado.
4. **Consolide:** um assunto, um arquivo. Sobreposição entre documentos é a
   origem da divergência — dois arquivos que explicam a mesma coisa vão discordar
   em três meses.

## Ao atualizar

1. Leia `.agent/README.md` primeiro, para saber o que já existe.
2. Atualize **só** os arquivos afetados.
3. Um erro que uma instrução teria evitado → a instrução entra no SOP ou no
   `review-checklist.md`, **com a referência ao caso**. Regra sem cicatriz vira
   conselho genérico e dilui as que importam.
4. Houve trade-off arquitetural → garanta que existe ADR (ou crie com `/adr`).
5. Atualize `.agent/README.md` no fim. Sempre.

## Ao criar um arquivo novo

- Uma seção **Related** no fim, com os documentos vizinhos.
- Títulos claros, um assunto por arquivo.
- **A regra de lugar:** o arquivo de instruções da raiz (`CLAUDE.md` /
  `AGENTS.md`) guarda o que vale em **todo** turno; ele é carregado em toda
  sessão e em todo subagente. O que se consulta uma vez por tarefa mora em
  `.agent/` e é linkado de lá. Ignorar isso incha a raiz até ninguém ler.

---

## Related

- `/adr` — quando a atualização revela uma decisão não registrada
- Skill `devkit-doctor` — mede se a documentação está acompanhando o código
