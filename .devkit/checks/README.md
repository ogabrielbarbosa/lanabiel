# Invariantes deste projeto

Cada `.sh` aqui é uma **cicatriz**: uma classe de bug que já aconteceu neste
projeto e que nenhuma ferramenta padrão pega. O hook `Stop` roda todos.

Contrato: recebe a lista de arquivos mudados em `$1`; imprime o que está errado
e sai com status != 0. Silencioso quando está tudo bem.

```bash
#!/usr/bin/env bash
# Por que existe: <o bug concreto, com data e sintoma>.
# Por que nada mais pega: <não é erro de tipo nem de lint porque…>
CHANGED="$1"
echo "$CHANGED" | grep -q '^src/' || exit 0
HITS=$(grep -rn '<padrão>' src/ | grep -vE '^[^:]+:[0-9]+:\s*(//|\*|#)' || true)
[ -z "$HITS" ] && exit 0
echo "<o que está errado e qual é a forma certa>"
echo "$HITS"
exit 1
```

Não escreva check preventivo contra bug hipotético — isso é ruído, e ruído
ensina o time a ignorar o gate. Escreva depois que o bug custar um dia.

Duas regras aprendidas na prática:

1. **Ignore comentários.** A documentação cita a forma errada de propósito. Um
   gate que acusa a própria documentação é um gate que se aprende a ignorar.
2. **Olhe a janela, não a linha.** Quando o padrão depende de contexto (uma
   exceção legítima três linhas acima), um check linha-a-linha reprova o caso
   legítimo e, no meio do ruído, esconde a violação de verdade.
