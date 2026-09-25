---
name: devkit-doctor
description: Auditar a saúde do processo de desenvolvimento neste projeto — se os gates rodam de verdade, se a documentação acompanha o código, se as regras do checklist ainda pegam o que dizem pegar. Use quando o processo parecer enfeite, ao voltar a um projeto depois de semanas, antes de um onboarding, ou quando um bug passar por uma revisão que deveria tê-lo pego. Triggers - auditar processo, o gate está funcionando, devkit doctor, revisar o setup, a documentação está velha, por que isso passou na revisão.
---

# Diagnóstico do processo

Gate que só existe em documento é enfeite. Esta skill mede a diferença entre o
processo declarado e o processo que de fato acontece.

Rode a cada poucas semanas, e sempre depois de um bug ter passado por uma
revisão que deveria tê-lo pego.

---

## 1. Os gates executam?

```bash
cat .devkit/profile.sh                    # existe? os comandos estão certos?
bash .claude/hooks/verify.sh < /dev/null  # roda? em quanto tempo?
ls .devkit/checks/                        # quais invariantes são cobrados
```

Verifique, item a item:

- **O hook cabe no timeout.** Um hook que estoura o tempo é morto no meio e vira
  ruído: a sessão fecha "verde" sem ter verificado nada. Meça, não presuma.
- **O hook enxerga arquivo novo.** Crie um arquivo untracked com erro e confirme
  que o hook reprova. Guarda de mudança baseada só em `git diff` não vê arquivo
  novo — e a sessão que só criou arquivos passa sem verificação.
- **Todo `check` em `.devkit/checks/` ainda reprova.** Quebre de propósito o que
  ele deveria pegar e confirme que ele grita. Check que nunca reprovou pode ter
  parado de funcionar há meses — uma mudança de caminho basta.
- **O escopo está certo.** Um gate que acusa o trabalho de outra pessoa é um
  gate que se aprende a ignorar.

## 2. As regras têm dono e cicatriz?

Abra `.agent/SOP/review-checklist.md`. Para cada item, uma pergunta:

> Que bug real fez este item existir?

Item sem resposta é conselho genérico — e conselho genérico dilui os itens que
importam. Ou ele ganha a referência ao caso concreto, ou ele sai.

Segunda pergunta, mais dura:

> Isto é **verificável por máquina**?

Se for, ele não deveria estar num checklist que depende de alguém lembrar. Ele
deveria estar em `.devkit/checks/`. Checklist é para o que exige julgamento; o
resto é gate.

## 3. A documentação acompanha o código?

```bash
git log --since="8 weeks ago" --name-only --pretty=format: | sort -u | head -50
git log --since="8 weeks ago" --name-only --pretty=format: -- .agent/ | sort -u
```

Áreas com muito commit e nenhuma atualização em `.agent/System/` são doc
provavelmente vencida. Abra a de maior movimento e confira o primeiro fato
concreto que ela afirma — caminho, nome de arquivo, comando. Se o primeiro já
estiver errado, o documento está mentindo há tempo suficiente para alguém ter
agido com base nele.

## 4. As decisões estão registradas?

```bash
ls .agent/Decisions/*.md | wc -l
git log --since="8 weeks ago" --oneline -- .agent/Decisions/ | wc -l
```

Muitas semanas de commits estruturais e nenhum ADR novo significa uma de duas
coisas: ou não houve decisão (improvável), ou elas estão só na cabeça de quem as
tomou. Varra o `git log` do período atrás de mudanças de dependência, de fluxo
de dado ou de padrão, e proponha os ADRs retroativos — datados de quando a
decisão foi tomada, não de hoje.

Confira também o índice: número duplicado, `Superseded by` apontando para nada,
linha no índice sem arquivo correspondente.

## 5. O arquivo de instruções da raiz inchou?

O arquivo carregado em **todo** turno (`CLAUDE.md`, `AGENTS.md` ou equivalente)
só pode conter o que vale em todo turno. O que se consulta uma vez por tarefa
mora em `.agent/` e é linkado de lá.

```bash
wc -l CLAUDE.md AGENTS.md 2>/dev/null
```

Passou de ~400 linhas, procure a seção mais longa: quase sempre é um mapa, uma
tabela ou um catálogo que deveria ser um arquivo linkado.

## 6. Existe trabalho fora do histórico?

```bash
git status --short | grep '^??'
```

Pasta de processo, skill ou documento untracked há dias é trabalho sem rede:
qualquer limpeza o apaga sem rastro. Commite ou descarte.

---

## Relatório

Uma tabela, um veredito por eixo, e uma recomendação por linha vermelha.

```
| Eixo                    | Veredito | Evidência |
| ----------------------- | -------- | --------- |
| Gates executam          | ⚠️       | verify.sh leva 190s contra timeout de 60s — morre no meio |
| Regras com cicatriz     | ✅       | 14 de 14 itens citam o caso |
| Docs acompanham         | ❌       | System/api.md cita 3 rotas que não existem mais |
| Decisões registradas    | ⚠️       | 6 semanas, 2 mudanças estruturais, 0 ADR |
| Instruções da raiz      | ✅       | 280 linhas |
| Trabalho fora do git    | ❌       | devkit/ untracked há 3 dias |
```

Não conserte tudo de uma vez. Comece pelo gate que não executa — enquanto ele
não rodar, todo o resto é opinião.

## Related

- `devkit/docs/02-autoria-de-regra.md` — como uma cicatriz vira gate
- Skill `verify` — o gate que esta skill audita
- Comando `/update-doc` — o conserto do eixo 3
