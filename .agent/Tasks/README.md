# Roadmap — as oito fases

Índice de `.agent/Tasks/`. Uma spec por fase, na ordem abaixo. A ordem não é
gosto: ela segue dependência de dados, e está justificada em cada linha.

| # | Fase | Frames no Pencil | Status |
| --- | --- | --- | --- |
| 0 | [Fundação](./fase-0-fundacao.md) | — | 🟢 Done (2026-09-25) |
| 1 | [Login](./fase-1-login.md) | 2 | 🟡 Reviewed (2026-09-26) |
| 2 | [Onboarding](./fase-2-onboarding.md) | 6 frames / 23 telas | 🟡 Implementada e na `main` (2026-09-26) — A29/A30 adiados, ver abaixo |
| 3 | [Configurações](./fase-3-configuracoes.md) | 9 abas | 🟡 Implementada (2026-09-26) — A24 manual pendente, contraste como dívida |
| 4 | [Lista](./fase-4-lista.md) | 14 (8 modais) | 🟡 Implementada e na `main` (2026-09-26) — A21 manual pendente |
| 5 | [Calendário](./fase-5-calendario.md) | 5 | 🟡 Reviewed (2026-09-26) — spec pronta, build não começou |
| 6 | Viagens | 7 | 🔴 sem spec |
| 7 | Home (globo) | 5 | 🔴 sem spec |

---

## Onde estão as informações

### O design

O arquivo é `~/.pencil/documents/6b52fae9-2ad1-40df-9cbc-425f5b02100c/pencil-new.pen`
e **só se lê pelo MCP do Pencil** — nunca com `Read` ou `grep`, porque é
encriptado. Há também um export JSON na raiz do repo (`lanabiel`, sem extensão),
que é a mesma coisa em formato legível.

Para extrair a copy de um frame, esta chamada funciona (o `resolveInstances` é
obrigatório: sem ele os nós de instância chegam ao visitante como `undefined` e o
`Get` estoura):

```js
Get("<frameId>", (n) => n && n.type === "text" && n.content ? n.content : undefined,
    {resolveInstances: true})
```

Para ver a estrutura em vez da copy, troque o visitante por um que devolva
`n.type + ":" + n.name` e limite a profundidade com o `ctx`.

Os frames com dimensão `?x?` **não são mobile** — são o painel direito em scroll
completo, ou containers de fluxo com as telas dentro de um filho chamado
`Screens`. O design é todo 1440x900.

### As decisões já tomadas

`.agent/Decisions/` — três ADRs, todos `Proposed` (viram `Accepted` quando a fase
que os implementa fechar):

- [0001](../Decisions/0001-supabase-com-rls-por-casal.md) — Supabase com RLS por
  casal. Amarra **todas** as fases: nenhuma query no cliente filtra por
  `couple_id`.
- [0002](../Decisions/0002-estadia-por-pessoa-estado-derivado.md) — estadia por
  pessoa, estado do casal derivado. Amarra 3, 4, 5 e 7.
- [0003](../Decisions/0003-lista-tabela-unica-com-check-por-categoria.md) —
  `list_items` em tabela larga com `CHECK` por categoria. Amarra a 4, e a forma
  já está travada, então não se re-discute.

O **backlog** no fim de [`../Decisions/README.md`](../Decisions/README.md) tem
cinco itens adiados, cada um com a fase em que o ADR sai. Ler antes de propor
mudança estrutural: propor o que já foi rejeitado desperdiça a rodada.

### O que já existe de código e schema

- `supabase/migrations/` — as cinco migrations da Fase 0, append-only.
- `src/lib/database.types.ts` — gerado do schema. É o contrato: se a spec fala de
  uma coluna, ela está aqui ou não existe.
- `supabase/baseline/README.md` — o schema anterior, o que se aproveitou e o que
  se descartou. **`join_couple(code)` de lá é o ponto de partida da Fase 2**, não
  folha em branco.
- `.agent/System/project_architecture.md` — estrutura, fronteiras, fluxo de dados.
- `.agent/SOP/falhas-silenciosas.md` — quatro falhas desta stack que não dão erro
  de compilação. Toda spec deve olhar se a feature dela toca alguma.

### Como escrever a spec

