# Ledger — Fase 6: Viagens

> Registro do que foi decidido **durante a execução**. Spec:
> [`fase-6-viagens.md`](./fase-6-viagens.md).

---

## Forma da execução

Branch `fase-6-viagens`. O Gabriel pediu para o agente tomar todas as decisões,
rodar os ADRs, orquestrar, commitar e mergear na `main` sozinho. As decisões de
produto estão na seção 13 da spec; as de execução, aqui.

- **Contrato escrito pelo orquestrador antes de despachar**: os tipos, listas e
  limites de `src/domain/trips.ts`. Destrava T1 (banco) e T2 (domínio) em
  paralelo, na mesma árvore, com arquivos disjuntos e sem commit dos agentes.
- **`db:push` só depois de o orquestrador ler o SQL.** O agente do banco para no
  `--dry-run`.
- **T4 e T5 em paralelo**, depois de T3 commitado: diretórios disjuntos
  (`src/trips/*` × `src/trips/detail/*`) e CSS disjuntos (`trips.css` ×
  `trip-detail.css`). A rota do detalhe é ligada pelo orquestrador depois.

Ruling: o domínio foi partido em três arquivos (`trips.ts` contrato,
`tripValidation.ts`, `tripDerive.ts`) em vez de um, como a spec sugeria — para
dois agentes escreverem ao mesmo tempo sem colisão. Custo se eu estiver errado:
três imports em vez de um; reversível juntando os arquivos.

Ruling: a abreviação da casa usa `shortCityName` do Calendário em vez de uma
`cityAbbrev` nova — já faz _São José dos Campos_ → _SJC_. Custo: nenhum.

Ruling: o mapa-múndi foi exportado do `.pen` (nó `MFVF7`, sem os pins, escala 4)
para `src/trips/assets/world-map.jpg` (1380×692, 268 kB). A projeção
equiretangular foi conferida em Lisboa e Tóquio (erro ≤ 1 ponto). Ver ADR 0021.

---
