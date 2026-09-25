# Adaptar a outra stack

O processo não muda. O que muda é **como se prova alguma coisa** — e isso mora
todo em `.devkit/profile.sh`.

## O que traduzir

| Conceito               | TS/Node            | Python              | Go                 | Swift                |
| ---------------------- | ------------------ | ------------------- | ------------------ | -------------------- |
| Verificação estática   | `tsc --noEmit`     | `mypy`              | `go vet`           | a própria compilação |
| Lint                   | `eslint`           | `ruff`              | `golangci-lint`    | `swiftlint`          |
| Testes                 | `vitest` / `jest`  | `pytest`            | `go test ./...`    | `xcodebuild test`    |
| Formatar um arquivo    | `prettier --write` | `ruff format`       | `gofmt -w`         | `swiftformat`        |
| Contrato compartilhado | pacote de schemas  | modelos Pydantic    | pacote de tipos    | módulo `Shared`      |
| Migrações              | journal do ORM     | revisões do Alembic | `.sql` numerados   | versões do modelo    |
| Índice de migração     | `_journal.json`    | `down_revision`     | tabela de controle | `.xcdatamodeld`      |

## O que NÃO muda

Estes conceitos existem em toda stack, mesmo quando não têm ferramenta com nome:

- **Fonte única de verdade.** Regra de negócio em dois lugares diverge em
  silêncio, em qualquer linguagem. Se a stack não tem um lugar natural para o
  contrato, escolha um e registre num ADR — é o tipo de decisão que ninguém
  lembra ter tomado seis meses depois.
- **Prova é saída de execução.**
- **Recurso numerado colide entre frentes** sem dar conflito de merge. Migração,
  ADR, versão de modelo, arquivo-índice. Liste os seus em `DEVKIT_INDEX_FILES`.
- **Existe uma classe de falha que nenhuma ferramenta pega.** Toda stack tem a
  sua; é ela que vai encher `.devkit/checks/`. As de quatro stacks estão nos
  `notas.md` de cada perfil.

## Quando um conceito não existe

Não force. Deixe a variável vazia — o hook pula a etapa.

Um profile com comando inventado é pior que um profile incompleto: ele faz o
gate falhar por motivo errado, e a terceira vez que isso acontece o time aprende
a ignorar o gate inteiro.

## Stack sem verificação estática

Linguagem dinâmica sem tipos move peso para os testes e para o lint. O gate
continua existindo, só muda de forma: `DEVKIT_CMD_TYPECHECK` vazio,
`DEVKIT_CMD_TEST` obrigatório, e a skill `verify` passa a exigir teste para
aceite que em outra stack o compilador cobriria.

## Passo a passo

1. `cp -r devkit/profiles/_template devkit/profiles/<nome>`
2. Preencha o `profile.sh` com os comandos que a CI realmente roda — a CI é a
   verdade quando ela e o `package.json` discordam.
3. **Rode cada comando uma vez** antes de gravar.
4. `time bash .claude/hooks/verify.sh < /dev/null`. Passou do timeout? Tire o
   mais caro do conjunto — quase sempre o build.
5. Escreva `notas.md`: as falhas silenciosas desta stack. É a lista de onde
   nascem os primeiros checks.
6. `checklist.md`: só as **seções**. Os itens nascem dos bugs deste projeto.

## Related

- [`../profiles/README.md`](../profiles/README.md) — o contrato completo
- [`02-autoria-de-regra.md`](02-autoria-de-regra.md) — como um item nasce