Template em `../templates/spec-template.md`; o procedimento em `/spec`. A
**Fase 0 serve de exemplo trabalhado**: [`fase-0-fundacao.md`](./fase-0-fundacao.md)
com as 14 seções preenchidas, e [o ledger](./fase-0-fundacao.ledger.md) com os
rulings de execução. O critério de pronto é um só: um agente novo implementa sem
perguntar nada de produto nem de técnica.

---

## Fase 1 — Login

**Frames:** `Login [LMpij]`, `Escolha [UEca1]` — uma tela cada.

**Por que aqui:** sem sessão não há RLS para exercitar, e a Fase 0 deixou um
helper de sessão só para teste que precisa sair.

**O que a Fase 0 já resolveu:** auth do Supabase configurada, RLS provada com
três usuários reais em `supabase/tests/rls.test.ts`. Não há tabela nova.

**Decisões que a spec tem de tomar:**
- **O perfil não pode nascer por trigger.** O schema anterior tinha
  `handle_new_user` criando o `profile` no cadastro; impossível agora, porque
  `profiles.home_city_id` é `NOT NULL` e um trigger não tem cidade para pôr. Quem
  sabe a cidade é o onboarding. Então: o que acontece quando alguém se autentica e
  ainda não tem perfil? Essa é a ponte para a Fase 2 e precisa de resposta aqui.
- Persistência de sessão, expiração, e o que a tela mostra quando a sessão morre
  no meio do uso — lembrando que RLS devolve **lista vazia, não erro**.

**Pendência externa:** `auth_leaked_password_protection` está desligado no
projeto. É o único aviso de segurança que sobrou e é toggle no painel
(Authentication), não SQL.

---

## Fase 2 — Onboarding

