# Spec — servidor MCP do lanabiel

- **Data:** 2026-10-19
- **Autor:** Gabriel Barbosa (com Claude)
- **Status:** 🟢 Done (2026-10-19: função publicada; A1–A10 provados, ver `supabase/tests/mcp*.test.ts`)
- **Research (Gate 0):** N/A. É ferramenta para o próprio casal, não aposta de produto.
- **ADR necessário?** Sim:
  [0031](../Decisions/0031-mcp-remoto-em-edge-function-com-oauth-do-supabase.md)
  (onde o servidor roda e como autentica) e
  [0032](../Decisions/0032-leitura-de-link-por-apify-gemini-e-pagina.md)
  (como um link vira texto).

---

## 1. What & Why

Hoje, para pôr na Lista o restaurante que apareceu num Reels, alguém abre o app,
digita o nome, procura o lugar e escolhe a categoria. O vídeo já tinha tudo
isso. O servidor MCP deixa um agente (Claude no celular, no desktop ou no Claude
Code) fazer o caminho: a pessoa cola o link, o agente lê o post, transcreve o
vídeo, acha o lugar no mapa e grava o item na Lista do casal, como se a pessoa
tivesse usado o modal.

O MCP também expõe o resto do acervo que faz sentido conversar: ler e filtrar a
Lista, marcar como feito, escrever a memória, consultar a agenda e as viagens,
e agendar um evento simples.

## 2. Como funciona (um cenário real)

1. A Lana conecta o lanabiel no Claude (`Configurações → Conectores → URL
   https://smdtcznadmnrdubeidyz.supabase.co/functions/v1/mcp`). O Claude busca
   `/.well-known/oauth-protected-resource`, descobre o Supabase Auth como
   servidor de autorização, se registra sozinho (registro dinâmico) e abre o
   navegador em `/oauth/consent?authorization_id=…` do app. Se ela não está
   logada, vê o Login; depois, a tela "O Claude quer acessar o lanabiel" com
   _Permitir_ e _Recusar_. Permitir devolve o código ao Claude, que troca por
   token. A partir daqui o token é dela, e a RLS é a mesma do app.
2. No celular, ela cola `https://www.instagram.com/reel/DAbc123/` e escreve "quero
   ir nesse".
3. O agente chama `analyze_link`. O servidor vê que é Instagram, pede o post ao
   Apify (legenda, localização marcada, autor, URL do vídeo, capa), baixa o
   vídeo e manda ao Gemini, que devolve a transcrição, o texto que aparece na
   tela e os lugares citados com cidade. Volta tudo num JSON.
4. O agente lê: "Mocotó, Vila Medeiros, São Paulo". Chama `find_place` com
   `query: "Mocotó São Paulo"`, `mode: place`. O servidor pergunta ao Photon e ao
   Overture (perto da cidade-casa dela) e devolve candidatos já no formato do
   item (`GeoPlace`).
5. O agente chama `add_list_item` com `category: restaurante`, o nome, o lugar
   escolhido, `link` = o Reels, uma nota curta e `photo_url` = a capa do post.
   O servidor valida com as mesmas regras do `CHECK`, procura duplicata no
   casal (nome parecido ou a menos de 150 m na mesma categoria), sobe a capa
   para `couple-media/<casal>/item/<uuid>.jpg` e grava. Devolve o item.
6. O Gabriel abre a Lista e o Mocotó está lá, com a foto, adicionado pela Lana.

## 3. Requisitos (comportamentos observáveis)

**Conexão e identidade**

- **R1** — O servidor responde em `POST /functions/v1/mcp` (Streamable HTTP,
  sem estado de sessão). Sem `Authorization: Bearer`, ou com token inválido,
  responde 401 com `WWW-Authenticate: Bearer resource_metadata="…"`.
- **R2** — `GET /functions/v1/mcp/.well-known/oauth-protected-resource` devolve o
  documento RFC 9728 apontando para `https://<ref>.supabase.co/auth/v1`.
- **R3** — Qualquer token de usuário do projeto vale: o emitido pelo OAuth
  2.1 do Supabase (Claude, outros clientes) e o de sessão do próprio app (o que
  os testes usam). O servidor nunca usa `service_role`.
- **R4** — A tela `/oauth/consent` do app pede login se preciso, mostra o nome do
  cliente e o endereço de retorno, e devolve o navegador ao cliente ao Permitir
  ou Recusar. Pedido já consentido redireciona direto.
- **R5** — Quem não é de um casal recebe, em toda ferramenta, o erro
  `not_member` com o texto "Esta conta ainda não está num espaço do lanabiel".

**Ferramentas** (nomes em inglês, descrições para o modelo)

