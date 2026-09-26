# ADR 0007 — Cidades brasileiras por seed do IBGE, com escrita em `cities` fechada ao cliente

- **Status:** Proposed
- **Data:** 2026-09-26
- **Área:** schema (`cities`), onboarding (Fase 2)

---

## Contexto

O onboarding pede _"Cidade onde você mora"_, e a resposta vira
`profiles.home_city_id`, que é `NOT NULL` de propósito: sem cidade-casa a
derivação do [0002](./0002-estadia-por-pessoa-estado-derivado.md) não distingue
"juntos em casa" de "viajando juntos". O mesmo ADR proíbe cidade como texto —
"SJC" e "São José dos Campos" fariam a derivação dizer _Separados_ com os dois
no mesmo lugar, sem erro nenhum.

Em 2026-09-26 `cities` tinha três linhas de seed (SJC, Marau, Londrina) e uma
policy que deixava qualquer sessão autenticada inserir. Para Gabriel e Lana
bastava. Para o critério da Fase 2 — outro casal atravessando o fluxo — não: um
casal de Pelotas trava no passo 1.

Sabia-se também que o Mapa e as Viagens (Lisboa, Göreme) vão precisar de cidade
com coordenada **fora** do Brasil. A pergunta real era se essa dependência chega
agora ou depois. No brainstorm, o Gabriel escolheu **só Brasil, por seed**.

## Decisão

**`cities` recebe os 5.570 municípios do IBGE por migration, e o cliente perde a
permissão de inserir.**

- Nome, UF e código vêm da API de Localidades do IBGE; latitude e longitude vêm
  do dataset `kelvins/municipios-brasileiros`, cruzado por `codigo_ibge`. Um
  script versionado (`scripts/gen-cities-seed.ts`) gera a migration, com a URL e
  o SHA-256 das duas fontes no cabeçalho do SQL. A migration gerada é commitada:
  regenerar é opcional, não requisito de build.
- Coluna nova `ibge_code integer unique`, nula para cidades que um dia vierem de
  fora do Brasil.
- As três cidades da Fase 0 **mantêm os UUIDs fixos**: o seed faz upsert pela
  chave natural `(name, state_code, country_code)` e só preenche `ibge_code`.
- A policy `cities_insert_authenticated` é removida. Toda cidade entra por
  migration.
- A busca é `search_cities(q)`, `security invoker`, com `unaccent` e `lower`,
  prefixo antes de "contém", 8 resultados, a partir de 2 caracteres. Sem índice:
  5.570 linhas em varredura sequencial ficam abaixo de 20 ms.

## Alternativas descartadas

- **Geocoding externo agora** (Nominatim/OSM, Mapbox, Google Places). Cobre o
  mundo e já prepara Mapa e Viagens. Descartado **nesta fase**, não para sempre:
  traz dependência externa com limite de requisição e termos de uso, exige
  deduplicar a mesma cidade vinda duas vezes do provedor, e exige manter a
  escrita em `cities` aberta ao cliente (ou passar por outra função). Tudo isso
  para atender um caso que ainda não existe — casal fora do Brasil.
- **Seed agora e geocoding depois, com contrato estável** (`searchCities` atrás de
  uma interface). Era a opção C do brainstorm. Descartada por decisão do Gabriel:
  a interface pode nascer quando o geocoding nascer, e desenhá-la sem o segundo
  implementador é adivinhar o contrato.
- **Texto livre com coordenada opcional.** Violaria o [0002](./0002-estadia-por-pessoa-estado-derivado.md)
  diretamente.
- **Manter o insert aberto e deixar o cliente criar a cidade que faltar.** Com
  outros casais, `cities` é tabela **compartilhada**: uma cidade digitada errado
  por um casal apareceria na busca de todos, e não há dono para corrigir. Com o
  IBGE completo, o insert não tem mais caso de uso legítimo.
- **Seed só das capitais e das maiores cidades.** Menor migration, e deixa de
  fora exatamente o tipo de cidade que motivou o app (Marau tem 45 mil
  habitantes).

## Consequências

### Positivas

- Qualquer casal brasileiro passa do passo 1, sem dependência externa, sem custo
  e sem rede fora do Supabase.
- Deduplicação de graça: a chave natural e o `ibge_code` são únicos, e o cliente
  não cria linha nenhuma.
- A superfície de escrita diminui: some a única policy de insert em tabela
  global que o projeto tinha.
- A busca tolera acento ("Sao Jose" encontra "São José").

### Negativas / trade-offs

- **Casal fora do Brasil não faz onboarding.** A busca vazia diz isso na tela,
  mas para essa pessoa o app simplesmente não serve.
- **Este ADR vai ser superseded, e é provável que seja.** Quando as Viagens
  precisarem de Lisboa, o geocoding entra — e com ele volta a pergunta de como
  cidade estrangeira é criada, deduplicada e autorizada, agora com duas fontes
  convivendo (IBGE e provedor). O custo foi adiado, não evitado.
- **Coordenada vinda de dataset de terceiro.** Se estiver errada, a derivação não
  sente (compara identidade de cidade, não posição), mas a distância em linha
  reta da tela _Tudo pronto_ sai errada. O SHA-256 documenta de onde veio, e não
  garante que esteja certo.
- **Migration de ~450 KB.** `db:reset` fica alguns segundos mais lento, e o diff
  do PR fica grande e ilegível nessa parte — revisa-se o script, não o SQL.
- Apelidos ("SJC", "Floripa") não funcionam na busca.
- Município criado ou renomeado pelo IBGE depois do seed exige migration nova. É
  raro, mas acontece.

## Código / evidência

| Artefato | Caminho |
| -------- | ------- |
| Spec da fase | [`../Tasks/fase-2-onboarding.md`](../Tasks/fase-2-onboarding.md), seção 5 (migration 4) e A14–A15 |
| Seed original de três cidades | `supabase/migrations/20260925120300_seed_cities.sql` |
| Policy removida | `cities_insert_authenticated`, em `supabase/migrations/20260925120200_rls_policies.sql` |
| Gerador do seed | `scripts/gen-cities-seed.ts` — não existe ainda |

## Related

- [0002 — Estadia por pessoa; estado do casal derivado](./0002-estadia-por-pessoa-estado-derivado.md) —
  por que cidade é referência e nunca texto
- Backlog em [`README.md`](./README.md): engine do mapa (Fase 7), que vai trazer a
  mesma pergunta para cidades estrangeiras
