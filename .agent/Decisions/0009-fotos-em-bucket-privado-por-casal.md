# ADR 0009 — Fotos de perfil em bucket privado, com leitura por casal

- **Status:** Proposed
- **Data:** 2026-09-26
- **Área:** Supabase Storage, autorização (Fase 2)

---

## Contexto

O perfil do onboarding tem _"Sua foto · Aparece no calendário e na lista"_. É o
primeiro arquivo que o produto guarda, e portanto a primeira autorização fora de
tabela: até aqui toda regra de acesso do projeto é policy de linha no Postgres
([0001](./0001-supabase-com-rls-por-casal.md)).

Fotos de pessoa são dado pessoal, e o produto agora é para outros casais. A foto
também nasce **antes** de o casal existir — no passo 1 do onboarding a pessoa
ainda não tem casal, às vezes nem perfil.

A Fase 0 tinha deixado `avatar_path` fora de `profiles` de propósito: "coluna
sem quem a escreva fica nula para sempre". Quem escreve é o onboarding.

## Decisão

**Bucket `avatars` privado; a pasta é o `auth.uid()` do dono; o dono escreve e
apaga só na própria pasta; lê o dono e quem divide casal com ele; a leitura é por
URL assinada.**

- Caminho `<auth.uid()>/<uuid aleatório>.webp`. O nome aleatório impede que o
  cache sirva a foto antiga depois de uma troca; trocar grava o novo
  `profiles.avatar_path` e só então apaga o objeto antigo.
- `insert`/`update`/`delete` em `storage.objects`: `(storage.foldername(name))[1]
  = auth.uid()::text`. Funciona antes de haver perfil ou casal.
- `select`: a própria pasta, ou uma pasta cujo dono está em
  `couple_members` de um casal em `private.my_couple_ids()` — a mesma função que
  corta as tabelas.
- O cliente reduz a imagem para 512×512 WebP antes de subir; o bucket recusa
  acima de 1 MB e fora de `image/webp`/`image/jpeg`.
- URL assinada com 1 hora de validade.

## Alternativas descartadas

- **Bucket público com nome imprevisível.** O mais simples, com URL permanente e
  CDN. Descartado porque "imprevisível" não é autorização: a URL de uma foto
  circula em log, histórico e captura de tela, e depois disso qualquer um a abre
  para sempre. Com casais que não conhecemos, não dá para prometer que a foto só
  aparece para o casal.
- **Pasta por casal (`<couple_id>/...`).** Encaixaria direto em
  `my_couple_ids()`. Não serve porque a foto nasce antes do casal: no passo 1 não
  há `couple_id`, e mover o objeto depois do aceite seria uma segunda escrita,
  com a sua própria falha.
- **Foto como `bytea` ou base64 em `profiles`.** Autorização de graça, pela
  policy da linha. Descartado: engorda toda leitura de perfil (inclusive a do
  portão, a cada carregamento), e o Postgres vira servidor de imagem.
- **Gravatar ou foto do provedor OAuth.** Zero armazenamento. Não existe para
  quem entra por senha, depende de terceiro e faz o navegador de cada visitante
  pedir a foto a outro domínio.
- **Transformação de imagem no servidor** (image transformation do Storage).
  Exige plano pago. Reduzir no cliente resolve o mesmo problema de graça.

## Consequências

### Positivas

- A foto segue a mesma fronteira de autorização das tabelas: quem divide casal
  vê, quem não divide não vê, e a regra mora numa policy, não no cliente.
- A mesma `my_couple_ids()` corta linha e arquivo. Não nasce uma segunda
  definição de "quem é do casal".
- Funciona antes de o casal existir, sem mover arquivo depois.

### Negativas / trade-offs

- **URL assinada expira.** Toda tela que mostra foto precisa gerá-la e renová-la,
  e uma aba aberta por mais de uma hora mostra foto quebrada até recarregar. É
  complexidade de cliente que o bucket público não teria.
- **Sem CDN efetiva:** a URL muda a cada assinatura, então o cache do navegador
  aproveita pouco. Com dois avatares por casal, é irrelevante; com a galeria de
  memórias das fases seguintes, pode não ser. Aquela fase decide de novo.
- **Primeira policy em `storage.objects`.** É outro lugar onde a autorização
  mora e onde uma regra errada vaza dado. Precisa de teste de integração próprio,
  com os dois casais, como as tabelas tiveram.
- **Objetos órfãos:** upload bem-sucedido seguido de falha ao gravar o perfil
  deixa arquivo sem dono no bucket. Aceitável e raro; a limpeza vai com o
  agendador.
- **A policy de leitura depende de `couple_members`.** Quando a Fase 3 permitir
  sair de um casal, a foto deixa de ser visível para o ex-parceiro na hora — o que
  é o certo, mas precisa estar no teste daquela fase.

## Código / evidência

| Artefato | Caminho |
| -------- | ------- |
| Spec da fase | [`../Tasks/fase-2-onboarding.md`](../Tasks/fase-2-onboarding.md), seção 5 (migration 5) e A16 |
| Função que corta tabela e arquivo | `private.my_couple_ids()`, em `supabase/migrations/20260925120400_harden_schemas.sql` |
| Prova da policy | `supabase/tests/storage.test.ts` — não existe ainda |

## Related

- [0001 — Supabase com RLS por casal](./0001-supabase-com-rls-por-casal.md)
- [0008 — Convite portador e um casal por pessoa](./0008-convite-portador-e-um-casal-por-pessoa.md) —
  `unique (profile_id)` é o que garante que "quem divide casal" é uma pessoa só
