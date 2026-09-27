# ADR 0017 — Cidades do mundo em `cities`, como linhas do casal, a partir do Photon

- **Status:** Proposed
- **Data:** 2026-09-26
- **Área:** schema (`cities`), autorização, Calendário (Fase 5)
- **Revisa em parte:** [0007](./0007-cidades-brasileiras-por-seed-do-ibge.md) (a escrita em `cities` deixa de ser fechada ao cliente, num recorte)

---

## Contexto

O [0007](./0007-cidades-brasileiras-por-seed-do-ibge.md) pôs em `cities` os
5.570 municípios do IBGE e fechou a escrita ao cliente. Ele mesmo registrou que
seria revisto: _"Quando as Viagens precisarem de Lisboa, o geocoding entra"_.
Esse momento chegou uma fase antes. O mês desenhado do Calendário (`D1Zny4`)
mostra uma faixa _Lisboa, Portugal_, e `stays.city_id` só aceita cidade que
exista em `cities`. Sem Lisboa em `cities`, a viagem para Lisboa não vira
estadia, e a derivação do [0002](./0002-estadia-por-pessoa-estado-derivado.md)
não diz _Viajando juntos_.

Duas coisas já existiam em 2026-09-26. A Fase 4 escolheu o Photon (OSM) como
provedor de lugares, chamado direto do navegador, sem chave
([0016](./0016-busca-de-lugares-pelo-photon-osm.md)). O Photon devolve, para
cada resultado, `osm_type` e `osm_id`: um identificador que distingue a Lisboa
de Portugal de qualquer outra Lisboa. E `cities` tem o `CHECK`
`cities_br_has_ibge_code`: cidade brasileira sem código do IBGE não entra.

O motivo do 0007 para fechar a escrita continua certo: `cities` é
compartilhada, e uma grafia errada de um casal apareceria na busca de todos,
sem dono para corrigir. O problema, então, não é "deixar o cliente escrever".
É deixá-lo escrever **onde os outros leem**.

No `/spec` da Fase 5, o Gabriel escolheu **abrir o mundo agora**, em vez de
limitar a Fase 5 ao Brasil e empurrar a decisão para as Viagens.

## Decisão

**Cidade de fora do Brasil é uma linha de `cities` que pertence a um casal.
Ela vem de um resultado do Photon e é deduplicada, dentro do casal, pelo
identificador do OSM.**

- Colunas novas em `cities`: `couple_id` (nulo nas cidades do IBGE,
  `on delete cascade`), `osm_ref` (`N`/`W`/`R` + `osm_id`, por exemplo
  `R5400890`) e `region` (província ou estado, só para exibir).
- `cities_scope`: se `couple_id` está preenchido, então `osm_ref` também está, e
  `country_code <> 'BR'`. Com o `cities_br_has_ibge_code` que já existe, isso
  garante que **cidade brasileira é sempre a linha do IBGE**. O cliente não
  consegue criar uma segunda Marau, e a derivação nunca diz _Separados_ para
  dois registros da mesma cidade.
- `unique (couple_id, osm_ref)`. O cliente faz
  `insert … on conflict do nothing` e depois lê o `id` pela `osm_ref`. Os dois
  integrantes escolhendo Lisboa, até ao mesmo tempo, terminam no mesmo `id`.
- **Leitura:** `couple_id is null or couple_id in (select private.my_couple_ids())`.
  **Escrita:** só `insert`, só com `couple_id` do próprio casal e `osm_ref`
  preenchida. Sem `update` e sem `delete`: uma cidade referenciada não muda de
  nome embaixo de uma estadia.
- `search_cities` continua só no IBGE (`couple_id is null`). A cidade
  estrangeira se acha pelo Photon, nunca pela busca por nome.
- Estadia e evento só referenciam cidade global ou do próprio casal, e um
  trigger cobra isso. Sem ele, quem soubesse o `uuid` da Lisboa de outro casal
  poderia apontar para ela.
- No seletor, o resultado do Photon com `countrycode = BR` é descartado: o
  Brasil sai do IBGE.
- `profiles.home_city_id` e `couple_saved_cities` continuam só no IBGE. As telas
  deles não mudam.

## Alternativas descartadas

- **Limitar a Fase 5 ao Brasil e decidir na Fase 6.** Era a recomendação na
  pergunta, e o Gabriel escolheu o contrário. O custo dela seria uma faixa
  desenhada (_Lisboa_) que o app não consegue gravar, e uma viagem para fora que
  não vira estadia durante uma fase inteira.
