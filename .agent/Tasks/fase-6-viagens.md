# Spec — Fase 6: Viagens

> **Gate 1.** Decide _o que_ construir, antes de escrever código.

- **Data:** 2026-09-27
- **Autor:** Gabriel Barbosa (com Claude)
- **Status:** 🟡 Reviewed (pronta p/ implementar) — decisões tomadas pelo agente a pedido do Gabriel ("toma as decisões"), registradas na seção 13
- **Research (Gate 0):** N/A. A fase está desenhada nos 7 frames de Viagens; cidade do mundo (ADR 0017), Photon (ADR 0016), pintura (ADR 0018) e mídia do casal (ADR 0012) já existem
- **ADR necessário?** Sim, três no mesmo PR: **0019** (a viagem é o evento `viagem` dos dois, estendido 1:1 por `trips`), **0020** (rota com parâmetro `/viagens/:id` sem biblioteca — supersede o gatilho do 0013) e **0021** (mapas das Viagens sem engine: projeção equiretangular sobre a imagem do `.pen`, até a Fase 7)

---

## 1. What & Why

Gabriel e Lana viajam juntos e hoje a viagem existe só como um evento `viagem` no Calendário: título, destino, datas. O que faz a viagem — o roteiro dia a dia, a preparação, o orçamento, a hospedagem, as fotos, o que cada um escreveu depois — não tem onde morar.

Depois desta fase eles abrem **Viagens** na barra lateral e usam as telas desenhadas: a **Grade** e a **Linha do tempo** das viagens com os números do casal, o painel _Pelo mundo, juntos_, o **Detalhe** de uma viagem feita (Ilhabela) e de uma futura (Lisboa), a **Galeria em tela cheia** e o modal **Nova viagem**. Criar uma viagem cria o período no calendário (a mesma pintura do evento, ADR 0018) e puxa os itens da Lista que ficam no destino.

## 2. Como funciona (um cenário real)

A Lana abre `/viagens`. A tela lê em paralelo os eventos `viagem` dos dois com os detalhes (`trips` e as tabelas-filhas), as cidades referenciadas, os integrantes com as cidades-casa, as estadias (para o _No calendário_) e os itens da Lista. Enquanto isso, esqueleto. Voltando `ok`, o kicker diz _"14 viagens juntos desde 2024"_ e a fileira de números mostra 14 feitas, 7 países, 23 cidades, 18.420 km e 96 dias.

Ela toca _Nova viagem_. No _Destino_ digita "Floria" e escolhe _Florianópolis, SC · Brasil_ (o seletor de cidade do Calendário, `CityPicker`). _Ida_ sex 8 jan 2027, _Volta_ qui 14 jan. Em _Capa_ escolhe uma foto. Em _De onde cada um sai_, as duas linhas já vêm com a casa de cada um (_São José dos Campos_, _Marau_); ela escreve _"voo POA → FLN · 55min"_ na dela. _Hospedagem: Pousada na Lagoa_. _Nota: Férias de verão, sem notebook_. O bloco _Ao salvar_ mostra a faixa _Viajando juntos · Florianópolis · 8 → 14 jan · 7d_ sobre o mini-mês de janeiro e _Da lista em Floripa · 5 itens_ (os itens da Lista a até 30 km do destino). Ela toca _Salvar viagem_.

O cliente chama `create_trip`. A RPC, numa transação: chama `create_event` (tipo `viagem`, os dois, pintar = sim) — que grava o evento e pinta os dois em Florianópolis de 8 a 14/1 —; o trigger do evento cria a linha de `trips` e os cinco itens de preparação padrão; a RPC grava a hospedagem e as duas saídas. Volta `{status:'ok', id}`. Aí o cliente sobe a capa (`couple-media/<casal>/trip/<uuid>.webp`), insere a linha em `trip_photos` e aponta `trips.cover_photo_id` para ela. A tela navega para `/viagens/<id>`: o detalhe da viagem futura, com _"Próxima viagem · em 103 dias"_, roteiro vazio (_"Dia 1 a 7 · em aberto · 7 dias livres — puxem itens da lista de Floripa pra cá"_ com três sugestões) e _Preparação · 0 de 5_.

Em julho, depois da viagem, o Gabriel abre o detalhe, toca _Adicionar fotos_ e sobe 40 fotos; abre _Memórias · Escrever_, dá 5 corações e escreve. O card da viagem na Grade passa para _Já fizemos_, com a capa, _"40 fotos · 1 memória"_ e os corações.

## 3. Requisitos (comportamentos observáveis)

Os frames: Grade `OmXwr`, Linha do tempo `NAPHW`, Painel `lB4rw`, Detalhe feita `Peoa7`, Detalhe futura `f3yqz`, Galeria `pUXaX`, Nova viagem `MQHBd` (modal `xLhij`). Componentes: `Trip Card` `OHmBS`, `Trip Card Planned` `PwXcG`, `Itinerary Item` `T51V9`. **Toda a copy fixa sai do `.pen`**; a copy com dado sai das regras abaixo. O que o frame mostra e a spec manda não renderizar está na seção 14.

**Casca e rotas**

- **R1** — A barra lateral ganha **Viagens** (o ícone do nó `d98FB` do Navbar), na ordem do frame: Calendário · Lista · Viagens. `/viagens` abre a Grade; `/viagens/<uuid>` abre o detalhe. Um `<uuid>` que não é viagem do casal (ou malformado) mostra _"Essa viagem não está aqui."_ com _Voltar para Nossas viagens_. A troca Grade/Linha do tempo é estado da tela (começa em Grade), não caminho.
- **R2** — O que é viagem: um `calendar_events` com `kind = 'viagem'` e `travelers = 'both'`. Viagem solo e visita continuam só no Calendário. Uma viagem criada pelo _Novo evento_ do Calendário aparece em Viagens também (o trigger cria o `trips`, I2).

