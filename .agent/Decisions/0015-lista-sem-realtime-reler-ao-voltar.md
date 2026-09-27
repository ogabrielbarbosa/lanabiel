# ADR 0015 — Lista sem realtime: reler ao voltar ao foco

- **Status:** Proposed
- **Data:** 2026-09-26
- **Área:** fluxo de dados do cliente (Fase 4; vale para as telas seguintes até ser superseded)

---

## Contexto

Desde a Fase 0 o realtime estava no backlog com uma condição: decidir quando
existissem duas telas escrevendo no mesmo acervo
([README](./README.md), backlog; [0001](./0001-supabase-com-rls-por-casal.md)
registra que o Supabase oferece Postgres Changes sem migration). A Fase 4 é
essa hora. Na Lista, os dois adicionam itens, marcam feitos e escrevem memórias
sobre as mesmas linhas.

O que se sabia naquele momento:

- **O uso real é assíncrono.** Gabriel e Lana moram em cidades diferentes. É
  raro os dois estarem com a Lista aberta ao mesmo tempo. O caso normal é um
  adicionar e o outro ver horas depois, com a aba reaberta ou recarregada.
- **As Configurações (Fase 3) já vivem sem realtime** ("a mudança de um aparece
  para o outro na próxima leitura"), e ninguém sentiu falta.
- **A regra de tela do projeto é "o valor na tela é o gravado"**: sem
  atualização otimista, e a tela só muda depois do `ok` do banco. Eventos
  chegando por um canal paralelo, no meio de uma escrita própria em voo, criam
  exatamente a janela em que a tela e o banco discordam.
- **A colisão perigosa já está fechada no banco.** Marcar como feito passa por
  `mark_item_done`, que devolve `already_done` se a outra pessoa marcou antes.
  Cada memória é de uma pessoa só, então não há duas escritas na mesma linha. O
  que sobra de concorrência (a nota de corações, a edição de um campo) é "vence
  a última", como qualquer preferência.
- **O que ainda não existe:** avisos ao outro (fim do roadmap) e a Home com
  contador (Fase 7), os dois lugares onde "ao vivo" teria valor visível.

## Decisão

**Não assinar Postgres Changes.** A Lista relê o acervo inteiro (itens,
memórias, fotos) em dois momentos:

1. **Depois de cada escrita própria**, com `ok` ou com um erro que sugere
   estado velho (`already_done`, `not_found`, `photo_limit`, zero linhas).
2. **Quando a aba volta a ficar visível** (`visibilitychange` → `visible`).

A releitura que falha **não apaga** o que está na tela. Ela mantém os dados e
mostra _"Não deu pra atualizar — mostrando o que já estava aqui"_. Só a leitura
inicial troca a tela por erro.

A releitura é o mesmo `loadList()` da primeira carga, sem uma segunda forma de
buscar dados.

## Alternativas descartadas

- **Postgres Changes em `list_items`, `list_memories` e `list_photos`.** O item
  da outra pessoa apareceria na hora. Custos: gerir a assinatura (abrir, fechar
  ao sair da tela, reconectar depois de o free tier pausar ou de o laptop
  dormir); decidir o que fazer com um evento que chega durante uma escrita
  própria em voo (aplicar, enfileirar ou ignorar, e cada escolha tem um caso
  errado); e garantir que a RLS filtra o evento para o casal certo, o que o
  Supabase faz, mas é mais uma superfície a testar contra o online. Tudo isso
  para um caso (os dois olhando ao mesmo tempo) que quase não acontece.
- **Broadcast "algo mudou, releia"** (um canal por casal, e a tela relê ao
  receber). É mais simples que aplicar eventos, porque reaproveita o
  `loadList()`, mas ainda exige gerir a assinatura, e os dois aparelhos teriam
  de publicar depois de cada escrita. Uma escrita que desse certo com o
  broadcast falhando deixaria a outra tela velha em silêncio, que é exatamente
  o estado que o foco já resolve.
- **Polling em intervalo** (a cada N segundos). Consome requisições com a aba
  parada, impede o projeto do free tier de dormir e, num intervalo curto o
  bastante para parecer vivo, cria a mesma corrida com a escrita em voo.
- **Não reler nunca** (só ao recarregar a página). Mais barato, mas a pessoa
  deixaria a aba aberta de manhã e veria a lista velha à noite. O foco custa
  uma linha e cobre esse caso.

## Consequências

### Positivas

- Um caminho de leitura só. A tela nunca junta dado de duas fontes, e o "valor
  na tela é o gravado" continua verdade.
- Nenhuma assinatura para abrir, fechar ou reconectar, e nada para testar contra
  o Realtime do online.
- O projeto do free tier pode dormir com a aba parada.
- Ligar realtime depois não muda migration nem contrato: `loadList()` continua
  sendo a função chamada, só com mais um gatilho.

### Negativas / trade-offs

- **Com os dois olhando ao mesmo tempo, o item da outra pessoa só aparece
  quando a pessoa sai e volta à aba**, ou depois da próxima escrita dela. Em
  chamada de vídeo, montando a lista juntos, isso vai ser notado.
- A releitura busca **tudo**, não o que mudou. Com centenas de itens são três
  `select`s pequenos. Com milhares, o limite de 1000 da spec (seção 8) cobra
  paginação antes de o realtime virar assunto.
- Uma aba que nunca perde o foco (tela aberta num monitor) não se atualiza
  sozinha.

**Gatilhos para rever** (qualquer um reabre, com ADR novo):

1. O casal reclamar de não ver o que o outro fez enquanto os dois estavam na
   tela.
2. A Home (Fase 7) precisar de contador ou "última memória" ao vivo.
3. Os avisos ao outro chegarem: o aviso no app já é um canal empurrado, e aí
   vale reaproveitá-lo para invalidar a tela.

## Código / evidência

| Artefato | Caminho |
| -------- | ------- |
| Spec | `../Tasks/fase-4-lista.md` (R28, seção 7, A18) |
| Releitura | `src/list/ListScreen.tsx` (a criar) |
| Leitura única | `src/data/list.ts` → `loadList()` (a criar) |
| Colisão do feito fechada no banco | RPC `mark_item_done` → `already_done` |

## Related

- [0001 — Supabase com RLS por casal](./0001-supabase-com-rls-por-casal.md)
- [0011 — Preferências em três escopos](./0011-preferencias-em-tres-escopos.md) (a mesma regra de "vence a última")
- [0003 — Lista em tabela única](./0003-lista-tabela-unica-com-check-por-categoria.md)
