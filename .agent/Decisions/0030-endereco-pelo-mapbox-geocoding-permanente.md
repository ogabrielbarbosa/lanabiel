# ADR 0030 — Endereço com número pelo Mapbox Geocoding permanente

- **Status:** Proposed
- **Data:** 2026-10-11
- **Área:** dependência externa, busca da Lista (revisa em parte o 0016 e o 0027)

---

## Contexto

O Gabriel procurava um restaurante pelo nome, não achava e digitava o
endereço ("Rua Vilaça, 500"). A busca devolvia a rua inteira, o bairro ou a
mesma rua em outra cidade. Medido em 2026-10-11: o Photon acertou **1 de 6**
endereços com número em SJC e Marau. O OSM tem pouco número de casa no Brasil.

O pedido foi "usar o Google". Os termos do Google Maps Platform proíbem usar o
resultado do Places com mapa que não é Google (14.2) e guardar coordenada por
mais de 30 dias (14.3). O casal já recusou trocar o mapa (ADR 0027). O Mapbox
Search Box, que achou bem os restaurantes perto de casa, também não deixa
guardar ("only available for temporary use"). O **Geocoding v6 do Mapbox
deixa**, com `permanent=true` ("allowed to be cached and stored
indefinitely"), mas só tem endereço e lugar, sem estabelecimento.

Medido com o código do app, a partir da cidade de quem busca: **6 de 6**, cada
um no número certo, na cidade certa e em primeiro lugar. Isso só aconteceu com
o nome da cidade no texto. Só com `proximity`, ele acertou 3 de 6 e mandou
"Rua Bento Gonçalves 500", buscado a partir de Marau, para Soledade.

Na conta do projeto, o modo permanente respondeu com o token público que o
mapa já usa.

## Decisão

- No modo `place` da busca da Lista, quando o texto tem número
  (`looksLikeAddress`), `searchPlaces` chama **também** o Geocoding v6 com
  `permanent=true`, `types=address`, numa caixa de ~60 km em volta de onde a
  pessoa está e com ", {cidade}" no texto quando ela não escreveu a cidade
  (sem vírgula). Sem resultado ali, tenta de novo no mundo, com o texto como
  veio. São no máximo duas chamadas por busca, depois do debounce.
- A chamada sai **do navegador**, com o `VITE_MAPBOX_TOKEN` público (`pk.`)
  do ADR 0022, como o Photon: `credentials: 'omit'`, `no-referrer`.
- Os endereços (até 3) vão **no topo**, fora da ordem por anel do ADR 0027: a
  rua sem número do Photon a 1 km ganharia do número certo a 3 km.
- O resultado vira o `GeoPlace` de sempre (rua e número em `address`), e o
  modal **não** usa "Rua Vilaça 500" como nome do item: pede o nome.
- Photon e Overture continuam como estão, para estabelecimento, parque e
  cidade. O Mapbox fora do ar, ou sem token, não aparece para quem busca.
- `searchOrigin` passa a devolver o nome da cidade junto da coordenada.

## Alternativas descartadas

- **Google Places / Google Geocoding.** Proibidos pelos termos, como acima.
- **Mapbox Search Box.** A melhor busca de estabelecimento medida, mas não
  deixa guardar a coordenada sem contrato com o comercial.
- **Colar o link do Google Maps.** O formato da URL não é documentado, e os
  termos do usuário final proíbem copiar conteúdo do Maps.
- **Edge function com token secreto.** Esconderia o token, mas o `pk.` do
  bundle já consegue chamar o modo permanente. Uma função a mais não fecha
  esse caminho e custa uma ida ao Supabase por busca.
- **Chamar o permanente só ao escolher** (sugestões temporárias, gratuitas,
  e uma chamada permanente no clique). É mais barato, mas a escolha vira
  assíncrona e o resultado guardado pode diferir do mostrado. Com o volume de
  duas pessoas, não compensa.

## Consequências

### Positivas

- "Rua + número" cai na porta, ou na quadra (`interpolated`), da cidade certa.
- O contorno que o casal já usava (digitar o endereço) passa a funcionar.
- A coordenada pode ir para o pin do globo: os termos permitem.

### Negativas / trade-offs

- **Custo por chamada**, sem faixa grátis: US$ 5 por 1.000. Uma busca com
  número custa uma ou duas chamadas, e digitar devagar dispara mais de uma
  busca. Com o uso do casal, alguns dólares por mês no pior caso.
- **O `pk.` público consegue gastar** no modo permanente. Isso já valia antes
  desta decisão. Restringir o token por URL no painel do Mapbox reduz o risco.
- **"Parece endereço" é heurística**: "Bar 51" dispara uma chamada à toa.
- **A cobertura de endereço do Mapbox no Brasil é "básica"** na tabela dele.
  Nas duas cidades do casal a medição foi boa. Em outras cidades, não sei.
- O nome da cidade no texto pode puxar para a rua de mesmo nome dentro dela,
  quando a pessoa queria outra cidade sem escrever qual. A segunda tentativa,
  no mundo, só acontece quando a primeira não acha nada.

## Código / evidência

| Artefato | Caminho |
| -------- | ------- |
| Fonte | `src/data/addresses.ts` |
| Junção | `src/data/places.ts` (`searchPlaces`, `addressToCandidate`, `ADDRESS_TOP`) |
| Origem com nome | `src/domain/list.ts` (`searchOrigin`, `SearchFrom`) |
| Testes | `src/data/addresses.test.ts` |
| Medição | [`../Research/lista-adicionar-simples.md`](../Research/lista-adicionar-simples.md), seção 3 |

## Related

- [0016 — Busca de lugares pelo Photon (OSM)](./0016-busca-de-lugares-pelo-photon-osm.md)
- [0022 — Engine do mapa: Mapbox](./0022-engine-do-mapa-mapbox.md)
- [0027 — Estabelecimentos pelo Overture](./0027-estabelecimentos-pelo-overture-perto-de-casa.md)
- [0029 — Cidades do mundo por seed do GeoNames](./0029-cidades-do-mundo-por-seed-do-geonames.md)
