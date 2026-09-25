# /commit — Mensagem de commit que explica o porquê

Gera a mensagem no padrão do projeto a partir do que está em stage.

---

## Instruções para o agente

1. `git diff --staged` — veja exatamente o que está em stage.
2. Nada em stage? Rode `git diff` e `git status --short`, mostre o que há de
   solto (inclusive arquivo untracked) e peça para selecionar. Não faça
   `git add -A` por conta própria.
3. `git log --oneline -15` — o estilo deste repositório manda, não o genérico.
4. Escreva no formato Conventional Commits:

```
<tipo>(<escopo>): <descrição curta no imperativo>

<corpo — explica o PORQUÊ, e o alternativo rejeitado quando houve um>

<rodapé — breaking changes, referência de issue>
```

### Tipos

`feat` · `fix` · `refactor` · `chore` · `docs` · `style` · `test` · `perf`

### Regras

- Assunto em até 72 caracteres, imperativo ("adiciona", não "adicionado").
- **O corpo responde por quê.** O diff já mostra o quê — repeti-lo em prosa é
  desperdício de um espaço que ninguém mais vai ter para explicar a intenção.
- Quando houve alternativa considerada e rejeitada, ela entra em uma linha. É o
  que transforma o `git log` em documentação de decisão.
- Nunca liste arquivos na mensagem. Se a mensagem precisa da lista para fazer
  sentido, o commit tem assuntos demais.
- Diff que cobre preocupações independentes → proponha a divisão em commits, com
  os arquivos de cada um.

### O anti-padrão

Não escreva o commit-despejo: "snapshot", "wip", "ajustes gerais", "várias
melhorias". Ele apaga o rastro de todas as decisões que carrega, e é
exatamente o tipo de commit que ninguém consegue reverter seis meses depois.

## Saída

Apresente a mensagem num bloco de código e **pergunte antes de aplicar**. Não
rode `git commit` automaticamente.
