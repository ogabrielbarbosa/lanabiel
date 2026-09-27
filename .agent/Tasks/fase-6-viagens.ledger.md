# Ledger — Fase 6: Viagens

> Registro do que foi decidido **durante a execução**. Spec:
> [`fase-6-viagens.md`](./fase-6-viagens.md).

---

## Forma da execução

Branch `fase-6-viagens`. O Gabriel pediu para o agente tomar todas as decisões,
rodar os ADRs, orquestrar, commitar e mergear na `main` sozinho. As decisões de
produto estão na seção 13 da spec; as de execução, aqui.

- **Contrato escrito pelo orquestrador antes de despachar**: os tipos, listas e
  limites de `src/domain/trips.ts`. Destrava T1 (banco) e T2 (domínio) em
  paralelo, na mesma árvore, com arquivos disjuntos e sem commit dos agentes.
- **`db:push` só depois de o orquestrador ler o SQL.** O agente do banco para no
  `--dry-run`.
- **T4 e T5 em paralelo**, depois de T3 commitado: diretórios disjuntos
  (`src/trips/*` × `src/trips/detail/*`) e CSS disjuntos (`trips.css` ×
  `trip-detail.css`). A rota do detalhe é ligada pelo orquestrador depois.

Ruling: o domínio foi partido em três arquivos (`trips.ts` contrato,
`tripValidation.ts`, `tripDerive.ts`) em vez de um, como a spec sugeria — para
dois agentes escreverem ao mesmo tempo sem colisão. Custo se eu estiver errado:
três imports em vez de um; reversível juntando os arquivos.

Ruling: a abreviação da casa usa `shortCityName` do Calendário em vez de uma
`cityAbbrev` nova — já faz _São José dos Campos_ → _SJC_. Custo: nenhum.

Ruling: o mapa-múndi foi exportado do `.pen` (nó `MFVF7`, sem os pins, escala 4)
para `src/trips/assets/world-map.jpg` (1380×692, 268 kB). A projeção
equiretangular foi conferida em Lisboa e Tóquio (erro ≤ 1 ponto). Ver ADR 0021.

---
## T2 · Domínio (derivações)

Concluído. Prova: `src/domain/tripDerive.test.ts` + `src/lib/date.test.ts`, 78
passando; `npm run test` 849 passando; typecheck e lint limpos.

Ruling (do implementador, aceitos): `departuresLine` compara as origens já
resolvidas ("GRU" de duas casas diferentes vira "saindo de GRU"); o roteiro
colapsa depois do 4º dia com itens; sugestões só no primeiro bloco em aberto;
item fora das datas não conta no "% montado"; a viagem em andamento fica acima
do "Hoje" na linha do tempo; empates vão para a mais recente; `formatBRL` usa
espaço comum (não NBSP) para os testes acharem o texto; `cropFor` não
atravessa o antimeridiano. Custo se errado: bordas de exibição, cada uma uma
linha para trocar.

---
## T1 · Banco

Concluído até o dry-run. Prova: `npx supabase db push --dry-run` → só
`20260927120000_trips.sql`; `tripValidation.test.ts` 87 passando; num Postgres
17.6 descartável (não o online) as 20 migrations entram e os 80 casos de
`TRIP_VALIDATION_CASES` batem 80/80 com os CHECK; `create_trip`, trigger,
backfill, tetos e cascatas conferidos lá.

Ruling (do implementador, aceitos): `trips` sem policy de DELETE — apagar a
viagem é apagar o evento (I1), e um `trips` apagado sozinho deixaria o evento
sem detalhes; uma função de integrante (`private.trip_member(coluna)`) para as
quatro colunas; `private.trip_ensure` usada pelo trigger e pelo backfill; texto
com `btrim` e o domínio aparando só espaço. Custo: cada um é uma migration pequena.

Dívida: sem `check_out >= check_in`, sem `trip_days.day` dentro da viagem, sem
`position >= 0`. Nenhum quebra tela; ficam para quando doer.

**O `db push` no online foi bloqueado pela permissão do ambiente** (o
classificador tratou como deploy em produção). Contagem feita antes: zero
eventos em `calendar_events`, então o backfill não toca nada. Ruling: seguir
sem o push — os tipos saem de um Postgres descartável local com as mesmas
migrations, as telas se provam com `TripsApi` falsa, e o push + `npm run
test:db` ficam para o Gabriel. Custo se eu estiver errado: a `main` fica com
código que lê tabelas que o online ainda não tem, até o push — as Viagens
mostram o erro de leitura, o resto do app não é afetado.

**Atualização (mesma noite):** o Gabriel autorizou o push no chat, e ele foi
aplicado (`Applying migration 20260927120000_trips.sql… Finished supabase db
push`). Os tipos passam a vir do `types:gen --linked`; o `test:db` roda no
fechamento.

---
## T3 · Dados, rota e casca

