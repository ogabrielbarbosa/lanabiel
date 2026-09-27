# ADR 0023 — A Home ocupa `/`; o Calendário passa a `/calendario`

- **Status:** Proposed
- **Data:** 2026-09-27
- **Área:** cliente, navegação (Fase 7)

---

## Contexto

Desde a Fase 3 o Calendário respondia em `/` (e em `/calendario`), porque era a
primeira tela de domínio que existia ([0013](./0013-casca-e-navegacao-por-caminho.md)).
A Fase 7 entrega a Home desenhada (`Home — Escuro`), que é o primeiro destino
do `Navbar` e a tela de entrada do app.

## Decisão

- `/` é a Home; `/calendario` é o Calendário (a única rota dele).
- Todo link interno que levava ao Calendário (`calendarFocus`, _Ver no
  calendário_, _marque no Calendário_, o _Novo evento_ do _Adicionar_) aponta
  para `/calendario`.
- Caminho desconhecido continua voltando para `/` — que agora é a Home.

## Alternativas descartadas

- **Home em `/home`, Calendário em `/`.** Mantém os links velhos, mas a entrada
  do app deixaria de ser a tela desenhada como entrada, e o primeiro ícone da
  barra levaria a um caminho que ninguém digita.

## Consequências

### Positivas

- A entrada do app é a vitrine, como no design.

### Negativas / trade-offs

- Favorito antigo em `/` abre a Home em vez do Calendário (a um clique dele).

## Código / evidência

| Artefato | Caminho |
| --- | --- |
| Rotas | `src/app/router.ts` |
| Barra | `src/app/Shell.tsx` |

## Related

- [0013 — casca e navegação por caminho](./0013-casca-e-navegacao-por-caminho.md)
- [0020 — rota com parâmetro sem biblioteca](./0020-rota-com-parametro-sem-biblioteca.md)
