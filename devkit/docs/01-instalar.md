# Instalar num projeto

## O caminho curto

```bash
cp -R /caminho/para/devkit ./devkit           # ou git subtree
./devkit/install.sh . ts-node-web             # perfis: ts-node-web nextjs expo-rn swift _template
```

Depois, dentro do projeto:

```
/devkit-init ts-node-web
```

O `install.sh` copia arquivos. O `/devkit-init` é quem **adapta**: descobre a
stack real, troca os comandos de exemplo pelos verdadeiros e executa cada um uma
vez. Pular esse passo deixa um gate que falha por motivo errado — pior que não
ter gate.

## Levar o kit para o outro projeto

| Forma        | Comando                                                          | Quando                          |
| ------------ | ---------------------------------------------------------------- | ------------------------------- |
| Cópia        | `cp -R ~/origem/devkit ./devkit`                                 | Dois ou três projetos           |
| Subtree      | `git subtree add --prefix=devkit <repo-do-devkit> main --squash` | Quer puxar melhorias depois     |
| Repo próprio | `git clone <repo-do-devkit> devkit`                              | Virou hábito em vários projetos |

**Commite o `devkit/` onde ele mora.** Pasta untracked não tem histórico: um
`git clean` ou uma limpeza de disco a apaga sem deixar rastro.

## O que é criado

```
.claude/
  commands/    brainstorm research spec adr commit update-doc devkit-init
  skills/      verify debug finish-branch orchestrate devkit-doctor
  agents/      architect-reviewer scale-advisor
  hooks/       verify.sh format.sh
  settings.json
.devkit/
  profile.sh   ← como se prova algo NESTE projeto (fonte única)
  checks/      ← os invariantes; nasce vazio, de propósito
.agent/
  README.md  Decisions/  System/  SOP/  Tasks/  Research/  templates/
```

O `install.sh` **nunca sobrescreve**. Reinstalar sobre um projeto em uso reporta
o que manteve e não apaga regra que alguém escreveu. Se o projeto já tem
`.claude/settings.json`, os hooks são **acrescentados** às listas existentes.

## A primeira semana

O kit vem vazio de conteúdo, e isso é deliberado: regra emprestada não tem
cicatriz — o time não sabe por que ela existe e não confia nela.

**Dia 1.** `/devkit-init`. Preencha `System/project_architecture.md`. Meça o
hook com `time bash .claude/hooks/verify.sh < /dev/null` e confirme que ele cabe
no timeout.

**Primeira feature.** Use `/spec` de verdade, mesmo parecendo exagero. O valor
aparece na seção de aceites: se você não consegue escrever como provar um
critério, ele não estava claro — e você acabou de economizar o retrabalho.

**Primeiro bug que se repete.** Aqui o kit começa a valer. Rode `debug`, e na
fase 4 faça a pergunta: isto pode acontecer em outro arquivo? Se sim, nasce o
primeiro `.devkit/checks/`. Procedimento em
[`02-autoria-de-regra.md`](02-autoria-de-regra.md).

**Primeira decisão estrutural.** `/adr`. O primeiro ADR é o mais difícil de
escrever e o que mais paga: ele estabelece que este projeto registra decisões.

**Primeiro mês.** Rode a skill `devkit-doctor`. Ela mede a distância entre o
processo declarado e o que de fato acontece.

## Instalação manual, sem o script

Copie `core/commands/` para `.claude/commands/`, `core/skills/` para
`.claude/skills/`, `core/agents/` para `.claude/agents/`, `core/hooks/` para
`.claude/hooks/`, `core/templates/agent/` para `.agent/`, e o `profile.sh` do
perfil escolhido para `.devkit/profile.sh`. Registre os hooks em
`.claude/settings.json` com o trecho de `core/templates/settings.hooks.json`.

## Atualizar o kit depois

Comandos, skills, agentes e hooks podem ser substituídos por versões novas sem
perda — não têm conteúdo de projeto. **Nunca** substitua `.devkit/profile.sh`,
`.devkit/checks/`, `.agent/SOP/review-checklist.md` nem nada em `.agent/`: é ali
que mora tudo o que este projeto aprendeu.

## Related

- [`03-adaptar-stack.md`](03-adaptar-stack.md) — quando nenhum perfil serve
- [`00-como-funciona.md`](00-como-funciona.md) — por que o processo é assim