- **Cidade estrangeira global (sem `couple_id`), criada por RPC `security definer`.**
  Deduplica entre casais e economiza linhas. Mas volta exatamente o problema do
  0007: uma linha errada (um nome envenenado sob a `osm_ref` de Lisboa) passaria
  a valer para todos os casais, e não há como o servidor conferir o que o
  cliente diz que o Photon devolveu sem chamar o Photon ele mesmo. De quebra,
  seria a 13ª `security definer` em `public`.
- **Chamar o Photon no servidor** (edge function) e gravar só o que veio de lá.
  Resolve a confiança, mas põe uma dependência externa no caminho de escrita de
  toda viagem, e a instância pública pede uso justo por cliente, não por
  servidor. O ganho (conferir dado que só o próprio casal lê) não paga isso.
- **Texto e coordenada soltos na estadia, sem `city_id`.** Viola o
  [0002](./0002-estadia-por-pessoa-estado-derivado.md): a derivação compara
  identidade, e "Lisboa" digitada duas vezes são duas cidades.
- **Importar um dataset mundial de cidades** (GeoNames, por exemplo) por
  migration, como o IBGE. São centenas de milhares de linhas para dois
  usuários, com um critério de "o que é cidade" diferente do Photon, que é
  quem a tela usa para buscar.
- **Deduplicar por nome e país em vez do OSM.** Existem várias cidades com o
  mesmo nome no mesmo país (há Springfields de sobra), e a grafia muda com o
  idioma.

## Consequências

### Positivas

- A viagem para Lisboa vira estadia, e a derivação diz _Viajando juntos_ sem
  nenhuma regra nova.
- O motivo do 0007 continua de pé: nenhuma linha escrita por um casal aparece
  para outro.
- O Brasil não muda: uma fonte só (IBGE), com a mesma busca.
- A Fase 6 (Viagens) e a Fase 7 (o globo) já recebem cidades do mundo com
  coordenada, sem decidir nada sobre isso.

### Negativas / trade-offs

- **A mesma Lisboa existe uma vez por casal.** Duplicação consciente, que só
  pesaria se o app tivesse muitos casais indo às mesmas cidades.
- **`osm_id` não é estável para sempre.** Se o OSM renumerar a relação de uma
  cidade, a próxima escolha dela cria uma segunda linha no casal. Uma estadia
  em cada linha faz a derivação dizer _Separados_ para os dois em Lisboa, sem
  erro nenhum. É raro para cidade, mas é o tipo de falha silenciosa que este
  projeto cataloga. Gatilho para rever: a primeira vez que aparecer, e aí a
  correção é uma migration que funde as duas linhas.
- **O dado da cidade estrangeira é o que o cliente disse.** O banco confere o
  formato (`osm_ref`, país, coordenada no intervalo) e não a verdade. Como só o
  próprio casal lê, o pior caso é o casal enganar a si mesmo.
- **A escrita em `cities` volta a existir para o cliente**, e isso é superfície
  de segurança. Ela está limitada a `insert`, ao próprio casal e a
  `country_code <> 'BR'`, e os testes de integração provam cada recorte.
- **Duas fontes de cidade convivem** (IBGE e Photon), com o seletor juntando as
  duas. A regra "Brasil é IBGE" mora no `CHECK` e no seletor, e só o `CHECK` é
  autoridade.
- **Cidade-casa continua só no Brasil.** Casal que mora fora ainda não faz
  onboarding, como no 0007.

## Código / evidência

| Artefato | Caminho |
| -------- | ------- |
| Spec | [`../Tasks/fase-5-calendario.md`](../Tasks/fase-5-calendario.md): I2, seção 5 (migration 1), R17, A8, A12 |
| Migration | `supabase/migrations/…_world_cities.sql` (a criar) |
| Seletor e dedupe | `src/data/worldCities.ts` (a criar) · `osmRef` em `src/data/places.ts` |
| Trigger de cidade do casal | `stays_members` e `calendar_events_members` (a criar) |
| O `CHECK` que já garante "Brasil é IBGE" | `cities_br_has_ibge_code`, em `supabase/migrations/20260926120300_cities_ibge.sql` |

## Related

- [0007 — Cidades brasileiras por seed do IBGE](./0007-cidades-brasileiras-por-seed-do-ibge.md): revisado em parte por este
- [0016 — Busca de lugares pelo Photon (OSM)](./0016-busca-de-lugares-pelo-photon-osm.md): o provedor, e as condições de privacidade que valem aqui também
- [0002 — Estadia por pessoa; estado do casal derivado](./0002-estadia-por-pessoa-estado-derivado.md): por que a identidade da cidade importa
- [0001 — Supabase com RLS por casal](./0001-supabase-com-rls-por-casal.md)