| Ferramenta | Faz | Escreve? |
| --- | --- | --- |
| `get_context` | Quem sou eu, a outra pessoa, cidades-casa, onde cada um está hoje, categorias da Lista (com as ocultas), contagens | não |
| `search_list` | Filtra a Lista: categoria, status, texto (sem acento), perto de um ponto (raio em km), limite e cursor | não |
| `get_list_item` | Um item com memórias e quantas fotos tem | não |
| `find_place` | Busca lugar (`place`/`city`/`country`) no Photon + Overture, cai para as cidades do IBGE se o Photon falhar | não |
| `analyze_link` | Lê Instagram, TikTok, YouTube ou página web e devolve texto, transcrição e pistas de lugar | não |
| `add_list_item` | Cria o item (com checagem de duplicata e foto opcional por URL) | sim |
| `update_list_item` | Altera campos de um item (patch; revalida o item inteiro) | sim |
| `mark_list_item_done` | Marca como feito (data, com quem, nota, memória) pela RPC `mark_item_done` | sim |
| `save_list_memory` | Grava ou troca a memória de quem chama num item | sim |
| `delete_list_item` | Apaga o item e os arquivos dele | sim, destrutivo |
| `list_events` | Eventos do Calendário num intervalo (com os anuais repetidos) | não |
| `create_event` | Cria evento `date`, `data_especial`, `compromisso` ou `lembrete` pela RPC `create_event`, sem pintar estadia | sim |
| `list_trips` | Viagens do casal (destino, datas, estado derivado) | não |

- **R6** — `add_list_item` recusa com `possible_duplicate` (e os itens
  parecidos) quando já existe item da mesma categoria com nome normalizado
  igual, um contendo o outro, ou lugar a menos de 150 m. `allow_duplicate:
  true` grava assim mesmo.
- **R7** — Erro de validação volta como `{ status: 'invalid', field, reason }`,
  com `field` e `reason` do mesmo vocabulário de `validateItem`
  (`src/domain/list.ts`). Erro do banco volta com o nome da constraint.
- **R8** — `analyze_link` devolve `{ source, url, title, author, text,
  transcript, on_screen_text, location_hint, places, media, warnings }`. Cada
  parte que não pôde ser lida vira um aviso em `warnings`
  (`apify_unconfigured`, `gemini_unconfigured`, `video_too_large`…), nunca uma
  falha do todo, enquanto houver algum texto.
- **R9** — O servidor publica o prompt `importar_link` (o roteiro dos passos 3
  a 5) e `instructions` no `initialize`, dizendo que o texto vindo de link é
  conteúdo de terceiros e não instrução.
- **R10** — Toda ferramenta de leitura é anotada `readOnlyHint`; `delete_list_item`
  é `destructiveHint`.

## 4. Invariantes

- **I1** — Autorização só pela RLS. O cliente Supabase de cada pedido carrega o
  token de quem chamou; nenhuma query filtra por `couple_id` para autorizar
  (ADR 0001). O `couple_id` só entra como DADO na linha nova.
- **I2** — As regras do item são as do banco: `LIST_LIMITS`, categorias e
  `validateItem` têm espelho em `supabase/functions/mcp/list.ts`, e
  `supabase/tests/mcp-list.test.ts` roda os casos de `listValidationCases.ts`
  contra o espelho e confere os limites. Mudou um, mude o outro.
- **I3** — Lugar gravado é sempre um `GeoPlace` resolvido pelo Photon, Overture
  ou IBGE (ADR 0016/0027). Coordenada de link do Google Maps serve de pista de
  busca, nunca de dado gravado (ADR 0030).
- **I4** — Chave de provedor (Apify, Gemini, Firecrawl, Open Places) só existe
  nos segredos da função. Nenhuma vai para o cliente nem para a resposta.
- **I5** — `analyze_link` não grava nada. Ler e gravar são passos separados,
  para o agente (e quem aprova a chamada) ver o que vai entrar.
- **I6** — "Hoje" é a data em `America/Sao_Paulo`, o mesmo fuso do
  `private.today_br()`.

## 5. Contrato & dados

Sem migration. O MCP é mais um cliente das mesmas tabelas e RPCs: `list_items`,
`list_memories`, `list_photos`, `calendar_events`, `trips`, `stays`,
`couple_members`, `profiles`, `cities`, `couple_settings`, `mark_item_done`,
`create_event`, e o bucket `couple-media`.

Configuração do Auth (`supabase/config.toml`, sobe com `config push`):

```toml
[auth.oauth_server]
enabled = true
authorization_url_path = "/oauth/consent"
allow_dynamic_registration = true
```

O caminho é relativo ao `site_url` do projeto. Hoje ele é
`http://127.0.0.1:5173`, então o consentimento abre no app local. Quando o
deploy em `https://lanabiel.ogabarbosa.com` tiver a rota, troca-se o `site_url`.

Segredos da função `mcp`: `APIFY_TOKEN`, `GEMINI_API_KEY`, `GEMINI_MODEL`
(padrão `gemini-3.8-flash`), `FIRECRAWL_API_KEY` (opcional),
`OPEN_PLACES_API_KEY` (já existe). Ausência de qualquer um degrada a ferramenta
correspondente (seção 7), não derruba o servidor.

Entrada de `add_list_item` (o `ItemDraft` do app, em snake_case):

