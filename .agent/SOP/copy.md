# Como escrever o texto da interface

Vale para todo texto que alguém lê no app: título, botão, dica, aviso, erro,
estado vazio, e-mail. O app é de um casal. O texto tem que soar como uma pessoa
explicando uma coisa para a outra, e não como slogan.

## Sem refrão

Refrão é a fórmula que volta tela após tela até virar ruído. É o que deixa o
texto com cara de gerado por IA. Não use:

| Refrão                                                    | Exemplo que saiu do app                                  |
| --------------------------------------------------------- | -------------------------------------------------------- |
| Travessão emendando duas frases                           | "Este espaço mudou — recarregue."                        |
| "Não é X — é Y" e outras antíteses                        | "Não é fraca — é conhecida."                             |
| Frase de efeito em par ou em trio                         | "Duas cidades. Um lugar só de vocês."                    |
| Poesia sobre a distância                                  | "Lá fora são 800 km — aqui dentro, nenhum."              |
| Interjeição fazendo papel de título                       | "Hmm.", "Opa.", "Calma aí.", "Quase!", "Um instante."    |
| Bordão afetivo repetido                                   | "seu amor", "de vocês dois", "cantinho"                  |
| Legenda que só repete o título da tela                    | legenda "Convite enviado." sobre o título "Convite enviado!" |

## O que fazer no lugar

- **Diga o que aconteceu e o que a pessoa pode fazer.** "O mapa não carregou.
  Recarregue a página." é melhor que qualquer frase simpática.
- **Uma ideia por frase.** Precisou de travessão, provavelmente são duas frases:
  use ponto. Se for um aposto de verdade, use vírgula ou parênteses.
- **Chame as coisas pelo nome.** "a outra pessoa", "o convite", "a Lista". O
  nome da pessoa, quando o app sabe, é melhor que um apelido genérico.
- **Afeto com moderação.** Um toque carinhoso numa tela especial (entrar no
  espaço, aniversário) funciona. O mesmo toque em toda tela vira tique.
- **Leia em voz alta.** Se você não mandaria aquela frase numa mensagem, reescreva.

## Onde o travessão continua valendo

- Como marcador de "sem valor" numa célula (`—`), que é dado e não frase.
- Em `aria-label` que junta dois rótulos (`"Azul — já escolhida"`), onde o
  leitor de tela precisa da pausa.
- Em comentário de código. Esta regra é sobre o que o usuário lê.

## Antes de mandar texto novo

Procure os padrões acima no diff:

```bash
git diff -U0 -- 'src/**/*.tsx' | grep -nE "^\+.*(— |Hmm\.|Opa\.|Calma aí|seu amor|vocês dois|cantinho)"
```
