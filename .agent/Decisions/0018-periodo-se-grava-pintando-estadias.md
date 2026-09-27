# ADR 0018 — Período se grava pintando estadias; o evento pinta uma vez

- **Status:** Proposed
- **Data:** 2026-09-26
- **Área:** fluxo de dados (`stays`), RPCs, Calendário (Fase 5)

---

## Contexto

O [0002](./0002-estadia-por-pessoa-estado-derivado.md) decidiu **o que** se
grava: uma estadia por pessoa, e o estado do casal derivado. Ele deixou em
aberto **como** as três entradas do design viram estadias, e avisou do custo:
_"Arrastar a faixa `Juntos em SJC` edita duas estadias, numa transação"_.

No design da Fase 5 (2026-09-26) há três jeitos de dizer onde cada um está, e
os três caem em estadias que **já existem**:

- o **Novo período** (`DLeES`): um estado (_Juntos em Marau_), talvez uma
  cidade, e um intervalo;
- o **Novo evento** de Visita ou Viagem (`BOR8L`): _Quem viaja_, _Destino_, ida
  e volta, e o bloco _"Período automático"_, que mostra o antes e o depois;
- a **edição** de um período (_Ver período_, ou tocando na faixa). O arrasto
  ficou fora da Fase 5, por decisão do Gabriel no `/spec`.

O caso comum é uma Visita no meio de uma estadia em aberto. O Gabriel mora em
SJC (`ends_on` nulo) e vai a Marau de 30/10 a 3/11. `stays_no_overlap` recusa
uma segunda estadia dele nesses dias. Então gravar a visita **é** mexer na
estadia de SJC: parti-la em "até 29/10" e "a partir de 4/11, em aberto". Feito
em várias escritas soltas pelo cliente, uma falha no meio deixa a pessoa em dois
lugares (a exclusão recusa) ou em lugar nenhum (a exclusão não vê).

Havia também duas perguntas sem resposta no design. **O que acontece com os
dias que saem de um período** quando ele é encurtado ou apagado? **O evento
continua mandando no período** depois de salvo? O próprio modal responde a
segunda pela metade: _"Dá pra ajustar o período depois"_.

## Decisão

**Toda escrita de estadia é uma _pintura_: "a pessoa P esteve na cidade C de
`de` até `até`", aplicada por uma RPC `security invoker` numa transação.**

1. **A regra da pintura.** No intervalo pintado, a pessoa passa a estar só na
   cidade nova. Estadia inteira dentro do intervalo é apagada. Estadia que
   atravessa uma borda é cortada. Estadia que cobre o intervalo inteiro é
   partida em duas, e o pedaço de depois **mantém o fim original, inclusive
   em aberto**. Depois, estadias vizinhas da mesma pessoa na mesma cidade são
   fundidas. `até` nulo pinta em aberto: apaga tudo o que a pessoa tinha depois
   de `de`.
2. **Uma chamada, várias entradas, em ordem.** `paint_stays(entries)` recebe até
   8 entradas e as aplica na ordem, e a segunda pode sobrescrever a primeira.
   Um `pg_advisory_xact_lock` por casal põe duas pinturas simultâneas do mesmo
   casal em fila. A rotina mora uma vez só no banco (`private.paint_one`), e
   `create_event` a reusa.
3. **A mesma regra existe no cliente, com prova de paridade.** `paintStays`
   (`src/domain/calendar.ts`, pura) alimenta a prévia do _Novo período_ e o
   _Período automático_ do evento. Uma tabela de casos compartilhada roda
   contra as duas implementações. É o mesmo padrão de `validateItem` e
   `list_items_format` ([0003](./0003-lista-tabela-unica-com-check-por-categoria.md)).
4. **Os dias que saem de um período voltam para a casa de cada um.** Editar um
   período pinta, antes do intervalo novo, a cidade-casa de cada pessoa nos
   dias do intervalo antigo que ficaram de fora. _Apagar período_ é pintar as
   casas sobre ele inteiro. A prévia mostra o resultado antes de salvar.
5. **O evento pinta uma vez.** `create_event(evento, pintar)` grava o evento e,
   para Visita e Viagem, pinta os viajantes no destino, na mesma transação.
   Depois disso as estadias são a verdade: editar ou apagar o evento **não**
   mexe nelas, e nenhuma estadia referencia evento. O modal de edição diz isso
   no lugar do _Período automático_.

Não se apaga para `unknown`: nenhuma operação da interface cria lacuna. Os dias
sem registro são só os que nunca foram pintados.

## Alternativas descartadas

- **Escritas soltas pelo cliente** (`update` de corte + `insert` da nova). É o
  que a timeline antiga fazia sobre `localStorage`, onde não havia outra pessoa
  escrevendo nem falha de rede no meio. No banco, cada falha parcial é uma
  pessoa em dois lugares ou em nenhum, e duas pessoas editando ao mesmo tempo
  intercalam os cortes.
