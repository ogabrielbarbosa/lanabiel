# ADR 0012 — Mídia do casal em bucket próprio, com pasta por casal

- **Status:** Proposed
- **Data:** 2026-09-26
- **Área:** Storage, autorização (Fase 3; Fases 4 e 6 reutilizam)

---

## Contexto

O [0009](./0009-fotos-em-bucket-privado-por-casal.md) pôs as fotos de perfil em
`avatars/<auth.uid()>/…`: a foto nasce no passo 1 do onboarding, antes do
casal, e a leitura por casal é resolvida pela policy.

A Fase 3 traz a primeira foto que é **do casal**, não de uma pessoa: a capa
("Trocar fotos", "Usar foto do casal na capa"). As Fases 4 e 6 trazem mais — até
10 fotos por memória, a galeria de cada viagem. O design da Zona sensível diz o
que acontece quando alguém sai: _"O acervo inteiro — … e fotos — fica com a
Lana"_. Uma foto guardada na pasta de quem a subiu some para a outra pessoa no
dia em que essa sai do casal, porque a leitura depende de dividir casal.

## Decisão

- Bucket privado **`couple-media`**, caminho `<couple_id>/<tipo>/<uuid>.<ext>`.
  Nesta fase só `tipo = cover`; `memory` e `trip` são das Fases 4 e 6.
  _(2026-09-26, Fase 4: entra também `item`, a foto de capa de cada item da
  Lista — ver [`fase-4-lista.md`](../Tasks/fase-4-lista.md). Mesmas policies,
  nada novo no Storage.)_
- Policies de select/insert/update/delete em `storage.objects` quando a primeira
  pasta ∈ `private.my_couple_ids()` — a mesma função que corta as tabelas.
- `couples.cover_path` com `CHECK` de que aponta para `<id>/cover/…`.
- Apagar o espaço apaga a pasta **pelo cliente, antes** da RPC: o Storage recusa
  delete direto em `storage.objects`, e depois da RPC a pessoa já não é membro.
- `avatars` continua como está: foto de perfil é da pessoa e fica com ela.

## Alternativas descartadas

- **Mesma pasta do `avatars`, por uid de quem subiu.** Quebra o "acervo fica com
  quem fica".
- **Mesmo bucket `avatars`, com uma segunda regra de pasta.** Funciona, mas
  mistura limites diferentes (1 MB por avatar, 5 MB por foto do casal) e duas
  semânticas de dono no mesmo lugar.
- **Apagar os arquivos por trigger ou dentro de `delete_couple`.** O Storage não
  deixa apagar por SQL; exigiria edge function com `service_role` só para isso.

## Consequências

### Positivas

- Sair do casal não leva as fotos do casal embora.
- Fases 4 e 6 herdam bucket, caminho e policy prontos.
- Uma só definição de "quem é do casal" para tabela e arquivo.

### Negativas / trade-offs

- Apagar o espaço tem dois passos que não são uma transação: se a RPC falhar
  depois de a pasta sair, o casal perdeu só a capa. A tela diz isso.
- Capa trocada cujo arquivo antigo não saiu fica órfã (limpeza vai com o
  agendador).
- O Storage vai migrar para R2 ou S3 (decisão do Gabriel, 2026-09-26). O que
  sobrevive à troca é o caminho `<couple_id>/<tipo>/<uuid>` e a regra de que só
  `src/data/` toca em arquivo; as policies viram outra coisa.

## Código / evidência

| Artefato | Caminho |
| -------- | ------- |
| Migration | `supabase/migrations/20260926130200_couple_media.sql` |
| Fronteira | `src/data/settings.ts` (`replaceCover`, `deleteCouple`, `loadPhotoStats`) |
| Teste | `supabase/tests/storage.test.ts` (A6) |

## Related

- [0009 — Fotos em bucket privado por casal](./0009-fotos-em-bucket-privado-por-casal.md)
- Spec: [`../Tasks/fase-3-configuracoes.md`](../Tasks/fase-3-configuracoes.md)
