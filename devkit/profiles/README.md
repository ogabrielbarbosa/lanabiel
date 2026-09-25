# Perfis de stack

O processo é o mesmo em todo projeto. O que muda é **como se prova alguma
coisa** — o comando de typecheck, o de teste, onde mora a migração, o que conta
como contrato compartilhado.

Um perfil preenche esses buracos. Ele vira `.devkit/profile.sh` no projeto alvo,
e é a fonte única dessas respostas: as skills leem dali, os hooks leem dali, e
nenhum agente precisa adivinhar a partir do `package.json`.

```
devkit/profiles/<nome>/
├── profile.sh        # o contrato preenchido — vira .devkit/profile.sh
├── checklist.md      # seções do review-checklist (SEM itens)
└── notas.md          # o que essa stack costuma quebrar em silêncio
```

---

## O contrato

Toda variável é opcional: ausente significa "este projeto não tem isso", e o
hook simplesmente pula a etapa. Melhor pular do que rodar um comando que não
existe — gate que falha por motivo errado é gate que se aprende a ignorar.

| Variável                    | O que é                                                             |
| --------------------------- | ------------------------------------------------------------------- |
| `DEVKIT_STACK`              | Nome do perfil, para relatório                                      |
| `DEVKIT_CMD_TYPECHECK`      | Verificação estática de tipos                                       |
| `DEVKIT_CMD_LINT`           | Lint                                                                |
| `DEVKIT_CMD_TEST`           | Suíte de testes                                                     |
| `DEVKIT_CMD_BUILD`          | Build — **fora do gate por padrão** (ver `verify.sh`)               |
| `DEVKIT_CMD_FORMAT_FILE`    | Formatador de UM arquivo; recebe o caminho como argumento           |
| `DEVKIT_CODE_EXT`           | Regex de extensões que disparam o gate                              |
| `DEVKIT_FORMAT_EXT`         | Regex de extensões que o formatador entende                         |
| `DEVKIT_CONTRACT_PATH`      | Caminho do contrato compartilhado (fonte única de verdade)          |
| `DEVKIT_CMD_CONTRACT_BUILD` | Como reconstruí-lo depois de mudar                                  |
| `DEVKIT_MIGRATIONS_DIR`     | Onde moram as migrações                                             |
| `DEVKIT_CMD_MIGRATE_CHECK`  | Confere que o disco e o índice de migrações batem                   |
| `DEVKIT_READY_MARKER`       | Arquivo/pasta cuja ausência significa "dependências não instaladas" |
| `DEVKIT_INDEX_FILES`        | Arquivos que **toda** frente edita — colidem sem dar conflito       |
| `devkit_scope_args()`       | Função: recebe os arquivos mudados, devolve o recorte do comando    |

### `devkit_scope_args` — por que existe

Num monorepo com várias frentes abertas, rodar a árvore inteira devolve a quebra
de outra pessoa. O agente lê aquilo como "meu trabalho falhou", vai investigar
código que não é dele, e na terceira vez aprende a ignorar o gate.

A função recorta a verificação aos módulos que a sessão tocou. A varredura
completa pertence à CI, onde o PR tem um dono só.

Projeto de pacote único não precisa dela: não declare, e o comando roda inteiro.

---

## Escrever um perfil novo

1. `cp -r devkit/profiles/_template devkit/profiles/<nome>`
2. Preencha o `profile.sh`. **Rode cada comando uma vez** antes de gravar.
3. Meça o hook: `time bash .claude/hooks/verify.sh < /dev/null`. Se passar do
   timeout, tire o mais caro do conjunto — quase sempre o build.
4. `notas.md` recebe as falhas silenciosas da stack: aquilo que não dá erro de
   compilação nem de lint, e só aparece em runtime ou em produção. É a lista da
   qual nascem os primeiros `.devkit/checks/`.

Perfis prontos: `ts-node-web` · `nextjs` · `expo-rn` · `swift`
