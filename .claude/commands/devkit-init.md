# /devkit-init — Instalar o processo neste projeto

Adapta o devkit ao repositório atual: descobre a stack, escreve
`.devkit/profile.sh`, cria o esqueleto de `.agent/` e liga os gates.

Roda **uma vez por projeto**. Para re-diagnosticar depois, use a skill
`devkit-doctor`.

Uso: `/devkit-init` · `/devkit-init <perfil>` (`ts-node-web`, `nextjs`, `expo-rn`, `swift`)

---

## Instruções para o agente

### 1. Descobrir a stack — pelo repositório, não perguntando

Levante os fatos antes de abrir a boca. Cada pergunta que o repositório já
responde e você faz mesmo assim queima a confiança de quem está do outro lado.

```bash
ls package.json pyproject.toml go.mod Cargo.toml Package.swift pubspec.yaml 2>/dev/null
cat package.json 2>/dev/null | head -60          # scripts, deps, packageManager
ls pnpm-lock.yaml package-lock.json yarn.lock bun.lockb 2>/dev/null
ls turbo.json nx.json pnpm-workspace.yaml 2>/dev/null
ls .github/workflows/ 2>/dev/null                # o que a CI já cobra é o gate real
git log --oneline -20                            # o estilo de commit do time
```

Três coisas importam mais que o resto:

- **Os comandos reais de qualidade.** Não os que você acha que existem: os que
  estão em `scripts`, no `Makefile` ou na CI. Se a CI roda algo que o
  `package.json` não tem, a CI é a verdade.
- **O gerenciador de pacotes.** Sai do lockfile, não do hábito.
- **O contrato compartilhado**, se houver: o pacote/módulo que frente e fundo
  importam para não escrever a mesma regra duas vezes.

Leia também os passos extras da CI: invariantes que ela cobra além de
typecheck/lint/test (consistência de migração, grep de padrão proibido, "o lint
não pode ter alterado arquivos") são os primeiros candidatos a `.devkit/checks/`
— já provaram que valem, porque alguém se deu ao trabalho de pô-los na CI.

### 2. Escolher o perfil

| Perfil        | Quando                                                                 |
| ------------- | ---------------------------------------------------------------------- |
| `ts-node-web` | SPA + API como processos separados (Vite/React + Nest/Express/Fastify) |
| `nextjs`      | Next.js App Router — servidor e cliente no mesmo processo              |
| `expo-rn`     | React Native / Expo                                                    |
| `swift`       | iOS/macOS nativo                                                       |
| `_template`   | Nenhum dos acima. Copie e preencha os slots.                           |

Nenhum perfil serve? Não force. Copie `profiles/_template/` e preencha —
o contrato de um perfil está em `devkit/profiles/README.md`.

### 3. Escrever `.devkit/profile.sh`

Copie o `profile.sh` do perfil escolhido e **substitua os comandos pelos que
você levantou no passo 1**. Nada de placeholder: o profile é a fonte única de
"como se prova alguma coisa neste projeto", e um placeholder ali vira um gate
que nunca roda.

**Rode cada comando uma vez antes de gravar.** Um profile com um comando que não
existe é pior que nenhum profile — ele faz o gate falhar por motivo errado, e
gate que acusa o que não é problema é gate que se aprende a ignorar.

### 4. Criar `.agent/`

Se o `install.sh` não rodou, copie o esqueleto de `devkit/core/templates/agent/`.
Depois:

- Preencha `System/project_architecture.md` com o que você levantou no passo 1.
  Este é o único documento que **precisa** existir no dia um.
- Deixe `Decisions/` com o template e o índice vazio. ADR se escreve quando há
  decisão, não para encher pasta.
- Deixe `SOP/review-checklist.md` com as seções e **sem itens**. Cada item vai
  nascer de um bug real deste projeto — ver `devkit/docs/02-autoria-de-regra.md`.

> Não copie checklists de outro projeto. Regra emprestada não tem cicatriz: o
> time não sabe por que ela existe, não confia nela, e ela acaba diluindo as
> regras que foram pagas com bug.

### 5. Ligar os gates

Se o `install.sh` não rodou:

```bash
mkdir -p .claude/hooks .devkit/checks
cp devkit/core/hooks/verify.sh devkit/core/hooks/format.sh .claude/hooks/
```

Registre os hooks em `.claude/settings.json` (`PostToolUse` para formatar,
`Stop` para verificar) — o trecho está em
`devkit/core/templates/settings.hooks.json`.

**Meça o tempo antes de dar por feito:**

```bash
time bash .claude/hooks/verify.sh < /dev/null
```

Se passar do timeout configurado, o hook é morto no meio e a sessão fecha
"verde" sem ter verificado nada — que é o pior resultado possível, porque é
indistinguível do sucesso. Tire o build do conjunto, restrinja o escopo, ou
aumente o timeout. Nessa ordem.

### 6. Escrever a seção no arquivo de instruções da raiz

Insira em `CLAUDE.md` (ou `AGENTS.md`) o bloco de
`devkit/core/templates/CLAUDE.section.md`, adaptado. Ele é curto de propósito:
diz qual é o fluxo, onde mora cada coisa, e nada mais.

### 7. Relatar

```
Devkit instalado · perfil <nome>

profile.sh    typecheck: <cmd> ✅  lint: <cmd> ✅  test: <cmd> ✅ (todos executados)
.agent/       README, System/project_architecture.md, Decisions/ (vazio), SOP/, templates/
hooks         format.sh (PostToolUse) · verify.sh (Stop, <N>s medidos)
checks        nenhum ainda — o primeiro nasce do primeiro bug que se repetir

Pendente: <o que você não conseguiu levantar e por quê>
```

Sempre declare o pendente. Um devkit instalado pela metade que se anuncia
completo é a primeira mentira de um sistema cujo valor inteiro é não mentir.

---

## Related

- `devkit/profiles/README.md` — o contrato de um perfil
- `devkit/docs/01-instalar.md` — instalação manual, sem agente
- Skill `devkit-doctor` — a auditoria periódica