**Cabeçalho comum (Grade e Linha do tempo)**

- **R3** — Kicker _"{n} viagens juntos desde {ano da primeira}"_ (n = todas, feitas e planejadas; sem viagens: _"Nenhuma viagem ainda"_). Título _Nossas viagens_. Segmento _Grade / Linha do tempo_. _Nova viagem_ abre o modal (R24).
- **R4** — Fileira de números (`tripTotals`, I5), só das **feitas**: _viagens feitas_, _países_, _cidades_, _km · viajados juntos_ (milhar com ponto), _dias · viajando juntos_.

**Grade** (`OmXwr`)

- **R5** — **Próxima viagem**: a viagem em andamento, senão a próxima planejada (`heroTrip`). Capa (ou o gradiente do frame sem capa), rótulo _Próxima viagem_ (em andamento: _"Viajando agora · dia {k} de {N}"_), título, _"{d–d mmm aaaa}"_, _"{N} dias"_, a rota _"{origem} → {destino}"_ (I8), _"♥ Gabriel e Lana · saindo de {casa abreviada}"_ (as duas casas iguais) ou _"♥ {A} sai de {X} · {B} sai de {Y}"_ (I8). À direita, _"em {n} dias"_ (em andamento: some) e o bloco _"{p} de 3 prontos"_ com **Passagens**, **Hospedagem** (o item de preparação daquele tipo: marcado ou não, e o `detail` como segunda linha) e **Roteiro** (_"{r}% montado"_, pronto em 100%, I7). Tocar no cartão abre o detalhe. Sem viagem futura nem em andamento: o cartão vira _"Para onde vai a próxima?"_ com _Nova viagem_.
- **R6** — **Planejadas · {n} mais pra frente**: as outras planejadas (sem a do R5), em ordem de data, com `Trip Card Planned`: _"Planejada · {nota}"_ (sem nota: _Planejada_), título, _"{datas} · {N} dias"_, _"em {n} dias"_. Some quando n = 0. Rolagem horizontal quando passa de 2.
- **R7** — **Já fizemos · {n} viagens**, com os chips _Todas · {anos, do mais recente} · Brasil · Exterior_ (um só ativo; ano = ano de `starts_on`; Brasil = destino `BR`). `Trip Card`: capa, país (_Brasil_, ou o nome do país por `Intl.DisplayNames('pt-BR')`), título, _"{datas} · {N} dias"_, número de fotos, _"{m} memória(s)"_ e os corações (I6). Em grade de 4 colunas, da mais recente. Filtro sem resultado: _"Nenhuma viagem nesse filtro."_.

**Linha do tempo** (`NAPHW`)

- **R8** — Todas as viagens, da mais distante no futuro para a mais antiga, num trilho vertical com o marcador _"{MMM}\n{aaaa}"_ de cada uma. O marcador _"Hoje · {d mmm}"_ fica entre a última futura e a primeira passada. Futuras: _Planejada_ (ou _Próxima viagem_ para a do R5) · título · _"{d–d mmm} · {N} dias · {nota ou rota}"_ · _"em {n} dias"_; a próxima leva também _"{p} de 3 prontos"_. Passadas: _Já fomos_ · título · _"{d–d mmm} · {N} dias"_ · corações · _"{f} fotos · {m} memórias"_. Tocar abre o detalhe.

**Painel _Pelo mundo, juntos_** (`lB4rw`, igual nas duas vistas)

- **R9** — Data de hoje por extenso (_"Sexta, 25 de setembro"_) e _Pelo mundo, juntos_.
- **R10** — **Onde já estivemos**: a imagem do mapa-múndi do `.pen` com pins projetados (ADR 0021): verde = destino de viagem feita, amarelo vazado = planejada, rosa maior = a casa de quem vê, e o arco de cada destino até a casa (contínuo nas feitas, tracejado nas planejadas). Legenda _feitas · planejadas · casa ({abreviação})_ e _"{p} países · {c} cidades"_ (os de R4).
- **R11** — **Destinos dos sonhos · Ver na lista**: até 3 itens da Lista das categorias País e Cidade, a fazer, os mais recentes; foto (ou o ícone da categoria), nome, tag da categoria, segunda linha (`secondaryLine` da Lista) e _Planejar_, que abre _Nova viagem_ com a busca do Destino preenchida com o nome da cidade (item Cidade) ou do país (item País). _Ver na lista_ navega para `/lista`. Sem itens: o bloco some.
- **R12** — **Recordes** (`tripRecords`, só feitas): _Viagem mais longa_ (título · _"{N} dias · {mmm aaaa}"_), _Mais distante_ (título · _"{km} km de {casa abreviada}"_, da casa de quem vê), _Destino mais repetido_ (cidade · _"{n} vezes"_, só com n ≥ 2). Linha sem resposta some; bloco sem linhas some.
- **R13** — **Há um ano**: a viagem feita que contém a data de hoje menos um ano; senão a feita com início mais próximo dessa data, até 30 dias de distância; senão o bloco some. Capa, _Ver viagem_, _"{datas} · {N} dias"_, título e, entre aspas, a memória mais recente dela (só as primeiras 140 letras, com reticências).

**Detalhe** (`Peoa7` feita, `f3yqz` futura)

