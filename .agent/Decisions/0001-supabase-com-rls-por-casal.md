# ADR 0001 — Supabase com RLS por casal, em vez de `localStorage`

- **Status:** Proposed
- **Data:** 2026-09-25
- **Área:** persistência, autenticação

---

## Contexto

O app hoje é um SPA sem backend: `storage.ts` grava um array de estadias em
`localStorage` sob a chave `lanabiel:stays:v1`. Isso funcionou enquanto o app
era de uma pessoa só — e é exatamente o limite. A Lana não tem acesso a nada:
o "app do casal" é, na prática, um bloco de notas no navegador do Gabriel.

O design no Pencil (~50 telas) resolve isso de forma explícita e não opcional:
tem tela de Login, três cenários de onboarding por convite, um e-mail de convite
desenhado em duas larguras, `couple_members`, e copy que pressupõe dois
editores em toda parte — _"Adicionando como Gabriel · a Lana recebe um aviso"_,
_"Gabriel escrevendo · a Lana pode completar"_, _"Avisar a Alana quando salvar"_.
Duas pessoas escrevendo no mesmo acervo, de máquinas diferentes, é o requisito;
não é um upgrade futuro.

Além de escrita compartilhada, o design pede coisas que `localStorage` não tem
como cobrir: fotos (até 10 por memória), envio de e-mail transacional, e um
agendado (_"Lembrar do aniversário de namoro · Todo dia 17, às 9h, pros dois"_).
Havia um projeto Supabase chamado `lanabiel` já criado na conta, com seis
tabelas esboçadas e **zero linhas** em todas — ou seja, migrar não custa dado
nenhum, e o esqueleto pode ser refeito à vontade.

## Decisão

Persistir tudo em **Postgres no Supabase**, usando quatro dos seus serviços:
Auth (login e convite), Database, Storage (fotos) e Edge Functions (e-mail e
agendados).

O isolamento é **RLS por casal, na policy — nunca no cliente**. Toda tabela de
domínio carrega `couple_id`, e cada policy checa pertencimento via
`couple_members` contra `auth.uid()`. O cliente não filtra por `couple_id`: ele
pede a tabela e recebe o que é dele. Uma query que esqueça o filtro tem de
voltar vazia, não voltar tudo.

O schema existente (`profiles`, `couples`, `couple_members`, `places`,
`calendar_events`, `mementos`) é descartado e reescrito na Fase 0. Ele não
cobre o domínio: `calendar_events` não tem coluna de quem-está-onde, `places`
tem `country NOT NULL` (uma série não entra), `mementos` tem `file_path` no
singular e nenhuma nota nem "quem estava". Reescrever com zero linhas é grátis;
migrar depois não seria.

## Alternativas descartadas

- **Continuar em `localStorage`, sincronizando por export/import.** O
  `exportStays.ts` já existe, então o caminho estava meio aberto. Mas dois
  editores assíncronos com merge manual é a pior parte de um sistema
  distribuído sem nenhuma de suas vantagens: quem exportou por último ganha, e
  o outro descobre que perdeu a memória que escreveu.
- **Backend próprio (Node + Postgres hospedado).** Controle total e nenhum
  fornecedor no caminho. Custa construir Auth, fluxo de convite, upload de
  fotos, envio de e-mail e agendador — tudo isso para **dois usuários**. É
  desproporcional ao problema.
- **Firebase / Firestore.** Auth e realtime prontos e maduros. Mas o domínio
  aqui é francamente relacional — item da lista ↔ memória ↔ evento ↔ estadia ↔
  viagem — e as telas são cheias de agregação por data (_"22 juntos · 8
  separados"_, _"31 de 86 feitas"_, _"104 dias juntos em 2026"_). Isso é SQL.
  Em Firestore viraria denormalização e contadores mantidos à mão, que é
  precisamente a classe de bug que o [ADR 0002](./0002-estadia-por-pessoa-estado-derivado.md)
  existe para evitar.
- **Supabase sem RLS, filtrando por `couple_id` no cliente.** Menos código e
  policies mais simples de escrever. E é o furo inteiro: a chave publishable
  vai no bundle por definição, então qualquer pessoa com o DevTools aberto lê
  a tabela completa. Para um acervo que é literalmente o diário de um casal,
  o custo do vazamento não é técnico.

## Consequências

### Positivas

- RLS é a única porta. Um `select` sem filtro devolve só o que é do casal, então
  esquecer o filtro no cliente deixa de ser uma falha de segurança.
- Fotos ganham lugar de verdade (Storage), com as mesmas policies por casal.
- Edge Functions cobrem o e-mail de convite e o agendado do aniversário, que
  não tinham como existir antes.
- `generate_typescript_types` dá tipos derivados do schema, então uma coluna
  renomeada quebra o `typecheck` em vez de quebrar em produção.
- Realtime está disponível quando a Fase 4 precisar, sem migration nem troca de
  cliente.
- Distâncias (`960 km` entre as cidades-casa, `1,2 km` até o Vicentina Aranha)
  passam a ser calculáveis no banco, perto dos dados.

### Negativas / trade-offs

- Dependência de um fornecedor para auth, storage, functions e banco de uma vez.
  Trocar depois não é trocar uma peça, são quatro.
- **Projeto no free tier pausa por inatividade.** Não é hipótese: os outros dois
  projetos desta mesma conta (`PlinAi`, `War Room`) estão `INACTIVE` agora. Um
  app que o casal abre em rajadas é candidato natural a isso, e o app volta
  quebrado sem nenhum erro nosso.
- **RLS mal escrita falha em silêncio**, e nas duas direções: permissiva demais
  não dá erro nenhum, e restritiva demais devolve lista vazia — que a UI mostra
  como "nada por aqui" em vez de "sem permissão". As policies precisam de teste
  explícito com as duas contas, e isso não existe hoje: o projeto não tem test
  runner (`DEVKIT_CMD_TEST` está vazio). Decidir o runner deixa de ser opcional
  nesta fase.
- Desenvolvimento local passa a exigir Supabase CLI e um stack rodando, ou
  trabalhar direto contra o projeto remoto. O `npm run dev` sozinho não basta
  mais.
- O app deixa de funcionar offline, coisa que `localStorage` dava de graça.

## Código / evidência

| Artefato | Caminho |
| -------- | ------- |
| Persistência atual, a ser substituída | `src/timeline/storage.ts` |
| Export manual que servia de "sync" | `src/timeline/exportStays.ts` |
| Projeto Supabase | ref `smdtcznadmnrdubeidyz` (região `sa-east-1`) |
| Schema novo | `supabase/migrations/` — não existe ainda |
| Spec da Fase 0 | `.agent/Tasks/` — não existe ainda |

## Related

- [0002 — Estadia por pessoa, estado do casal derivado](./0002-estadia-por-pessoa-estado-derivado.md)
- [0003 — Lista em tabela única, com CHECK por categoria](./0003-lista-tabela-unica-com-check-por-categoria.md)
- `.agent/System/project_architecture.md` — está desatualizado; atualizar na Fase 0
