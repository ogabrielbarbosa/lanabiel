# Como uma cicatriz vira regra

Este é o mecanismo que faz o processo melhorar sozinho. Sem ele, o kit é um
conjunto de conselhos; com ele, é um sistema que aprende.

**A regra da regra:** só entra o que já custou. Regra preventiva contra bug
hipotético é ruído, e ruído ensina o time a ignorar o gate — inclusive no dia em
que ele estiver certo.

---

## O ciclo

```
bug acontece
   │
   ├─ a skill `debug` acha o mecanismo (não o sintoma)
   │
   ├─ a correção remove o mecanismo, e um teste trava aquele caso
   │
   └─ pergunta: ISTO PODE ACONTECER DE NOVO EM OUTRO ARQUIVO?
         │
         ├─ não  → acabou. O teste basta.
         │
         └─ sim  → é uma CLASSE de bug. Continue:
                  │
                  ├─ dá para verificar por máquina?
                  │     sim → .devkit/checks/<nome>.sh       (gate local)
                  │           + o mesmo passo na CI           (gate do PR)
                  │     não → .agent/SOP/review-checklist.md  (checklist)
                  │
                  └─ a causa foi uma decisão errada de estrutura?
                        sim → /adr registrando a decisão certa
```

A pergunta do meio é a que todo mundo pula, e é a que importa. Um bug corrigido
com teste está resolvido **naquele arquivo**. Se o mesmo mecanismo pode nascer em
outro arquivo amanhã, o trabalho não acabou.

---

## Gate ou checklist?

| Critério                                       | Vai para          |
| ---------------------------------------------- | ----------------- |
| Dá para detectar com `grep`, parser ou comando | `.devkit/checks/` |
| Exige julgamento sobre intenção ou contexto    | checklist         |

O erro comum é pôr no checklist o que a máquina verificaria. O custo aparece
depois: o checklist cresce, ninguém lê inteiro, e os itens que **exigem**
julgamento — os que só um humano pega — se perdem no meio dos mecânicos.

Checklist é caro: cada item consome atenção humana em toda revisão, para sempre.
Gaste esse orçamento no que a máquina não faz.

## Local e CI: o mesmo check, dois lugares

O check em `.devkit/checks/` pega o erro na sessão, antes do commit. A CI pega o
que escapou — sessão sem hook, commit feito à mão, outra pessoa. Um não substitui
o outro. O ideal é a CI **chamar o mesmo script**, para que a regra não exista em
duas versões que divergem:

```yaml
- name: Invariantes do projeto
  run: for c in .devkit/checks/*.sh; do bash "$c" "$(git ls-files)" || exit 1; done
```

---

## Escrever um check

Contrato: recebe os arquivos mudados em `$1`, imprime o que está errado, sai
com status != 0. Silencioso quando está tudo bem.

```bash
#!/usr/bin/env bash
# .devkit/checks/exemplo.sh
#
# Por que existe: <o bug concreto, com data e sintoma>.
# Por que nada mais pega: <não é erro de tipo nem de lint porque…>

CHANGED="$1"
echo "$CHANGED" | grep -q '^src/' || exit 0     # fora do escopo: sai barato

HITS=$(grep -rnE '<padrão>' src/ 2>/dev/null | grep -vE '^[^:]+:[0-9]+:\s*(//|\*|#)' || true)
[ -z "$HITS" ] && exit 0

echo "<o que está errado, e qual é a forma certa>"
echo "$HITS"
exit 1
```

### Duas armadilhas, ambas aprendidas apanhando

**1. Ignore comentários.** A documentação cita a forma errada de propósito — é
assim que ela ensina. Um check que acusa o arquivo onde a regra está explicada é
um check que alguém vai silenciar na primeira semana.

**2. Olhe a janela, não a linha.** Quando o padrão tem exceção legítima que
aparece algumas linhas acima (um marcador de contexto, uma anotação), um check
linha-a-linha reprova os casos legítimos. O efeito é pior do que parece: no meio
do ruído que ele gera, as violações de verdade passam despercebidas — o check
ativamente esconde o que deveria mostrar.

### O comentário de cabeçalho não é opcional

Ele responde **por que este check existe**. Sem isso, daqui a um ano alguém vai
encontrar um check que reprova algo que parece inofensivo, não vai achar
justificativa, e vai apagá-lo. Aí o bug volta — e volta sem ninguém lembrar que
já tinha sido resolvido uma vez.

---

## Escrever um item de checklist

```markdown
- [ ] <a regra, no imperativo e verificável>

> Sintoma de violação: <o que se vê quando alguém quebra>. <O caso concreto, com
> referência ao commit, PR ou incidente.>
```

O bloco de citação faz mais trabalho do que parece. Ele transforma a regra de
"alguém acha isso importante" em "isto já aconteceu e custou X" — e é a
diferença entre um revisor que discute o item e um que o aplica.

---

## Manutenção

A skill `devkit-doctor` faz a pergunta certa a cada item: **que bug fez este item
existir?** Item sem resposta não sobrevive à auditoria.

E uma segunda, mais dura: quebre de propósito o que o check deveria pegar e
confirme que ele grita. Check que nunca reprovou pode ter parado de funcionar há
meses — uma pasta renomeada basta, e ele passa a sair com status zero sobre um
diretório que não existe mais.

## Related

- [`00-como-funciona.md`](00-como-funciona.md) — por que o gate precisa executar
- Skill `debug` — a fase 4 é onde esta pergunta nasce
- Skill `devkit-doctor` — a auditoria periódica
