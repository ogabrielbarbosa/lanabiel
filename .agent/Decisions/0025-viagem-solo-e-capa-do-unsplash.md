# ADR 0025 — Viagem solo nas Viagens, e capa do Unsplash

- **Status:** Proposed
- **Data:** 2026-10-06
- **Área:** schema (`trips`, `create_trip`, trigger), dependência externa (Unsplash), Viagens
- **Supersede:** em parte o [0019](./0019-viagem-e-o-evento-estendido-por-trips.md) (a regra "viagem = `travelers = 'both'`" e a alternativa "viagem inclui solo", descartada lá)

---

## Contexto

O 0019 decidiu que só a `viagem` dos dois aparece nas Viagens. O argumento era
que viagem solo de trabalho não é história do casal. Usando o app, o casal
pediu o contrário: no cadastro da viagem, escolher "eu, ela ou os dois". Uma
viagem de um dos dois também entra no acervo, e quem não foi acompanha pelo app.

No mesmo pedido, a Nova viagem perdeu campos (hospedagem, de onde cada um sai,
nota) e ganhou um banner no topo com a capa. O casal pode enviar uma imagem
própria (a logo do lugar) ou usar uma foto do destino vinda de um banco de
imagens conhecido. A escolha foi o Unsplash.

## Decisão

- **Toda `viagem` é viagem nas Viagens**, com `travelers = 'both'` ou `'solo'`.
  O trigger `calendar_events_trip` cria `trips` para qualquer `viagem`, e a
  migration faz o backfill. `create_trip` aceita `travelers` e `traveler_id`
  (a validação continua no `create_event`) e pinta só a estadia de quem viaja.
- **Os números "juntos" contam só as viagens dos dois** (`jointTrips`): totais,
  recordes e "N viagens juntos desde". A solo aparece na grade e no detalhe
  ("Só Lana"), com o orçamento dividido por 1.
- **Quem viaja não se edita no _Editar viagem_.** Mudar sem repintar (ADR
  0018) deixaria o calendário dizendo outra coisa. Isso continua no calendário.
- **Capa do Unsplash pela URL deles, com crédito.** `trips` ganha
  `cover_stock_url`, `cover_stock_author` e `cover_stock_author_url` (os três
  juntos ou nenhum, cada um preso ao domínio do Unsplash por `CHECK`). A foto
  própria (`cover_photo_id`) vence a do Unsplash. O crédito "Foto de X no
  Unsplash" aparece onde a foto é grande (banner do modal, herói do detalhe).
- **A chave fica numa edge function** (`unsplash-search`, segredo
  `UNSPLASH_ACCESS_KEY`). Ela exige sessão, busca em paisagem e chama o
  `download_location` quando uma foto é escolhida. Sem a chave, responde
  `unconfigured` e o modal fica só com o _Enviar foto_.

## Alternativas descartadas

- **Copiar a foto do Unsplash para o bucket privado.** As regras da API exigem
  usar a URL do Unsplash (hotlink). Copiar descumpre a licença.
- **Wikipedia/Wikimedia.** Grátis e sem chave, mas as fotos de cidade são
  irregulares. O casal escolheu o Unsplash.
- **Chave do Unsplash no cliente (`VITE_…`).** Ficaria exposta a quem abrir o
  app, e a cota é da conta.
- **Coluna `jsonb` única para a capa.** Três colunas com `CHECK` validam o
  domínio de cada URL. Num `jsonb` seria um `CHECK` mais frágil.

## Consequências

### Positivas

- A viagem solo usa a mesma estrutura (roteiro, fotos, preparação) sem tabela nova.
- A Nova viagem tem menos campos, e a capa aparece sozinha.

### Negativas / trade-offs

- Nova dependência externa em tempo de uso: a capa do Unsplash some se a foto
  for removida de lá. O gradiente do frame cobre esse caso.
- Modo demo do Unsplash: 50 buscas por hora. Basta para dois usuários.
- A miniatura do cartão usa a foto sem crédito. O crédito fica no detalhe.

## Código / evidência

| Artefato | Caminho |
| --- | --- |
| Migration | `supabase/migrations/20261006120000_solo_trips_stock_cover.sql` |
| Edge function | `supabase/functions/unsplash-search/` (+ `supabase/tests/unsplash-search.test.ts`) |
| Cliente | `src/data/stockCovers.ts`, `src/trips/TripModal.tsx` |
| Derivações | `src/domain/tripDerive.ts` (`jointTrips`, `tripTravelerIds`) |
