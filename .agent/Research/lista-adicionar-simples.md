# Research — Adicionar à Lista com menos campos e uma busca que acha

> **Gate 0.** Feature voltada ao usuário que mexe na fonte de dados da busca de
> lugares (ADRs 0016 e 0027) e na base de cidades da Home.

- **Data:** 2026-10-11
- **Status:** 🟢 Concluído

---

## 1. Problema

O Gabriel, ao adicionar um item à Lista:

- **Restaurante ou parque não aparece pelo nome.** Ele cai para o endereço,
  "rua + número", e a busca devolve só a rua ou o bairro. O pin fica no lugar
  errado, ou ele desiste do item.
- **O modal pede campos demais.** São 8 categorias, cada uma com Nome, Local,
  Link, Nota e Foto, e algumas com campos só delas (Região, Onde comer, Cidades
  que interessam, Temporadas). No passo 1, os cartões das categorias deixam um
  espaço vazio embaixo.
- **País não lista cidades.** Na Home, escolher a África do Sul abre um
  seletor de cidades vazio. Na Lista, País e Cidade são categorias separadas,
  com buscas diferentes.

Frequência: toda vez que se adiciona um lugar. É a escrita mais comum da Lista.

## 2. Por que agora

- A Fase 7 pôs os itens no globo. Pin errado agora aparece na tela inicial do
  app, não fica escondido numa linha de texto.
- O ADR 0027 (2026-10-09) melhorou a busca de estabelecimentos, mas não a de
  endereço. O contorno "digitar o endereço" continua falhando.
- O casal já usa a Lista de verdade. A queixa vem do uso, não de hipótese.

## 3. Evidência de demanda

Ninguém de fora usa o app (ADR 0014), então "demanda" aqui é o uso do casal
mais uma medição. As consultas são reais, feitas em 2026-10-11 contra o Photon
(`photon.komoot.io/api`, com `lat`/`lon` de SJC ou de Marau) e contra o Mapbox
(Search Box `/forward` e `/suggest`, e Geocoding v6 `/forward`, com
`proximity` igual). O script e a saída completa ficaram no scratchpad da
sessão; o resumo está abaixo.

| Afirmação | Fonte | Confiança |
| --------- | ----- | --------- |
| Endereço com número: o Photon acerta **1 de 6** (só Benedito Matarazzo 9403, por um ponto de ônibus). Nos outros 5, devolve a rua sem número ou outra cidade (Cruz Alta, Ribeirão Preto, Camaquã). | Consulta real: Rua Vilaça 500, Av. Nove de Julho 300, Rua Sete de Setembro 200 (SJC); Av. Júlio Borella 1144, Rua Bento Gonçalves 500 (Marau); Av. Dep. Benedito Matarazzo 9403 (SJC) | Alta |
| Endereço com número: o Mapbox Search Box acerta **6 de 6**, no número e na cidade certos, como 1º resultado. | Mesmas consultas | Alta |
| O Geocoding v6 do Mapbox (sem POI) acerta 3 de 6 em 1º lugar só com `proximity`: a proximidade pesa pouco e ele pula para Guarulhos, Extrema ou Jundiaí. | Mesmas consultas | Alta |
| Com `country=br` e **a cidade de partida no texto** ("Rua Vilaça 500 São José dos Campos", "Rua Bento Gonçalves 500 Marau"), o v6 acerta o número na cidade certa. Precisão: `rooftop`, `point` ou `interpolated` (estimada ao longo da quadra). | Consulta real, `types=address,street` | Alta |
| **O Search Box não deixa guardar nada**: _"all data returned by the Search Box API endpoints is only available for temporary use. If your use case requires storing position data, contact Mapbox sales."_ Não há modo `permanent`. | https://docs.mapbox.com/api/search/search-box/ | Alta |
| **O Geocoding v6 deixa guardar com `permanent=true`**: _"Permanent results are allowed to be cached and stored indefinitely."_ Exige cartão na conta. Não devolve POI: _"no longer provides POI data"_. | https://docs.mapbox.com/api/search/geocoding/ | Alta |
| O v6 permanente custa US$ 5,00 por 1.000 requisições, sem faixa grátis. 500 buscas por mês dariam uns US$ 2,50. | https://www.mapbox.com/pricing | Alta |
| A cobertura de endereço do Mapbox no Brasil é "básica" (○); região, cidade e bairro são "premium". | https://docs.mapbox.com/help/dive-deeper/mapbox-data | Alta (mas a medição acima foi boa nas duas cidades) |
| **Google Places, inviável**: 14.2 _"must not use Google Maps Content from the Places API in conjunction with a non-Google map"_; 14.3, latitude e longitude por _"up to 30 consecutive calendar days"_. A Geocoding API do Google deixa guardar (6.3.2), mas a 6.2 também proíbe mapa que não é Google. | https://cloud.google.com/maps-platform/terms/maps-service-terms (modificado em 10/06/2026) | Alta |
| **Link do Google Maps colado**: o formato `@lat,lng` e `!3d!4d` não é documentado (engenharia reversa). Os termos do usuário final proíbem _"copy the content"_ e _"create or augment any other mapping-related dataset (including… business listings database…)"_. | https://www.google.com/help/terms_maps/ | Média (zona cinzenta, não permissão) |
| **GeoNames** é CC-BY 4.0. O `cities5000` tem 69.789 cidades (15 MB, **592 na África do Sul**); o `cities15000` tem 34.159 (8,1 MB, 307 na ZA). O nome em português vem do `alternateNamesV2`. | https://download.geonames.org/export/dump/readme.txt + arquivos medidos em 2026-10-11 | Alta |
| O Natural Earth (domínio público) tem só cidades grandes, poucas por país. O Overture divisions é ODbL, em GeoParquet, pesado para seed. | naturalearthdata.com/about/terms-of-use · docs.overturemaps.org/attribution | Alta |
| Estabelecimento perto de casa: "pizzaria" e "restaurante" a partir de Marau. O Photon dá 1 de 6 resultados em Marau; o Search Box dá **6 de 6**. | Consulta real | Alta |
| Rede em SJC: Coco Bambu os dois acham. Madero, só o Search Box. "Coco Bam" já autocompleta no `/suggest`. | Consulta real | Alta |
| **Parques: o Photon ganha.** Parque Vicentina Aranha e Parque da Cidade (SJC) vêm em 1º no Photon. O Search Box devolve outro lugar (um sanatório em SP, o Parque da Cidade de Jacareí). | Consulta real | Alta |
| Lugar famoso em outra cidade ("Mocotó São Paulo"): o Photon acha, o Search Box devolve ruas parecidas. | Consulta real | Alta |
| Exterior (Zuma Dubai, Kirstenbosch): o Search Box acha os dois. | Consulta real (Photon não testado nesses dois) | Média |
| O Overture (fonte atual de estabelecimentos, ADR 0027) **não foi medido** aqui, porque exige sessão na edge function `places-nearby`. | — | Lacuna |
| A Home fora do Brasil só lista cidades que já têm item: `regionRows` só preenche com zero as cidades do IBGE (`src/domain/map.ts`, nível `state`). Sem base mundial de cidades, a África do Sul sai vazia. | Código | Alta |