- **R14** — Topo: _← Nossas viagens_ (volta para `/viagens`), _Ver no calendário_ (navega para `/` com o mês de `starts_on` aberto — `calendarFocus`, R32), _Adicionar ao roteiro_ (R19) e _Adicionar fotos_ (R21).
- **R15** — Herói com a capa: rótulo _"Já fomos · {Brasil | país}"_ (feita), _"Próxima viagem · em {n} dias"_ (a do R5), _"Planejada · em {n} dias"_ (outra futura), _"Viajando agora · dia {k} de {N}"_. Título, _"{datas aaaa}"_, _"{N} dias"_, a nota (_Férias de inverno_), _"♥ Gabriel e Lana"_ e os corações com _nota da viagem_ (I6; sem memória com nota: corações apagados e _"sem nota ainda"_). Feita: _"{f} fotos"_. Futura: a linha das saídas (R5) e _"{p} de {n} prontos"_ (a preparação toda, I7).
- **R16** — Quatro números: **cidades** (_"{lista de cidades · }"_ e _"{c} cidades"_; I9), **km** (_"{km} km"_ e _"percorridos · {origem} → {destino} → {origem}"_ na feita, _"{origem} → {destino}"_ na futura; I8), **dias** (_"{N} dias"_ · _"juntos · {d} a {d mmm}"_), e **lugares** — feita: _"{i} lugares"_ · _"visitados · {l} da nossa lista"_ (itens de roteiro · os vinculados à Lista); futura: _"{n} itens"_ · _"da lista em {destino}"_ (itens da Lista a ≤ 30 km do destino, `NEARBY_RADIUS_KM`).
- **R17** — **Roteiro dia a dia** com _Editar roteiro_ (feita) / _Montar roteiro_ (futura), que abre o modal do item no primeiro dia sem item (ou no dia 1). Cada dia da viagem: _"Dia {k}"_, _"{Sáb, 12 jul}"_ e _"· {título do dia}"_ (tocar edita o título, R20); os itens do dia (`Itinerary Item`) ordenados por hora (sem hora no fim), com hora, título, tag do tipo, _"· {nota}"_ e o selo _da lista_ quando vinculado. Tocar num item edita (R19). Dias vazios seguidos (dois ou mais) viram **um** bloco _"Dia {a} a {b}"_ · _"{Sáb, 3 → Sex, 9 out}"_ · _"· em aberto"_, com _"{n} dias livres — puxem itens da lista de {destino} pra cá"_ e até 3 sugestões (itens da Lista perto do destino e fora do roteiro), cada uma com o número de dias livres; tocar numa sugestão abre o modal do item já vinculado, no primeiro dia livre. Um dia vazio sozinho aparece como dia normal, sem itens. Com mais de 4 dias com itens, só os 4 primeiros aparecem e _"Ver dias {5} a {N}"_ expande. Itens com data fora da viagem (a viagem mudou de data no Calendário) aparecem num último grupo _"Fora das datas da viagem"_.
- **R18** — Blocos por status. **Feita e em andamento**: _Galeria · {f} fotos_ com _Tela cheia_ (R22) — mosaico de 3 colunas com as primeiras 9 fotos, a última com _"+{resto}"_ quando há mais; sem fotos, _"Nenhuma foto ainda"_ com _Adicionar fotos_ —; **Memórias** com _Escrever_ (R23): o bloco _Nota da viagem · "{os dois deram 5 | Gabriel deu 4 · Lana deu 5 | Lana deu 5}"_ e as memórias de cada um (avatar, nome, _"escrito em {d mmm}"_, texto); **Da nossa lista · feitos aqui · {n} itens**: os itens da Lista vinculados ao roteiro com status _feito_ (_"Feito · {mmm}"_, nome, tag, _"· {cidade}"_, _"♥ {os dois | nome}"_), até 4, e _"Ver os {n} itens na lista"_ (navega para `/lista`). **Futura**: **Preparação · {p} de {n}** (R20b), **Orçamento estimado** (R20c), **Hospedagem** (R20d) e **Na lista em {destino} · {n} itens**: itens da Lista perto do destino, até 4, com _"No roteiro · dia {k}"_ ou _"Fora do roteiro"_, e _Adicionar ao roteiro_. **Todas**: **Mapa da viagem** (R10b) e **No calendário · Abrir**: a tira dos dias da viagem com a faixa derivada das estadias (`coupleStateOn`/`runs` do Calendário, a cor do tipo da faixa) e o rótulo _"{Viajando juntos | Juntos em … | Separados} · {destino}"_ e _"{mmm aaaa}"_ (futura: _"{d–d mmm} · planejado"_). _Abrir_ = _Ver no calendário_.
- **R10b** — **Mapa da viagem · Abrir no globo** (o _Abrir no globo_ não renderiza, seção 14): a mesma imagem do R10, recortada no retângulo que contém origem e destino (com folga e um recorte mínimo de 24° de largura), com a linha origem → destino, os pins com rótulo (_SJC_, _Ilhabela_) e a legenda _"{origem} → {destino}"_ · _"{km} km · {i} pins"_ (i = itens do roteiro vinculados a itens da Lista com lugar).

**Modais e edições** (sem frame próprio: montados com `Form Field`, `Segment Item`, `Chip` e o `CalDialog` do Calendário, na linguagem do `xLhij`)

