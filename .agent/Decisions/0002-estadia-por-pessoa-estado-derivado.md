# ADR 0002 — Estadia por pessoa; estado do casal derivado, nunca gravado

- **Status:** Proposed
- **Data:** 2026-09-25
- **Área:** domínio (timeline), schema

---

## Contexto

O app precisa responder, a qualquer data: **onde cada um estava, e vocês estavam
juntos?** Hoje isso vive em `together.ts`, que cruza as estadias do Gabriel com
as da Lana e devolve as interseções na mesma cidade. O `CLAUDE.md` já registrava
a regra em maiúsculas — _"Nunca persista um período junto"_ — mas para um app de
`localStorage` de um usuário só. Vale reexaminar agora que vai para o banco, e o
design parecia contradizê-la.

O modal **"Novo período"** do Calendário tem um campo `Estado` com quatro opções
escolhidas à mão: `Juntos em SJC`, `Juntos em Marau`, `Viajando juntos`,
`Separados`. Lido de fora, isso é uma coluna `state` pedindo para ser gravada.
Só que o painel **"Onde a gente está"**, na mesma tela, mostra uma linha por
pessoa:

```
Gabriel   São José dos Campos   em casa
Lana      São José dos Campos   visitando · dia 5
```

E o modal **"Novo evento"** diz, no próprio corpo: _"Visitas e viagens já criam
o período de onde vocês vão estar"_, com um campo `Quem viaja: Gabriel / Lana /
Os dois` e um bloco "Período automático" que mostra o antes e depois
(_"Separados em novembro: 12 → 7 dias"_). Ou seja: o design tem **três**
entradas que produzem a mesma informação — o período à mão, o evento de viagem,
e a posição individual de cada um.

A frase do usuário que fechou a questão: _"eu posso viajar pra outro lugar e ela
também, e ela pode permanecer; e depois a gente fica junto"_. Isso são duas
posições independentes. Não é um período de casal com um estado; é o encontro de
duas trajetórias, que às vezes coincide.

Há uma última evidência, e é a mais forte: **a tentativa anterior persistiu o
estado, e o resultado está no banco.** A migration `00001_core_schema` deste
mesmo projeto criou

```sql
location_type text not null check (location_type in
  ('together_rs','together_sp','together_other','alone_rs','alone_sp','alone_other'))
