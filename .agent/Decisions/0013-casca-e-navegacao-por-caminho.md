# ADR 0013 — Casca do app e navegação por caminho, sem biblioteca de rotas

- **Status:** Proposed
- **Data:** 2026-09-26
- **Área:** cliente (navegação), Fase 3 em diante

---

## Contexto

Até a Fase 2 o app era um portão e uma tela: `App.tsx` renderizava a timeline
antiga depois do `ready`. A Fase 3 traz a segunda área (Configurações, com nove
abas) e a barra de navegação do design (`Navbar`, PajKz), em que Home, Lista e
Viagens vão entrar. A Fase 2 tinha adiado a "biblioteca de rotas" para a Fase 7.

As abas precisam de URL: recarregar numa aba reabre nela, voltar do navegador
troca de aba, e outras telas vão linkar direto (a Lista abrindo
_Configurações › Lista_).

## Decisão

- Navegação por **caminho** (`/configuracoes/<aba>`), sobre `history.pushState`
  e `popstate`, em `src/app/router.ts` (~50 linhas, `useSyncExternalStore`).
- `src/app/Shell.tsx` é a casca: barra lateral + rota. A barra mostra **só**
  destinos que existem; cada fase acrescenta o dela.
- Caminho desconhecido volta para `/` substituindo o histórico;
  `/configuracoes` vai para a primeira aba.
- A hospedagem, quando existir, reescreve todo caminho para `index.html`.

**Gatilho para trocar por biblioteca** (TanStack Router ou React Router): rota
com parâmetro além do slug (ex.: `/viagens/:id`), ou carregamento de dado por
rota. As Viagens (Fase 6) provavelmente disparam o primeiro.

> **Nota (2026-09-27):** disparou, e a decisão foi manter o roteador — ver
> [0020](./0020-rota-com-parametro-sem-biblioteca.md), que substitui este gatilho.

## Alternativas descartadas

- **React Router / TanStack Router agora.** Duas áreas e nove slugs não pagam a
  dependência, e escolher antes de ter a primeira rota com parâmetro é escolher
  no escuro.
- **Fragmento (`#/configuracoes`).** Dispensa reescrita no servidor, mas o
  fragmento já tem dono: o link do convite (`#convite=`), que o portão consome.
- **Estado local, sem URL.** Recarregar voltaria sempre para o calendário, e
  nenhuma tela poderia linkar para uma aba.

## Consequências

### Positivas

- Zero dependência; o roteador cabe numa leitura.
- As fases seguintes plugam destino na barra sem mexer no portão.

### Negativas / trade-offs

- Sem code splitting por rota, sem loaders, sem parâmetro tipado.
- Hospedagem precisa de rewrite (o `vite dev`/`preview` já fazem).
- Migrar para biblioteca depois é mexer em `Shell.tsx` e nos links — pequeno
  enquanto houver poucas rotas; por isso o gatilho está escrito.

## Código / evidência

| Artefato | Caminho |
| -------- | ------- |
| Roteador | `src/app/router.ts` |
| Casca | `src/app/Shell.tsx` |
| Testes | `src/app/router.test.ts`, `src/app/Shell.test.tsx` |

## Related

- Spec: [`../Tasks/fase-3-configuracoes.md`](../Tasks/fase-3-configuracoes.md), R1–R4