- **R19** — **Item do roteiro** (novo/editar): _Dia_ (os dias da viagem, _"Dia {k} · {Sáb, 12 jul}"_), _Hora_ (opcional), _Título_ (obrigatório), _Tipo_ (os 9 de `ITINERARY_KINDS`), _Nota_ (opcional), _Da lista_ (busca nos itens do casal, como o _Vínculo com a lista_ do Calendário; escolher preenche título e tipo quando vazios). Editar ganha _Apagar_. Salvar grava e relê.
- **R20** — **Título do dia**: um campo (≤ 60), vazio apaga.
- **R20b** — **Preparação**: cada item é caixa de marcar (toca → alterna `done`), rótulo e detalhe; tocar no texto abre o editor (rótulo, detalhe, _Apagar_); _Adicionar item_ no fim. O ♥ do frame marca os itens marcados.
- **R20c** — **Orçamento · Editar**: total planejado (_"R$ 18.400"_), _"R$ {total/2} por pessoa"_, _"gasto até agora R$ {gasto}"_ e as linhas (_Passagens R$ 9.800_) com a barra proporcional. _Editar_ abre o editor de linhas (rótulo, planejado, gasto; adicionar/apagar). Sem linhas: _"Sem orçamento ainda"_ e _Editar_.
- **R20d** — **Hospedagem · Abrir reserva**: nome, endereço, _"Check-in {sex 1 out, 15h} · Check-out {sex 9 out, 11h}"_, _"{link encurtado} · reserva #{código}"_, _"Pago · R$ {valor}"_ (ou _"A pagar · R$ {valor}"_). _Abrir reserva_ abre o link em nova aba (some sem link). Tocar no cartão abre o editor com os sete campos. Sem nada: _"Adicionar hospedagem"_.
- **R21** — **Adicionar fotos**: escolhe até 50 arquivos por vez; cada um é reduzido como na Lista (webp) e sobe para `couple-media/<casal>/trip/<uuid>.webp`, e só então a linha entra em `trip_photos` com `taken_on` = data do `lastModified` do arquivo se cair dentro da viagem (senão nulo) e `added_by` = quem sobe. Progresso _"Enviando {k} de {n}"_. Falha de um arquivo não para os outros; no fim, _"{x} fotos não subiram"_.
- **R22** — **Galeria em tela cheia** (`pUXaX`), por cima de tudo: título, _"{datas} · {f} fotos"_, _"{i} / {f}"_, _Definir como capa_ (vira _Capa da viagem_ quando já é), a foto, _Anterior/Próxima_, a legenda (_"{legenda ou destino}"_ e _"{Seg, 14 jul} · foto {do Gabriel | da Lana} · Dia {k}"_, sem data: só _"foto da Lana"_), as miniaturas (a atual destacada, rolagem até ela) e a dica _← → navegar · F favoritar · Esc fechar_. Teclado: ← → navega (circular), F alterna favorito (o coração na foto), Esc fecha e devolve o foco. Tocar na legenda permite editá-la (≤ 80). Ordem: `taken_on` (nulos no fim), depois `created_at`. _Apagar foto_ fica no menu da foto (apaga o arquivo e depois a linha; se era a capa, a capa fica vazia).
- **R23** — **Memória** (_Escrever_): um por pessoa; os corações de 1 a 5 (obrigatório) e o texto (1–2000). Quem já escreveu, edita a sua (_Escrever_ vira _Editar a minha_). Ninguém edita a do outro.

**Nova viagem / Editar viagem** (`xLhij`)

- **R24** — _Nova viagem_ · _"Cria o período no calendário e puxa itens da lista do destino"_. Campos: **Destino** (`CityPicker` do Calendário, com cidades do mundo, I3), **Ida** e **Volta** (datas, `Volta ≥ Ida`, ≤ 366 dias — `CALENDAR_LIMITS.spanDays`), **Capa** (_Enviar_, uma foto, opcional, com prévia), **De onde cada um sai** (uma linha por integrante, na ordem dos slots: a casa dele e um campo curto de transporte, placeholder _"voo GRU → FLN · 1h05"_), **Hospedagem** (nome, opcional), **Nota** (opcional, ≤ 280). **Ao salvar**: _No calendário_ com o cartão _"♥ Viajando juntos · {destino} · {d → d mmm} · {N}d"_ sobre o mini-mês de Ida com os dias da viagem marcados (o rótulo do cartão sai da prévia `paintStays` + `coupleStateOn`: se o destino é a casa de um, _"Juntos em {cidade}"_), e _Da lista em {destino} · {n} itens_ (até 3 nomes com a tag; só leitura — eles aparecem no detalhe, R18). _Cancelar_ / _Salvar viagem_.
- **R25** — Salvar a Nova viagem: `create_trip`; depois, com capa, o upload (R21) e `cover_photo_id`. Se a capa falhar, a viagem fica salva e o detalhe abre com o aviso _"A viagem foi salva, mas a capa não subiu."_. Depois do `ok` navega para `/viagens/<id>`.
- **R26** — **Editar viagem** (no detalhe, o título do herói tem o lápis): o mesmo modal com _"Editar viagem"_, um campo **Nome da viagem** (o `title` do evento, que na criação é o nome do destino — I10) acima do Destino, e o resto preenchido. Datas e destino **não repintam** (ADR 0018): a linha _"Mudar datas ou destino aqui não muda o período — ajuste no calendário."_ substitui o _Ao salvar_. Rodapé: _Apagar viagem_, com a confirmação _"Apagar {título}? As fotos e o roteiro vão junto; o período no calendário continua."_ — apaga os arquivos das fotos, depois o evento (a cascata leva o resto) e volta para `/viagens`.

**Gravação e releitura**

- **R27** — Como no Calendário: a tela só mostra o valor depois do `ok`; modais ficam abertos e desabilitados enquanto gravam, e na falha continuam abertos com a causa. Depois de cada escrita própria e ao voltar o foco, relê tudo (ADR 0015).
- **R28** — O export das Configurações sobe para `version: 4` e ganha `trips` (cada viagem com os detalhes, as saídas por `slot`, o roteiro, a preparação, o orçamento, as memórias por `slot` e as fotos como caminho no bucket — sem `couple_id` nem ids de perfil). O resumo das Configurações (_"14 viagens"_) passa a contar viagens feitas pelo `tripTotals`.
- **R29** — _Apagar o espaço_ (Configurações) já apaga `couple-media/<casal>/` inteiro, e a cascata de `couples` leva as tabelas novas; nada muda ali além de o teste cobrir `trip/`.
- **R30** — Nada nesta fase lê `day_kisses`.
- **R31** — O _Adicionar_ da barra continua com _Novo evento_ e _Item na lista_ (sem _Nova viagem_: não está no design).
- **R32** — `calendarFocus`: um pedido em memória (como `addIntent.ts`) que o Calendário consome ao montar, abrindo o mês pedido na visão Mês.

## 4. Invariantes

