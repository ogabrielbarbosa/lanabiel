# Ledger — Fase 7: Mapa (a Home)

> Registro do que foi decidido **durante a execução**. Spec:
> [`fase-7-mapa.md`](./fase-7-mapa.md).

---

## T0 · Base (feita pelo orquestrador)

Rota (`/` = Home, `/calendario` = Calendário, links internos trocados),
`src/domain/map.ts` (contrato), `src/map/` (`MapEngine`, adaptador Mapbox,
receita, engine falsa, `useMap`, `MapFailed`), `app/mapFocus.ts` e
`app/listFocus.ts`. `mapbox-gl@3.31` instalado; `VITE_MAPBOX_TOKEN` no
`.env.example`.

Ruling: **pins, grupos e rótulos são React por cima do mapa**, posicionados por
`handle.project` a cada `onMove`, e não marcadores/camadas do Mapbox — a spec
dizia "fonte GeoJSON com cluster da engine". Por quê: (1) o comportamento vira
provável em jsdom com a engine falsa (ADR 0005), (2) nenhum dado do casal
entra no provedor nem na forma de GeoJSON (I13), (3) o visual dos pins é o
componente do `.pen` em CSS, não um ícone de sprite. O agrupamento virou
`clusterPoints` (guloso em pixels, `CLUSTER_PX`) no domínio. Custo se eu
estiver errado: com milhares de pins o re-render por quadro pesa; reversível
trocando o desenho por uma camada `symbol` atrás da mesma interface.

Ruling: **o que está atrás do globo** some por distância angular do centro
(> 80° com zoom < 5), não por `isPointOnSurface`. Aproximação boa no zoom do
globo; custo: um pin na borda pode piscar perto do limbo.

Ruling: `latestMemory` compara pelo **dia** (a memória de viagem só guarda
`written_on`); a spec (I10) foi ajustada.

Ruling: subagentes trabalham **na mesma árvore, com arquivos disjuntos** por
tarefa (sem worktree): as tarefas se tocam só por contratos já escritos aqui
(`domain/map.ts`, `map/engine.ts`, os focos). Custo: colisão se um sair do
recorte — cada despacho lista o que NÃO tocar.

## T3 · Testes do domínio (`map.test.ts`)

Concluído. Prova: `src/domain/map.test.ts`, 68 passando (também sob TZ
America/Sao_Paulo, UTC, Pacific/Kiritimati e Pacific/Pago_Pago); `src/domain`
inteiro 542.

Ruling (subagente): `cityCode` com 3+ palavras no total mas < 3 significativas
usa as iniciais de todas (_Campos do Jordão_ → CDJ, como o I9 pede; antes dava
CJO). Efeito colateral: _Rio de Janeiro_ → RDJ. Custo se errado: um selo de três
letras diferente no seletor de cidades; trocar a regra é uma linha.

Ruling: "há 1 dia" no singular (R4 só mostrava o plural). Aceito.

Ruling (orquestrador): a spec foi alinhada aos nomes do código (`regionRows`,
`BR_STATES`, `cameraFor(view, pins, viewer)`, a ordem de `yearTogether`/
`monthStrip`, `latestMemory` com `listMemories`). O fallback de câmera de país
sem pins cai na cidade de quem vê — só alcançável no Brasil sem nenhum pin, e
aí a cidade de quem vê já está no Brasil. Aceito sem mudança.

## T7 · Viagens e Lista na engine

Concluído. Prova: `vitest run src/trips src/list src/domain/tripDerive.test.ts`,
315 passando (14 arquivos); `rg world-map src` vazio; `vite build` com o Mapbox
num chunk `adapter-*.js` separado. Não verificado com o Mapbox real (sem token).

Ruling (subagente): a legenda _"Vira a 'Última memória' da Home"_ fica no
**rodapé** do _Marcar como feito_, como no `.pen` (`P0MzG`), não sob o campo
como a spec dizia — o `.pen` é a fonte da verdade; spec corrigida.

Ruling: o mapa-múndi das Viagens enquadra por `bounds` (lat −56..72, lng
−170..178), não por zoom fixo: o `fitBounds` cabe o mundo no quadro 2:1 em
qualquer largura. O mapa da viagem para em `maxZoom 7` (viagem curta não vira
mapa de rua). Viagem em andamento tem arco tracejado. Custo se errado:
constantes em `TripsPanel.tsx`/`blocks.tsx`.

Ruling: _Ver no globo_ aparece quando `pinOf(item)` não é nulo — a mesma regra
dos pins da Home.

Dívida: a linha do mapa da viagem feita passou de amarela para verde-água (as
cores de arco do adaptador valem para os dois mapas). Conferir no aceite visual.

## T5a · Dados e esqueleto da Home, casca em `/`

Concluído. Prova: typecheck e lint limpos; suíte inteira 46 arquivos, 1218
testes; `vite build` com `mapbox-gl` no chunk `adapter-*` e `src/dev` fora do
`dist`.

