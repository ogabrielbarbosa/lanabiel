# ADR 0011 — Preferências em três escopos: casal, pessoa e aparelho

- **Status:** Proposed
- **Data:** 2026-09-26
- **Área:** schema (preferências), Configurações (Fase 3)

---

## Contexto

As Configurações têm nove abas no Pencil, e seis delas guardam preferências de
telas que ainda não existem: a visão padrão do Calendário (Fase 5), as
categorias visíveis da Lista (Fase 4), o contador na Home (Fase 7), os canais
de aviso (fim do roadmap). No brainstorm da Fase 3 o Gabriel decidiu:
**contrato agora, efeito depois**. A Fase 3 grava; cada fase lê a coluna dela e
a refina se precisar.

O design mistura, sem dizer, três donos diferentes. "Cores das faixas" vale para
os dois (é o mesmo calendário). "Notificações" é de cada um: a Lana quer push,
o Gabriel não. E "Tema" diz no próprio frame: _"Vale só pra este aparelho"_.
Guardar preferência de pessoa numa tabela do casal faria a escolha de um
sobrescrever a do outro, sem erro.

## Decisão

- **Casal → `couple_settings`**, uma linha por casal, `couple_id` como chave.
  Os dois editam; RLS por `private.my_couple_ids()`.
- **Pessoa → `profile_settings`**, uma linha por perfil. Só a própria pessoa lê
  e edita (`profile_id = auth.uid()`); o envio futuro lê no servidor. O que é
  identidade (nome, cor, cidade, foto) continua em `profiles`.
- **Aparelho → `localStorage`** (`lanabiel:appearance`): tema, densidade,
  reduzir animações. Nunca o banco.
- **Colunas tipadas com `CHECK`, não JSONB.** Os padrões moram no `default` de
  cada coluna — e só lá: o cliente não tem segunda tabela de padrões. As linhas
  nascem por trigger `after insert` em `couples` e `profiles`; linha ausente é
  erro, não "use o padrão".
- As listas dos `CHECK` (paletas, categorias) são as mesmas de
  `src/domain/settings.ts`, e um teste de banco prova a paridade.
- Avisos: 18 colunas `notify_<evento>_<canal>` em vez de uma tabela
  (perfil, evento, canal).

## Alternativas descartadas

- **Uma coluna JSONB de preferências por casal/pessoa.** Fase futura mudaria o
  formato sem migration — que é justamente o problema: sem `CHECK`, sem tipo
  gerado, e o padrão passa a morar no cliente. Uma chave renomeada num lado vira
  preferência perdida em silêncio.
- **Colunas direto em `couples` e `profiles`.** Menos uma tabela, mas `couples`
  é identidade e acesso (nome, data, convite); misturar quinze colunas de
  preferência nela deixa a policy de update de `couples` responsável por coisas
  que não têm a ver com o casal existir.
- **Tabela normalizada `notification_preferences (perfil, evento, canal)`.** O
  padrão de cada combinação teria de morar num seed ou no cliente, e ausência
  de linha voltaria a significar "padrão". Com colunas, o `default` é a
  documentação.
- **Tema no banco, por pessoa.** O frame diz "por aparelho", e é o que se espera
  de um celular escuro e um notebook claro da mesma pessoa.

## Consequências

### Positivas

- Cada preferência tem um dono e um lugar. As Fases 4–7 leem colunas que já
  existem, com nome e tipo gerados.
- Mudança de formato quebra o `typecheck` no lugar certo.
- Valores fora da paleta ou chaves de categoria inventadas não entram, venham
  do app ou do painel.

### Negativas / trade-offs

- Preferência nova é migration. Numa tabela de dois usuários isso é barato, e
  foi aceito no brainstorm.
- `profile_settings` tem 18 colunas de aviso — largo, e cresce três por evento.
- Tema não acompanha a pessoa entre aparelhos.
- As listas dos `CHECK` existem em dois lugares (SQL e TS); o teste de paridade
  é o que impede a divergência.

## Código / evidência

| Artefato | Caminho |
| -------- | ------- |
| Migration | `supabase/migrations/20260926130000_settings.sql` |
| Contrato | `src/domain/settings.ts` |
| Fronteira | `src/data/settings.ts` |
| Aparelho | `src/app/appearance.ts` |
| Paridade e RLS | `supabase/tests/settings.test.ts` (A1, A3, A4) |

## Related

- [0001 — Supabase com RLS por casal](./0001-supabase-com-rls-por-casal.md)
- [0003 — Lista em tabela única](./0003-lista-tabela-unica-com-check-por-categoria.md) — as chaves de categoria
- Spec: [`../Tasks/fase-3-configuracoes.md`](../Tasks/fase-3-configuracoes.md)