- **I1** — **A viagem é o evento.** Datas, destino, título, nota e quem viaja moram em `calendar_events` e em nenhum outro lugar. `trips` só tem o que o evento não tem, com `trips.event_id` = `calendar_events.id` (1:1). Apagar o evento apaga a viagem inteira (cascata); apagar a viagem é apagar o evento. **O período não é da viagem**: criar pinta uma vez; editar ou apagar não mexe nas estadias (ADR 0018).
- **I2** — Todo evento `viagem` dos dois tem exatamente uma linha em `trips`: um trigger `after insert or update` a cria (com os 5 itens de preparação padrão, só no insert da linha), e a migration faz o backfill dos que já existem. Se o evento deixar de ser dos dois, a linha fica (não aparece nas Viagens, R2) e volta a valer se ele voltar a ser.
- **I3** — Cidade é referência (`city_id`), com a mesma regra do Calendário (I2 da Fase 5): brasileira é a do IBGE, de fora é do casal por `osm_ref`.
- **I4** — **Estado da viagem é derivado de hoje**, nunca gravado: `planned` (`starts_on > hoje`), `ongoing` (`starts_on ≤ hoje ≤ ends_on`), `done` (`ends_on < hoje`). "Hoje" é `todayIso()` do cliente, como no Calendário.
- **I5** — `tripTotals` conta só as feitas: viagens; países = `country_code` distintos dos destinos; cidades = `city_id` distintos dos destinos; km = soma de `tripKm`; dias = soma de `daysInclusive(starts_on, ends_on)`.
- **I6** — A **nota da viagem** é a média das notas das memórias, arredondada para cima (`ceil`), de 1 a 5; sem memória, não há nota. O rótulo é _"os dois deram {n}"_ quando as duas notas são iguais, _"{A} deu {a} · {B} deu {b}"_ (ordem dos slots) quando diferem, _"{A} deu {a}"_ com uma só.
- **I7** — Preparação: _"{p} de {n}"_ = marcados / todos. O **roteiro montado** é `floor(100 × dias com ≥ 1 item / dias da viagem)`. O _"{p} de 3 prontos"_ da Grade conta Passagens (primeiro item `kind = 'passagens'` marcado), Hospedagem (idem `hospedagem`) e Roteiro (100%); tipo ausente conta como não pronto e a linha mostra _"a definir"_.
- **I8** — Distâncias são linha reta (`distanceKm`, haversine da Fase 2), **da casa de quem vê**. `tripKm = 2 × distanceKm(casa, destino)`. A **origem** de uma saída é o `origin_code` dela quando preenchido, senão a casa abreviada (`shortCityName` do Calendário: _São José dos Campos_ → _SJC_, _Marau_ fica inteiro). A rota do R5 é _"{origem de quem vê} → {destino}"_.
- **I9** — Cidades de uma viagem: o destino, depois as cidades (`city`) dos itens da Lista vinculados ao roteiro, sem repetição (comparação sem acento e sem caixa), na ordem do roteiro.
- **I10** — O `title` do evento nasce igual ao rótulo do destino (_"Lisboa, Portugal"_ / _"Ilhabela, SP"_: nome + UF no Brasil, nome + país fora) e depois é livre (R26).
- **I11** — Um item de roteiro tem `day` dentro de `[starts_on, ends_on]` da viagem **no momento em que é gravado** (trigger). Uma memória por pessoa por viagem, e cada um grava só a sua. `cover_photo_id` aponta para uma foto da **mesma** viagem.
- **I12** — Tudo que é filho de `trips` repete `couple_id` com FK composta `(trip_id, couple_id)` e a RLS é a expressão de sempre (`couple_id in (select private.my_couple_ids())`). O cliente nunca filtra por casal.
- **I13** — Limites (`TRIP_LIMITS` em `src/domain/trips.ts`, com paridade testada contra os `CHECK`): título do dia 60; item do roteiro: título 80, nota 120, até 200 por viagem; preparação: rótulo 40, detalhe 80, até 20; orçamento: rótulo 30, valores 0–1.000.000.000 centavos, até 12 linhas; memória 1–2000; hospedagem: nome 80, endereço 160, link 500 (`https://` ou `http://`), código 40, valor 0–1.000.000.000 centavos; saída: código 8, nota 80; legenda 80; até 500 fotos por viagem.

## 5. Contrato & dados

### Contrato compartilhado — `src/domain/trips.ts` (tipos, listas e limites) · `tripValidation.ts` (espelho dos CHECK) · `tripDerive.ts` (derivações) — puros, sem Supabase, `Date` só via `lib/date.ts`

```ts
export const ITINERARY_KINDS = ['voo','hospedagem','transporte','restaurante','comida','parque','cidade','experiencia','outro'] as const
export const PREP_KINDS = ['passagens','hospedagem','documentos','seguro','malas','outro'] as const
export const DEFAULT_PREP = [ // o mesmo array o trigger insere (paridade testada)
  { kind: 'passagens', label: 'Passagens' }, { kind: 'hospedagem', label: 'Hospedagem' },
  { kind: 'documentos', label: 'Documentos' }, { kind: 'seguro', label: 'Seguro viagem' },
  { kind: 'malas', label: 'Malas' },
]
export const TRIP_LIMITS = { /* I13 */ }

export type TripStatus = 'planned' | 'ongoing' | 'done'
export interface Trip {            // um evento viagem dos dois + o que é dele
  id: string                       // = calendar_events.id = trips.event_id
  title: string; cityId: string; startsOn: string; endsOn: string; note: string | null
  coverPhotoId: string | null
  lodging: Lodging                 // campos anuláveis
  departures: TripDeparture[]      // { profileId, originCode, note }
  days: TripDayTitle[]             // { day, title }
  itinerary: ItineraryItem[]       // { id, day, at, title, kind, note, listItemId, position }
  prep: PrepItem[]                 // { id, kind, label, detail, done, position }
  budget: BudgetLine[]             // { id, label, plannedCents, spentCents, position }
  memories: TripMemory[]           // { profileId, rating, body, writtenOn }
  photos: TripPhoto[]              // { id, path, takenOn, caption, favorite, addedBy, createdAt }
}
export function tripStatus(t, today): TripStatus
export function heroTrip(trips, today): Trip | null
export function tripTotals(trips, cities, home, today)  // I5
export function tripKm(home, dest): number              // I8
export function tripRating(memories, members)           // I6 → { hearts, label } | null
export function prepSummary(t) / readiness(t)           // I7
export function itineraryPlan(t, nearbyItems)            // R17: dias, blocos em aberto, colapso, fora das datas
export function tripRecords(trips, cities, home, today)  // R12
export function oneYearAgo(trips, today)                 // R13
export function timeline(trips, today)                   // R8: ordem + posição do "Hoje"
export function gridFilters(trips, cities, today) / applyGridFilter(...)  // R7
export function tripCities(t, dest, listItems)           // I9
export function validateItineraryItem / validatePrepItem / validateBudgetLine / validateMemory / validateLodging / validateDeparture  // espelhos dos CHECK
```

