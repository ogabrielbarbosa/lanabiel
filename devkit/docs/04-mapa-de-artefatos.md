# Mapa de artefatos

Onde cada coisa mora, e por quê.

## Por pergunta

| Pergunta                               | Arquivo                            | Vida      |
| -------------------------------------- | ---------------------------------- | --------- |
| O que vale em **todo** turno?          | `CLAUDE.md` / `AGENTS.md` da raiz  | Evolui    |
| Por que decidimos assim?               | `.agent/Decisions/NNNN-*.md`       | Imutável  |
| Como o sistema funciona?               | `.agent/System/*.md`               | Reescrito |
| Vale a pena existir?                   | `.agent/Research/<tema>.md`        | Congela   |
| O que vamos construir?                 | `.agent/Tasks/<feature>.md`        | Evolui    |
| O que foi decidido durante a execução? | `.agent/Tasks/<feature>.ledger.md` | Evolui    |
| O que a revisão cobra aqui?            | `.agent/SOP/review-checklist.md`   | Cresce    |
| Como faço X passo a passo?             | `.agent/SOP/<tarefa>.md`           | Reescrito |
| Como se prova algo neste projeto?      | `.devkit/profile.sh`               | Evolui    |
| Que classes de bug não podem voltar?   | `.devkit/checks/*.sh`              | Cresce    |

## As três vidas

**Imutável** — o ADR. Registra o que se sabia **naquele momento**. Reescrevê-lo
destrói a única coisa que ele oferece: a possibilidade de julgar a decisão pelo
que estava disponível, e não pelo que se sabe hoje. Mudou de ideia? ADR novo que
supersede.

**Reescrito** — o System doc. Descreve o presente. Quando o código muda, ele
muda. Documento de sistema desatualizado é pior que ausente: o ausente faz a
pessoa ler o código; o desatualizado faz ela agir errado com confiança.

**Cresce** — checklist e checks. Só se acrescenta, e só com cicatriz. Item que
sai, sai porque a classe de bug deixou de ser possível (a fronteira mudou, a
ferramenta passou a pegar) — nunca porque incomodou.

## ADR vs. System doc

A confusão mais comum. **O ADR é o porquê; o System doc é o como.**

> ADR 0012: "Escolhemos fila em vez de chamada síncrona porque o webhook tem
> teto de 5s e o provedor corta a conexão. Rejeitamos thread em background:
> perde a mensagem no deploy."
>
> System/ingestao.md: "O webhook valida a assinatura, publica na fila e devolve 200. O worker consome, deduplica por chave externa e persiste."

Trocar os dois é o que produz a doc que ninguém consegue usar: o System doc
cheio de justificativas históricas, e o ADR descrevendo um funcionamento que já
mudou duas vezes.

## Spec vs. Ledger vs. ADR

| Artefato | Momento                      | Autoridade            |
| -------- | ---------------------------- | --------------------- |
| Spec     | Antes de construir           | Diz o que construir   |
| Ledger   | Durante, sem ninguém olhando | Registra o que mudou  |
| ADR      | Quando o ruling é estrutural | Vira regra do projeto |

O caminho barato é: decide-se em voo, registra-se o ruling, e o que se mostrar
estrutural vira ADR depois. Exigir ADR antes de cada decisão pequena para a
execução; não registrar nada produz um sistema cujas escolhas ninguém explica.

## O que NÃO vai para `.agent/`

- **O que o código já diz.** Documentar assinatura de função é doc que nasce
  velha na primeira refatoração.
- **O que o `git log` já diz.** Histórico de mudanças não é documento.
- **Catálogo na raiz.** Mapa, tabela e lista de referência moram em `.agent/` e
  são linkados. Na raiz, custam contexto em toda sessão e em todo subagente.

## Related

- [`00-como-funciona.md`](00-como-funciona.md) — a regra de lugar