## 4. Concorrência

O que o casal já espera, por ter visto em outros apps:

- **Google Maps (salvar lugar).** Um campo, um toque no resultado, e nome,
  endereço e pin vêm juntos. Não se digita nome nem link à parte. É a
  referência citada pelo Gabriel, e o uso dele é a fonte.
- **Wanderlog e Polarsteps (planejar viagem).** _Hipótese a validar, sem
  fonte nesta rodada:_ adicionar lugar é um campo de busca, e o tipo vem do
  resultado.
- **Apps de filme e série** buscam num catálogo. Aqui isso fica **fora**
  (ver seção 9): filme e série seguem como nome + onde assistir.

Requisito implícito: **o tipo do lugar deve vir do resultado, e não ser uma
pergunta a mais.**

## 5. Fit com o produto

Pertence ao produto: a Lista é a maior área do app, e o pin certo no globo é a
razão de a Fase 7 existir.

O que isto obriga a assumir:

- **Os 5 grupos ficam só na tela; o banco continua com 8 categorias.** Países
  e cidades, Restaurantes e parques, Comidas, Filmes e séries, Experiências. O
  resultado escolhido define a categoria: país vira `pais`, cidade vira
  `cidade`. A tela pergunta só o que o resultado não responde: filme ou série,
  restaurante ou parque, se o POI não disser. Assim não há migration, e
  `hidden_categories`, filtros, pins e o `CHECK` do ADR 0003 ficam como estão.
- **O Link sai do formulário.** A coluna `link` fica (itens antigos podem ter
  link), mas o modal deixa de pedi-la.
- **Uma base de cidades do mundo vira dependência** da Home e da Lista
  (ver seção 6, item D).

## 6. Opções

### Busca de restaurantes, parques e endereços

