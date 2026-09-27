# ADR 0022 — Engine do mapa: Mapbox GL JS v3, com satélite, terreno 3D e atmosfera

- **Status:** Proposed
- **Data:** 2026-09-27
- **Área:** cliente, dependência externa (Fase 7: Home e Viagens)

---

## Contexto

A Fase 7 é o mapa: o globo da Home, a descida Mundo → País → Estado → Cidade e
os dois mapas das Viagens. O backlog (_Engine do mapa_, em [README](./README.md))
tinha escolhido **MapLibre GL JS + OpenFreeMap**, verificando que o globo com
atmosfera existe nele e que os tiles não pedem chave.

Olhando os frames com cuidado no brainstorm de 2026-09-27, a escolha não
entrega o design: o globo de `eocRt` é **satélite fotorrealista** saturado
(mar turquesa, floresta verde, halo verde-rosado) e o zoom de SJC (`XwYKK`) é
**relevo 3D com textura de satélite** e luzes de cidade. O OpenFreeMap só tem
tiles vetoriais: dá um globo de polígonos chapados, nunca aquela foto. O
Gabriel pediu 3D "igual à imagem" e aceitou pagar pouco, se preciso.

Verificado em mapbox.com/pricing (2026-09-27): o Mapbox GL JS cobra por _map
load_ (cada inicialização de mapa), 50.000 grátis por mês, US$ 5/mil acima; um
load inclui tiles vetoriais e raster sem limite — satélite e terreno não são
cobrados à parte. O casal usa ~5.400 loads/mês (spec, seção 8).

## Decisão

- **Mapbox GL JS v3** (`mapbox-gl`), com projeção `globe`, `fog` para a
  atmosfera, terreno por `mapbox.mapbox-terrain-dem-v1` e satélite. A receita
  visual (Standard Satellite com `lightPreset` ou estilo próprio sobre
  `mapbox.satellite` com saturação/contraste) mora em `src/map/style.ts` e é
  escolhida pelo Gabriel comparando com os frames (A1 da spec).
- A engine fica atrás de `MapEngine` (`src/map/engine.ts`). **Só**
  `src/map/mapbox/adapter.ts` importa `mapbox-gl`, e ele chega por `import()`
  dinâmico — o chunk de entrada não carrega o Mapbox.
- **Pins, rótulos e cartões são React por cima do mapa**, posicionados por
  `project`. Para o Mapbox saem só pedidos de tile e o token; nenhum dado do
  casal (nome, item, foto, memória) vira camada ou GeoJSON do provedor.
- Uma instância de mapa por montagem de tela (é o que conta como load).
- Token **público** (`pk.…`) em `VITE_MAPBOX_TOKEN`, restrito por URL no painel
  do Mapbox. Sem token, sem WebGL ou com erro de carga, a tela mostra _"O mapa
  não carregou."_ e segue funcionando sem câmera.
- Supersede o item _Engine do mapa_ do backlog e o
  [0021](./0021-mapas-das-viagens-sem-engine.md) (os mapas das Viagens saem do
  JPG e usam a mesma engine, sem interação).

## Alternativas descartadas

- **MapLibre + OpenFreeMap (o backlog).** Sem satélite nem relevo: não chega no
  visual do `.pen`, que era o pedido.
- **MapLibre com satélite e relevo gratuitos** (Sentinel-2 cloudless da EOX,
  terreno da AWS). Sem chave e open source, mas o satélite é mais pobre, sem
  luz de cidade, e o estilo seria trabalho próprio inteiro. Continua possível
  atrás de `MapEngine` se o Mapbox ficar caro ou mudar de licença.
- **Cesium / Google Photorealistic 3D Tiles.** O melhor zoom de cidade, mas
  mais pesado, com cara de Google Earth (longe das cores do `.pen`) e outra
  cobrança.
- **Continuar com a imagem estática do `.pen`** (ADR 0021 estendido). Sem zoom,
  sem 3D, sem descer até a cidade — não é a Fase 7.

## Consequências

### Positivas

- Globo, satélite, relevo e névoa prontos, no plano grátis.
- Nada do acervo do casal sai para o provedor (I13 da spec).
- A troca de fornecedor custa um adaptador, não as telas.

### Negativas / trade-offs

- Dependência proprietária (a licença do GL JS v2+ não é open source) e chave de
  terceiro no bundle — mitigada por restrição de URL.
- `mapbox-gl` pesa ~1,5 MB: a primeira abertura da Home espera o chunk; o
  painel renderiza antes.
- O SDK manda a telemetria de uso padrão do Mapbox (contagem de loads).
- A arte do `.pen` é gerada: satélite real não fica idêntico — o aceite é lado
  a lado, não pixel a pixel.
- Pins em React por cima re-renderizam a cada quadro de movimento; bom para
  centenas, não para dezenas de milhares.

## Código / evidência

| Artefato | Caminho |
| --- | --- |
| Interface | `src/map/engine.ts` |
| Adaptador (único import de `mapbox-gl`) | `src/map/mapbox/adapter.ts` |
| Receita visual | `src/map/style.ts` |
| Engine falsa (testes) | `src/map/fakeEngine.ts` |
| Spec | `../Tasks/fase-7-mapa.md` |

## Related

- [0021 — mapas das Viagens sem engine](./0021-mapas-das-viagens-sem-engine.md) (superseded)
- [0005 — interface se prova em jsdom](./0005-interface-se-prova-em-jsdom.md)
- [0016 — busca de lugares pelo Photon](./0016-busca-de-lugares-pelo-photon-osm.md) (de onde vêm as coordenadas)
