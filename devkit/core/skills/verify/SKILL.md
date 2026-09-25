---
name: verify
description: Provar que o trabalho está feito antes de dizer que está — o Gate 3 do pipeline. Use ao terminar uma feature, antes de abrir PR, quando um aceite da spec precisa ser demonstrado, ou sempre que for afirmar "pronto", "funcionando" ou "corrigido". Triggers - verificar, provar, terminei, está pronto, funciona, testar de verdade, gate 3, antes do PR, critérios de aceite.
---

# Verificar antes de concluir

Uma afirmação sem saída de comando é uma previsão, não um relatório.

**Regra única: você não escreve "funciona" sem colar o que provou.**

Esta skill é o único gate que nenhum tipo de trabalho pula. Bugfix pula
pesquisa; copy pula spec; ninguém pula a prova.

---

## De onde vêm os comandos

Todo comando desta skill sai de `.devkit/profile.sh` — o arquivo que declara,
para **este** projeto, como se compila, se testa e se mede. Leia-o antes de
rodar qualquer coisa:

```bash
cat .devkit/profile.sh
```

Se ele não existe, o devkit não foi instalado aqui: rode `/devkit-init` antes de
continuar. Nunca invente o comando de teste a partir do `package.json` — o
profile existe justamente para que a resposta seja a mesma em toda sessão.

---

## O que conta como prova

| Afirmação                      | Prova aceita                                    | Prova recusada                |
| ------------------------------ | ----------------------------------------------- | ----------------------------- |
| "compila"                      | saída de `$DEVKIT_CMD_TYPECHECK`                | "não mudei tipo nenhum"       |
| "passa nos testes"             | saída de `$DEVKIT_CMD_TEST`, com a contagem     | "os testes existentes cobrem" |
| "o aceite §10.3 está atendido" | o teste que exercita **aquele** aceite, nomeado | "implementei conforme a spec" |
| "a tela funciona"              | teste de UI que monta, age e asserta            | "o componente renderiza"      |
| "a query ficou rápida"         | medição antes e depois, mesma carga             | "adicionei o índice"          |
| "o dado foi gravado"           | consulta ao banco                               | a UI mostrando o valor certo  |
| "não quebrei nada"             | suíte inteira verde                             | "a mudança é isolada"         |

Prova é **saída de execução**. Leitura de código não é prova: o código lido é o
mesmo que você escreveu, e você já acreditava nele.

---

## O procedimento

### 1. Recupere os aceites

Abra a spec em `.agent/Tasks/<feature>.md`, seção de critérios de aceite. Se a
feature não tem spec (bugfix, copy, UI isolada), o aceite é a frase do pedido —
**escreva-a antes de continuar**, porque é contra ela que você vai medir. Aceite
que só existe na sua cabeça não reprova nada.

Liste os aceites numerados. Cada um vai receber um veredito.

### 2. Rode a máquina

Na ordem do profile, do mais barato ao mais caro:

```bash
source .devkit/profile.sh
$DEVKIT_CMD_TYPECHECK
$DEVKIT_CMD_LINT
$DEVKIT_CMD_TEST
```

Falhou? Pare. Conserte. Rode de novo. **Não prossiga com falha "não
relacionada"** — ou ela é relacionada e você não viu, ou ela já estava quebrada
e agora é sua.

Mexeu no contrato compartilhado (`$DEVKIT_CONTRACT_PATH`)? Rode
`$DEVKIT_CMD_CONTRACT_BUILD` — consumidor que lê o build antigo passa no
typecheck e quebra em runtime.

Mexeu no schema do banco? Rode `$DEVKIT_CMD_MIGRATE_CHECK`. Ele não deve gerar
nada novo: se gerou, o schema no código e a migração no disco divergiram.

### 3. Prove cada aceite, um a um

**Lógica** — aponte o teste que o exercita, com arquivo e linha. Se não existe,
escreva. Um aceite sem teste não está provado, está prometido.

**Interface** — teste automatizado que monta, age e asserta. Abrir navegador,
simulador ou device é passo **sob demanda**: só quando o pedido disser para
verificar, capturar ou medir ali. Sem esse pedido, o que só o navegador provaria
entra no relatório como **não verificado**, nunca como presumido.

**Performance** — número antes e número depois, mesma máquina, mesma carga. Sem
baseline não há afirmação de melhora, há torcida.

**Dado** — consulte o armazenamento. A UI mostrando o valor certo não prova que
o valor certo foi gravado; prova que a UI calculou certo a partir de sabe-se lá o quê.

**Acessibilidade / visual** — medida, não impressão. Contraste em número, alvo
em pixel, nos dois temas quando houver cor.

### 4. Procure o que você não testou

Três perguntas, sempre:

- **Qual estado vazio?** Lista sem itens, campo nulo, primeira execução, usuário recém-criado.
- **Qual falha?** Rede caindo, provedor recusando, permissão negada, concorrência, relógio torto.
- **Qual limite?** A página 2, o item 5.001, o texto de 4 KB, o tenant com 40 usuários.

Cada uma que você não conseguir responder com uma execução vira **linha no
relatório** — não sumiço.

### 5. Relate

```
## Verificação

typecheck ✅ · lint ✅ · testes ✅ 171 passando (12 novos)

| Aceite | Veredito | Prova |
| --- | --- | --- |
| §10.1 fora da janela bloqueia envio livre | ✅ | window.spec.ts:42 |
| §10.2 o composer exige template          | ✅ | composer.spec.tsx:88 |
| §10.3 provedor B não tem janela          | ⚠️ | sem credencial de B no ambiente — não verificado |

Não verificado: §10.3 (motivo acima).
Descoberto na verificação: o estado vazio da lista mostra travessão, não convite.
```

**"Não verificado" é uma resposta legítima. "Presumo que funcione" não é.**
Omitir o que ficou de fora é o único erro que esta skill não perdoa — quem lê o
relatório decide o risco, e não pode decidir sobre o que não sabe.

---

## Quando a verificação encontra uma classe de bug

Se o que quebrou pode quebrar de novo do mesmo jeito em outro arquivo, a
correção não termina no arquivo. Escreva uma verificação em
`.devkit/checks/` — é assim que uma cicatriz vira gate. O procedimento está em
`devkit/docs/02-autoria-de-regra.md`.

Regra que só existe em documento é enfeite.

---

## Depois

Verificação limpa → `/code-review` (Gate 4). Encontrou problema → conserte e
**recomece do passo 2**; verificação parcial não conta.

## Related

- `.agent/SOP/review-checklist.md` — o que a revisão cobra depois
- Skill `finish-branch` — o fechamento, que assume esta verificação feita
- `.agent/System/ai-development-workflow.md` — onde este gate entra
