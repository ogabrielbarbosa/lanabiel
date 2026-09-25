# `expo-rn` — o que quebra em silêncio

A regra que muda tudo: **o gate de sessão não abre simulador.** Build nativo e
device são caros demais para um hook. Prova de interface aqui é teste de
componente; o que só o simulador provaria entra no relatório da skill `verify`
como **não verificado**, nunca como presumido.

## Divergência entre iOS e Android

Sombra, teclado, área segura, fonte e retorno de permissão diferem. Um teste que
roda só numa plataforma prova uma plataforma. Declare qual foi.

## Estilo sem equivalente

Nem toda propriedade de web existe no RN, e a que não existe é **ignorada em
silêncio** — sem erro, sem aviso. O layout sai diferente do desenho e ninguém
sabe por quê.

## Permissão negada permanentemente

O segundo pedido não abre diálogo nenhum: o sistema devolve negado direto. Se o
código só trata "concedido" e "pedir de novo", a tela trava para sempre para
quem negou uma vez. É o estado que mais escapa de teste.

## Dependência nativa fora da SDK

Instalar um pacote com código nativo que não bate com a versão da SDK quebra só
no build — minutos depois, longe de quem causou. Daí `expo-doctor` estar aqui.

## Estado que sobrevive ao fechamento

App em segundo plano, suspenso e restaurado por horas. Sessão expirada, socket
morto, timer parado. Dificilmente reproduzido na mão, e é onde o usuário vive.

## Lista longa sem virtualização

Funciona nos 20 itens do desenvolvimento e trava nos 2.000 do usuário. Não dá
erro: dá abandono.
