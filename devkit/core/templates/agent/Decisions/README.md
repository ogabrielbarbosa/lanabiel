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
|     |        |      |      |

## Backlog — discutido, sem código

Itens em que houve conversa mas nada foi construído. Ficam aqui para não serem
re-discutidos do zero.

| Assunto | O que se decidiu adiar | Por quê |
| ------- | ---------------------- | ------- |
|         |                        |         |
