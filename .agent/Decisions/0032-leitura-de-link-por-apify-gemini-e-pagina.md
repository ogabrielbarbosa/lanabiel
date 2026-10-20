# ADR 0032 — Leitura de link: Apify para Instagram e TikTok, Gemini para o vídeo, página pelo HTML (Firecrawl opcional)

- **Status:** Proposed
- **Data:** 2026-10-19
- **Área:** dependência externa, servidor MCP

---

## Contexto

O caso que motivou o MCP (ADR 0031) é "vi um lugar num vídeo, quero na Lista".
Num Reels de restaurante, o nome costuma estar em três lugares: na legenda, na
localização marcada e no texto escrito sobre o vídeo, às vezes só na fala.
Instagram e TikTok não entregam o post a quem não está logado, e uma edge
function não roda `yt-dlp` nem Whisper.

O agente do outro lado é um modelo de linguagem: entender o texto e decidir
qual lugar é ele faz bem. Falta quem transforme o link em texto.

## Decisão

- **Instagram:** actor `apify/instagram-scraper` (`directUrls`, 1 resultado),
  pela API síncrona do Apify. Dá legenda, localização marcada, autor, hashtags,
  URL do vídeo e as imagens.
- **TikTok:** actor `clockworks/tiktok-scraper` (`postURLs`,
  `shouldDownloadVideos`). Dá legenda, autor, hashtags e o vídeo.
- **Vídeo e imagens:** Gemini (`generateContent`, vídeo inline até 18 MB, saída
  JSON com esquema) devolve a transcrição, o texto da tela, um resumo e os
  lugares citados com cidade. YouTube vai por URL (`file_data`), sem download.
- **Página web:** `fetch` direto, com título, meta tags, JSON-LD
  (`Restaurant`, `LocalBusiness`, `Place`, `Movie`, `TVSeries`…) e o texto sem
  marcação. Com `FIRECRAWL_API_KEY`, o Firecrawl entra no lugar do `fetch` para
  página que só monta com JavaScript.
- **Google Maps:** o link curto é seguido e o nome do lugar e a coordenada saem
  da URL final. Servem de pista para `find_place`, nunca de dado gravado.
- **Sem chave, degrada:** Instagram cai para as meta tags (a legenda vem no
  `og:description`), TikTok para o oEmbed público, e o resultado leva um aviso.
- O servidor **não decide** o lugar nem grava: devolve o texto e as pistas, e
  o agente chama `find_place` e `add_list_item`.

## Alternativas descartadas

- **Transcrever com Whisper (OpenAI)** — ouve, mas não lê o texto escrito no
  vídeo, que é onde o nome do restaurante mais aparece. O Gemini faz os dois
  numa chamada.
- **Transcrição do próprio actor do TikTok** — cobra por minuto e não cobre o
  Instagram. O Gemini serve aos dois.
- **Firecrawl para tudo** — não lê Instagram nem TikTok logado e não transcreve.
  Fica opcional, para página web pesada.
- **Decidir o lugar no servidor com um LLM próprio** — duplicaria o que o agente
  já faz, e um erro de escolha viraria gravação sem a pessoa ver.

## Consequências

### Positivas

- Um link de Reels vira nome, cidade e fala em uma chamada.
- Trocar de provedor mexe só em `supabase/functions/mcp/links/`.

### Negativas / trade-offs

- Dois provedores pagos (Apify por post, Gemini por token), e as chaves são
  segredos novos da função.
- Actor do Apify muda de formato sem aviso. O mapeamento é defensivo e
  testado com o formato de hoje.
- Instagram muda as meta tags com frequência; o caminho sem Apify é melhor
  esforço.

## Código / evidência

| Artefato | Caminho |
| -------- | ------- |
| Leitura de link | `supabase/functions/mcp/links/` |
| Testes | `supabase/tests/mcp-links.test.ts` |

## Related

- [0031 — Servidor MCP remoto](./0031-mcp-remoto-em-edge-function-com-oauth-do-supabase.md)
- [0016 — Busca de lugares pelo Photon](./0016-busca-de-lugares-pelo-photon-osm.md)
- [0030 — Endereço pelo Mapbox, sem Google](./0030-endereco-pelo-mapbox-geocoding-permanente.md)
