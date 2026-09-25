# Desenvolvimento com IA — o guia deste projeto

Tudo que o repositório oferece para trabalhar com agentes, e quando usar cada
coisa. Se você só vai ler uma seção, leia [o fluxo](#o-fluxo).

---

## O fluxo

```
        ideia vaga
            │
     /brainstorm ─────────────── Gate −1 · problema em 5 linhas
            │
     /research ───────────────── Gate 0 · só p/ aposta de produto
            │
     /spec ───────────────────── Gate 1 · contrato + aceites testáveis
            │
     Plan Mode ───────────────── Gate 2 · tarefas verticais, por dependência
            │
     build ───────────────────── skill orchestrate, se independentes
            │
     skill verify ───────────── Gate 3 · prova de execução por aceite
            │
     /code-review ───────────── Gate 4 · conformidade, depois qualidade
            │
     skill finish-branch ────── Gate 5 · colisões · commits · destino
            │
        PR  (+ /adr no mesmo PR, se houve trade-off estrutural)
```

**Dimensione à incerteza.** Bugfix, copy, UI isolada e melhoria interna de infra
pulam os Gates −1 e 0, às vezes o 1. Vá ao menor passo que resolve a dúvida.

**Ninguém pula o Gate 3.** E ele não depende de disciplina: o hook `Stop` o cobra
sozinho.

---

## Comandos

| Comando               | Faz                                                    | Sai em                       |
| --------------------- | ------------------------------------------------------ | ---------------------------- |
| `/brainstorm <ideia>` | Socrático, uma pergunta por vez, até caber em 5 linhas | nada — produz clareza        |
| `/research <tema>`    | Pesquisa de mercado com fonte e "por que agora"        | `.agent/Research/<tema>.md`  |
| `/spec <feature>`     | Contrato, invariantes, aceites testáveis               | `.agent/Tasks/<feature>.md`  |
| `/adr <título>`       | Registra a decisão e o alternativo rejeitado           | `.agent/Decisions/NNNN-*.md` |
| `/commit`             | Mensagem convencional que explica o **porquê**         | —                            |
| `/update-doc`         | Varre o código e atualiza `.agent/`                    | `.agent/**`                  |
| `/code-review`        | Revisão do diff                                        | achados                      |

## Skills

| Skill               | Quando                          | A regra que ela impõe                                    |
| ------------------- | ------------------------------- | -------------------------------------------------------- |
| **`verify`**        | Antes de dizer "pronto"         | Afirmação sem saída de comando é previsão, não relatório |
| **`debug`**         | Qualquer bug                    | Não se escreve correção antes de reproduzir              |
| **`finish-branch`** | Fechar branch/worktree          | Colisão de numeração se confere **antes** do merge       |
| **`orchestrate`**   | Plano com tarefas independentes | Contexto de subagente é construído, nunca herdado        |
| **`devkit-doctor`** | O processo parece enfeite       | Gate que não executa não é gate                          |

## Sub-agentes

Contexto isolado, read-only: opinam, não editam.

| Agente               | Quando                                                                         |
| -------------------- | ------------------------------------------------------------------------------ |
| `architect-reviewer` | Antes de escrever um ADR; dependência estrutural nova; "isso aguenta crescer?" |
| `scale-advisor`      | Mais volume, mais usuários, mais throughput; avaliar SE e QUANDO extrair       |

## O que roda sozinho

| Onde                       | O quê                                                          |
| -------------------------- | -------------------------------------------------------------- |
| `PostToolUse` (Edit/Write) | `.claude/hooks/format.sh` — formata só o arquivo tocado        |
| `Stop`                     | `.claude/hooks/verify.sh` — qualidade + invariantes do projeto |

Os comandos saem de `.devkit/profile.sh`. Os invariantes são os scripts de
`.devkit/checks/` — um por classe de bug que já aconteceu aqui.

Opt-out do teste no hook: `DEVKIT_SKIP_TEST=1`. Incluir o build: `DEVKIT_RUN_BUILD=1`.

---

## Onde a memória do projeto mora

Ver [`.agent/README.md`](../README.md). A regra curta: o arquivo de instruções
da raiz guarda o que vale em **todo** turno; o resto mora em `.agent/` e é
linkado de lá.

---

## Três hábitos que pagam

**Registre a decisão, não só o código.** Toda mensagem de commit responde _por
quê_, com o alternativo rejeitado quando houve um. É o que permite ao `git log`
funcionar como documentação — e é o que salva alguém, meses depois, de desfazer
uma escolha deliberada achando que era descuido.

**Contexto fresco ganha de pensar mais tempo.** Sessão longa acumula suposição.
Um subagente com contexto construído acha o que o autor não acha.

**Decida e registre, em vez de travar.** Numa execução longa, conflito entre
plano e código se resolve com um ruling — _o que decidi, por quê, o que custa se
eu estiver errado_ — não com uma pergunta que para o dia de alguém. Só quatro
coisas param: operação destrutiva, ação sensível de segurança, efeito fora da
worktree (merge, push, deploy) e plano em que todo caminho é chute.
