# Checklist de revisão — <projeto>

O **motor** da revisão é o `/code-review`. Este arquivo é o que ele não pode
saber sozinho: as regras **deste** projeto. **As seções vêm; os itens não.**

Cada item tem que apontar para um bug que já aconteceu **neste** projeto. Regra
emprestada não tem cicatriz: ninguém sabe por que ela existe, ninguém confia
nela, e ela dilui as que foram pagas com bug.

O que a máquina verifica, a máquina verifica: item mecanicamente checável mora
em `.devkit/checks/`, não aqui. Como um item nasce:
`devkit/docs/02-autoria-de-regra.md`.

Formato de item:

```markdown
- [ ] <a regra, no imperativo e verificável>

> Sintoma de violação: <o que se vê>. <O caso concreto, com commit/PR/incidente.>
```

---

## 1. Fronteiras

<!-- O que uma camada não pode fazer, e que nenhuma ferramenta pega sozinha. -->

## 2. Contrato e dados

<!-- Regra de negócio em um lugar só. Migração registrada. Limites de query. -->

## 3. Servidor

<!-- Autorização, idempotência, erro tipado, ausência de N+1. -->

## 4. Cliente

<!-- Estado, cache, invalidação, ciclo de vida de assinatura. -->

## 5. Interface

<!-- Tokens, escala, acessibilidade medida, estados vazios. -->

## 6. Dívida que não pode entrar

<!-- O que este projeto decidiu nunca mais aceitar num diff. -->
