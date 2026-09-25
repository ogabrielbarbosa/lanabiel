# Arquitetura do projeto

## O que é

SPA em React + TypeScript, servido pelo Vite. Sem backend próprio ainda.

## Stack

| Camada    | Tecnologia          | Papel                                                   |
| --------- | ------------------- | -------------------------------------------------------- |
| Build/dev | Vite 8              | dev server, bundling                                    |
| UI        | React 19 + TS 6     | componentes e estado da SPA                             |
| Lint      | oxlint              | verificação estática de padrões                         |
| Tipos     | tsc (project refs)  | typecheck (`tsconfig.app.json` + `tsconfig.node.json`)  |

## Estrutura

```text
src/
├── main.tsx        # entrypoint, monta <App /> no #root
├── App.tsx          # componente raiz
├── assets/          # imagens estáticas importadas pelo bundler
└── index.css, App.css
public/              # arquivos servidos sem passar pelo bundler
```

## Fluxo de dados

Ainda não há dado persistido nem chamada de rede: é o esqueleto padrão do Vite
(um clique em `App.tsx` que incrementa estado local). O primeiro fluxo real
ponta-a-ponta deve ser documentado aqui assim que existir.

## Fronteiras

Ainda não há camadas a separar (sem API, sem estado global, sem roteamento).
Esta seção nasce quando a primeira fronteira real aparecer.

## Contrato compartilhado

Não se aplica — pacote único, sem outro processo consumindo o mesmo código.

## Ambientes e variáveis

Nenhuma variável de ambiente ainda. Vite lê `.env*` na raiz quando existirem
(prefixo `VITE_` para expor ao client).

## Related

- `.agent/Decisions/README.md` — por que cada uma dessas escolhas
- `.agent/SOP/review-checklist.md` — o que a revisão cobra
