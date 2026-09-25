# /research — Pesquisa de mercado (Gate 0)

Segunda fase do pipeline — depois do `/brainstorm`, que afia a ideia. Produz um
documento que embasa a Spec.

Só é obrigatório para trabalho **grande**: feature nova voltada ao usuário,
aposta de produto. Melhoria interna de infra, performance ou dívida técnica pula
direto para `/spec`.

Saída: `.agent/Research/<tema>.md`, a partir de `.agent/templates/research-template.md`.

---

## Instruções para o agente

### 1. Reaproveitar o que já existe

Leia `.agent/Research/` antes de pesquisar qualquer coisa. Se já há documento
sobre o tema ou sobre um vizinho, **cite e estenda** — não repita. Confira
também o posicionamento do produto em `.agent/System/` para checar se o tema faz
sentido no que está sendo construído.

### 2. Pesquisar

Busque concorrentes, demanda e o "por que agora". Para varredura ampla, despache
um subagente de pesquisa em vez de encher a sessão principal de páginas.

**Toda afirmação de mercado precisa de fonte verificável.** Sem fonte não é
achado, é opinião — e opinião entra no documento marcada como hipótese a validar,
nunca como fato.

### 3. Escrever o documento

Preencha todas as seções do template: Problema · Por que agora · Evidência de
demanda · Concorrência · Fit com o produto · Opções · Recomendação · Riscos ·
Fora de escopo.

Seção que não se aplica a este tema: escrever `N/A — <razão>`, não apagar. A
seção vazia é informação; a seção ausente é esquecimento.

### 4. Gate 0 — critério de passagem

O documento passa quando tem **problema claro**, **evidência de demanda com
fonte**, **"por que agora"** e uma **recomendação em uma frase**. Enquanto
faltar qualquer um, `Status: Draft`.

### 5. Handoff

Termine apontando o próximo passo: `/spec <feature>`. A recomendação vira o
"What & Why" da Spec — se ela não couber lá, ela não estava pronta.

---

## Quando NÃO usar

- Bugfix, copy, ajuste de UI isolado.
- Melhoria de infra, performance ou dívida técnica sem novo comportamento de
  usuário → vá direto para `/spec` ou, se não houver trade-off estrutural,
  direto para a implementação.

---

## Related

- Template: `.agent/templates/research-template.md`
- Fase anterior: `/brainstorm` · Próxima: `/spec`
- Guia: `.agent/System/ai-development-workflow.md`
