# devkit

Um processo de desenvolvimento com agentes, empacotado para ser instalado em
qualquer projeto: os gates, os artefatos, as skills e o mecanismo que faz o
próprio processo aprender com os bugs do projeto.

Vem **vazio de conteúdo**, de propósito. O que ele traz é a estrutura e o
método; as regras nascem dos bugs que cada projeto pagar.

```bash
cp -R devkit /outro-projeto/devkit
cd /outro-projeto && ./devkit/install.sh . ts-node-web
claude   # → /devkit-init ts-node-web
```

---

## O que ele instala

| Onde                 | O quê                                                                           |
| -------------------- | ------------------------------------------------------------------------------- |
| `.claude/commands/`  | `/brainstorm` `/research` `/spec` `/adr` `/commit` `/update-doc` `/devkit-init` |
| `.claude/skills/`    | `verify` `debug` `finish-branch` `orchestrate` `devkit-doctor`                  |
| `.claude/agents/`    | `architect-reviewer` `scale-advisor`                                            |
| `.claude/hooks/`     | `verify.sh` (Stop) · `format.sh` (PostToolUse)                                  |
| `.devkit/profile.sh` | Como se prova algo neste projeto — fonte única de skills e hooks                |
| `.devkit/checks/`    | Os invariantes do projeto. Nasce vazio.                                         |
| `.agent/`            | Decisions (ADRs) · System · SOP · Tasks · Research · templates                  |

## O fluxo

```
/brainstorm → /research → /spec → plan → build → verify → /code-review → finish-branch
   Gate -1     Gate 0     Gate 1  Gate 2         Gate 3     Gate 4         Gate 5
```

**Dimensione à incerteza.** Bugfix, copy e UI isolada pulam os primeiros gates.
**Ninguém pula o Gate 3** — e ele não depende de disciplina: é um hook.

## As três ideias

1. **O gate tem de executar.** Processo documentado e não executado produz a
   sensação de rigor sem o rigor. O Gate 3 é um hook, não um parágrafo.
2. **A prova é saída de execução.** Ler o código não prova nada — é o mesmo
   código que você escreveu, e você já acreditava nele. E "não verificado" é
   resposta legítima; "presumo que funcione" não é.
3. **A decisão é registrada, não lembrada.** Em três níveis, por custo: mensagem
   de commit, ruling no ledger, ADR.

Desenvolvidas em [`docs/00-como-funciona.md`](docs/00-como-funciona.md).

## Como ele aprende

Este é o mecanismo que separa o kit de uma pasta de conselhos:

```
bug → debug acha o mecanismo → pode acontecer em outro arquivo?
                                   │
                    verificável por máquina? → .devkit/checks/ (+ CI)
                    exige julgamento?        → review-checklist
                    foi decisão estrutural?  → /adr
```

**Só entra o que já custou.** Regra preventiva contra bug hipotético é ruído, e
ruído ensina o time a ignorar o gate — inclusive quando ele estiver certo.
Procedimento em [`docs/02-autoria-de-regra.md`](docs/02-autoria-de-regra.md).

## Estrutura

```
devkit/
├── install.sh                 # instala num projeto; nunca sobrescreve
├── core/                      # AGNÓSTICO de stack
│   ├── commands/  skills/  agents/  hooks/
│   └── templates/             # esqueleto do .agent/, settings, bloco do CLAUDE.md
├── profiles/                  # ESPECÍFICO: os slots preenchidos
│   ├── ts-node-web/  nextjs/  expo-rn/  swift/  _template/
│   └── README.md              # o contrato de um perfil
└── docs/
    ├── 00-como-funciona.md      # a teoria
    ├── 01-instalar.md           # instalação e a primeira semana
    ├── 02-autoria-de-regra.md   # como uma cicatriz vira gate
    ├── 03-adaptar-stack.md      # quando nenhum perfil serve
    └── 04-mapa-de-artefatos.md  # onde cada coisa mora, e por quê
```

A separação **core / profile** é a chave da portabilidade: o processo é o mesmo
em toda parte, e o perfil responde "como se roda o teste aqui". Stack nova é um
`profile.sh` novo, não um processo novo.

## Atualizar depois

`core/` pode ser substituído por versões novas sem perda — não tem conteúdo de
projeto. **Nunca** substitua `.devkit/profile.sh`, `.devkit/checks/` nem nada em
`.agent/`: é ali que mora tudo o que aquele projeto aprendeu.

## Manutenção

Rode a skill `devkit-doctor` a cada poucas semanas, e sempre depois de um bug
ter passado por uma revisão que deveria tê-lo pego.

**Commite esta pasta.** Ela já foi perdida uma vez por estar untracked.
