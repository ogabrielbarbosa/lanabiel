# Architecture Decision Records

O registro imutável do **porquê**. O _como_ mora em `../System/` e é reescrito
sempre que o código muda; um ADR, não — decisão que mudou vira ADR novo que
supersede o antigo.

## Regras

1. **Numeração sequencial**, sem reuso. Antes de escrever, confira colisão com
   as outras frentes:
   ```bash
   ls *.md | sed 's/-.*//' | sort | uniq -d
   ```
   Dois ADRs com o mesmo número não dão conflito de merge — dão duas linhas
   iguais neste índice que ninguém percebe.
2. **ADR aceito não se reescreve.** Mudou de ideia? ADR novo, e o antigo ganha
   `Superseded by NNNN`.
3. **Um ADR por decisão**, no mesmo PR que a introduz.
4. **Só há ADR se houver trade-off estrutural**: dependência nova, mudança de
   fluxo de dados, escolha de segurança ou performance com custo do outro lado,
   padrão novo obrigatório. Bugfix e UI isolada não geram ADR — registro demais
   dilui, e um diretório de trivialidades não é consultado.

Use `/adr <título>`. Template: [`0000-template.md`](./0000-template.md).

---

## Índice — Accepted

| #   | Título | Área | Data |
| --- | ------ | ---- | ---- |
| [0010](./0010-banco-so-online-sem-stack-local.md) | Banco só online, sem stack local | infraestrutura de dados, verificação | 2026-09-26 |

## Índice — Proposed

| #   | Título | Área | Data |
| --- | ------ | ---- | ---- |
| [0001](./0001-supabase-com-rls-por-casal.md) | Supabase com RLS por casal, em vez de `localStorage` | persistência, autenticação | 2026-09-25 |
| [0002](./0002-estadia-por-pessoa-estado-derivado.md) | Estadia por pessoa; estado do casal derivado, nunca gravado | domínio (timeline), schema | 2026-09-25 |
| [0003](./0003-lista-tabela-unica-com-check-por-categoria.md) | Lista em tabela única, com `CHECK` por categoria (revisado em 2026-09-26: os 8 modais, `done_on`, `done_with` por perfil) | schema (lista de desejos) | 2026-09-25 |
| [0004](./0004-login-com-senha-e-oauth.md) | Login com senha e OAuth, sem link mágico | autenticação (Fase 1) | 2026-09-26 |
| [0005](./0005-interface-se-prova-em-jsdom.md) | Comportamento de interface se prova em jsdom | ferramental de teste | 2026-09-26 |
| [0006](./0006-email-transacional-por-resend-em-edge-function.md) | E-mail transacional por Resend, numa edge function que não usa `service_role` | e-mail, edge functions (Fase 2) | 2026-09-26 |
| [0007](./0007-cidades-brasileiras-por-seed-do-ibge.md) | Cidades brasileiras por seed do IBGE, com escrita em `cities` fechada ao cliente (revisado em parte pelo 0017) | schema (`cities`), onboarding | 2026-09-26 |
| [0008](./0008-convite-portador-e-um-casal-por-pessoa.md) | Convite como entidade com código portador; uma pessoa em no máximo um casal | schema, segurança do convite (Fase 2) | 2026-09-26 |
| [0009](./0009-fotos-em-bucket-privado-por-casal.md) | Fotos de perfil em bucket privado, com leitura por casal | Storage, autorização (Fase 2) | 2026-09-26 |
| [0011](./0011-preferencias-em-tres-escopos.md) | Preferências em três escopos: casal, pessoa e aparelho | schema, Configurações (Fase 3) | 2026-09-26 |
| [0012](./0012-midia-do-casal-em-bucket-por-casal.md) | Mídia do casal em bucket próprio, com pasta por casal | Storage, autorização (Fase 3) | 2026-09-26 |
| [0013](./0013-casca-e-navegacao-por-caminho.md) | Casca do app e navegação por caminho, sem biblioteca de rotas | cliente, navegação (Fase 3) | 2026-09-26 |
| [0014](./0014-testes-de-integracao-no-projeto-online.md) | Testes de integração contra o projeto online, enquanto o app não abre (supersede em parte o 0010) | verificação (Fase 3) | 2026-09-26 |
| [0015](./0015-lista-sem-realtime-reler-ao-voltar.md) | Lista sem realtime: reler ao voltar ao foco e depois de cada escrita própria | fluxo de dados do cliente (Fase 4) | 2026-09-26 |
| [0016](./0016-busca-de-lugares-pelo-photon-osm.md) | Busca de lugares pelo Photon (OSM), com o resultado guardado no item | dependência externa, geografia da Lista (Fase 4) | 2026-09-26 |
| [0017](./0017-cidades-do-mundo-por-casal.md) | Cidades do mundo em `cities`, como linhas do casal, a partir do Photon (revisa em parte o 0007) | schema, autorização, Calendário (Fase 5) | 2026-09-26 |
| [0018](./0018-periodo-se-grava-pintando-estadias.md) | Período se grava pintando estadias; o evento pinta uma vez | fluxo de dados (`stays`), RPCs (Fase 5) | 2026-09-26 |
| [0019](./0019-viagem-e-o-evento-estendido-por-trips.md) | A viagem é o evento `viagem` dos dois, estendido 1:1 por `trips` | schema, Viagens (Fase 6) | 2026-09-27 |
| [0020](./0020-rota-com-parametro-sem-biblioteca.md) | Rota com parâmetro (`/viagens/:id`) sem biblioteca de rotas (supera o gatilho do 0013) | cliente, navegação (Fase 6) | 2026-09-27 |
| [0021](./0021-mapas-das-viagens-sem-engine.md) | Mapas das Viagens sem engine: projeção sobre a imagem do `.pen`, até a Fase 7 | cliente, Viagens (Fase 6) | 2026-09-27 |

