# ADR 0019 — A viagem é o evento `viagem` dos dois, estendido 1:1 por `trips`

- **Status:** Proposed
- **Data:** 2026-09-27
- **Área:** schema, fluxo de dados, Viagens (Fase 6)

---

## Contexto

A Fase 5 criou `calendar_events` com o tipo `viagem`: título, destino
(`city_id`), ida e volta, quem viaja, nota. Criar o evento pinta as estadias uma
vez ([0018](./0018-periodo-se-grava-pintando-estadias.md)). A Fase 6 desenha a
viagem como coisa muito mais rica: capa, roteiro dia a dia, preparação,
orçamento, hospedagem, saída de cada um, galeria com centenas de fotos e uma
memória por pessoa com nota. E o modal _Nova viagem_ diz no próprio corpo:
_"Cria o período no calendário"_.

O roadmap deixou a pergunta central aberta: a viagem **é** um evento com mais
campos, ou uma tabela própria que referencia o evento? O [0002](./0002-estadia-por-pessoa-estado-derivado.md)
já pagou o preço de duas verdades para a mesma informação uma vez.

## Decisão

- **Viagem = `calendar_events` com `kind = 'viagem'` e `travelers = 'both'`.**
  Datas, destino, título, nota e quem viaja moram só no evento.
- **`trips` estende o evento 1:1**, com a mesma chave (`trips.event_id` é o
  `id` do evento, FK composta `(event_id, couple_id)` com `on delete cascade`).
  Nela ficam só os campos que o evento não tem (capa, hospedagem). As listas
  (`trip_departures`, `trip_days`, `trip_itinerary_items`, `trip_prep_items`,
  `trip_budget_lines`, `trip_memories`, `trip_photos`) penduram em `trips`, cada
  uma repetindo `couple_id` com FK composta, para a RLS usar a expressão de
  sempre.
- **Um trigger cria a linha de `trips`** quando um evento passa a ser viagem
  dos dois, com os cinco itens de preparação padrão. Assim a viagem criada pelo
  _Novo evento_ do Calendário também aparece nas Viagens, e a migration faz o
  backfill.
- **`create_trip` (RPC `invoker`)** chama `create_event` com pintura e grava
  hospedagem e saídas na mesma transação.
- **O estado da viagem (planejada, em andamento, feita) é derivado de hoje**,
  nunca gravado.

## Alternativas descartadas

- **Tabela `trips` independente, com as próprias datas e destino, e um
  `event_id` opcional.** É a segunda verdade: editar a data no Calendário não
  mudaria a viagem, ou o contrário. Exatamente o erro do `location_type`
  contado no 0002.
- **Colunas novas em `calendar_events`.** Capa e hospedagem viram colunas nulas
  em cinco tipos que não as usam, e o `CHECK` de formato (já o mais longo do
  schema) cresce mais. As listas não cabem em colunas de qualquer jeito.
- **`status` gravado na viagem.** Mudaria sozinho à meia-noite — só um
  agendador o manteria certo. Derivar de hoje é de graça.
- **Viagem inclui solo e visita.** O design é _"Nossas viagens"_, _"viajados
  juntos"_; visita não é viagem, e viagem solo de trabalho não é história do
  casal.

## Consequências

### Positivas

- Uma verdade só para datas e destino; o Calendário e as Viagens nunca
  divergem.
- A URL `/viagens/<id>` é o id do evento e sobrevive a qualquer edição.
- Apagar o evento leva tudo (cascata); nada órfão no banco.

### Negativas / trade-offs

- Toda leitura das Viagens junta evento + `trips` + sete tabelas-filhas.
- Um evento que deixa de ser dos dois deixa a linha de `trips` parada — não
  aparece, mas existe até o evento ser apagado.
- O trigger em `calendar_events` é um efeito colateral: escrever um evento
  agora pode inserir em outras duas tabelas.

## Código / evidência

| Artefato | Caminho |
| --- | --- |
| Migration | `supabase/migrations/20260927120000_trips.sql` |
| Domínio | `src/domain/trips.ts` |
| Dados | `src/data/trips.ts`, `src/data/tripRow.ts` |
| Prova | `supabase/tests/trips.test.ts` (A3–A7) |

## Related

- [0002 — estadia por pessoa, estado derivado](./0002-estadia-por-pessoa-estado-derivado.md)
- [0018 — período se grava pintando](./0018-periodo-se-grava-pintando-estadias.md)
- [0012 — mídia do casal em bucket por casal](./0012-midia-do-casal-em-bucket-por-casal.md)
- Spec: `../Tasks/fase-6-viagens.md`
