# ADR 0027 — Estabelecimentos pelo Overture e ordem por proximidade, a partir de onde a pessoa está (revisa em parte o 0016)

- **Status:** Proposed
- **Data:** 2026-10-09
- **Área:** dependência externa, busca de lugares da Lista

---

## Contexto

O casal quer digitar o nome de um restaurante na Lista, achar o lugar e ver o
pin na posição exata do globo. A busca do ADR 0016 (Photon, sobre o
OpenStreetMap) acha cidade, rua e parque, mas quase nunca o estabelecimento
pequeno. Em 2026-10-09 foram sorteados 25 restaurantes, bares e cafés abertos
do Overture Places (release `2026-09-23.1`) em São José dos Campos e 25 em
Marau. O Photon achou **2 de 25** em SJC e **1 de 25** em Marau, contando como
achado o resultado a menos de 300 m.

O pedido original foi "buscar pelo Google Maps". Os termos da Google Maps
Platform proíbem as duas coisas de que a Lista precisa:

- mostrar o resultado do Places num mapa que não é da Google (o nosso é Mapbox,
  ADR 0022);
- guardar a coordenada por mais de 30 dias (só o `place_id` pode ser guardado).

O casal não quis trocar o mapa. Mapbox Search Box e Foursquare têm a mesma
restrição de guardar a coordenada.

O Overture Places é dado aberto (CDLA-Permissive 2.0, Apache 2.0 e CC0,
conforme a fonte). 97% dos lugares do recorte de SJC vêm da Meta (páginas de
negócio do Facebook). A coordenada pode ser guardada e desenhada em qualquer
mapa.

## Decisão

- No modo `place` da busca da Lista, `searchPlaces` consulta **ao mesmo tempo**
  o Photon e os estabelecimentos do Overture **perto de onde a pessoa está**
  (ver abaixo de onde a busca parte).
- O Overture vem pela **Open Places API**, uma API hospedada sobre o Overture,
  com plano grátis de 10 mil buscas por mês. Ela é chamada numa edge function
  nova, `places-nearby`, que guarda a chave (`OPEN_PLACES_API_KEY`) e exige
  sessão, no mesmo molde da `unsplash-search` (ADR 0025).
- A API só busca num raio de até 50 milhas (~80 km) em volta de um ponto, e o
  ponto é o de partida da busca.
- O resultado é um só, ordenado por proximidade (abaixo), com duas vagas
  garantidas ao Photon (`PHOTON_RESERVED`) para a rua de mesmo nome não sumir.
  O mesmo lugar nas duas fontes (mesmo nome sem acento e a menos de ~150 m)
  aparece uma vez.
- O Overture sem chave, fora do ar ou sem cota **não aparece** para quem busca:
  fica o Photon, como antes. O fallback do IBGE só entra quando nenhum dos dois
  trouxe nada.
- **O ponto de partida é onde a pessoa está hoje**: a cidade da estadia do dia
  dela (`searchOrigin`). Sem estadia no dia, a cidade-casa. Não usa o GPS do
  navegador: pediria permissão, e o app já sabe pelo Calendário.
- **A ordem é do meio para fora, em anéis** (`rankByProximity`): bairro (até
  2 km), cidade (15 km), estado (250 km), país, continente (5.000 km) e mundo.
  Vale para Photon e Overture juntos, nos modos `place` e `city`. Dentro do
  mesmo anel fica a ordem de relevância do provedor. O anel do país é "mesmo
  país de onde a pessoa está", não distância, porque o Brasil tem mais de
  4.000 km e Buenos Aires fica mais perto de SJC que o norte da Bahia. O país
  de origem sai do resultado mais perto, se estiver a menos de 50 km; sem ele,
  o anel do país é até 1.500 km. Com a ordem por proximidade, o Photon traz 10
  resultados em vez de 5, para haver o que ordenar.
- Nada muda no schema: o candidato do Overture é o mesmo `GeoPlace`, guardado
  nas mesmas colunas de `list_items`.

## Alternativas descartadas

- **Google Places.** Melhor cobertura, mas os termos proíbem pin em mapa que
  não é da Google e coordenada guardada além de 30 dias.
- **Trocar o mapa pelo Google Maps** para poder usar o Places. O casal recusou:
  o globo do Mapbox está configurado como querem (ADR 0022).
- **Tabela própria no Supabase**, com os lugares do Overture importados por
  região e busca no banco. Tem autocompletar e não depende de terceiro, mas
  exige um script de importação para cada região nova. O casal escolheu a API
  hospedada.
- **Mapbox Search Box / Foursquare.** Têm estabelecimento, mas não deixam
  guardar a coordenada.

## Consequências

### Positivas

- Restaurante, bar e café perto de casa passam a ser achados, com coordenada
  própria que vai para o pin do globo e para o _Perto de vocês_.
- O mapa, o schema e a tela não mudam: a troca fica em `places.ts`.

### Negativas / trade-offs

- **Só perto de onde a pessoa está.** Um restaurante em cidade de viagem
  futura continua dependendo do Photon, até a estadia daquele dia começar.
- **A proximidade ganha da relevância entre anéis.** Um nome que bate
  exatamente, mas fica em outro estado, vai para depois de um que bate pela
  metade na própria cidade.
- **Serviço sem garantia.** A Open Places API é de uma empresa desconhecida.
  Se sumir, a busca volta a ser só o Photon, sem erro na tela, e a decisão
  seguinte é a tabela própria.
- **Dados um mês atrás do Overture** e com algum lixo (um matadouro como
  "restaurante"). O `min_confidence` de 0,3 corta parte dele.
- **A precisão da coordenada não foi medida** contra a porta real dos lugares.
- **Uma chamada de edge function por busca** (depois do debounce de 350 ms),
  contra a cota de 10 mil por mês.

## Código / evidência

| Artefato | Caminho |
| -------- | ------- |
| Edge function | `supabase/functions/places-nearby/` (+ `supabase/tests/places-nearby.test.ts`) |
| Cliente | `src/data/nearbyPlaces.ts`, `src/data/places.ts` (`searchPlaces`, `mergeNearby`, `rankByProximity`), `src/list/api.ts` |
| Ponto de partida | `src/domain/list.ts` (`searchOrigin`), `src/list/ListScreen.tsx` (`searchFrom` no contexto) |
| Testes | `src/data/places.test.ts` ("Overture perto de casa") |

## Related

- [0016 — Busca de lugares pelo Photon (OSM)](./0016-busca-de-lugares-pelo-photon-osm.md)
- [0022 — Engine do mapa: Mapbox](./0022-engine-do-mapa-mapbox.md)
- [0025 — Viagem solo e capa do Unsplash](./0025-viagem-solo-e-capa-do-unsplash.md) (o molde da edge function)