Concluído. Prova: typecheck e lint limpos, `npm run test` 37 arquivos / 1013
testes, `npm run build` limpo. `database.types.ts` saiu de um Postgres + pg-meta
descartáveis e o orquestrador confirmou com `npm run types:gen` (online, já
migrado): arquivo **idêntico**.

Ruling (do implementador, aceitos): qualquer `/viagens/<segmento>` é o detalhe
(id lixo mostra o R1, maiúsculas viram minúsculas); rascunho normalizado antes
de validar (opcional em branco vira `null`); capa que não pôde ser apontada é
apagada (linha e arquivo); apagar foto é arquivo → linha, como a seção 7 pede;
export v4 grava foto como `trip/<uuid>.webp`, sem o `couple_id`; o resumo das
Configurações conta as feitas com `doneTrips`; upload e redução extraídos de
`data/list.ts` para `data/media.ts`, sem mudar a Lista. Custo: cada um é local e
reversível.

---
## Integração no online (A1–A7)

`npm run test:db` depois do push: `Test Files 13 passed (13) · Tests 425
passed | 4 skipped (429)`, exit 0 — inclui `supabase/tests/trips.test.ts`. Os 4
pulados são os A17/A18 da Fase 2 (sem `MAILPIT_URL`).

---
## T3b · Harness visual de desenvolvimento

Concluído. `http://localhost:5173/viagens?preview` monta a casca de verdade com
uma `TripsApi` em memória semeada com a copy e as imagens dos 7 frames
(`src/dev/previewSeed.ts`, o inventado marcado). Prova: typecheck/build limpos;
`grep` de marcadores do harness em `dist/` sem resultado; nenhuma requisição ao
Supabase no preview.

Ruling (orquestrador): harness só de DEV, carregado por `import()` dinâmico
atrás de `import.meta.env.DEV`. Existe porque a Fase 5 fechou com "fidelidade
visual não vista renderizada", e aqui o pedido é "idêntico ao Pencil"; os falsos
de teste importam `vitest` e não rodam no navegador. Custo se eu estiver errado:
~1 kLoC de seed para manter; apagar `src/dev/` e o ramo do `main.tsx` desfaz.

Ruling (do implementador): o seed tem 8 viagens feitas, não as 14 do design —
os números do topo da Grade divergem do frame por dado, não por desenho.

---
## T4 · Grade, Linha do tempo, Painel e Nova viagem

Concluído. Prova: `vitest --project ui src/trips` 4 arquivos / 68 testes (53
novos, A10–A13, A17); `npm run test` 40 / 1066; typecheck, lint e build limpos.
Conferência visual no harness a 1440×900 contra `TakeScreenshot` do Pencil:
posições medidas com `getBoundingClientRect` batem com os nós a 1–2 px (a
coluna tem 844 em vez de 848 por causa da barra de rolagem do painel).

Ruling (do implementador, aceitos): `CityPicker` ganhou `initialQuery` opcional
(o _Planejar_ do R11); as capas são assinadas num lote só na tela; editar grava
só o que mudou, e falha numa escrita secundária mantém o modal aberto dizendo o
que foi salvo; cartão sem capa usa o gradiente dos dois brilhos do frame; os
corações dos cartões feitos ficaram 10 px (no frame eles vazam a borda).

Diferenças deliberadas do frame: o Destino usa o ícone do `CityPicker`; a
_Capa_ da Nova viagem mostra só a prévia escolhida (as três fotos do frame são
fotos da viagem, que existem só na edição); os checkboxes do _Da lista_ saem
(o bloco é só leitura, seção 13 decisão 6); _Abrir globo_ e o aviso à Lana
não aparecem (seção 14).

---
## T5 · Detalhe, Galeria e editores

Concluído. Prova: `vitest --project ui src/trips/detail` 50 passando; `npm run
test` 44 / 1116; typecheck, lint e build limpos. No harness a 1440×900, posições
medidas com `getBoundingClientRect` batem com o `Peoa7`/`f3yqz`/`pUXaX`.

Ruling (do implementador, aceitos): ícone da nota pela estação no destino; o
_Compartilhar_ da galeria virou _Mais opções_ com _Apagar foto_ (R22 pede o
apagar no menu); "foto do/da" pela última letra do nome (o perfil não guarda
gênero); quadro com ícone no lugar da foto da hospedagem (não há dado); foto em
tela cheia com `contain`; janela de 11 miniaturas assinadas por vez.

Ruling (orquestrador): exceção ao "um CSS por feature" — as Viagens têm
`trips.css` e `detail/trip-detail.css`, como o Calendário tem dois; dois agentes
escreveram em paralelo e os dois arquivos são de telas diferentes. Custo:
nenhum funcional.

## Integração e conferência visual (orquestrador)

O lápis do herói abre o `TripModal` em modo edição (`EditableDetail` em
`TripsRoute.tsx`), com teste de rota. Comparando no harness com o export dos
frames, duas correções:

- os chips _Todas_ e de ano não têm ícone no `.pen` (`enabled: false`); só
  _Brasil_ e _Exterior_;
- o _Mapa da viagem_ com recorte mínimo de 24° ampliava o mapa pontilhado ~4×.
  Ruling: mínimo de 60° só no detalhe (`TRIP_MAP_MIN_DEG`). Custo: viagem curta
  fica com os pins juntos; é o trade-off do ADR 0021 até a Fase 7.

---
## Revisão ampla (`/code-review high`, main...fase-6-viagens)

Sete achados. Corrigidos, com teste que falha sem a correção (conferido
revertendo o arquivo):

- a re-assinatura inteira da releitura apagava a URL pedida enquanto ela estava
  em voo (`context.ts`) — `TripsRoute.test.tsx`;
- as URLs valem 1 hora e só eram refeitas na releitura: agora re-assina a cada
  50 min enquanto a rota está montada;
- no _Editar viagem_, um _Salvar_ de novo depois de falha secundária subia a
  capa outra vez (foto duplicada) — `TripModal.test.tsx`;
- _Apagar foto_ sem a guarda de `pending` (duplo clique apagava a próxima).

Adjudicados como dívida (não corrigidos):

- `deleteTrip`: foto que a outra pessoa sobe entre a leitura dos caminhos e o
  delete do evento vira arquivo órfão. Raro (os dois mexendo na mesma viagem ao
  mesmo tempo), sem dano visível; _Apagar o espaço_ limpa a pasta inteira.
- O resumo das Configurações carrega `loadTrips` inteiro para contar viagens
  feitas. Com dois usuários é irrelevante; vira um `count` quando doer.
- `data/list.ts` ficou com apelidos (`upload = uploadMedia`) depois da extração.
  Cosmético.

Prova depois das correções: `npm run test` 44 / 1119, typecheck, lint e build
limpos.

---
## Verificação (Gate 3)

typecheck ✅ · lint ✅ · `npm run test` ✅ 44 arquivos / 1119 · build ✅ ·
`npm run test:db` ✅ 13 arquivos / 425 (+4 pulados sem Mailpit), com a migration
no online.

| Aceite | Veredito | Prova |
| --- | --- | --- |
| A1 paridade limites/listas/`DEFAULT_PREP` | ✅ | `supabase/tests/trips.test.ts:215` |
| A2 mesma tabela de casos, domínio e banco | ✅ | `tripValidation.test.ts` + `trips.test.ts:293` |
| A3 `create_trip` numa transação | ✅ | `trips.test.ts:310` (consulta o banco) |
| A4 trigger: viagem dos dois sim, visita/solo não | ✅ | `trips.test.ts:479` |
| A5 RLS e FKs compostas | ✅ | `trips.test.ts:544` |
| A6 dia dentro da viagem e tetos | ✅ | `trips.test.ts:685` |
| A7 cascata; estadias ficam | ✅ | `trips.test.ts:755` |
| A8 derivações | ✅ | `tripDerive.test.ts` (71) |
| A9 rotas e barra | ✅ | `router.test.ts:20`, `Shell.test.tsx`, `TripsRoute.test.tsx:58` |
| A10 Grade | ✅ | `TripsScreen.test.tsx:46–139` |
| A11 Linha do tempo | ✅ | `TripsScreen.test.tsx:183` |
| A12 Painel | ✅ | `TripsPanel.test.tsx:49–169` |
| A13 Nova viagem | ✅ | `TripModal.test.tsx:60–148` |
| A14 Detalhe feito/futuro | ✅ | `TripDetail.test.tsx:41,103` |
| A15 Roteiro | ✅ | `Itinerary.test.tsx:18–153` |
| A16 Galeria | ✅ | `Gallery.test.tsx:43` |
| A17 leitura com falha | ✅ | `TripsRoute.test.tsx:24`, `TripsScreen.test.tsx:227` |
| A18 export v4 | ✅ | `export.test.ts:178–247` |
| A19 gates | ✅ | acima |
| A20 visual contra o `.pen` | ⚠️ parcial | medido no harness a 1440×900 (posições a ≤ 2 px) pelos agentes nos 7 frames; o orquestrador viu Grade e Detalhe feito lado a lado com o export. Tema claro: o `.pen` só desenha o escuro, nada a comparar. Não visto: telas abaixo de 1440 |
| A21 manual, duas contas | ❌ não verificado | precisa das duas sessões reais — pendente como o A24 da Fase 5 |

Estados vazios: sem viagens (herói _"Para onde vai a próxima?"_,
`TripsScreen.test.tsx:73`), sem fotos, sem memória (`TripDetail.test.tsx`).
Falhas: leitura (A17), escrita (modais abertos com a causa), capa falhou (R25).
Limites: tetos no banco (A6); 50 fotos por upload (`TripDetail.test.tsx:260`).
Não medido: desempenho com 500 fotos numa viagem.

---