`src/domain/tripValidationCases.ts`: a tabela de casos que roda no domínio (`vitest domain`) e contra o banco (`supabase/tests/trips.test.ts`), como `eventValidationCases.ts`.

### Migration — `supabase/migrations/20260927120000_trips.sql`

- `calendar_events`: `unique (id, couple_id)` (alvo das FKs compostas).
- `trips` — `event_id uuid primary key`, `couple_id not null`, FK `(event_id, couple_id) → calendar_events (id, couple_id) on delete cascade`; `cover_photo_id uuid` (FK composta `(cover_photo_id, event_id)` → `trip_photos (id, trip_id)` `on delete set null (cover_photo_id)`, criada depois de `trip_photos`); `lodging_name`, `lodging_address`, `lodging_check_in` (`timestamp` sem fuso, hora local do lugar), `lodging_check_out`, `lodging_url`, `lodging_code`, `lodging_cents integer`, `lodging_paid boolean not null default false`; `created_at`, `updated_at` (trigger `touch_updated_at`).
- `trip_departures` — `(trip_id, profile_id)` pk, `couple_id`, `origin_code`, `note`. Trigger de integrante (como `calendar_events_members`).
- `trip_days` — `(trip_id, day)` pk, `couple_id`, `title` (1–60).
- `trip_itinerary_items` — `id`, `trip_id`, `couple_id`, `day date not null`, `at time`, `title`, `kind` (CHECK `ITINERARY_KINDS`), `note`, `list_item_id` (FK composta com `list_items (id, couple_id)` `on delete set null (list_item_id)`), `position int not null default 0`, `created_by default auth.uid()`, `created_at`. Trigger: `day` dentro da viagem (I11) e teto de 200 (com trava na linha de `trips`, como `list_photos`).
- `trip_prep_items` — `id`, `trip_id`, `couple_id`, `kind` (CHECK), `label`, `detail`, `done bool default false`, `position`; teto 20.
- `trip_budget_lines` — `id`, `trip_id`, `couple_id`, `label`, `planned_cents`, `spent_cents` (0 por padrão), `position`; teto 12.
- `trip_memories` — `(trip_id, profile_id)` pk, `couple_id`, `rating smallint 1–5`, `body` 1–2000, `written_on date default today_br()`, `updated_at`. Policies de insert/update/delete: `profile_id = auth.uid()` (I11).
- `trip_photos` — `id`, `trip_id`, `couple_id`, `path` (único; prefixo `<couple_id>/trip/`, CHECK), `taken_on date`, `caption` ≤ 80, `favorite bool default false`, `added_by default auth.uid()`, `created_at`; `unique (id, trip_id)`; teto 500.
- Trigger `calendar_events_trip` (after insert or update of `kind`, `travelers` em `calendar_events`, **invoker**): evento `viagem` dos dois sem `trips` → insere `trips` e, se inseriu, os 5 `DEFAULT_PREP`. Backfill dos existentes na migration.
- RPC `public.create_trip(p_trip jsonb) returns jsonb`, **invoker** (não conta nas doze `definer`): `{title, city_id, starts_on, ends_on, note, lodging_name, departures:[{profile_id, origin_code, note}]}` → chama `public.create_event` com `kind:'viagem', travelers:'both', all_day:true` e `p_paint = true`, e na mesma transação grava `lodging_name` e as saídas. Erros: os do `create_event` (42501, `not_member`, 22023, 23514) e 23514 dos `CHECK` novos. → `{status:'ok', id}`.
- Todos os triggers novos em `private`, `security invoker`, `set search_path = ''`, com `revoke … from public, anon` e `grant … to authenticated, service_role`; recusas com `constraint` e `hint` = nome da regra (lição da Fase 3).
- RLS em todas as tabelas novas: select/insert/update/delete para membros com a expressão de sempre; `trips` sem insert pelo cliente fora do trigger/RPC é aceitável (a policy de insert existe para o trigger invoker).
- Storage: nenhuma mudança — `couple-media` já autoriza por `<couple_id>/` na primeira pasta (ADR 0012).

### Cliente — fronteira de dados

`src/data/trips.ts` (leitura de tudo em paralelo, com `DataResult`; escritas com `WriteResult`, via `rpc.ts` para a RPC) e `src/data/tripRow.ts` (mapeador snake ↔ camel, único lugar com snake_case). A tela recebe `TripsApi` injetada (`src/trips/api.ts`), como `CalendarApi`/`ListApi`, para os testes de interface usarem um falso.

### Compatibilidade

Nada quebra: as colunas de `calendar_events` não mudam; o `unique (id, couple_id)` é aditivo. O Calendário ganha só `calendarFocus`. O export sobe de versão (R28).