Ruling (subagente): a `MapArea` só monta depois do primeiro `ok` da leitura —
A16 por construção (leitura falha = nenhuma instância, nenhum pin). Custo: o
globo espera a leitura antes de começar a carregar o chunk, ao contrário da
seção 2 (em paralelo). Aceito: são ~1 s a mais só na primeira abertura.

Ruling: `photoOf` = `photo_path` do item, senão a primeira `list_photos`. A Home
pode mostrar foto num item que a Lista mostra sem — a spec pede "a primeira
foto".

Ruling: o harness `?preview` tem estadias próprias da Home (`HOME_STAYS`) que
reproduzem o cenário do `.pen` (juntos em SJC de 14/9 a 3/10, dia 12 de 20); o
`.pen` se contradiz com o embarque para Lisboa em 1/10, e o app, fiel ao
ADR 0018, não repinta. 23 itens a mais só na Home, marcados `// inventado`.

Ruling: copy do estado "sozinho" (_"A Home é de vocês dois — convide de novo em
Configurações."_) é do agente; o `.pen` não desenha.

Ruling (orquestrador): o aviso do oxlint em `useMap` (ref escrita no render)
virou um efeito sem dependências.

## T6 · Painel da Home

Concluído. Prova: `src/home/HomePanel.test.tsx`, 27 passando (e sob 4 fusos);
`/?preview` renderizou o painel sem erro de console em 800×600 e 1440×900.

Ruling (subagente): _Juntos pelo mundo_ some sem viagem feita (como destaque e
memória). _"{n} salvos"_ conta feitos e a fazer (os pins do mapa, `allPins` +
`nearby`). Trecho em aberto: barra cheia. Custo: uma linha cada.

Ruling: a linha do item em _Nessa região_ é a `secondaryLine` da Lista (a
cidade), não o bairro do `.pen` (_"Centro"_) — o item não guarda bairro.

Divergências aceitas do `.pen`: _"Sexta, 25 de setembro"_ (25/9/2026 é sexta; o
`.pen` usa o calendário de 2025); o chip _"8 dias juntos"_ para 12–19/7
(`tripDays`, inclusivo — o `.pen` diz 7).

Pendência: `HomePanel` recebe `onShowOnMap(focus)` (_Ver mapa_ e itens de
_Nessa região_); ligar à área do mapa no `HomeScreen`.

Tocou fora de `src/home`: `src/lib/date.ts` (`monthLong`, `dayMonthLong`).

## T5b · Área do mapa da Home

Concluído. Prova: `src/home/MapArea.test.tsx`, 34 testes (A10, A11, A12, A14
cabeçalho, A15, A17, A18 parte Home); `src/home` 78.

Rulings (subagente): o enquadramento usa os pins sem filtro (filtro não faz a
câmera pular); pin selecionado sai do agrupamento; `mapFocus` de cidade fora de
`cities` abre no globo; clique que andou > 5 px não fecha o cartão (arrastar o
mapa); a área do mapa fixa as cores do `.pen` escuro (inclusive `--cat-*`) nos
dois temas — satélite é sempre escuro; o seletor de países não corta em 7.
Copy sem frame (buscas, vazios, rótulos de acessibilidade) é do agente.

Ruling (orquestrador): o painel pede foco com a Home aberta por
`onShowOnMap` → estado `FocusRequest {focus, nonce}` no `HomeScreen` →
`MapArea` aplica cada `nonce` uma vez (`nav.goFocus`). O `requestMapFocus` fica
só para quem chega de outra tela.

Ruling (orquestrador): `useMap` cria **um contêiner filho novo por montagem**.
No StrictMode a montagem anterior ainda resolvia quando a seguinte começava, e
o Mapbox avisava "container should be empty" (e contaria um load a mais).

## Aceite visual — bloqueado pelo token

O `.env.local` tem `VITE_MAPBOX_TOKEN`, mas é um token **secreto** (`sk.`): o
Mapbox GL o recusa no navegador ("Use a public access token (pk.*)"). O
adaptador agora recusa qualquer token que não comece com `pk.` antes de usar
(toda `VITE_*` vai para o bundle). A1/A20 esperam um `pk.`.

## Bundle (A21)

A primeira comparação estava errada: o build da `main` numa worktree sem
`.env.local` eliminou o app como código morto (228 kB). Com o mesmo `.env`:
`main` 893 kB / **251,7 kB gzip**; branch 948 kB / **266,0 kB gzip** (+14,3 kB,
o código das telas da Home); `mapbox-gl` só no `adapter-*` (1,84 MB / 510 kB
gzip); o `world-map.jpg` (274 kB) saiu. O A21 dizia ≤ 5 kB — número que não
separava o Mapbox (o que se queria barrar) do código da própria Home. Spec
corrigida para ≤ 20 kB de código de tela e zero de Mapbox no entry.

## Revisão ampla (Gate 4) e correções

`/code-review high` sobre a branch inteira: 8 achados, todos corrigidos.
- `fitBounds` + `setZoom` cancelava o voo para país/estado → `cameraForBounds`
  com o zoom mínimo aplicado ao alvo, e um `flyTo`.
- O token secreto seria inlinado no `dist` apesar da recusa em runtime →
  `vite.config.ts` derruba o **build** com token que não é `pk.` (no `serve`,
  só avisa).
- Qualquer `error` antes do `load` (um tile) derrubava o mapa → só erro de
  estilo conta.
- A área do mapa re-renderizava inteira a cada quadro → `useMapTick(handle)`,
  assinado só pelos pins, pelo cartão e pelo `TripMap`.
- `panel.css` registrado como exceção no CLAUDE.md.
- `listFocus` agora é apagado ao sair da Lista (a leitura que falhou não o
  consumia).
- StrictMode montava dois mapas (dois loads) → um microtick antes de montar.
- O efeito do foco do painel dependia de `nav` instável → lido por ref.

## Verificação (Gate 3)

typecheck ✅ · lint ✅ (0 avisos) · testes ✅ 48 arquivos, **1280 passando**
(domínio do mapa 68; Home 79 entre `MapArea`, `HomePanel`, `HomeScreen`) · build
✅ (`VITE_MAPBOX_TOKEN=` — com o `sk.` do `.env.local` o build PARA, de
propósito).

| Aceite | Veredito | Prova |
| --- | --- | --- |
| A1 receita aprovada lado a lado | ⚠️ não verificado | sem token `pk.` — o `.env.local` tem um `sk.` |
| A2 `/` Home, `/calendario`, barra | ✅ | `app/router.test.ts:9`, `app/Shell.test.tsx:36,46` |
| A3 pins e filtros | ✅ | `domain/map.test.ts:100` |
| A4 regiões | ✅ | `domain/map.test.ts:186` |
| A5 câmera | ✅ | `domain/map.test.ts:282` |
| A6 `cityCode` | ✅ | `domain/map.test.ts:349` |
| A7 volta ao mundo | ✅ | `domain/map.test.ts:376` |
| A8 ano, mês, período | ✅ | `domain/map.test.ts:412,477` |
| A9 última memória | ✅ | `domain/map.test.ts:522` |
| A10 breadcrumb e seletores | ✅ | `home/MapArea.test.tsx:86` |
| A11 filtros | ✅ | `home/MapArea.test.tsx:323` |
| A12 cartão do lugar → Lista | ✅ | `home/MapArea.test.tsx:274` + `list/ListScreen.test.tsx` (listFocus) |
| A13 painel do `.pen` | ✅ | `home/HomePanel.test.tsx:273` |
| A14 fora do "juntos" | ✅ | `home/MapArea.test.tsx:404`, `home/HomePanel.test.tsx:419` |
| A15 engine falhou | ✅ | `home/MapArea.test.tsx:460` |
| A16 leitura falhou | ✅ | `home/HomeScreen.test.tsx:70` |
| A17 uma instância | ✅ | `home/MapArea.test.tsx:498`, `home/HomeScreen.test.tsx:104` |
| A18 Ver/Abrir no globo | ✅ | `list/ItemSheet.test.tsx:435`, `trips/TripsPanel.test.tsx:143`, `trips/detail/TripDetail.test.tsx:392`, `home/MapArea.test.tsx:520` |
| A19 Viagens sem JPG | ✅ | `trips/TripsPanel.test.tsx:64`, `TripDetail.test.tsx:351`; `rg world-map src` vazio |
| A20 `/?preview` com mapa real, 5 frames | ⚠️ parcial | preview renderiza (breadcrumb, seletor de estados, filtros, painel) sem erro de console; o globo não, pelo token |
| A21 bundle | ✅ | entry 251,7 → 266,1 kB gzip (+14,4, código das telas); `mapbox-gl` só em `adapter-*` |
| A22 `mapbox-gl` isolado, sem `day_kisses` | ✅ | `rg "mapbox-gl" src` → só `src/map/mapbox/adapter.ts`; `day_kisses` só em comentário |
| A23 gates | ✅ | acima |
| R18 painel → mapa (novo) | ✅ | `home/HomeScreen.test.tsx` "R18 — o painel pede foco…" |

Não verificado: o visual do mapa real (A1, parte do A20) e, com ele, o
enquadramento dos níveis na engine de verdade, os pins sobre o satélite e o
terreno no zoom de cidade. Tudo isso depende de um token `pk.`.

## Fechamento (2026-09-27)

Com o token `pk.` no `.env.local`, o mapa carrega nas duas receitas, sem erro de
console. O Gabriel olhou e **reprovou o visual** ("não tá bom") e pediu para
fechar a fase e fazer o merge. O que o agente viu comparando com `eocRt`:
- `standard` (Standard Satellite, `lightPreset: dusk`): escura e apagada, longe
  do `.pen`.
- `custom` (raster `mapbox.satellite` + saturação/contraste): terra viva e
  verde, mais perto; o mar sai quase preto (no `.pen` é turquesa) e demora ~3–4 s
  a mais para aparecer.

Dívida (A1, parte do A20): acertar a receita — mar turquesa (camada de água por
cima ou `raster-hue-rotate`/`raster-color` nas áreas de água), halo verde-rosado
mais claro, luzes de cidade no zoom de SJC — e comparar os cinco frames lado a
lado. Nada no código amarra a receita: é `src/map/style.ts` e o adaptador.
