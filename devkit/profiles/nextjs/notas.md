# `nextjs` — o que quebra em silêncio

A fronteira servidor/cliente é invisível no editor e decisiva em runtime. Quase
tudo nesta lista é ela.

## Segredo vazado para o bundle

Variável sem o prefixo público lida num componente cliente vira `undefined` — ou,
pior, o valor é embutido no bundle porque alguém "resolveu" adicionando o
prefixo. O check que vale a pena escrever: nenhum segredo conhecido aparece em
`.next/static/`.

## `"use client"` subindo a árvore

Uma diretiva num componente alto marca toda a subárvore como cliente. O efeito é
bundle e perda de renderização no servidor, sem nenhum aviso. O sintoma é a
página ficar lenta sem ninguém ter tocado nela.

## Cache silencioso

`fetch`, rotas e segmentos têm comportamentos de cache que mudam entre versões
do framework. Dado velho na tela não é bug de query — é cache que alguém não
declarou. Registre a decisão de cache num ADR: é exatamente o tipo de escolha
que ninguém lembra seis meses depois.

## Server Action sem autorização

A action é um endpoint público. Estar dentro de um componente protegido não
protege nada: quem tiver o identificador chama direto. Toda action valida
sessão e permissão **dentro dela**.

## Migração e schema divergentes

Mesmo caso do perfil TS: arquivo no disco, ausente do índice, nunca executado.