## 6. Identidade & nomes

A viagem é identificada pelo `id` do evento — a URL `/viagens/<id>` sobrevive a qualquer edição. Fotos em `couple-media/<couple_id>/trip/<uuid>.webp`, um uuid novo por upload (ADR 0009: o cache nunca serve foto velha). Os nomes de constraint são contrato (a fronteira de dados os lê para dizer o que falhou): `trip_itinerary_day_in_trip`, `trip_itinerary_limit`, `trip_prep_limit`, `trip_budget_limit`, `trip_photos_limit`, `trip_photos_path`, `trip_member`, `trips_cover_same_trip` e os `CHECK` `trip_*_format`/`_len`.

## 7. Comportamento em falha

- Leitura falhou (rede, projeto pausado): a tela mostra _"Não deu para carregar as viagens."_ com _Tentar de novo_ — nunca a Grade vazia (a lição do `DataResult`). Sessão caída → o portão.
- `create_trip` falhou: nada foi gravado (uma transação); o modal continua aberto com a causa.
- `create_trip` ok e a capa falhou: R25. O arquivo que subiu sem linha é removido em silêncio (`removeQuietly`, como a Lista).
- Upload de várias fotos: cada uma é arquivo → linha; arquivo que subiu e cuja linha falhou (ex.: teto de 500) é removido. O resumo conta as que não entraram.
- Apagar viagem: primeiro os arquivos (falha de algum → para, nada é apagado no banco, mostra a causa); depois o evento. Arquivo órfão nunca aponta de uma linha viva.
- Apagar foto: arquivo, depois linha; se a linha falhar o arquivo já foi — a linha fica apontando para nada e a galeria mostra o quadro vazio com _Apagar_ (idempotente).
- A outra pessoa apagou a viagem enquanto eu via: a próxima releitura não a encontra e o detalhe mostra o R1 (_"Essa viagem não está aqui."_).
- Item do roteiro fora das datas (a viagem mudou no Calendário): nada falha; o R17 agrupa.

## 8. Limites & orçamentos

Leitura: uma consulta por tabela (8 tabelas + as já existentes), sem N+1, todas cortadas pela RLS; com 50 viagens × 200 fotos o payload de metadados é ~10 mil linhas — `paginate.ts` da Fase 4 cobre o teto de 1000 do PostgREST. As miniaturas usam URL assinada em lote (`createSignedUrls`), 1 hora, e só das fotos visíveis (capa dos cards, mosaico de 9, a galeria aberta). Upload: 50 arquivos por vez, 3 em paralelo, cada um ≤ 5 MB depois de reduzido (limite do bucket). Photon: o do `CityPicker`, sem chamada nova.

## 9. Segurança & permissões

RLS por casal em todas as tabelas (I12); FKs compostas impedem apontar para item, foto ou evento de outro casal; triggers invoker conferem integrante (saídas, memórias, autor). Memória: cada um só grava a sua (policy). Storage: o prefixo `<couple_id>/trip/` é conferido pela policy existente e pelo `CHECK` de `path`. `create_trip` é invoker. Nenhuma função `definer` nova (A20 continua com doze). A foto é dado íntimo como a da Lista: só aparece por URL assinada.

## 10. Critérios de aceite (testáveis)

| # | Critério | Como provar |
| --- | --- | --- |
| A1 | `TRIP_LIMITS`, `ITINERARY_KINDS`, `PREP_KINDS` e `DEFAULT_PREP` batem com os `CHECK` e com o trigger | `supabase/tests/trips.test.ts` (paridade) |
| A2 | A mesma tabela `tripValidationCases` passa no domínio e no banco | `src/domain/trips.test.ts` + `supabase/tests/trips.test.ts` |
| A3 | `create_trip` grava evento, `trips`, 5 itens de preparação, hospedagem e saídas, e pinta os dois no destino, numa transação; com cidade de outro casal nada é gravado | `supabase/tests/trips.test.ts` |
| A4 | Evento `viagem` dos dois criado pelo `create_event` do Calendário ganha `trips` (trigger); `visita` e viagem solo não | idem |
| A5 | RLS: o casal B não lê nem escreve nenhuma tabela nova do casal A; FK composta recusa item/foto/capa de outro casal ou outra viagem; memória do outro não se edita | idem |
| A6 | Item do roteiro fora das datas é recusado (`trip_itinerary_day_in_trip`); os tetos (200/20/12/500) recusam com o nome | idem |
| A7 | Apagar o evento leva `trips` e filhos; as estadias pintadas continuam | idem |
| A8 | `tripStatus`, `heroTrip`, `tripTotals`, `tripKm`, `tripRating`, `readiness`, `itineraryPlan`, `tripRecords`, `oneYearAgo`, `timeline`, filtros — cada regra de I4–I10 e R5–R17 com caso | `src/domain/trips.test.ts` |
| A9 | `/viagens` e `/viagens/<id>` resolvem; id desconhecido mostra o R1; a barra tem Viagens | `src/app/router.test.ts`, `src/trips/*.test.tsx` |
| A10 | Grade: números, herói (com e sem próxima), planejadas, filtros de _Já fizemos_ | `src/trips/TripsScreen.test.tsx` |
| A11 | Linha do tempo: ordem e o marcador _Hoje_ no lugar certo | idem |
| A12 | Painel: pins projetados (lat/lng → %), destinos dos sonhos com _Planejar_, recordes, há um ano | `src/trips/TripsPanel.test.tsx` |
| A13 | Nova viagem chama `create_trip` com o payload certo, sobe a capa depois, navega para o detalhe; falha mantém o modal com a causa | `src/trips/NewTripModal.test.tsx` |
| A14 | Detalhe feito e futuro renderizam os blocos do R15–R18 com os textos derivados | `src/trips/detail/TripDetail.test.tsx` |
| A15 | Roteiro: colapso de dias vazios, _Ver dias 5 a N_, fora das datas, criar/editar/apagar item | `src/trips/detail/*.test.tsx` |
| A16 | Galeria: ← → circular, F favorita, Esc fecha, _Definir como capa_ | `src/trips/detail/Gallery.test.tsx` |
| A17 | Leitura com falha mostra o erro, não a Grade vazia | `TripsScreen.test.tsx` |
| A18 | Export v4 com `trips`, sem `couple_id` nem ids de perfil | `src/data/export.test.ts` |
| A19 | typecheck, lint, test, **build** limpos | saída dos comandos |
| A20 | As telas batem com os 7 frames (captura lado a lado com o `.pen`, claro e escuro) | captura no browser do app + `TakeScreenshot` do Pencil |
| A21 | Manual, duas contas: a Lana cria a viagem, o Gabriel vê ao voltar o foco, os dois escrevem memória | roteiro manual — pendente como A24 da Fase 5 |

