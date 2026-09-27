# ADR 0003 — Lista em tabela única, com `CHECK` por categoria

- **Status:** Proposed
- **Data:** 2026-09-25
- **Área:** schema (lista de desejos)

---

## Contexto

A Lista é a maior área do app em volume: 86 itens no design, em oito
categorias — `Países`, `Cidades`, `Restaurantes`, `Parques`, `Comidas`,
`Filmes`, `Séries`, `Experiências`. O modal de adicionar diz, no subtítulo:
_"Escolha a categoria primeiro — os campos se ajustam"_. E eles se ajustam de
verdade: um restaurante pede `Local` (com endereço e coordenada, porque _"Vai
virar um pin no globo"_), uma série pede `Onde assistir` e `Temporadas`, e o
design é explícito no contrário — _"Filmes e séries não viram pin no globo"_.

A tabela `places` que existia no projeto não aceita isso: `country` é
`NOT NULL`, então uma série não entra. O nome da tabela também mente sobre
metade do conteúdo.

Olhando a linha secundária de cada item na tela "Lista — Todos", o padrão
aparece, e é bem menos variado do que oito categorias sugerem:

```
Severance         Série        · Apple TV+           ← plataforma
Past Lives        Filme        · MUBI                ← plataforma
Mocotó            Restaurante  · São Paulo           ← local
Acarajé da Dinha  Comida       · Salvador            ← local
Mergulho          Experiência  · Pernambuco          ← local
Ibirapuera        Parque       · São Paulo           ← local
Japão             País         Tóquio, Kyoto, Osaka  ← local
Gramado no Natal  Cidade       Serra Gaúcha          ← local
```

São **dois formatos**, não oito: seis categorias geográficas e duas de mídia,
mais `temporadas`, que só a série usa. Todas compartilham o mesmo miolo — nome,
nota do tipo lembrete, link, foto, ênfase, status (`quero fazer` / `já
fizemos`), nota de corações, quem adicionou e quando.

Uma restrição real do momento: dos oito modais de adicionar, **dois estão
desenhados** (Restaurante e Série). Os outros seis foram inferidos das linhas da
lista e do detalhe do item, não lidos de um desenho.

## Decisão

Uma tabela única, `list_items`, com colunas nomeadas para os dois formatos e um
`CHECK` por categoria garantindo a regra.

- **Comuns a todas:** `id`, `couple_id`, `category`, `name`, `note`, `link`,
  `photo_path`, `featured`, `status`, `rating`, `added_by`, `created_at`,
  `done_at`, `done_with`.
- **Geográficas, anuláveis:** `address`, `city`, `state`, `country`,
  `country_code`, `lat`, `lng`.
- **Mídia, anuláveis:** `platform`, `seasons`.

O `CHECK` é o que carrega a semântica que as colunas anuláveis perdem:
`category in ('filme','serie')` exige `platform` preenchida e `lat`/`lng` nulos;
qualquer outra categoria exige `city`; `seasons` só é permitida em `'serie'`.

As **memórias saem daqui**: são uma tabela própria, com **uma linha por pessoa**
por item feito. O detalhe do item mostra as duas lado a lado, cada uma com seu
texto, e o modal confirma — _"Gabriel escrevendo · a Lana pode completar"_. A
**nota de corações, ao contrário, é uma só** (_"Quanto vocês amaram? 4 de 5"_) e
fica no item.

Vale registrar que `note` e a memória são coisas diferentes, porque o design
mostra as duas no mesmo cartão: `note` é o lembrete de antes de ir (_"Pedir o
risoto de cogumelos e a torta de limão"_), a memória é o que ficou depois.

## Alternativas descartadas

- **Campos comuns na tabela + `details jsonb` para o que varia.** Flexível:
  categoria nova sem migration. O problema é onde a flexibilidade cai —
  `generate_typescript_types` devolve `Json` exatamente nos campos que variam,
  que são os que mais precisam de checagem. Nada no TypeScript impede gravar
  `{ seasons: "quatro" }`, e filtrar por plataforma pede índice GIN. Para dois
  formatos já conhecidos e estáveis, é flexibilidade paga e não usada.
- **Uma tabela por categoria** (ou supertipo com subtabelas). Tipagem exata,
  zero coluna anulável. Mas a tela principal é _"Tudo · 86 itens · Recentes
  primeiro"_, que viraria `UNION` de oito tabelas com ordenação por cima; e o
  `Vínculo com a lista` do evento, a memória e os pins do globo precisariam de
  chave estrangeira polimórfica — justamente o que o Postgres não sabe garantir.
  Caro, e o custo cai na leitura mais frequente do app.
- **Duas tabelas, uma por formato** (`geo_items` e `media_items`). Elimina as
  colunas anuláveis com apenas um `UNION` de dois lados. Mas duplica os catorze
  campos comuns, duas FKs onde bastaria uma, e a fronteira é frágil: se um dia
  um filme ganhar cinema com endereço, o item muda de tabela — o que significa
  novo `id`, e memórias órfãs.

## Consequências

### Positivas

- Tipos gerados úteis: cada campo tem seu tipo, e renomear uma coluna quebra o
  `typecheck`.
- A query dos pins do globo é `where lat is not null`, indexável, e o próprio
  índice já exclui filmes e séries.
- A tela "Todos · 86 itens · Recentes primeiro" é um `select` com `order by`.
- O `Vínculo com a lista` do evento, a memória e o "marcar como feito" apontam
  todos para um `id` numa tabela só.
- O `CHECK` transforma a regra do design (_"filmes e séries não viram pin"_) em
  invariante do banco: um filme com coordenada é rejeitado na escrita, não
  descoberto quando aparece um pin errado no mapa.

### Negativas / trade-offs

- **Nove colunas anuláveis.** Ler o `\d list_items` não diz quais valem para
  qual categoria — o `CHECK` diz, e alguém tem de ir ler. Documentar a tabela em
  `.agent/System/` deixa de ser opcional.
- **Categoria nova é migration**, e provavelmente `CHECK` novo também. Aceitável:
  as oito vêm do design e a navegação inteira é construída sobre elas.
- **Seis dos oito modais não estão desenhados**, então a lista de colunas
  geográficas é inferência. Se o desenho revelar um campo que eu não previ, é
  `ALTER TABLE` — barato agora, com zero linhas na tabela; caro depois de vocês
  terem 86 itens escritos. Isso é um argumento para desenhar os seis modais
  **antes** da Fase 4, não depois.
- O `CHECK` cresce com as exceções e, passado de certo ponto, fica ilegível. Se
  chegar a mais de duas ou três condições por categoria, o sinal é que esta
  decisão está errada e cabe um ADR novo — não um `CHECK` maior.

## Revisão — 2026-09-26 (Fase 4, antes de existir a tabela)

Este ADR ainda estava `Proposed`, e a tabela ainda não existia. Então ele é
revisado aqui, sem ser superseded. O texto acima fica como estava, como registro
do que se sabia no dia 25. O que muda vale a partir desta seção.

**O que mudou no conhecimento.** A premissa _"dos oito modais, dois estão
desenhados"_ estava errada: os oito existem no `.pen` (País `PmKZ4`, Cidade
`cX0DT`, Parque `UaQ1K`, Comida `e3jts`, Experiência `wBKDf`, Filme `NuAJ6`,
além de Restaurante e Série). Lidos, eles confirmam os **dois formatos** e
revelam quatro coisas que a inferência não pegou:

1. **País** tem _Cidades que interessam_ (chips, _"Aparece como segunda linha do
   item na lista"_), e o pin fica no centro do país, sem cidade.
2. **Cidade** tem _Região_ em texto livre (_"Serra Gaúcha · pertinho de
   Marau"_), também como segunda linha.
3. **Comida** tem _Onde comer · opcional_ (_"Pode ficar vazio se for um prato,
   não um lugar"_) além da cidade.
4. **O marcar como feito** pede uma **data** (_"Quando · Sáb, 26 set 2026"_),
   não um instante, e _Quem estava_ é ele, ela ou os dois.

**Decisão revisada** (o resto da decisão original continua):

- **Colunas novas:** `region text` (só `cidade`), `venue text` (só `comida`),
  `highlights text[]` (só `pais`, ≤ 12), `updated_at timestamptz`.
- **`done_at timestamptz` → `done_on date`**, porque o design pede um dia e o
  projeto compara datas como strings ISO.
- **`done_with`** passa a ser `'both' | 'solo'`, com `done_solo_by uuid →
  profiles` quando `solo`. É por **perfil**, não por slot, para a pessoa
  continuar a mesma se trocar de slot depois de alguém sair do casal.
- **`platform` é texto livre** (≤ 30), não enum. O modal sugere seis
  plataformas e aceita _Outra…_: Globoplay não pode custar uma migration.
- **`link`** tem `CHECK (link ~* '^https?://')`, porque ele vira `href` na tela.
- **O `CHECK` de formato**, reescrito:
  - mídia exige `platform` e proíbe `lat`, `lng`, `country_code`, `city`,
    `address`, `region`, `venue` e `highlights`;
  - geográfico exige `lat`, `lng` e `country_code` e proíbe `platform`;
  - `pais` proíbe `city`, e as outras cinco geográficas a exigem;
  - `seasons`, `highlights`, `region` e `venue` pertencem a uma categoria cada.
- **As memórias** (`list_memories`, uma por `(item_id, profile_id)`) e as
  **fotos** (`list_photos`, ≤ 10 por item, por trigger) carregam o `couple_id`
  repetido, com **FK composta** `(item_id, couple_id) → list_items (id,
  couple_id)`. Assim a RLS das três tabelas é a mesma expressão
  (`couple_id in (select private.my_couple_ids())`), sem subquery por item, e o
  banco garante que o `couple_id` da filha é o do item.
- **O lugar vem do Photon/OSM** e é guardado resolvido nas colunas geográficas.
  Ver o [0016](./0016-busca-de-lugares-pelo-photon-osm.md).

**Conferindo o próprio alarme deste ADR** (_"mais de duas ou três condições por
categoria → a decisão está errada"_). As condições de **exigência** continuam
curtas: geográfico exige coordenada, país e (exceto `pais`) cidade; mídia exige
plataforma. O que cresceu foram as de **exclusividade** ("esta coluna só existe
nesta categoria"), que são mecânicas: uma linha por coluna, sem lógica entre
elas. O `CHECK` está no limite, não além. O próximo campo exclusivo de uma
categoria só é o sinal para reconsiderar, com um ADR novo, uma coluna `jsonb`
por categoria **só para os opcionais de exibição**, mantendo coordenada e
plataforma como colunas.

**Custo novo que esta revisão assume:** quatro colunas anuláveis a mais (treze
no total), então documentar `list_items` em `.agent/System/` continua
obrigatório, e ficou mais.

## Código / evidência

| Artefato | Caminho |
| -------- | ------- |
| Schema antigo, descartado (`country NOT NULL` rejeita série) | tabela `public.places`, ref `smdtcznadmnrdubeidyz` |
| Schema novo | `supabase/migrations/…_list.sql` (Fase 4, a criar) |
| Spec que revisa | [`../Tasks/fase-4-lista.md`](../Tasks/fase-4-lista.md) (seções 4 e 5) |
| Modais desenhados (8 de 8, revisão) | Pencil: `RvlR2` Restaurante · `i160RR` Série · `PmKZ4` País · `cX0DT` Cidade · `UaQ1K` Parque · `e3jts` Comida · `wBKDf` Experiência · `NuAJ6` Filme |
| Campos do item feito | Pencil: `RWegR` Detalhe do item (feito) · `x4sciG` Marcar como feito |

## Related

- [0001 — Supabase com RLS por casal](./0001-supabase-com-rls-por-casal.md)
- [0002 — Estadia por pessoa, estado do casal derivado](./0002-estadia-por-pessoa-estado-derivado.md)