> **Estado (2026-09-26):** implementada, verificada e mergeada (PR #1). Falta
> só o que depende de serviço externo: **A29** (e-mail real pelo Resend) e
> **A30** (Google no celular). Decidido: ficam para o fim do roadmap, junto com
> os **avisos ao outro** e o **agendador** — que a Fase 2 deixou fora de escopo.

**Frames (23 telas, as internas ficam num filho `Screens`):**
`Cenário 1 — Criar o espaço [rjqp1]` (5) · `Cenário 2 — Convidado pelo link do
e-mail [JYDLA]` (5) · `Cenário 3 — Convidado digitando o código [Sa41c]` (4) ·
`Estados e erros [S6AT2]` (5: código inválido, expirado, convite já usado,
enviando, reenvio confirmado) · `E-mail de convite [YinSr]` (2: desktop e
celular) · `Home pós-onboarding [pVDY4]` (2: vista do Gabriel e vista da Lana).

**Por que aqui:** é o que cria casal, perfis e **cidades-casa** — e a derivação
do ADR 0002 não funciona sem cidade-casa.

**O que já existe:** `couples.invite_code` com `unique`; o limite de dois
integrantes já é cobrado pelo schema (`couple_members.slot`, `check (slot in
(1,2))` + `unique (couple_id, slot)`), então a RPC não precisa contar.

**Decisões que a spec tem de tomar:**
- **Formato do código de convite.** O design mostra 6 dígitos; o schema antigo
  gerava 8 hex (`substr(md5(random()::text),1,8)`).
- **A busca por código é RPC `security definer`, nunca policy.** Nenhuma policy
  expõe `couples` por `invite_code` — é o único segredo do schema. `join_couple`
  do baseline é o modelo.
- **Nome completo vs. `display_name`.** O schema tem **um** campo. A tela
  "Confirmar dados do casal" do Cenário 2 mostra "Lana Martins", nome completo.
  Ou o campo vira nome de exibição e o sobrenome sai, ou entra um segundo campo.
- **Notificação de aniversário.** Descoberta num toggle das Configurações —
  *"Lembrar do aniversário de namoro · Todo dia 17, às 9h, pros dois"*. É
  agendado no servidor: `pg_cron` ou edge function agendada. Não aparece em tela
  nenhuma como fluxo.

**ADRs que saem nesta fase:** envio de e-mail (Resend + edge function, já
escolhido) e o agendador. Os dois estão no backlog.

**Pendência sua:** domínio verificado para o remetente do Resend. Sem ele o free
tier só entrega no seu próprio e-mail, e o convite vai para o da Lana.

---

## Fase 3 — Configurações

**Frames:** `Configurações — Perfil do casal [MzQxz]` — e aqui está o buraco.

**O menu tem 8 abas e só uma está desenhada.** As outras sete — Meu perfil,
Cidades, Calendário, Lista, Notificações, Aparência, Dados e privacidade (mais
uma "Zona sensível") — existem como item de menu e nada mais. Como não vamos
desenhá-las, **a spec desta fase é a única que define comportamento sem design**.
Duas saídas honestas, e a spec tem de escolher explicitamente:

1. Especificar as sete em prosa, aceitando que o visual sai do que já existe de
   componentes (`Settings Item`, `Toggle On/Off`, `Form Field`, `Segment Item`).
2. Entregar só "Perfil do casal" + "Cidades" e empurrar as outras seis para
   depois da Fase 7 — mas **"Cidades" não pode esperar**, porque guarda as
   cidades-casa de que a derivação depende.

**O que o frame desenhado já define:** nome do casal (opcional), começo do
namoro (17 set 2024), três toggles (lembrar aniversário, mostrar contador na
Home, usar foto do casal na capa), trocar fotos, as duas cidades-casa, e um
resumo (86 itens, 14 viagens, 104 dias juntos em 2026).

**Decisão que a spec tem de tomar:** o design mostra **"Distância entre as
cidades · 960 km"**. Linha reta entre São José dos Campos e Marau dá **861 km**
(medido). Ou o número é rodoviário — e aí precisa de API de rotas, dependência
nova — ou é estimativa. `cities` já tem lat/lng, então as duas saídas cabem sem
mudar schema.

**Schema novo:** colunas em `couples` para os três toggles e a foto de capa.

---

## Fase 4 — Lista

**Frames:** `Lista — Todos [B3rwp]` · `Filtro sem resultados [DXg1A]` ·
`Detalhe do item (feito) [RWegR]` · `Modal Adicionar (Restaurante) [RvlR2]` ·
`Modal Adicionar (Série) [i160RR]` · `Modal Marcar como feito [x4sciG]` ·
`Painel scroll completo [ltlFV]` · os outros seis modais de adicionar (abaixo).

**Por que antes do Calendário:** o modal "Novo evento" tem um campo **"Vínculo
com a lista"**, então o Calendário precisa que os itens existam.

**O que o ADR 0003 já travou:** `list_items` em tabela única, campos comuns +
7 colunas geográficas + 2 de mídia, todas anuláveis, com `CHECK` por categoria.
São **8 categorias mas só 2 formatos**: seis geográficas (País, Cidade,
Restaurante, Parque, Comida, Experiência) e duas de mídia (Filme, Série, com
`plataforma` e — só a série — `temporadas`). O design é explícito: *"Filmes e
séries não viram pin no globo"*.

**O que o design já define, e que a spec não precisa inventar:**
- **A memória é uma por pessoa**, não uma por item. O detalhe do Mocotó mostra as
  duas entradas lado a lado, e o modal confirma: *"Gabriel escrevendo · a Lana
  pode completar"*. Tabela própria.
- **A nota de corações é uma só, do casal** (*"Quanto vocês amaram? 4 de 5"*), e
  fica no item.
- **`note` e memória são coisas diferentes.** `note` é o lembrete de antes de ir
  (*"Pedir o risoto de cogumelos"*); a memória é o que ficou depois. O design
  mostra as duas no mesmo cartão.
- Até **10 fotos** por marcação de feito, "quem estava" (ele / ela / os dois), e
  progresso derivado (31 de 86, 36%, quebrado por categoria).
- O painel lê o **período derivado**: *"Perto de vocês · 12 itens da lista na
  cidade · do calendário"*, com distâncias, e a sugestão do dia muda de lugar
  para série quando vocês estão separados.

**Os 8 modais de adicionar estão desenhados** (conferido no `.pen` em
2026-09-26 — esta seção dizia "2 de 8"): além dos dois acima, País `PmKZ4`,
Cidade `cX0DT`, Parque `UaQ1K`, Comida `e3jts`, Experiência `wBKDf` e Filme
`NuAJ6`. Eles revelaram campos que o ADR 0003 não previa (cidades de interesse
do país, região da cidade, _onde comer_ da comida) e uma busca de
estabelecimento com endereço, no mundo todo — ver a spec
[`fase-4-lista.md`](./fase-4-lista.md).

**Schema novo:** `list_items`, `memories`, fotos, e o bucket de Storage.

**ADR desta fase:** realtime (backlog) — se a escrita de um aparece na tela do
outro sem recarregar.

---

## Fase 5 — Calendário

**Frames:** `Calendário — Mês [D1Zny4]` · `Ano [XEnYP]` · `Painel scroll
completo [n2aVYz]` · `Modal Novo evento (Visita) [BOR8L]` · `Modal Novo
período [DLeES]`.

**É a fase que mais depende do ADR 0002**, e a que mais tem trabalho escondido:

- **O campo `Estado` do modal "Novo período" é atalho de entrada, não coluna.**
  Escolher `Juntos em Marau` grava **duas** estadias numa transação. `Separados`
  precisa de duas cidades, e o design mostra `Cidade` no singular — o default é a
  casa de cada um.
- **Arrastar a faixa `Juntos em SJC` edita duas estadias de uma vez.** O
  `useBarDrag.ts` de hoje move uma; é reescrita, não ajuste.
- **`unknown` não existe no design.** Dia sem estadia registrada precisa de
  tratamento visual que o Pencil não tem, e não pode ser pintado como
  `Separados`.
- **É aqui que o `localStorage` morre.** `timeline/storage.ts`,
  `useTimeline.ts`, `exportStays.ts`, `seedStays.ts` e `together.ts` saem, e a
  tela atual é substituída pelo desenho (um mês com painel, não dois meses lado
  a lado).

**Tipos de evento no design:** Viagem, Visita, Date, Data especial, Compromisso,
Lembrete. O modal tem `Quem viaja` (ele / ela / os dois), `Vínculo com a lista`,
um bloco "Período automático" que mostra o antes/depois (*"Separados em
novembro: 12 → 7 dias"*) e um checkbox *"Avisar a Lana quando salvar"*.

**Schema novo:** `calendar_events` — e nada de `location_type`. Ver o que o
baseline errou.

---

## Fase 6 — Viagens

**Frames:** `Viagens — Grade [OmXwr]` · `Linha do tempo [NAPHW]` · `Painel
scroll completo [lB4rw]` · `Viagem — Detalhe (Ilhabela, feita) [Peoa7]`
(1440x2914) · `Viagem — Detalhe (Lisboa, futura) [f3yqz]` (1440x2252) ·
`Galeria em tela cheia [pUXaX]` · `Modal Nova viagem [MQHBd]`.

**Por que depois do Calendário:** uma viagem é um evento rico — ela cria o
período. Os dois frames de detalhe mostram roteiro item a item e galeria, e o
painel da Home mostra *"Próxima viagem · Roteiro · GRU → LIS · 1–9 out · 9
dias"*, com contagem para o embarque.

**Schema novo:** viagem, itens de roteiro, galeria. A relação com
`calendar_events` é a decisão central: a viagem **é** um evento com mais campos,
ou uma tabela própria que referencia o evento?

---

## Fase 7 — Home (o globo)

**Frames:** `Home — Escuro [eocRt]` · `Painel — scroll completo [LFEx4]` ·
`Navegação · Estados [j32cy]` · `Navegação · Cidades [saMmF]` · `Zoom São José
dos Campos [XwYKK]`.

**Última de propósito:** ela lê a lista, o calendário, as viagens, as memórias e
as configurações. É vitrine, não base.

**No design o mapa é imagem estática** com pins posicionados à mão (`Globe
IMAGEFILL` com halo e atmosfera nos níveis Mundo/Brasil/Estados, `City Map
IMAGEFILL` no zoom de SJC). Então nada no Pencil escolhe engine — a escolha está
no backlog e já foi verificada: **MapLibre GL JS v5 + OpenFreeMap**
(`projection: {type:'globe'}` com `sky.atmosphere-blend` dá o globo; os tiles não
pedem chave nem cobram, e chegam a nível de rua).

**O que o painel da Home consome, e portanto o que precisa estar pronto:**
próxima viagem com roteiro, período atual com dias restantes, faixa do mês
(juntos/separados/hoje/planejado), percentual do ano, itens da lista na cidade
com distância, destaques, última memória, e agregados de países/cidades/km
viajados.

**Decisão da spec:** o breadcrumb é Mundo → Brasil → São Paulo → São José dos
Campos, então os itens geográficos precisam de estado/região — `list_items` já
prevê a coluna `state` no ADR 0003, mas o agrupamento por região é lógica nova.