## 11. Abordagem de teste

Domínio puro com vitest `domain` (todas as regras de I4–I10 e as derivações de R5–R18). Interface com vitest `ui` em jsdom e `TripsApi` falsa (ADR 0005) — o comportamento de tela se prova renderizando. Banco com `npm run test:db` contra o online (ADR 0014): paridade, RPC, triggers, RLS e cascatas. Visual contra o `.pen` por captura (A20). O A21 fica manual porque precisa de duas sessões reais.

## 12. Riscos & mitigações

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| O trigger de `calendar_events` inserir `trips` sob RLS falhar para o `service_role` ou no backfill | viagem sem linha, detalhe quebrado | backfill na migration + A4; o cliente trata `trips` ausente como detalhes vazios |
| Mapa por imagem ficar feio em viagem curta (SJC → Ilhabela) | mapa pouco útil | recorte mínimo de 24°; aceitável até o MapLibre da Fase 7 (ADR 0021) |
| Galeria com centenas de fotos pesar | lentidão | URL assinada só do que está visível; miniaturas em lote |
| Migration direto em produção | dado real | só aditiva; nenhuma coluna existente muda; `select count(*)` antes do backfill |

## 13. Open questions (resolvidas pelo agente, 2026-09-27)

1. **Viagem é evento ou tabela própria?** → Evento `viagem` dos dois + `trips` 1:1 com a mesma chave (ADR 0019). Uma tabela própria com datas e destino criaria a segunda verdade que o ADR 0002 proíbe.
2. **Nova viagem tem título?** → Não no design. O título nasce do destino e é editável em _Editar viagem_ (I10, R26).
3. **Nota da viagem é do casal ou de cada um?** → De cada um, na memória; a nota é derivada (I6). O frame diz _"os dois deram 5"_.
4. **Km de quê?** → Linha reta ida e volta da casa de quem vê (I8), coerente com _"de SJC"_ e com a distância das Configurações. Não é rodoviário (sem API de rotas).
5. **Preparação: 3 itens (Grade) ou 5 (Detalhe)?** → 5 itens editáveis; a Grade mostra 3 _prontidões_, duas delas itens e o Roteiro derivado (I7).
6. **"Puxa itens da lista"** grava algo? → Não: é leitura derivada por distância (≤ 30 km). Vira item de roteiro quando alguém o põe num dia.
7. **Rota com parâmetro** → sem biblioteca (ADR 0020).
8. **Mapa** → imagem do `.pen` + projeção (ADR 0021).
9. **Avisos à outra pessoa** (_"A Lana recebe um aviso e pode editar"_) → fim do roadmap, junto com os avisos do Calendário.

## 14. Fora de escopo

- _Abrir globo_ / _Abrir no globo_ (Fase 7) e o recorte de mapa desenhado à mão do `R3aZa` (usa-se o recorte do mapa-múndi).
- _"A Lana recebe um aviso e pode editar"_ no rodapé do modal (avisos: fim do roadmap).
- Arrastar para reordenar itens do roteiro (ordem por hora e `position`).
- Moeda que não seja real; câmbio.
- Ler EXIF das fotos (a data vem do `lastModified`).
- Viagem solo em Viagens.
- _Nova viagem_ no _Adicionar_ da barra.

---

## Plano (Gate 2)

1. [ ] **T1 · Banco** — migration, `supabase/tests/trips.test.ts`, `db push`, `types:gen`. (A1–A7)
2. [ ] **T2 · Domínio** — `src/domain/trips.ts`, `tripValidationCases.ts`, testes. (A2, A8) — paralelo ao T1
3. [ ] **T3 · Dados e casca** — `src/data/trips.ts`, `tripRow.ts`, `src/trips/api.ts`, `context.ts` (hook de leitura), fixtures de teste, rota e barra, `calendarFocus`, export v4. (A9, A18)
4. [ ] **T4 · Grade, Linha do tempo, Painel e Nova viagem** — `src/trips/*`, `trips.css`. (A10–A13, A17)
5. [ ] **T5 · Detalhe, Galeria e editores** — `src/trips/detail/*`, `trip-detail.css`. (A14–A16) — paralelo ao T4
6. [ ] **T6 · Fechamento** — conferência visual contra o `.pen` (A20), `/code-review`, `verify`, docs (`project_architecture.md`, `CLAUDE.md`, roadmap), ADRs para `Accepted` onde couber, merge.

## Related

- ADRs: [0019](../Decisions/0019-viagem-e-o-evento-estendido-por-trips.md) · [0020](../Decisions/0020-rota-com-parametro-sem-biblioteca.md) · [0021](../Decisions/0021-mapas-das-viagens-sem-engine.md) · 0002 · 0012 · 0015 · 0016 · 0017 · 0018
- Ledger: [`fase-6-viagens.ledger.md`](./fase-6-viagens.ledger.md)