```

Seis rótulos de casal numa coluna, com os estados RS e SP chumbados no `CHECK` —
e **nenhuma coluna, em nenhuma tabela, dizendo onde cada pessoa estava**. Só o
rótulo do par. Assim, mudar de cidade exigiria migration; "eu em Lisboa, ela em
Marau" não tinha como ser escrito; e `profiles.home_city` era
`check (home_city in ('RS','SP','other'))`, que não é cidade nenhuma, é sigla de
estado. O schema anterior está descrito em `../../supabase/baseline/README.md`.

O que faltava para fazer diferente já estava ao lado: com a cidade-casa de cada
um — agora uma referência com coordenada, não uma sigla — os quatro estados do
design saem de duas posições sem nenhum dado novo.

## Decisão

Persistir **uma estadia por pessoa** — `stays(person, city, start, end)`, com
`end` nulo significando "em aberto" — e **derivar** o estado do casal. O estado
nunca é gravado, em nenhuma tabela, em nenhum cache.

A derivação, dadas as duas estadias vigentes e as duas cidades-casa:

| Estado | Regra |
| --- | --- |
| `juntos_casa_gabriel` | mesma cidade, e é a cidade-casa do Gabriel |
| `juntos_casa_lana` | mesma cidade, e é a cidade-casa da Lana |
| `viajando_juntos` | mesma cidade, e não é casa de nenhum dos dois |
| `separados` | cidades diferentes |

O campo `Estado` do modal "Novo período" é **atalho de entrada, não coluna**:
escolher `Juntos em Marau` grava duas estadias (Gabriel em Marau, Lana em
Marau) numa transação. O mesmo vale para o evento de viagem — `Quem viaja`
decide quantas estadias nascem. O que se lê depois é sempre a derivação.

Esta regra vale para o app inteiro, não só para o Calendário. O painel da Lista
declara a dependência no próprio texto: _"Perto de vocês · 12 itens da lista na
cidade · **do calendário**"_, e a sugestão do dia é escrita a partir do estado
(_"Vocês estão juntos em SJC até 30 set — dá pra encaixar no sábado"_; nas
semanas separados, vira filme ou série). A Home mostra `Juntos agora · São José
dos Campos` e o contador `Juntos há 12 dias` da mesma fonte.

## Alternativas descartadas

- **Gravar o período com `state` e `city`** (o mapeamento 1:1 do modal). É o mais
  simples de escrever e o que faz a faixa do calendário arrastar como um objeto
  único. E cria duas verdades: o evento de viagem grava o período, alguém edita
  o período à mão depois (_"Dá pra ajustar o período depois"_, diz o próprio
  modal), e agora "onde o Gabriel estava em 3 de novembro" tem duas respostas
  que divergem. É bug que não levanta exceção: a faixa aparece certa e o
  contador mente.
- **Gravar apenas o período junto, e inferir as posições individuais.**
  Impossível pelo requisito: "eu em Lisboa, ela em Marau" não é período junto
  nenhum, e ainda assim é a informação que o painel precisa mostrar, linha por
  linha, com `em casa` / `visitando · dia 5`.
- **Gravar a estadia e também materializar o período** (view materializada ou
  tabela de cache, atualizada por trigger). Resolve performance de agregação
  mantendo uma fonte só. Mas é otimização antes de existir o problema: são dois
  usuários e alguns milhares de dias. Fica no backlog, para quando a lentidão
  for medida em vez de suposta.
- **Guardar o estado como coluna gerada (`GENERATED ALWAYS AS`).** Tentador, mas
  o estado depende de _duas linhas_ (as duas estadias) e de _duas outras tabelas_
  (as cidades-casa nos perfis). Coluna gerada só vê a própria linha.

## Consequências

### Positivas

- Uma verdade só. A pergunta "onde cada um estava" tem uma resposta, e todas as
  telas leem a mesma.
- O caso que motivou a decisão — cada um viajando para um lugar diferente, uma
  delas ficando, os dois se reencontrando — é representável sem inventar estado
  novo.
- Trocar a cidade-casa nas Configurações recalcula a história inteira
  corretamente, sem migration e sem backfill. Com `state` gravado, isso seria um
  script de correção sobre dados já escritos.
- Calendário, Lista e Home compartilham um módulo de derivação. Corrigir a regra
  num lugar corrige em três telas.

### Negativas / trade-offs

- **Arrastar a faixa `Juntos em SJC` edita duas estadias**, numa transação. O
  `useBarDrag.ts` atual move uma; ele precisa de reescrita, não de ajuste.
- **`Separados` no modal precisa de duas cidades** e o design mostra `Cidade` no
  singular. O default passa a ser a cidade-casa de cada um, e quem estiver numa
  terceira cidade tem de editar sua própria estadia depois. O modal desenhado não
  cobre "cada um numa cidade que não é a sua casa" numa única passada.
- **A derivação depende de `home_city` preenchida.** Perfil incompleto não dá
  erro: a legenda simplesmente não sabe distinguir `Juntos em SJC` de `Viajando
  juntos`. Isso torna a aba `Cidades` das Configurações uma dependência da Fase 0,
  não um detalhe de configuração — e obriga `home_city` a ser `NOT NULL` desde o
  onboarding.
- **As estatísticas são agregação sobre derivação**, não leitura de coluna.
  _"22 juntos · 8 separados"_, _"104 dias juntos em 2026"_, _"38% do ano juntos"_
  e o resumo por cidade (`Em SJC 10 dias · Em Marau 8 dias · Viajando 4 dias`)
  todos passam por interseção de intervalos. Mais caro, e mais fácil de errar
  numa borda: os intervalos são **inclusivos nas duas pontas**, e `end` nulo tem
  de virar "hoje" antes de qualquer comparação. Esquecer esse `??` faz a barra
  desaparecer da tela sem erro nenhum — já é uma falha documentada em
  `.agent/SOP/falhas-silenciosas.md` e continua valendo.
- A cidade é comparada por identidade. Duas grafias da mesma cidade ("SJC" e
  "São José dos Campos") quebram a derivação silenciosamente, então a cidade
  precisa ser uma referência, não texto livre digitado.

## Código / evidência

| Artefato | Caminho |
| -------- | ------- |
| Derivação atual, a promover para a Fundação | `src/timeline/together.ts` |
| Modelo atual da estadia | `src/timeline/types.ts` |
| Agregações sobre a derivação | `src/timeline/timelineStats.ts` |
| Arrasto a reescrever (move 1, precisa mover 2) | `src/timeline/useBarDrag.ts` |
| Fim efetivo (`end ?? hoje`) e datas ISO locais | `src/lib/date.ts` |
| Falha silenciosa já catalogada | `.agent/SOP/falhas-silenciosas.md` |

## Nota — 2026-09-26 (Fase 5)

O "como" desta decisão está no [0018](./0018-periodo-se-grava-pintando-estadias.md):
toda escrita de estadia é uma pintura numa RPC, o evento pinta uma vez e não
fica ligado ao período, e os dias que saem de um período voltam para a casa de
cada um. O arrasto de faixa, citado acima como custo, ficou **fora** da Fase 5.
A timeline antiga (`src/timeline/`) é apagada na Fase 5, e com ela os arquivos
da tabela _Código / evidência_ acima. O que os substitui:

| Artefato | Caminho |
| -------- | ------- |
| Derivação | `src/domain/coupleState.ts` (já existia desde a Fase 0) |
| Pintura, trechos, contagens, faixas | `src/domain/calendar.ts` (a criar) |
| Pintura no banco | `public.paint_stays`, `public.create_event` (a criar) |

## Related

- [0001 — Supabase com RLS por casal](./0001-supabase-com-rls-por-casal.md)
- [0003 — Lista em tabela única, com CHECK por categoria](./0003-lista-tabela-unica-com-check-por-categoria.md)
- `CLAUDE.md` — a regra "nunca persista um período junto" nasceu ali; este ADR
  a mantém e explica o porquê agora que o design parecia pedir o contrário
