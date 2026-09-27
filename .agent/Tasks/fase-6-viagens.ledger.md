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
## T2 · Domínio (derivações)

Concluído. Prova: `src/domain/tripDerive.test.ts` + `src/lib/date.test.ts`, 78
passando; `npm run test` 849 passando; typecheck e lint limpos.

Ruling (do implementador, aceitos): `departuresLine` compara as origens já
resolvidas ("GRU" de duas casas diferentes vira "saindo de GRU"); o roteiro
colapsa depois do 4º dia com itens; sugestões só no primeiro bloco em aberto;
item fora das datas não conta no "% montado"; a viagem em andamento fica acima
do "Hoje" na linha do tempo; empates vão para a mais recente; `formatBRL` usa
espaço comum (não NBSP) para os testes acharem o texto; `cropFor` não
atravessa o antimeridiano. Custo se errado: bordas de exibição, cada uma uma
linha para trocar.

---
## T1 · Banco

Concluído até o dry-run. Prova: `npx supabase db push --dry-run` → só
`20260927120000_trips.sql`; `tripValidation.test.ts` 87 passando; num Postgres
17.6 descartável (não o online) as 20 migrations entram e os 80 casos de
`TRIP_VALIDATION_CASES` batem 80/80 com os CHECK; `create_trip`, trigger,
backfill, tetos e cascatas conferidos lá.

Ruling (do implementador, aceitos): `trips` sem policy de DELETE — apagar a
viagem é apagar o evento (I1), e um `trips` apagado sozinho deixaria o evento
sem detalhes; uma função de integrante (`private.trip_member(coluna)`) para as
quatro colunas; `private.trip_ensure` usada pelo trigger e pelo backfill; texto
com `btrim` e o domínio aparando só espaço. Custo: cada um é uma migration pequena.

Dívida: sem `check_out >= check_in`, sem `trip_days.day` dentro da viagem, sem
`position >= 0`. Nenhum quebra tela; ficam para quando doer.

**O `db push` no online foi bloqueado pela permissão do ambiente** (o
classificador tratou como deploy em produção). Contagem feita antes: zero
eventos em `calendar_events`, então o backfill não toca nada. Ruling: seguir
sem o push — os tipos saem de um Postgres descartável local com as mesmas
migrations, as telas se provam com `TripsApi` falsa, e o push + `npm run
test:db` ficam para o Gabriel. Custo se eu estiver errado: a `main` fica com
código que lê tabelas que o online ainda não tem, até o push — as Viagens
mostram o erro de leitura, o resto do app não é afetado.

---
