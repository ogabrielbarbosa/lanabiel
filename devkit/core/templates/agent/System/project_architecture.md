# Arquitetura do projeto

> Preencher no `/devkit-init`. É o único documento que **precisa** existir no
> dia um — todos os outros nascem quando há o que contar.
>
> Escreva a partir do código, não do README existente: documentação derivada de
> documentação herda os erros dela e acrescenta os próprios.

## O que é

Uma frase sobre o que o sistema faz e para quem.

## Stack

| Camada | Tecnologia | Papel |
| ------ | ---------- | ----- |
|        |            |       |

## Estrutura

```
<árvore de diretórios comentada — só os níveis que importam>
```

## Fluxo de dados

O caminho de ponta a ponta de UMA operação real: do gesto do usuário até o dado
persistido e de volta à tela. Um caminho concreto ensina mais que cinco
diagramas de caixas.

## Fronteiras

O que cada camada **não** pode fazer. É daqui que sai a seção 1 do
`review-checklist.md` — e é a parte que nenhuma ferramenta consegue cobrar
sozinha, por isso precisa estar escrita.

## Contrato compartilhado

Onde mora a fonte única de verdade das regras que frente e fundo dividem, e como
reconstruí-la depois de mudar. Regra de negócio em dois lugares não dá erro — dá
divergência silenciosa, e divergência silenciosa vira bug de dinheiro.

## Ambientes e variáveis

Como se configura cada ambiente e onde as variáveis são lidas.

## Related

- `.agent/Decisions/README.md` — por que cada uma dessas escolhas
- `.agent/SOP/review-checklist.md` — o que a revisão cobra
