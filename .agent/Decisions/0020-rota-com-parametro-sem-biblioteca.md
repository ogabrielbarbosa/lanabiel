# ADR 0020 — Rota com parâmetro (`/viagens/:id`) sem biblioteca de rotas

- **Status:** Proposed
- **Data:** 2026-09-27
- **Área:** cliente, navegação (Fase 6)

---

## Contexto

O [0013](./0013-casca-e-navegacao-por-caminho.md) escolheu um roteador de ~50
linhas sobre `history` e deixou escrito o gatilho para trocar por biblioteca
(TanStack Router ou React Router): _rota com parâmetro além do slug (ex.:
`/viagens/:id`), ou carregamento de dado por rota_. A Fase 6 dispara a primeira
metade: o detalhe da viagem precisa de URL própria (voltar do navegador,
recarregar, _Há um ano · Ver viagem_ linkando para ela).

A segunda metade não dispara: as Viagens leem tudo numa carga só, como o
Calendário e a Lista, e o detalhe é um recorte do que já foi lido.

## Decisão

- O roteador continua o de `src/app/router.ts`. `Route` ganha
  `{ name: 'trips' }` e `{ name: 'trip'; id: string }`, e `parseRoute` aceita
  `/viagens/<uuid>` por expressão regular (uuid em minúsculas).
- O parâmetro é só identidade; nenhuma rota carrega dado. Um id que não é
  viagem do casal é um estado da tela (_"Essa viagem não está aqui."_), não
  um redirecionamento.
- **Novo gatilho**, que substitui o do 0013: trocar por biblioteca quando
  houver **carregamento de dado por rota**, **duas ou mais rotas com
  parâmetro**, ou necessidade de **query string tipada**.

## Alternativas descartadas

- **TanStack Router agora.** Uma rota com um parâmetro não paga a
  dependência, o gerador de rotas e a migração dos links das nove abas.
- **React Router agora.** Mesmo argumento, e sem tipagem do parâmetro.
- **Detalhe como estado da tela, sem URL** (como o item aberto da Lista).
  Recarregar perderia a viagem aberta, e _Ver viagem_ não teria endereço.

## Consequências

### Positivas

- Zero dependência nova; `router.ts` continua cabendo numa leitura.
- O detalhe tem URL de verdade, com voltar e recarregar.

### Negativas / trade-offs

- Parâmetro sem tipo além do regex; cada rota nova com parâmetro é código à mão.
- O 0013 fica com um gatilho que não vale mais — está superado aqui nesta parte.

## Código / evidência

| Artefato | Caminho |
| --- | --- |
| Roteador | `src/app/router.ts` |
| Prova | `src/app/router.test.ts` |

## Related

- [0013 — casca e navegação por caminho](./0013-casca-e-navegacao-por-caminho.md) (gatilho superado aqui)