- **Evento dono do período** (`stays.source_event_id`, e editar o evento repinta
  as estadias). É o que um usuário espera ao mudar a data de uma visita. Mas é
  a segunda verdade que o [0002](./0002-estadia-por-pessoa-estado-derivado.md)
  descartou pelo nome: o evento diz 30/10–3/11, alguém ajusta a faixa para
  30/10–2/11, e agora a pergunta "onde o Gabriel estava em 3/11" tem duas
  respostas. Repintar a partir do evento apagaria o ajuste. Não repintar deixa
  o vínculo mentindo.
- **Dias tirados de um período viram `unknown`.** É a opção mais "honesta"
  sobre o que não se sabe, e a mais trabalhosa de usar: encurtar uma visita em
  um dia deixaria um buraco sem cor que alguém teria de preencher à mão. No uso
  real, quem encurta uma visita voltou para casa.
- **Dias tirados ficam com o que havia antes do período.** Exigiria guardar o
  histórico de cada pintura (o antes de cada sobrescrita), e isso é um log de
  versões, não uma regra.
- **Guardar o período e derivar as estadias.** Descartado no 0002.
- **Regra só no banco, sem espelho no cliente.** A prévia teria de chamar o
  banco a cada clique (uma RPC _dry-run_) ou mentir. O espelho custa uma
  segunda implementação, e a tabela de casos compartilhada paga esse custo.

## Consequências

### Positivas

- A pessoa nunca fica em dois lugares nem em lugar nenhum por falha parcial: a
  pintura é tudo ou nada.
- As três entradas do design (período, evento e edição) são a mesma operação.
  Uma regra, um lugar no banco, um no cliente, e a prova de que concordam.
- A prévia mostra exatamente o que vai ser gravado, porque roda a mesma regra.
- O estado do casal continua nunca gravado, e o evento não vira uma segunda
  fonte de posição.

### Negativas / trade-offs

- **"Voltou pra casa" é um palpite.** Se a Lana foi de SJC direto para
  Curitiba, encurtar a visita a põe em Marau nos dias errados. O modal mostra o
  depois e o caso real se corrige com uma Visita por cima, mas é uma correção à
  mão. Gatilho para rever: o casal fazer isso mais de uma vez.
- **Mudar a data de uma visita no evento não move o período.** É contraintuitivo,
  e a mitigação é só o texto do modal. Se o casal tropeçar nisso, a saída não é
  religar evento e estadia. É oferecer, ao salvar a edição, "aplicar ao
  calendário também", que é uma pintura nova e explícita.
- **Pintar em aberto apaga o futuro da pessoa.** É o comportamento certo para
  "a partir de hoje moro aqui", e destrutivo por engano. Por isso o _Novo
  período_ exige _Fim_, e o em aberto só existe no primeiro período e na edição
  de um trecho que já era aberto.
- **Duas implementações da mesma regra** (plpgsql e TypeScript). A paridade é
  provada por teste, não garantida por construção. Caso novo na regra exige caso
  novo na tabela.
- **Fundir estadias apaga o `id` de uma delas.** Nada referencia `stays.id` hoje,
  e com esta decisão nada deve referenciar: o evento, de propósito, não
  referencia.
- **A tabela `stays` continua aceitando escrita direta** (a policy da Fase 0 é
  `for all`). O cliente só escreve por pintura, mas o banco não impede. Fechar
  a policy fica para quando existir um segundo cliente.

## Código / evidência

| Artefato | Caminho |
| -------- | ------- |
| Spec | [`../Tasks/fase-5-calendario.md`](../Tasks/fase-5-calendario.md): I3, I6, R13–R20, seção 5 (RPCs), A2, A9 |
| Regra no cliente | `src/domain/calendar.ts` → `paintStays`, `entriesForPeriod`, `entriesForEdit`, `entriesForEvent` (a criar) |
| Casos compartilhados | `src/domain/paintCases.ts` (a criar) |
| Regra no banco | `private.paint_one`, `public.paint_stays`, `public.create_event` (a criar) |
| A exclusão que torna o corte obrigatório | `stays_no_overlap`, em `supabase/migrations/20260925120100_core_schema.sql` |

## Related

- [0002 — Estadia por pessoa; estado do casal derivado](./0002-estadia-por-pessoa-estado-derivado.md): esta decisão é o "como" dele
- [0003 — Lista em tabela única](./0003-lista-tabela-unica-com-check-por-categoria.md): o padrão de regra em dois lugares com tabela de casos
- [0015 — Sem realtime: reler ao voltar](./0015-lista-sem-realtime-reler-ao-voltar.md): por que a prévia pode ter sido feita sobre estadias velhas
- [0017 — Cidades do mundo por casal](./0017-cidades-do-mundo-por-casal.md)
