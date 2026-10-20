# ADR 0031 — Servidor MCP remoto numa edge function, autenticado pelo OAuth 2.1 do Supabase Auth

- **Status:** Proposed
- **Data:** 2026-10-19
- **Área:** integração com agentes, autenticação, edge functions

---

## Contexto

O casal quer usar o lanabiel de dentro de um agente (Claude no celular e no
desktop, Claude Code): colar o link de um vídeo e ver o item aparecer na Lista.
Isso pede um servidor MCP que leia e escreva o acervo **como a pessoa**, com a
mesma RLS do app (ADR 0001), e que funcione no celular, onde não há processo
local para rodar.

O Supabase Auth ganhou um servidor OAuth 2.1 (PKCE, registro dinâmico,
descoberta em `/.well-known/oauth-authorization-server/auth/v1`). O token que
ele emite é um JWT comum do projeto, com `role: authenticated` e o `sub` da
pessoa, então a RLS vale sem mudança. A tela de consentimento é do app, no
caminho que se configura (`authorization_url_path`), relativo ao `site_url`.

## Decisão

1. O servidor MCP é a edge function `mcp` (Deno), com o SDK oficial
   (`@modelcontextprotocol/sdk`, `WebStandardStreamableHTTPServerTransport`) em
   modo **sem estado**: um `McpServer` e um transporte por pedido.
2. `verify_jwt = false` na função: o gateway responderia 401 sem o
   `WWW-Authenticate` que o cliente MCP precisa para descobrir o OAuth. A
   função valida o token ela mesma (`auth.getClaims`) e publica o documento
   de recurso protegido (RFC 9728) em `/functions/v1/mcp/.well-known/oauth-protected-resource`.
3. O cliente Supabase de cada pedido leva o token de quem chamou. Nada de
   `service_role`.
4. OAuth 2.1 do Supabase ligado, com **registro dinâmico** (o Claude se registra
   sozinho) e a tela `/oauth/consent` no app, fora da casca, atrás do
   `AuthGate`.
5. As regras do item têm espelho em `supabase/functions/mcp/list.ts`, provado
   contra os mesmos casos do domínio (padrão do `paintCases.ts`), em vez de a
   função importar `src/`.

## Alternativas descartadas

- **MCP local por stdio (Node), com e-mail e senha** — funciona no Claude Code
  e no desktop, mas não no celular, que é onde o link do Reels aparece. E
  guardaria senha em arquivo de configuração.
- **Token pessoal gerado nas Configurações** — o servidor precisaria agir com
  `service_role` e filtrar por casal no código, o que põe a autorização no
  lugar errado (ADR 0001). Ou cunhar JWT próprio, que as chaves assimétricas do
  projeto não permitem sem expor a chave de assinatura.
- **Função na Vercel, ao lado do front** — importaria `src/` direto, mas o
  deploy depende de push no git, o tempo de função é comparável e o servidor
  ficaria longe do banco. A edge function é o padrão das outras três.
- **Importar `src/domain/list.ts` na função** — os imports de `src/` não têm
  extensão (escritos para o Vite) e o Deno não os resolve sem modo permissivo,
  que o runtime do Supabase não garante. O espelho com teste de paridade já é
  como o projeto lida com regra em dois lugares.

## Consequências

### Positivas

- Um link e um login: o conector funciona no Claude web, desktop, celular e
  Claude Code, e a RLS do app é a autorização do agente.
- Revogar é do Auth (`revokeGrant`), e o token expira sozinho.

### Negativas / trade-offs

- Registro dinâmico aberto: qualquer cliente se registra. Ainda precisa do
  login e do consentimento de um integrante, mas a lista de clientes cresce
  sem controle.
- Enquanto o `site_url` for `http://127.0.0.1:5173`, o consentimento só abre com
  o app rodando no Mac. Conectar uma vez basta (o token renova), mas
  reconectar exige o app local até o `site_url` ir para produção.
- Regras do item em dois lugares. O teste de paridade pega divergência, mas
  alguém precisa rodá-lo.
- 150 s por pedido limita o quanto `analyze_link` pode esperar.

## Endereço público

O conector usa `https://lanabiel.ogabarbosa.com/mcp`, não a URL da função. O
`vercel.json` reescreve `/mcp` e `/.well-known/oauth-protected-resource[/mcp]`
para a função com `?via=public`; com essa marca e o segredo `MCP_PUBLIC_URL`, a
função anuncia o endereço público no `resource` e no `WWW-Authenticate` (o
cliente MCP recusa `resource` diferente da URL em que conectou). Reescrever o
servidor como função da Vercel foi descartado: duplicaria o código e o tiraria
de perto do Supabase. O Supabase Auth aceita `resource=https://lanabiel.ogabarbosa.com/mcp`
no `/oauth/authorize` (conferido em 2026-10-19).

## Código / evidência

| Artefato | Caminho |
| -------- | ------- |
| Função | `supabase/functions/mcp/` |
| Consentimento | `src/auth/OAuthConsent.tsx` |
| Configuração | `supabase/config.toml` (`[auth.oauth_server]`, `[functions.mcp]`), `vercel.json` (rewrites do `/mcp`) |
| Testes | `supabase/tests/mcp-*.test.ts` |

## Related

- [0001 — Supabase com RLS por casal](./0001-supabase-com-rls-por-casal.md)
- [0032 — Leitura de link por Apify, Gemini e página](./0032-leitura-de-link-por-apify-gemini-e-pagina.md)
- Spec: `../Tasks/mcp-server.md`
