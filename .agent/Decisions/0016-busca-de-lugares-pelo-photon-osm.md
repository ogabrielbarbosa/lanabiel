# ADR 0016 — Busca de lugares pelo Photon (OSM), com o resultado guardado no item

- **Status:** Proposed
- **Data:** 2026-09-26
- **Área:** dependência externa, dados geográficos da Lista (Fase 4; Viagens e Mapa devem reaproveitar)

---

## Contexto

Os modais de adicionar da Lista pedem **lugar com coordenada**, e não só cidade:

- Restaurante e Parque buscam **estabelecimento ou endereço** (_"Mocotó · Av.
  Nossa Senhora do Loreto, 1100 · São Paulo, SP"_);
- Experiência busca _"cidade, região ou endereço — ex.: Capadócia"_, **fora do
  Brasil** (_Göreme, Turquia_);
- Cidade e Comida buscam cidade, também fora do Brasil (o modal de Cidade tem o
  campo _País_);
- País põe o pin no centro do país.

Todos os geográficos _"viram um pin no globo"_ (Fase 7). Então a coordenada
precisa ficar **guardada**, e não só consultada na hora.

O [0007](./0007-cidades-brasileiras-por-seed-do-ibge.md) resolveu `cities` com o
seed do IBGE (só Brasil) e adiou o geocoding _"para quando as Viagens
precisarem de Lisboa"_. A Lista chegou lá antes das Viagens.

O que foi medido em 2026-09-26, com chamadas reais à instância pública
`photon.komoot.io`:

| Consulta | Resultado |
| --- | --- |
| `Mocotó São Paulo` | restaurante (`amenity=restaurant`), com coordenada |
| `Parque Vicentina Aranha` | parque em São José dos Campos |
| `Göreme` | vilarejo em Nevşehir, TR |
| `Gramado` | município em RS |
| `Japão` sem filtro | **um vilarejo no Maranhão** |
| `Japão` com `layer=country` | JP, com nome em japonês (日本) |
| `Casa Amarela Bistrô São José dos Campos` | **não achado** |

A resposta tem `Access-Control-Allow-Origin: *` e não pede chave. `lang=pt` não
existe (só `default`, `de`, `en`, `fr`).

## Decisão

- **Provedor: Photon** (Komoot, sobre dados do OpenStreetMap), chamado **direto
  do navegador**, sem edge function no meio. URL base numa constante só
  (`PHOTON_URL`, em `src/data/places.ts`).
- **O resultado é guardado no item**, resolvido: endereço, cidade, estado, país,
  código ISO do país, lat e lng, nas colunas geográficas de `list_items`
  ([0003](./0003-lista-tabela-unica-com-check-por-categoria.md)). O item não
  guarda id do OSM e não depende do provedor para ser exibido depois.
- **A Lista não escreve em `cities`.** O 0007 continua de pé: `cities` segue
  sendo a tabela das cidades-casa e das estadias (IBGE, escrita fechada ao
  cliente), e um item da Lista é um lugar, não uma cidade do casal.
- **Filtro de camada por modal:** País usa `layer=country`; Cidade e Comida
  usam `layer=city`; Restaurante, Parque e Experiência buscam sem filtro. O
  viés de proximidade é a cidade-casa de quem busca.
- **Nome de país em português** sai de `Intl.DisplayNames('pt-BR', { type:
  'region' })` pelo código ISO, nunca do texto do Photon.
- **Quando não se acha o lugar:** _"Não achei — usar só a cidade"_. A pessoa
  busca a cidade, digita o endereço à mão, e o pin cai no centro da cidade.
- **Quando o Photon falha** (rede, HTTP ≠ 200): a busca cai no `search_cities`
  do IBGE, que já existe, e avisa _"Busca mundial indisponível — mostrando
  cidades do Brasil"_.
- **Uso justo:** ≥ 3 caracteres, 350 ms de espera, uma requisição em voo por
  campo, `limit=5`. Sai só o texto da busca e a coordenada de viés
  (`credentials: 'omit'`, `referrerPolicy: 'no-referrer'`).
- **Atribuição:** _"© OpenStreetMap"_ na lista de resultados, como pede a ODbL.

## Alternativas descartadas

- **Google Places.** Tem a melhor cobertura de estabelecimentos no Brasil (a
  Casa Amarela provavelmente estaria lá). Mas os termos da Google Maps Platform
  **proíbem guardar lat/lng por mais de 30 dias**, e só o `place_id` pode ser
  guardado. O pin do globo, a distância e o _Perto de vocês_ precisam da
  coordenada guardada, então cada leitura teria de reconsultar a Google, com
  custo por chamada e a lista dependendo da Google para existir. Também exige
  chave e um proxy em edge function para escondê-la.
- **Mapbox Search / Geocoding.** Boa cobertura e cota grátis generosa. Mas
  guardar o resultado exige o endpoint _permanent_, que é pago, e o temporário
  tem a mesma restrição de fundo da Google. Também pede chave.
- **Nominatim público** (`nominatim.openstreetmap.org`). São os mesmos dados do
  OSM, mas a política de uso **proíbe autocomplete** (busca a cada tecla) e
  limita a 1 requisição por segundo. O Photon existe justamente para o caso
  "buscar enquanto digita" sobre o OSM.
- **Estender o seed de `cities` para o mundo** (GeoNames). Resolve a cidade, não
  o estabelecimento (Mocotó, Vicentina Aranha), que é metade dos modais. Também
  faria `cities` crescer de 5 mil para centenas de milhares de linhas, para um
  casal.
- **Texto livre, sem coordenada.** Não vira pin, não dá distância, e o
  _Perto de vocês_ teria de comparar strings de cidade, que é o erro que o
  [0002](./0002-estadia-por-pessoa-estado-derivado.md) existe para evitar.
- **Edge function na frente do Photon.** Daria cache e um ponto único para
  trocar de provedor. Mas o Photon não tem chave a esconder, e o ponto único já
  existe no cliente (`places.ts`). Seria um salto de rede a mais em cada tecla,
  para nada que o casal note.

## Consequências

### Positivas

- Nenhuma chave, conta ou fatura. O dado é ODbL: guardar para sempre é
  permitido, com atribuição.
- É o mesmo ecossistema do mapa planejado (MapLibre + OpenFreeMap, também OSM;
  ver o backlog no [README](./README.md)): o pin guardado cai no mesmo lugar em
  que o mapa desenha a rua.
- O item guarda o lugar resolvido. Trocar de provedor amanhã não mexe em
  nenhuma linha gravada, só em `places.ts`.
- `cities` e a escrita fechada do 0007 ficam intocados.
- Viagens e Mapa herdam `searchPlaces`, e a pergunta "qual geocoder" não volta.

### Negativas / trade-offs

- **Cobertura de estabelecimento pequeno é pior que a da Google.** A Casa
  Amarela Bistrô, que está no próprio design, não foi achada. Nesses casos o
  pin cai no centro da cidade, o que o globo da Fase 7 aguenta e um mapa de rua
  mostraria errado.
- **Dependência de uma instância pública sem SLA**, mantida pela Komoot por
  boa vontade. Se ela sair do ar, só cidades do Brasil entram (pelo fallback
  do IBGE), e restaurante estrangeiro não entra. A saída é auto-hospedar o
  Photon (imagem oficial, algumas dezenas de GB de índice) ou trocar de
  provedor, as duas mexendo só em `places.ts`.
- **O texto da busca sai para um terceiro** (Komoot, Alemanha). É pouco (o
  nome do lugar e a coordenada pública da cidade-casa), mas é dado saindo do
  app que antes não saía.
- **Nomes locais** vêm do OSM: _Göreme_, _Nevşehir_. O país é traduzido, a
  cidade estrangeira não.
- **Duas fontes geográficas convivendo**: IBGE em `cities` (estadias) e OSM nos
  itens. A distância de um item até a cidade onde o casal está compara
  coordenadas das duas, e isso funciona porque as duas são WGS84. Mas "o item
  está em SJC?" é uma pergunta de raio (30 km, na spec), não de igualdade.

**Gatilhos para rever:**

1. Duas falhas do Photon percebidas pelo casal no mesmo mês → auto-hospedar ou
   trocar de provedor.
2. As Viagens precisarem de cidade estrangeira **como estadia** (Lisboa como
   `stays.city_id`): aí volta a pergunta do 0007, de como uma cidade de fora
   entra em `cities`, e este ADR é o ponto de partida.

## Código / evidência

| Artefato | Caminho |
| -------- | ------- |
| Spec | `../Tasks/fase-4-lista.md` (R13, seção 5, A11, seção 9) |
| Adaptador | `src/data/places.ts` (a criar) |
| Fixtures das consultas reais | `src/data/__fixtures__/photon/` (a criar) |
| Fallback | `src/data/cities.ts` → `searchCities` (existente) |

## Related

- [0007 — Cidades brasileiras por seed do IBGE](./0007-cidades-brasileiras-por-seed-do-ibge.md) — continua valendo; este ADR não o supersede
- [0003 — Lista em tabela única](./0003-lista-tabela-unica-com-check-por-categoria.md) — as colunas onde o resultado é guardado
- [0002 — Estadia por pessoa, estado derivado](./0002-estadia-por-pessoa-estado-derivado.md) — por que não texto livre