| Opção | O que é | Custo | Risco |
| ----- | ------- | ----- | ----- |
| **A. Mapbox Search Box** | A melhor busca de estabelecimento medida aqui. | US$ 3 por 1.000 sessões, depois de 500 grátis. | **Proibido guardar** sem contrato com o comercial. Fora, como o 0027 já dizia. |
| **A′. Mapbox Geocoding v6 `permanent`, só para endereço** ✅ | Mais uma fonte no `searchPlaces`, chamada quando o texto parece endereço (tem número). A consulta leva a cidade de partida (`searchOrigin`) e `country` dela. Guarda a coordenada. | ~US$ 2,50 por mês. Na construção, o modo permanente respondeu com o token público do mapa: a chamada sai do navegador, sem edge function (ADR 0030). | Cobertura "básica" no Brasil (a medição foi boa, e o `interpolated` cai na quadra, não na porta). Não acha estabelecimento. |
| **B. Google Places** | A melhor busca. | Grátis no nosso volume. | **Proibido**: mapa que não é Google (14.2) e 30 dias (14.3). |
| **C. Colar o link do Google Maps** | A pessoa acha no Google, cola o link e a gente extrai nome e coordenada. | Edge function para seguir o link curto. | Formato não documentado, e os termos do usuário final proíbem copiar conteúdo. Frágil e cinzento. |
| **Manter Photon + Overture para estabelecimento e parque** ✅ | É o que já existe (ADR 0027). Os dois deixam guardar. | Zero. | O Overture não foi medido nesta rodada. Se ele também falhar em restaurante, o próximo passo é a tabela própria com Overture/Foursquare OS importados (alternativa já registrada no 0027). |

### Cidades de um país (Home e Lista)

| Opção | O que é | Custo | Risco |
| ----- | ------- | ----- | ----- |
| **D. Seed do GeoNames, fora do Brasil** ✅ (na construção: `cities15000`, 29.461 cidades, 307 na África do Sul — ADR 0029) | Tabela de referência (nome em pt, país, estado, lat/lng, população), importada uma vez e só de leitura. O Brasil continua no IBGE. | ~15 MB de arquivo, estimados 10–25 MB no Postgres. Atribuição CC-BY na tela de créditos. | Convive com o ADR 0017 (cidade estrangeira é linha do casal em `cities`, do Photon): a spec decide se escolher do GeoNames cria essa linha (provável) ou se a referência substitui o Photon no modo `city`. Isso é ADR novo. |
| **E. Buscar sob demanda** | Ao abrir um país, consulta o Photon e o Mapbox filtrando o país. | Uma chamada por abertura. | Não dá lista completa, só busca. O seletor da Home mostra tudo de uma vez. |

## 7. Recomendação

Simplificar o modal para 5 grupos com um campo de busca que preenche tudo (as 8
categorias continuam no banco, decididas pelo resultado escolhido), resolver
"rua + número" somando o **Mapbox Geocoding v6 permanente** à busca existente, e
listar as cidades de qualquer país com um **seed do GeoNames** — sem Google,
porque os termos dele proíbem exatamente o que a Lista faz.

## 8. Riscos

- **O sintoma "o restaurante não aparece" pode continuar.** O Mapbox que acha
  restaurante não deixa guardar. O que se pode guardar é Photon + Overture, e o
  Overture não foi medido aqui. Mitigação: com o endereço funcionando, o
  contorno do Gabriel ("digito rua e número") passa a dar o pin certo. A spec
  deve medir o Overture com 10 restaurantes reais do casal antes de fechar.
- **O `permanent` cobra desde a primeira chamada.** O `pk.` do bundle já
  consegue chamá-lo (a conta aceitou), então uma edge function não fecharia
  esse caminho. Restringir o token por URL no painel do Mapbox reduz o risco.
  Ver o ADR 0030.
- **"Parece endereço" é heurística.** Se errar, ou o endereço não é buscado, ou
  se paga uma chamada à toa. Barato nos dois casos.
- **`interpolated`** põe o pin na quadra, não na porta. No zoom do globo isso
  não aparece; no zoom de cidade, talvez.
- **Duas bases de cidade estrangeira** (`cities` do casal, via Photon, e o
  GeoNames) podem divergir no nome ("Cidade do Cabo" e "Cape Town") e duplicar
  o pin. O ADR novo tem que dizer qual manda.
- **Tirar o Link do formulário** esconde o link de quem já tem. Itens antigos
  continuam mostrando o link no detalhe, mas não dá mais para editá-lo.

## 9. Fora de escopo

- Catálogo de filmes e séries (TMDB e similares): filme e série continuam
  nome + onde assistir.
- Trocar o mapa (ADR 0022).
- Mudar as 8 categorias no banco, `hidden_categories` ou os filtros da Home.
- Memórias, fotos do feito e _Marcar como feito_.

---

## Related

- ADRs: [0003](../Decisions/0003-lista-tabela-unica-com-check-por-categoria.md) ·
  [0016](../Decisions/0016-busca-de-lugares-pelo-photon-osm.md) ·
  [0017](../Decisions/0017-cidades-do-mundo-por-casal.md) ·
  [0027](../Decisions/0027-estabelecimentos-pelo-overture-perto-de-casa.md)
- Decisões: [0029](../Decisions/0029-cidades-do-mundo-por-seed-do-geonames.md) ·
  [0030](../Decisions/0030-endereco-pelo-mapbox-geocoding-permanente.md)