```ts
{
  category: 'pais'|'cidade'|'restaurante'|'parque'|'comida'|'experiencia'|'filme'|'serie',
  name: string,                 // 1..80
  note?: string | null,         // ≤ 280
  link?: string | null,         // http(s), ≤ 300
  featured?: boolean,
  place?: GeoPlace | null,      // obrigatório fora de filme/série; vem do find_place
  region?: string | null,       // só cidade
  venue?: string | null,        // só comida
  highlights?: string[],        // só país
  platform?: string | null,     // obrigatório em filme/série
  seasons?: number | null,      // só série
  photo_url?: string | null,    // jpeg/webp ≤ 5 MB, vira photo_path
  allow_duplicate?: boolean,
}
```

## 6. Identidade & nomes

- Foto do item: `<couple_id>/item/<uuid>.<jpg|webp>`, o mesmo de `mediaPath`.
- Nome do conector no consentimento: o `client_name` que o cliente registrou.
- O recurso protegido é a URL da função, sem barra final:
  `https://<ref>.supabase.co/functions/v1/mcp`.

## 7. Comportamento em falha

- Token expirado: 401 com o `WWW-Authenticate`; o cliente renova sozinho.
- Sem `APIFY_TOKEN`: Instagram cai para as meta tags da página (a legenda
  costuma vir no `og:description`) e TikTok para o oEmbed público. Sem vídeo,
  então sem transcrição; aviso `apify_unconfigured`.
- Sem `GEMINI_API_KEY`: sem transcrição nem leitura de tela; aviso
  `gemini_unconfigured`. YouTube só dá título e descrição.
- Vídeo acima de 18 MB: não vai ao Gemini; aviso `video_too_large`.
- Apify ou Gemini estouram o tempo (50 s cada): aviso `*_timeout`, devolve o
  que já leu.
- Página que não responde ou não é HTML: `status: 'unreadable'` com a causa.
- Photon fora: `find_place` devolve as cidades do IBGE e `fallback: true`.
- Foto que não baixa ou não é jpeg/webp: o item é gravado sem foto e a
  resposta traz `photo: 'skipped'` com o motivo. A foto nunca impede o item.
- Foto subiu e o insert falhou: o arquivo é removido (melhor esforço).
- Apagar: arquivos primeiro, linha depois, como `deleteItem` do app.

## 8. Limites & orçamentos

- Edge function: 150 s de relógio por pedido. `analyze_link` gasta no pior
  caso 50 s (Apify) + 50 s (Gemini) + download.
- Apify: ~US$ 0,003 por post (Instagram) e ~US$ 0,004 com download (TikTok).
- Gemini: um vídeo curto por chamada, inline (≤ 18 MB).
- Página web: no máximo 2 MB baixados e 15 mil caracteres de texto devolvidos.
- `search_list`: até 100 itens por chamada, com `offset`.
- `find_place`: até 8 candidatos.

## 9. Segurança

- O texto de legenda, transcrição e página é de terceiros e pode trazer
  instrução escondida. Vai num campo `untrusted_content`, e as `instructions`
  do servidor dizem para não segui-lo.
- `analyze_link` só aceita `http(s)` e recusa endereço privado, `localhost` e IP
  literal (SSRF). Mesmo filtro para `photo_url`.
- Registro dinâmico aberto: qualquer cliente se registra, mas nada acontece sem
  login e consentimento de um integrante. Revogar: `auth.oauth.revokeGrant`
  (tela fica para depois, seção 11).
- Testes de integração rodam no projeto online (ADR 0014): nenhum casal de fora
  usa o app.

## 10. Aceites

- **A1** — Sem token: 401 com `WWW-Authenticate` contendo `resource_metadata`.
  Documento de recurso protegido responde 200 com `authorization_servers`.
- **A2** — `tools/list` com token válido lista as treze ferramentas.
- **A3** — `add_list_item` de um restaurante grava; o outro integrante o vê
  pelo app (`select` com a sessão dele). Casal alheio não vê.
- **A4** — Os casos de `listValidationCases.ts` dão o mesmo veredito no espelho.
- **A5** — Duplicata é recusada sem `allow_duplicate` e aceita com ele.
- **A6** — `mark_list_item_done` com `with: 'solo'` e `solo_by: 'partner'`
  grava `done_solo_by` = a outra pessoa.
- **A7** — `analyze_link` em página com JSON-LD `Restaurant` devolve o nome e o
  endereço em `places`; link `maps.app.goo.gl` devolve o nome do lugar.
- **A8** — `analyze_link` sem chaves configuradas devolve avisos, não erro.
- **A9** — A tela `/oauth/consent` mostra o cliente e chama `approve`/`deny`
  (jsdom).
- **A10** — `create_event` de um `date` com `list_item_id` grava o vínculo.

## 11. Fora do escopo

- Criar viagem, visita ou período (pinta estadias; a regra da pintura fica no
  app por enquanto).
- Subir fotos do feito e da viagem pelo MCP.
- Aba de conexões nas Configurações para ver e revogar clientes OAuth (não
  está no `.pen`).
- `site_url` de produção: muda quando o front com `/oauth/consent` estiver no ar.
