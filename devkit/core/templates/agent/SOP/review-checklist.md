# Checklist de revisão — <projeto>

O **motor** da revisão é o `/code-review`. Este arquivo é o que ele não pode
saber sozinho: as regras **deste** projeto.

Um item marcado é um **bloqueio**, não uma sugestão — e todo item aqui nasceu de
um bug que já aconteceu.

---

## A regra deste arquivo

Cada item aponta para o caso concreto que o gerou. Se você não consegue
responder "que bug fez este item existir?", ele não entra: conselho genérico
dilui os itens que foram pagos com bug, e a terceira vez que a revisão acusa
algo que não é problema é a última em que alguém a leva a sério.

Segunda regra: **o que a máquina verifica, a máquina verifica.** Item
mecanicamente checável não mora em checklist — mora em `.devkit/checks/`.
Checklist é para o que exige julgamento. O procedimento está em
`devkit/docs/02-autoria-de-regra.md`.

---

## 1. Fronteiras

<!-- O que uma camada não pode fazer, e que o linter não pega. -->

## 2. Contrato e dados

<!-- Fonte única, migração registrada, limites de query, índices. -->

## 3. Servidor

<!-- Autorização, idempotência, erro tipado, N+1. -->

## 4. Cliente

<!-- Estado, cache, invalidação, ciclo de vida de assinatura. -->

## 5. Interface

<!-- Tokens, escala tipográfica, acessibilidade medida, estados vazios. -->

## 6. Dívida que não pode entrar

<!-- O que este projeto decidiu nunca mais aceitar num diff. -->

---

## Related

- `.agent/System/ai-development-workflow.md` — onde a revisão entra no pipeline
- Skill `verify` — o gate anterior
