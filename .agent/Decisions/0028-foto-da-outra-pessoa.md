# ADR 0028 — Cada um troca a foto da outra pessoa do casal

- **Status:** Accepted
- **Data:** 2026-10-10
- **Área:** Supabase Storage, autorização, Configurações (estende o 0009)

---

## Contexto

Nas Configurações, cada pessoa trocava só a própria foto (aba Meu perfil). O
pedido é poder trocar também a da outra pessoa, na aba Perfil do casal: é
comum um dos dois ter a foto boa do outro, e com o perfil provisório (ADR 0024)
a outra pessoa nem tem conta para subir a dela.

Duas travas impediam isso, e as duas existem por motivo:

- o bucket `avatars` só aceita escrita na pasta `<auth.uid()>/` (ADR 0009);
- `profiles_update_self` só deixa cada um atualizar o próprio perfil, e
  `profiles_avatar_in_own_folder` exige que `avatar_path` esteja na pasta do
  dono do perfil.

## Decisão

**A foto da outra pessoa sobe na pasta dela, e uma RPC grava o caminho.**

- Policy nova `avatars_insert_partner_folder`: `insert` em `avatars` numa pasta
  cujo dono está num casal de `private.my_couple_ids()`. Só `insert` — sem
  `update`/`delete` na pasta do outro. Com nome aleatório e `upsert: false`,
  ninguém sobrescreve nem apaga o arquivo da outra pessoa.
- RPC `set_partner_avatar(p_profile_id, p_path)`, `security definer`: confere
  que o perfil é do outro integrante do casal de quem chama (vale para o
  provisório), que o caminho está na pasta dele e que o objeto existe no
  bucket; só então grava `avatar_path`. Devolve `ok`, `not_member`,
  `not_partner` ou `invalid`.
- `profiles_update_self` e o `CHECK` da pasta não mudam: a foto continua
  morando na pasta de quem aparece nela.
- A própria foto segue pelo caminho de sempre. A interface usa o mesmo botão
  nos dois cartões (`src/settings/tabs/memberPhoto.tsx`).

## Alternativas descartadas

- **Abrir `profiles` para update pelo casal.** Uma policy de update por casal
  deixaria o outro mudar nome, cor e cidade-casa também — mais do que o pedido,
  e a cor tem trava própria (`profiles_color_distinct`).
- **Subir na pasta de quem troca e apontar o perfil do outro para ela.** Exigiria
  derrubar `profiles_avatar_in_own_folder`, e a foto de uma pessoa passaria a
  depender da conta da outra: se quem subiu sair do espaço ou apagar a conta, a
  foto some de quem ficou.

## Consequências

### Positivas

- Funciona para quem tem conta e para o perfil provisório, sem mexer no aceite.
- A regra de "quem é do casal" segue sendo a mesma `my_couple_ids()`.

### Negativas / trade-offs

- **Uma pessoa troca a foto da outra sem consentimento.** Para um casal que
  divide o acervo inteiro, é o comportamento esperado; não há aviso à outra
  pessoa (os avisos estão no fim do roadmap).
- A foto antiga fica no bucket, como já acontecia com a troca da própria.
- Mais uma policy de escrita em `storage.objects`, coberta em
  `supabase/tests/storage.test.ts`.
