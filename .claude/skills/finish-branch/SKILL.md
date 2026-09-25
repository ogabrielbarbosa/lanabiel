---
name: finish-branch
description: Fechar uma branch ou worktree — verificar, conferir colisões com as outras frentes, commitar em pedaços legíveis e decidir merge/PR/descarte. Use ao terminar o trabalho de uma branch, antes de abrir PR, ao voltar a uma worktree parada, ou quando o diff já está grande demais para uma mensagem só. Triggers - terminei a branch, fechar worktree, abrir PR, mergear, finalizar, limpar worktree, o que fazer com essa branch.
---

# Fechar uma frente de trabalho

Trabalho não fecha sozinho. Frente aberta sem fechamento produz três coisas, e
as três custam caro: worktree parada por semanas, recurso numerado duplicado
porque duas frentes correram em paralelo sem conferir, e o commit-despejo cuja
mensagem começa com "snapshot do que estava aberto".

Pior ainda é trabalho que nunca foi commitado: pasta untracked não tem histórico,
e um `git clean` ou uma limpeza de disco a apaga sem deixar rastro.

---

## 1. Verificar (não pule)

Rode a skill `verify`. Se ela não passa limpa, a branch não está pronta para
fechar — está pronta para continuar.

## 2. Conferir colisão com as outras frentes

O passo que quase todo mundo esquece. Trabalho paralelo colide em **recursos
numerados** e em **arquivos-índice**, e essa colisão **não dá conflito de
merge** — dá dois itens com o mesmo número, ou um item que some.

```bash
git worktree list
git branch -a --format='%(refname:short) %(committerdate:short)'
git status --short | grep '^??'     # o que ainda não existe no histórico
```

Confira cada eixo declarado no profile:

- **Migrações / revisões numeradas.** Todo arquivo no disco tem entrada no
  índice, e o maior número do índice bate com o maior prefixo em disco. O
  comando exato deste projeto está em `DEVKIT_CMD_MIGRATE_CHECK`
  (`.devkit/profile.sh`).
- **ADRs.** Dois arquivos com o mesmo número não conflitam — os nomes são
  diferentes. Só o índice fica com duas linhas iguais, e ninguém olha:
  ```bash
  ls .agent/Decisions/*.md | sed 's/.*\///;s/-.*//' | sort | uniq -d
  ```
- **Barris, registros e índices.** Os arquivos que **toda** frente edita na
  mesma região: barril de exports, registro de rotas, `README` de índice,
  arquivo de tradução, tabela de features. Liste os seus em
  `DEVKIT_INDEX_FILES` e confira todos.

Achou colisão: conserte **agora**, nesta branch. Depois do merge ninguém procura.

## 3. Rebasear na base e re-verificar

```bash
git fetch origin && git rebase origin/<branch-base>
```

O rebase mudou código? A verificação anterior não vale mais. Rode `verify` de novo.

## 4. Commitar em pedaços que se leiam

Um commit por **decisão**, não um por dia de trabalho. O critério é a mensagem:
se ela precisa de bullets sobre assuntos que não se relacionam, são vários commits.

Cada mensagem responde **por quê**, com o alternativo rejeitado quando houve um.
É a convenção que faz o `git log` funcionar como documentação de decisão. Use
`/commit`.

> Não faça o commit-snapshot. "As frentes que estavam abertas" não é uma
> decisão, é um despejo — e ele apaga o rastro de todas as decisões que continha.

## 5. ADR, se for o caso

Dependência estrutural nova, fluxo de dado alterado, trade-off de
segurança/performance, padrão novo que outras features vão seguir → `/adr`, **no
mesmo PR**. Mudou uma decisão anterior → ADR novo que supersede; não reescreva
um `Accepted`.

## 6. Decidir o destino

Apresente as opções com o custo de cada uma e **não escolha sozinho** — merge e
push são efeitos fora da worktree:

| Opção                    | Quando                                                            |
| ------------------------ | ----------------------------------------------------------------- |
| **PR**                   | O padrão. Trabalho que outra pessoa deveria ver antes de entrar.  |
| **Merge direto na base** | Só o que é trivial e reversível, e só com aval explícito.         |
| **Manter aberta**        | Ainda em andamento — então diga o que falta, em uma linha.        |
| **Descartar**            | A frente não vai continuar. Melhor apagar que deixar apodrecendo. |

## 7. Limpar

```bash
git worktree remove <caminho>          # worktree cujo trabalho entrou
git branch -d <branch>                 # local já mesclada
git fetch --prune                      # remotas 'gone'
```

Worktree parada com commit não mesclado é decisão adiada, não trabalho em
andamento. Feche ou descarte.

---

## Related

- Skill `verify` — o passo 1
- Comando `/commit` — mensagens no padrão do projeto
- Comando `/adr` — o passo 5
