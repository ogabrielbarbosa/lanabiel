# ADR 0021 — Mapas das Viagens sem engine: projeção equiretangular sobre a imagem do `.pen`

- **Status:** Proposed
- **Data:** 2026-09-27
- **Área:** cliente, Viagens (Fase 6)

---

## Contexto

As Viagens têm dois mapas: _Onde já estivemos_ (o mundo, com os destinos
feitos e planejados e arcos até a casa) e _Mapa da viagem_ no detalhe. No `.pen`
os dois são imagens geradas com pins desenhados por cima. O backlog já escolheu
a engine do mapa de verdade — MapLibre GL JS v5 + OpenFreeMap — e a amarrou à
Fase 7 (o globo da Home), porque nenhuma fase anterior depende dela.

Medido na imagem do mundo (`World Map`, `MFVF7`, 344×172): Lisboa e Tóquio caem
exatamente onde a projeção equiretangular os poria
(`x = (lng + 180) / 360`, `y = (90 − lat) / 180`), com erro de um ponto.

## Decisão

- O mapa-múndi do `.pen`, exportado sem os pins, vira um asset estático
  (`src/trips/assets/world-map.jpg`).
- Pins e arcos são SVG por cima, posicionados por projeção equiretangular a
  partir de `lat`/`lng` das cidades — uma função pura (`project`) no domínio.
- O _Mapa da viagem_ é a mesma imagem recortada no retângulo que contém origem
  e destino (folga e recorte mínimo de 24° de largura), não o mapa desenhado à
  mão do frame.
- _Abrir globo_ e _Abrir no globo_ não aparecem até a Fase 7.

## Alternativas descartadas

- **Adiantar o MapLibre para a Fase 6.** Dependência de ~800 kB, tiles de
  terceiro e um estilo a desenhar, para dois quadros de 344 px. E decidiria a
  Fase 7 por conta da 6.
- **SVG de países (Natural Earth).** Arquivo novo de fonte externa, e não é o
  visual do design (pontilhado).
- **Mapa estático de provedor (imagem por URL).** Chave, custo e a foto do
  casal saindo para terceiro em cada renderização.

## Consequências

### Positivas

- O visual é o do `.pen`, com pins de verdade.
- Nenhuma dependência nem chamada de rede nova.

### Negativas / trade-offs

- Em viagem curta (SJC → Ilhabela, ~100 km) o recorte mínimo deixa os dois pins
  quase juntos: o mapa da viagem diz pouco.
- Sem zoom, sem arrastar. É provisório: a Fase 7 troca pelos dois mapas no
  MapLibre, e aí este ADR é superseded.

## Código / evidência

| Artefato | Caminho |
| --- | --- |
| Imagem | `src/trips/assets/world-map.jpg` |
| Projeção | `src/domain/trips.ts` (`project`, `cropFor`) |

## Related

- Backlog _Engine do mapa_ em [`README.md`](./README.md)
- [0017 — cidades do mundo por casal](./0017-cidades-do-mundo-por-casal.md) (de onde vêm `lat`/`lng`)
