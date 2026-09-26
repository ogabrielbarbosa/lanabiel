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
|     |        |      |      |

## Índice — Proposed

| #   | Título | Área | Data |
| --- | ------ | ---- | ---- |
| [0001](./0001-supabase-com-rls-por-casal.md) | Supabase com RLS por casal, em vez de `localStorage` | persistência, autenticação | 2026-09-25 |
| [0002](./0002-estadia-por-pessoa-estado-derivado.md) | Estadia por pessoa; estado do casal derivado, nunca gravado | domínio (timeline), schema | 2026-09-25 |
| [0003](./0003-lista-tabela-unica-com-check-por-categoria.md) | Lista em tabela única, com `CHECK` por categoria | schema (lista de desejos) | 2026-09-25 |

## Backlog — discutido, sem código

Itens em que houve conversa mas nada foi construído. Ficam aqui para não serem
re-discutidos do zero.

| Assunto | O que se decidiu adiar | Por quê |
| ------- | ---------------------- | ------- |
| Envio de e-mail transacional | Resend + edge function, **escolhido**; o ADR sai com a Fase 2 (onboarding) | O convite é o único e-mail do app. Escrever o ADR agora seria decidir em setembro o que só vai ao código na fase do convite. Pendência prática: precisa de domínio verificado — sem ele o Resend só entrega pro próprio dono da conta, e o convite vai pro e-mail da Lana. |
| Agendador de notificações | `pg_cron` vs. edge function agendada; ADR na Fase 2 ou 3 | Descoberto num toggle das Configurações: _"Lembrar do aniversário de namoro · Todo dia 17, às 9h, pros dois"_. Não aparece em nenhuma tela como fluxo, mas exige agendado no servidor. |
| Realtime (Postgres Changes) | Se a escrita de um aparece na tela do outro sem recarregar; ADR na Fase 4 | Não muda migration nenhuma e pode ser ligado depois. Decidir antes de ter duas telas escrevendo seria decidir no escuro. |
| Engine do mapa | MapLibre GL JS v5 + OpenFreeMap; ADR na Fase 7 (Home) | Verificado: `projection: {type:'globe'}` com `sky.atmosphere-blend` dá o globo do design, e os tiles da OpenFreeMap não pedem chave nem cobram. Mas não amarra nada antes da Fase 7 — o design do globo é imagem estática, então nenhuma fase anterior depende da escolha. |
| Materializar os períodos | View materializada ou cache dos períodos derivados | Otimização antes do problema. Dois usuários e alguns milhares de dias não justificam. Reabrir quando a lentidão for medida, não suposta — ver [0002](./0002-estadia-por-pessoa-estado-derivado.md). |