## Backlog — discutido, sem código

Itens em que houve conversa mas nada foi construído. Ficam aqui para não serem
re-discutidos do zero.

| Assunto | O que se decidiu adiar | Por quê |
| ------- | ---------------------- | ------- |
| SMTP customizado no Auth (Resend) | Confirmação de e-mail no cadastro e _Esqueci minha senha_; ADR novo sobre o [0004](./0004-login-com-senha-e-oauth.md) | O envio de e-mail do produto saiu do backlog e virou [0006](./0006-email-transacional-por-resend-em-edge-function.md) em 2026-09-26, com domínio pronto no Resend. O mesmo domínio destrava o SMTP do Auth, mas ligá-lo muda o fluxo da Fase 1 e reabre a busca de convite por e-mail ([0008](./0008-convite-portador-e-um-casal-por-pessoa.md)) — não entra de carona na Fase 2. |
| Agendador de notificações | `pg_cron` vs. edge function agendada; ADR na Fase 2 ou 3 | Descoberto num toggle das Configurações: _"Lembrar do aniversário de namoro · Todo dia 17, às 9h, pros dois"_. Não aparece em nenhuma tela como fluxo, mas exige agendado no servidor. |
| Engine do mapa | MapLibre GL JS v5 + OpenFreeMap; ADR na Fase 7 (Home) | Verificado: `projection: {type:'globe'}` com `sky.atmosphere-blend` dá o globo do design, e os tiles da OpenFreeMap não pedem chave nem cobram. Mas não amarra nada antes da Fase 7 — o design do globo é imagem estática, então nenhuma fase anterior depende da escolha. |
| Materializar os períodos | View materializada ou cache dos períodos derivados | Otimização antes do problema. Dois usuários e alguns milhares de dias não justificam. Reabrir quando a lentidão for medida, não suposta — ver [0002](./0002-estadia-por-pessoa-estado-derivado.md). |
