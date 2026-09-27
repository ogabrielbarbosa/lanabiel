# Spec — Fase 5: Calendário

> **Gate 1.** Decide _o que_ construir, antes de escrever código.

- **Data:** 2026-09-26
- **Autor:** Gabriel Barbosa (com Claude)
- **Status:** 🟡 Reviewed (2026-09-26): zero perguntas bloqueantes. As decisões tomadas na spec estão na seção 13 e podem ser vetadas antes do build
- **Research (Gate 0):** N/A. A fase está desenhada nos 5 frames do Calendário, e o provedor de lugares (Photon) já foi provado na Fase 4 (ADR 0016)
- **ADR necessário?** Sim, dois no mesmo PR: **0017** (cidades do mundo em `cities`, por casal, a partir do Photon; revisa em parte o 0007) e **0018** (período se grava _pintando_ estadias numa RPC; o evento pinta uma vez, e os dias tirados de um período voltam para a casa de cada um). O **0015** (sem realtime) ganha uma linha estendendo o escopo ao Calendário, e a tabela de evidência do **0002** troca `src/timeline/` pelos arquivos novos. Os dois estão `Proposed`, então recebem uma nota datada

---

## 1. What & Why

O Calendário é onde o casal registra **onde cada um está** e **o que vai acontecer**, e a partir disso vê quantos dias passa junto. Hoje a tela é a timeline antiga sobre `localStorage`: um navegador só, cidade como texto livre, os dois não compartilham nada. E as outras telas que dependem de onde o casal está (o painel da Lista, depois a Home) mostram "sem registro", porque ninguém grava estadias no banco.

Depois desta fase, Gabriel e Lana abrem **Calendário** e usam as telas desenhadas: o mês com as faixas de estado e o painel _Onde a gente está_, o ano, o **Novo período** e o **Novo evento**. Tudo grava no Supabase, cortado por casal. As estadias passam a existir, então o _Perto de vocês_ e a _Sugestão do momento_ da Lista acordam sem mudar de código. Viagens para fora do Brasil (Lisboa) têm cidade de verdade. Cada dia tem o contador 💋. A timeline antiga, com o `localStorage` dela, **é apagada inteira**.

As preferências do Calendário que a Fase 3 gravou (`calendar_default_view`, `week_starts_on`, `show_adjacent_days`, `show_day_markers` e as quatro cores de faixa) **passam a ter efeito aqui**.

## 2. Como funciona (um cenário real)

É a primeira vez que o Gabriel abre `/` depois do deploy. O casal não tem nenhuma estadia. A tela lê em paralelo as estadias, os eventos, os dois integrantes com as cidades-casa, `couple_settings`, o casal (`started_on`), os 💋 do mês visível e as cidades referenciadas. Enquanto isso mostra esqueleto. A leitura volta `ok` com zero estadias, então a grade aparece sem faixa nenhuma, e acima dela o cartão _"Onde vocês estão hoje?"_. Ele escolhe _Separados_, deixa _Desde_ em hoje e _Até_ vazio, e toca _Criar no calendário_. O cliente chama `paint_stays` com duas entradas: Gabriel em São José dos Campos e Lana em Marau, as duas a partir de hoje e em aberto. As faixas _Separados · SJC e Marau_ aparecem da semana de hoje até a borda da tela.

Ele toca _Novo evento_ e escolhe **Visita**. _Quem viaja: Gabriel_. O _Destino_ já vem _"Marau, RS · casa da Lana"_. _Ida_: sex, 30 out, 19:20. _Volta_: ter, 3 nov, 21:05. _Vínculo com a lista_: ele digita "vin" e escolhe _Vinícola em Marau_. O bloco _Período automático_ calcula no cliente, com a mesma `paintStays` que o banco espelha: _"Gabriel viaja · 30 out → 3 nov · 5d"_, a tira de duas semanas com o antes e o depois, _"+5 dias juntos no ano"_ e _"Separados em novembro: 30 → 27 dias"_. Ele toca _Salvar evento_. O cliente chama `create_event(evento, pintar = true)`. A RPC, numa transação só, grava o evento e pinta o Gabriel em Marau de 30/10 a 3/11. A estadia aberta dele em SJC é partida em duas: até 29/10 e a partir de 4/11, ainda em aberto. Na grade, a semana de 30 out ganha a faixa _Gabriel em Marau_ e o chip do evento.

Em Lisboa, meses depois, a Lana cria uma **Viagem** para os dois. No _Destino_ ela digita "Lisboa". O IBGE não acha nada, e o Photon (`layer=city`) devolve _Lisboa · Portugal_. Ela escolhe. O cliente grava a cidade em `cities` como uma linha **do casal** (`couple_id`, `osm_ref = 'R5400890'`), ou reaproveita a que já existe com essa `osm_ref`, e usa o `id` dela no evento. A faixa amarela _Lisboa_ é derivada: os dois na mesma cidade, que não é a casa de nenhum.

Na manhã seguinte ao reencontro, a Lana passa o mouse no dia, vê o _+1_ ao lado do 💋 e toca. Vira uma linha em `day_kisses` para aquele dia, e o contador mostra _1_. Na aba do Gabriel, o número aparece quando a aba volta ao foco (ADR 0015).

## 3. Requisitos (comportamentos observáveis)

**Casca**

- **R1** — `/` e `/calendario` renderizam o Calendário novo. A barra lateral continua _Calendário · Lista · Configurações_. Entra o botão global **Adicionar** (`Add Button`, `NVoXy`, no pé da barra): ele abre um seletor com _Novo evento_ (abre o modal de evento no dia de hoje) e _Item na lista_ (navega para `/lista` com o modal de adicionar aberto). O botão vale em qualquer rota.
- **R2** — A timeline antiga sai inteira: `src/timeline/` (os 14 arquivos, `timeline.css` junto), o `calendar` de `ShellProps` e o import em `App.tsx`. As exportações de `src/lib/date.ts` que ninguém mais importa saem também. Na primeira carga depois do deploy, o app remove a chave `lanabiel:stays:v1` do `localStorage` (em `try/catch`). **Não se importa nada** dela (seção 13, decisão 4).

**Mês** (`D1Zny4`)

- **R3** — Cabeçalho: kicker _"{j} dias juntos · {s} separados"_ do mês visível (I5, contagem **desenhada**). Título _"{Mês} {ano}"_, setas de mês anterior e próximo, o seletor _Mês / Ano_ (começa em `calendar_default_view`, e a troca vale só até sair da tela), _Hoje_ (volta ao mês de hoje e seleciona hoje) e _Novo evento_.
- **R4** — Grade de 7 colunas, começando em `week_starts_on` (_DOM … SÁB_ ou _SEG … DOM_). Com `show_adjacent_days`, os dias dos meses vizinhos aparecem esmaecidos, com faixas e eventos. Sem ela, as células ficam vazias e sem faixa.
- **R5** — Célula do dia (`Calendar Day`, `fDD1M`): o número (hoje em destaque, com a borda do frame), o **par de avatares** do estado do dia e até 2 chips de evento, mais _"+{n}"_ quando há outros. O par de avatares usa a foto de perfil de cada um (ou as iniciais): sobrepostos com ♥ quando juntos, lado a lado quando separados, e **ausente** em `unknown`. O **💋** fica no canto: com contagem > 0 mostra o número. Ao passar o mouse (ou ao focar), mostra _+1_. Tocar no 💋 abre um passo-a-passo pequeno _− {n} +_ (R19). Com `show_day_markers = false`, nem o par de avatares nem o 💋 aparecem. Tocar na célula seleciona o dia (R12).
- **R6** — **Faixas**: uma faixa por **trecho** (I4) em cada semana, na cor da preferência do casal (`color_together_home_1` = juntos na casa de quem é slot 1, `_home_2`, `_away`, `color_apart`). `unknown` não tem faixa. O rótulo aparece no começo do trecho e no começo de cada semana em que ele continua (`bandLabel`, I9). Dia futuro tem a faixa na mesma cor, com a opacidade de _planejado_. Tocar numa faixa abre _Editar período_ daquele trecho (R16).
- **R7** — **Eventos de vários dias** (viagem, visita e compromisso com fim) aparecem como um chip corrido acima das células que cobrem, com ícone do tipo e título (_"Paraty · fim de semana"_), e _"(cont.)"_ quando continuam da semana anterior. Evento de um dia é chip dentro da célula, ordenado com _dia inteiro_ primeiro e depois por hora. Tocar num evento abre _Editar evento_ (R18).
- **R8** — Legenda: os quatro estados com a cor de cada um (_"Juntos em {casa 1}"_, _"Juntos em {casa 2}"_, _"Viajando juntos"_, _"Separados"_) e a dica de avatares (_juntos_ / _separados_). Quando o mês visível tem algum dia `unknown`, entra _"Sem registro"_ com o traço vazio.
- **R9** — **Primeiro período**: com zero estadias no casal (leitura `ok`), o cartão _"Onde vocês estão hoje?"_ (`First Period Card`, `W9BK5`) aparece acima da grade, com _"Cria o primeiro período no calendário"_, as quatro opções (_Juntos em {casa 1}_, _Juntos em {casa 2}_, _Juntos em outra cidade_, _Separados_), _Desde_ (padrão hoje), _Até_ (opcional, vazio = em aberto), a _Cidade_ quando a opção é _outra cidade_, e _Criar no calendário_. O cartão some quando existe a primeira estadia.

**Ano** (`XEnYP`)

- **R10** — Kicker: no ano corrente, _"{n} dias juntos · {p}% do ano até agora"_, com `n` vivido (`countStates`, nunca futuro) e `p = floor(100 × n / dias decorridos)`. Num ano passado, _"{n} dias juntos · {p}% do ano"_. Num ano futuro, _"{n} dias juntos planejados"_ (contagem desenhada). Título _"{ano}"_ e as mesmas setas e controles do mês.
- **R11** — Uma linha por mês (_Jan … Dez_), com a régua _1 · 5 · 10 · 15 · 20 · 25 · 31_. Os trechos do mês são barras nas cores de R6, e o trecho `unknown` fica vazio. A parte futura aparece esmaecida (_planejado_). Hoje tem o anel do frame. À direita, a coluna _JUNTOS_ com _"{n} d"_ por mês (contagem desenhada), esmaecida nos meses futuros. Tocar numa linha abre aquele mês na visão _Mês_. Os ícones de evento dentro das barras do frame não são renderizados (seção 14).

**Painel _Onde a gente está_** (`n2aVYz`)

- **R12** — Cabeçalho: a data de hoje por extenso e _"Onde a gente está"_. Os blocos, em ordem:
  1. **Agora** (sempre sobre hoje), com _Ver período_ (abre _Editar período_ do trecho de hoje). O título e a linha de baixo saem de `nowSummary` (I10):
     - juntos na casa de um: _"Juntos em {cidade} há {n} dias"_ / _"{visitante} está visitando desde {d mmm}"_;
     - juntos, a casa é dos dois: _"Juntos em {cidade} há {n} dias"_ / _"Em casa desde {d mmm}"_;
     - viajando juntos: _"Viajando juntos há {n} dias"_ / _"Em {cidade} desde {d mmm}"_;
     - separados: _"Separados há {n} dias"_ / _"{A} em {cidade A} · {B} em {cidade B}"_;
     - `unknown`: _"Sem registro de onde vocês estão hoje"_ e o botão _Criar período_ (abre o Novo período em hoje). Os blocos 1b e 1c somem.

     `n` é a diferença em dias desde o começo do trecho (hoje no primeiro dia dá _"há 0 dias"_ → mostrado como _"desde hoje"_).
     - **1b.** Barra de progresso do trecho: _"{início}"_, _"dia {k} de {N}"_, _"{fim}"_. Trecho em aberto não tem barra.
     - **1c.** Até dois contadores. O primeiro é _"{destino} começa em {n} dias"_, para a próxima viagem ou visita com início depois de hoje. O segundo depende do estado: _"{visitante} volta pra casa em {n} dias"_ (juntos na casa de um: o primeiro dia depois de hoje em que o visitante está na casa dele), _"Voltam pra casa em {n} dias"_ (viajando juntos: o primeiro dia em que um dos dois está em casa), ou _"Juntos de novo em {n} dias"_ (separados: o primeiro dia futuro juntos). Um contador sem resposta não aparece.
  2. **O dia selecionado** (hoje, se nenhum): _"{Sexta, 25 set}"_ e _Hoje_ (volta a seleção para hoje; some quando já é hoje). Uma linha por pessoa: avatar, nome, cidade e o status, que é _"em casa"_, _"visitando · dia {k}"_ (na casa da outra pessoa), _"viajando · dia {k}"_ (fora das duas casas) ou _"sem registro"_. `k` conta a partir do começo da estadia dela. Depois vem _"Eventos do dia · {n}"_, com ícone, título, subtítulo (`eventSubtitle`, I11) e hora (ou _"dia inteiro"_). Tocar abre o evento. _Adicionar evento_ abre o modal nesse dia.
  3. **Próximos eventos**: os próximos 6 a partir de hoje (inclusive as ocorrências anuais e o aniversário de namoro, I7), com o selo _"{d} {MMM}"_, título e subtítulo. O _Ver todos_ do frame não é renderizado.
  4. **Resumo de {mês visível}**, com _Ano_ (troca para a visão Ano): _"{j} dias juntos"_ e _"{s} dias separados"_ grandes, e as linhas _"Em {casa 1} · {n} dias"_, _"Em {casa 2} · {n} dias"_, _"Viajando · {n} dias"_, _"Separados · {n} dias"_ (contagem desenhada). Quando `n > 0`, entra _"Sem registro · {n} dias"_.

**Novo período / Editar período** (`DLeES`)

- **R13** — _Novo período_ · _"Marque onde cada um vai estar"_. _Estado_: quatro cartões com o par de avatares e a cor da faixa. _Juntos em {casa 1}_ · _"{nome do slot 2} veio"_; _Juntos em {casa 2}_ · _"{nome do slot 1} foi"_; _Viajando juntos_ · _"Outra cidade"_; _Separados_ · _"Cada um na sua"_. _Cidade_ só com _Viajando juntos_ (o seletor de R17). _Início_ e _Fim_, os dois obrigatórios, com `Fim ≥ Início` e no máximo 366 dias. Se as duas casas são a mesma cidade, os dois primeiros cartões viram um só (_Juntos em {casa}_), e _Separados_ some.
- **R14** — _Prévia · {mês}_: a tira de 7 dias em volta do começo, com as faixas **depois** de salvar (`paintStays` sobre as estadias carregadas), e o rótulo colorido _"{n} dias {juntos em X | viajando | separados}"_. Quando a pintura apaga ou encurta algo que já existia, entra a linha _"Substitui {n} dias que já estavam no calendário"_.
- **R15** — _Salvar período_ → `paint_stays` com as entradas de `entriesForPeriod` (I3). _Separados_ pinta cada um na própria casa.
- **R16** — _Editar período_ (tocar numa faixa, ou _Ver período_): o mesmo modal, com o título _"Editar período"_ e o estado, a cidade e as datas do trecho preenchidos. Salvar pinta o novo intervalo, e **os dias do trecho antigo que ficaram de fora voltam para a casa de cada um** (`entriesForEdit`, I3 e seção 13, decisão 3). A prévia mostra isso. Trecho em aberto aparece com _Fim_ vazio, e salvar sem _Fim_ mantém o trecho em aberto. Rodapé extra: _Apagar período_, que pede confirmação (_"Nesses dias, cada um volta pra própria casa."_) e pinta as casas sobre o trecho inteiro. Esse botão some quando o trecho já é _Separados_ com cada um em casa, porque não mudaria nada. **Não há arrasto de faixa** (seção 14).

**Seletor de cidade** (usado no período, no evento e no primeiro período)

- **R17** — Um campo só. Com ≥ 2 caracteres, busca no IBGE (`searchCities`, já existente) e, com ≥ 3, no Photon (`layer=city`, a mesma chamada de `places.ts`, com debounce de 350 ms e cancelamento). Primeiro vêm as duas casas (_"Marau, RS · casa da Lana"_), depois os municípios do IBGE (_"Pelotas, RS"_), depois os resultados do Photon **de fora do Brasil** (_"Lisboa · Portugal"_, o país por `Intl.DisplayNames('pt-BR')`) e o crédito _"© OpenStreetMap"_. Resultado do Photon com `countrycode = BR` é **descartado**: cidade brasileira é sempre a linha do IBGE (I2). Escolher uma cidade estrangeira chama `ensureWorldCity` (seção 5) antes de gravar. Com o Photon fora, a lista traz só o Brasil e o aviso _"Busca mundial indisponível — mostrando cidades do Brasil"_.

**Novo evento / Editar evento** (`BOR8L`)

- **R18** — _Novo evento_ · _"Visitas e viagens já criam o período de onde vocês vão estar"_. _Tipo_: os 6 chips (_Viagem, Visita, Date, Data especial, Compromisso, Lembrete_). Os números ao lado dos chips no frame não são renderizados. Os campos por tipo (só a Visita está desenhada; os outros usam os mesmos componentes):

  | Tipo | Campos, na ordem |
  | --- | --- |
  | Viagem | Título · _Quem viaja_ (Gabriel / Lana / Os dois, padrão Os dois) · _Destino_ (R17) · _Ida_ (data + hora) · _Volta_ (data + hora) · _Dia inteiro_ (esconde as horas) · Nota · Vínculo com a lista |
  | Visita | igual à Viagem, com _Quem viaja_ padrão em quem está criando e _Destino_ padrão na casa da **outra** pessoa (_"· casa da {nome}"_); com _Os dois_, o destino vem vazio |
  | Date | Título · _Dia_ · _Hora_ (ou dia inteiro) · _Local_ (texto livre, opcional) · Nota · Vínculo com a lista |
  | Data especial | Título · _Dia_ · _Repete todo ano_ (padrão ligado) · Nota |
  | Compromisso | Título · _Início_ · _Fim_ (opcional) · _Hora_ (ou dia inteiro) · _Local_ · Nota |
  | Lembrete | Título · _Dia_ · _Até_ (hora, opcional) · Nota |

  _Vínculo com a lista_: busca por nome nos itens do casal (`list_items`), mostrando nome e categoria, com _×_ para desfazer. _Período automático_ (só Viagem e Visita, só ao **criar**): _"Como os dias vão ficar"_, o cartão _"{quem} viaja · {d mmm} → {d mmm}"_ com _"{n}d"_, a tira de duas semanas com o antes e o depois, e três linhas: _"+{n} dias juntos no ano"_ (ou _"−{n}"_, e some com zero), _"Separados em {mês}: {antes} → {depois} dias"_ (o mês é o que tem mais dias do evento, e no empate o primeiro; some se não muda) e _"Dá pra ajustar o período depois"_. _"Avisar a {outra} quando salvar"_ **não aparece** (seção 14). _Cancelar_ / _Salvar evento_.
- **R19** — Salvar um evento novo chama `create_event`, com `pintar = true` para Viagem e Visita. Evento de outro tipo nunca mexe em estadia.
- **R20** — _Editar evento_: o mesmo modal preenchido, título _"Editar evento"_. **O tipo não muda na edição.** Em Viagem e Visita, o bloco _Período automático_ dá lugar a _"Mudar datas ou destino aqui não muda o período — ajuste no calendário."_ (seção 13, decisão 3). Rodapé extra: _Apagar_, com a confirmação _"Apagar {título}?"_, e, em Viagem e Visita, _"Apagar {título}? O período no calendário continua."_.
- **R21** — O **aniversário de namoro** aparece como evento derivado de `couples.started_on`: _"{n} anos juntos"_ (_"1 ano juntos"_) no dia e mês do começo, para `n ≥ 1`, com o ícone de Data especial. Não se edita nem se apaga ali (vem das Configurações).

**💋**

- **R22** — O passo-a-passo do 💋 (R5): _+_ insere uma linha em `day_kisses` para o dia. _−_ apaga a linha **mais recente** do dia, de qualquer autor (o número é do casal). _−_ fica desabilitado em zero, e _+_ em 20. Dia futuro não tem 💋. O número só muda depois do `ok` do banco.

**Lista** (efeitos da Fase 4 que esta fase liga)

- **R23** — No detalhe do item (`ItemSheet`), entra _Agendar_ (item a fazer e item feito), que abre o _Novo evento_ do tipo **Date**, com o título igual ao nome do item e o vínculo já preenchido. Salvar mantém a pessoa na Lista, com o aviso _"Agendado para {d mmm}"_. O texto de `unknown` no _Perto de vocês_ passa a _"Sem registro de onde vocês estão hoje — marque no Calendário."_, com link para `/`.

**Configurações e export**

- **R24** — O export sobe para `version: 3` e ganha `calendar_events` (sem `couple_id` nem ids de perfil: quem viaja e quem criou vão como `slot`; a cidade vai como nome, UF/região e país) e `day_kisses`, agregado como `[{ day, count }]`. As cidades das estadias passam a levar `country_code` e a `region`, porque agora existem cidades de fora do Brasil.

**Gravação e releitura**

- **R25** — Como na Lista, a tela só mostra o valor depois do `ok` do banco. Os modais ficam abertos e desabilitados enquanto gravam. Na falha, continuam abertos com o que foi digitado e a causa. Depois de cada escrita própria, e sempre que a aba volta ao foco, o Calendário relê tudo (ADR 0015). Os 💋 são relidos só para a janela visível (seção 8).

## 4. Invariantes

- **I1** — **Uma posição por pessoa por dia** (`stays_no_overlap`, já existente). O estado do casal **nunca é gravado** (ADR 0002): faixa, rótulo, contagem, _Agora_ e prévia saem de `coupleStateOn` sobre as estadias.
- **I2** — **Uma cidade tem uma identidade.** Cidade brasileira é sempre a linha do IBGE (`couple_id` nulo, `ibge_code` preenchido). Cidade de fora é uma linha **do casal** (`couple_id` preenchido, `osm_ref` preenchido, `country_code <> 'BR'`), única por `(couple_id, osm_ref)`. Os dois integrantes escolhendo Lisboa gravam o **mesmo** `city_id`, e por isso a derivação diz _Viajando juntos_ em vez de _Separados_. Uma estadia ou evento só referencia cidade global ou do próprio casal (trigger).
- **I3** — **Período se grava pintando** (ADR 0018). `paint(pessoa, cidade, de, até)` sobrescreve a pessoa naquele intervalo: o que ficava inteiro dentro é apagado, o que atravessava é cortado, e o que cobria o intervalo é partido em dois, com o pedaço de depois mantendo o fim original, inclusive o em aberto. Depois, estadias vizinhas da mesma pessoa **na mesma cidade** são fundidas. As entradas de uma chamada valem **em ordem**, numa transação. `paintStays` (domínio, puro) e `paint_stays` (banco) dão o mesmo resultado para a mesma tabela de casos (A2).
- **I4** — **Trecho** é a maior sequência de dias consecutivos com a mesma chave de estado: `together:{city}`, `apart:{cityA}:{cityB}` (na ordem dos slots) ou `unknown`. As faixas, o ano, o _Agora_ e o _Editar período_ usam a mesma função `runs`. Um trecho em aberto é o que termina onde as duas estadias estão em aberto.
- **I5** — **Duas contagens, com nomes diferentes.** `countStates` (existente) conta dias **vividos**: nunca passa de hoje. Ela vale para _"dias juntos em {ano}"_, _"% do ano até agora"_, _"há {n} dias"_ e o resumo das Configurações. `countDrawn` conta o que está **desenhado** numa janela: estadia em aberto vai até o fim da janela (`effectiveEndForDisplay`), e dia futuro com estadia conta como _planejado_. Ela vale para o kicker do mês, a coluna _JUNTOS_ do ano, o _Resumo de {mês}_ e a prévia. Nenhuma tela usa uma no lugar da outra.
- **I6** — **O evento pinta uma vez.** `create_event` com `pintar` grava o evento e as estadias na mesma transação. Depois disso, as estadias são a verdade: editar ou apagar o evento **não** mexe nelas, e nenhuma estadia referencia evento (ADR 0018).
- **I7** — **Ocorrência não é linha.** Data especial com `repeats_yearly` aparece em todo ano, no dia e mês de `starts_on` (29/2 cai em 28/2 nos anos não bissextos), com _"{n} anos"_ quando `n = ano − ano de início ≥ 1`. O aniversário de namoro é derivado de `couples.started_on` (R21). Nenhum dos dois grava uma linha por ano.
- **I8** — **Formato do evento, cobrado no banco** (`calendar_events_format`) e espelhado em `validateEvent`:
  - viagem e visita: `travelers`, `city_id` e `ends_on` preenchidos; `place` nulo;
  - as outras: `travelers`, `traveler_id` e `city_id` nulos;
  - `travelers = 'solo'` ⇔ `traveler_id` preenchido;
  - `ends_on` só em viagem, visita e compromisso, com `ends_on ≥ starts_on` e no máximo 366 dias;
  - `repeats_yearly` só em data especial;
  - `place` só em date e compromisso;
  - `all_day` ⇒ `starts_at` e `ends_at` nulos; `ends_at` só em viagem e visita.
- **I9** — `bandLabel(run)` é uma função pura: juntos na casa de um → _"{visitante} em {cidade curta}"_; juntos na casa dos dois → _"Juntos em {cidade curta}"_; viajando → _"{cidade curta}"_; separados → _"Separados · {cidade curta A} e {cidade curta B}"_. `shortCityName`: um nome com 3 ou mais palavras significativas (descontando _de, da, do, dos, das, e_) vira as iniciais em maiúsculas (_São José dos Campos_ → _SJC_). Os outros nomes ficam inteiros (_Rio de Janeiro_, _Marau_, _Lisboa_). O calendário inteiro usa a cidade curta em faixa, legenda, cartão e resumo, e a cidade inteira nas linhas de pessoa do painel e no seletor.
- **I10** — `nowSummary` e `personStatus` são funções puras de `(hoje, estadias, integrantes, eventos)`. `unknown` nunca vira _separados_ nem _em casa_ (ADR 0002).
- **I11** — `eventSubtitle`: com vínculo → _"{Tipo} · da nossa lista"_; viagem/visita → _"{cidade}, {UF ou país} · {n} dias"_; data especial anual → _"Data especial · {n} anos"_ (ou só _"Data especial"_); lembrete com hora → _"Lembrete · até {hh:mm}"_; com local → _"{Tipo} · {local}"_; senão, _"{Tipo}"_. A hora da coluna direita é `starts_at` (_"dia inteiro"_ sem ela).
- **I12** — 💋: no máximo 20 por casal por dia (trigger, `day_kisses_limit`), nunca em dia futuro (tolerância de um dia para o fuso, `day_kisses_future`). O número **nunca sai da tela do Calendário**: não aparece na Home, na Lista, nas Configurações nem em aviso nenhum. A única outra saída é o export (R24).
- **I13** — Toda estadia e todo evento pertencem ao casal de quem grava, e `profile_id`, `traveler_id` e `created_by` são integrantes desse casal no momento da escrita (trigger, como `list_items_members`). `couple_id` de evento não muda depois de criado.

## 5. Contrato & dados

### Contrato compartilhado — `src/domain/calendar.ts` (puro)

```ts
export const EVENT_KINDS = ['viagem', 'visita', 'date', 'data_especial', 'compromisso', 'lembrete'] as const
export type EventKind = (typeof EVENT_KINDS)[number]
export const TRAVEL_KINDS = ['viagem', 'visita'] as const
export const EVENT_KIND_LABEL: Record<EventKind, string>   // 'Viagem', 'Visita', 'Date', 'Data especial', …
export const CALENDAR_LIMITS = { title: 80, note: 280, place: 80, spanDays: 366,
  kissesPerDay: 20, paintEntries: 8, upcoming: 6 } as const

export type Band = 'home1' | 'home2' | 'away' | 'apart' | 'unknown'
export interface Run { from: string; to: string | null; band: Band; key: string;
  cityId: string | null; positions: { profileId: string; cityId: string }[] }
export interface PaintEntry { profileId: string; cityId: string; from: string; to: string | null }

export interface CalendarEvent { id; kind: EventKind; title; startsOn; endsOn: string | null;
  allDay: boolean; startsAt: string | null; endsAt: string | null;
  travelers: 'both' | 'solo' | null; travelerId: string | null; cityId: string | null;
  place: string | null; repeatsYearly: boolean; note: string | null; listItemId: string | null;
  createdBy: string | null }
export interface Occurrence { event: CalendarEvent | null /* null = aniversário derivado */;
  day: string; endDay: string; title: string; years: number | null }

export function paintStays(stays: readonly Stay[], entries: readonly PaintEntry[], newId: () => string): Stay[]  // I3
export function entriesForPeriod(draft: PeriodDraft, members: MembersBySlot): PaintEntry[]
export function entriesForEdit(old: Run, next: PeriodDraft, members: MembersBySlot): PaintEntry[]   // "volta pra casa"
export function entriesForEvent(event: EventDraft, members: MembersBySlot): PaintEntry[]            // o mesmo que create_event faz
export function runs(stays, members, from: string, to: string): Run[]                                 // I4, cortados na janela
export function runAround(day: string, stays, members): Run                                          // bordas reais, to = null se em aberto
export function bandOf(state: CoupleState, members: MembersBySlot): Band
export function countDrawn(from: string, to: string, stays, members): Record<Band, number>             // I5
export function bandLabel(run: Run, names: NamesBySlot, cities: CityMap, members: MembersBySlot): string  // I9
export function shortCityName(name: string): string                                                  // I9
export function nowSummary(today, stays, members, events, cities): NowSummary                          // R12.1, I10
export function personStatus(profileId, day, stays, members): { cityId: string | null;
  status: 'home' | 'visiting' | 'traveling' | 'unknown'; dayN: number | null }
export function occurrences(events, couple: { startedOn: string }, from: string, to: string): Occurrence[]  // I7
export function upcoming(occurrences, today: string, n = CALENDAR_LIMITS.upcoming): Occurrence[]
export function eventSubtitle(o: Occurrence, ctx): string                                             // I11
export function previewImpact(stays, entries, members, event: { from: string; to: string }): {
  togetherDeltaYear: number; month: string | null; apartBefore: number; apartAfter: number }
export function validateEvent(draft): { ok: true } | { ok: false; field: string; reason: string }     // espelha o CHECK
export function monthWeeks(year: number, month: number, weekStartsOn: 'sun' | 'mon'): string[][]
```

`MembersBySlot` é `{ 1: Member, 2: Member }`, com `Member` de `coupleState.ts` (a cidade-casa já está lá). `Band` sai do estado e dos slots: juntos na casa do slot 1 → `home1`, na do slot 2 → `home2`, na casa dos dois → `home1`, fora das duas → `away`. A cor de cada `Band` é a coluna de `couple_settings` com o mesmo nome.

`src/domain/paintCases.ts` e `src/domain/eventValidationCases.ts` são as tabelas de casos que rodam **nos dois lados** (A2, A3), como `listValidationCases.ts`. Os casos de pintura: intervalo dentro de uma estadia fechada, dentro de uma aberta (parte em duas, o fim continua em aberto), cobrindo várias, encostando na borda, pintando em aberto (apaga tudo depois), fusão com a vizinha na mesma cidade, duas entradas na mesma chamada em que a segunda sobrescreve a primeira, e pessoa sem estadia nenhuma.

### Migration 1 — `…_world_cities.sql` (ADR 0017)

Antes do `db:push`: `select count(*) from cities where country_code <> 'BR'` (esperado: 0; se não for, parar e olhar).

```sql
alter table public.cities
  add column couple_id uuid references public.couples (id) on delete cascade,
  add column osm_ref   text check (osm_ref ~ '^[NWR][0-9]+$'),
  add column region    text check (char_length(region) <= 80),
  add constraint cities_scope check (
    couple_id is null or (osm_ref is not null and country_code <> 'BR' and country_code ~ '^[A-Z]{2}$')),
  add constraint cities_osm_unique unique (couple_id, osm_ref);
create index cities_couple_idx on public.cities (couple_id);

-- leitura: as globais (IBGE) e as do próprio casal
drop policy <select atual> on public.cities;
create policy "cities_select_global_or_couple" on public.cities for select to authenticated
  using (couple_id is null or couple_id in (select private.my_couple_ids()));
-- escrita: só cidade de fora, do próprio casal. Sem update nem delete.
create policy "cities_insert_world_couple" on public.cities for insert to authenticated
  with check (couple_id in (select private.my_couple_ids()) and osm_ref is not null);
-- search_cities: acrescenta `couple_id is null` — a busca por nome continua só no IBGE
```

`cities_br_has_ibge_code` (Fase 2) continua valendo e, junto com `cities_scope`, garante I2: o cliente não consegue criar uma segunda Marau. A escrita em `cities` volta a ser aberta ao cliente, **mas só num recorte que ninguém de fora do casal lê**. É isso que o ADR 0017 registra contra o 0007: o motivo do 0007 (_"uma grafia errada de um casal apareceria na busca de todos"_) não se aplica a uma linha que só o casal vê. `profiles.home_city_id` e `couple_saved_cities` continuam só no IBGE (as telas deles não mudam).

### Migration 2 — `…_calendar.sql`

```sql
create table public.calendar_events (
  id             uuid primary key default gen_random_uuid(),
  couple_id      uuid not null references public.couples (id) on delete cascade,
  kind           text not null check (kind in ('viagem','visita','date','data_especial','compromisso','lembrete')),
  title          text not null check (char_length(btrim(title)) between 1 and 80),
  starts_on      date not null,
  ends_on        date,
  all_day        boolean not null default true,
  starts_at      time,
  ends_at        time,
  travelers      text check (travelers in ('both','solo')),
  traveler_id    uuid references public.profiles (id) on delete set null,
  city_id        uuid references public.cities (id),
  place          text check (char_length(place) <= 80),
  repeats_yearly boolean not null default false,
  note           text check (char_length(note) <= 280),
  list_item_id   uuid,
  created_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (list_item_id, couple_id) references public.list_items (id, couple_id)
    on delete set null (list_item_id),                        -- apagar o item desfaz o vínculo, não o evento
  constraint calendar_events_format check (...)             -- I8, um bloco por regra
);
create index on public.calendar_events (couple_id, starts_on);
create index on public.calendar_events (traveler_id);
create index on public.calendar_events (city_id);
create index on public.calendar_events (list_item_id);
create index on public.calendar_events (created_by);

create table public.day_kisses (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples (id) on delete cascade,
  day        date not null,
  added_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.day_kisses (couple_id, day);
create index on public.day_kisses (added_by);
```

**Triggers** (funções em `private`): `updated_at` e `couple_id` imutável em `calendar_events`; `calendar_events_members` (`traveler_id` e `created_by` integrantes; `city_id` global ou do casal; `security definer` só para ler `couple_members`, como `list_items_members`); `stays_members` (o mesmo para `stays.profile_id`, `created_by` e `city_id`, que hoje não é conferido); `day_kisses_guard` (no máximo 20 por `(couple_id, day)` → `23514` / `day_kisses_limit`; `day > current_date + 1` → `23514` / `day_kisses_future`).

**RLS:**

| Tabela | select | insert | update | delete |
| --- | --- | --- | --- | --- |
| `calendar_events` | casal | casal, `created_by = auth.uid()` | casal | casal |
| `day_kisses` | casal | casal, `added_by = auth.uid()` | — | casal |
| `stays` | (sem mudança: `for all` casal) | | | |

**RPC `paint_stays`** — `security invoker`, `set search_path = ''`, `revoke from public, anon`, `grant to authenticated`:

```
paint_stays(p_entries jsonb) → jsonb          -- [{profile_id, city_id, from, to|null}], 1..8, em ordem
  sem sessão → 42501
  sem casal → {status:'not_member'}
  entrada malformada (from > to, > 8 entradas, campo faltando) → 22023
  pg_advisory_xact_lock(hashtextextended(<couple_id>::text, 0))   -- duas pinturas do casal em fila
  para cada entrada: cortar/partir/apagar as estadias da pessoa no intervalo → inserir → fundir vizinhas (I3)
  perfil fora do casal ou cidade de outro casal → o trigger recusa (23514) e a transação inteira volta
  → {status:'ok'}
```

**RPC `create_event`** — mesmas marcas:

```
create_event(p_event jsonb, p_paint boolean) → jsonb
  sem sessão → 42501 · sem casal → {status:'not_member'}
  insere o evento (o CHECK valida o formato)
  se p_paint e kind in (viagem, visita): mesmo lock; pinta cada viajante na cidade de starts_on a ends_on
  (both → os dois integrantes, solo → traveler_id), pela mesma rotina interna de paint_stays
  → {status:'ok', id}
```

As duas são `invoker`, então a contagem de `security definer` em `public` **continua doze** (A11). Elas existem pela atomicidade: sem elas, pintar duas pessoas seriam quatro ou seis escritas soltas, e uma falha no meio deixaria uma pessoa em dois lugares ou em lugar nenhum. Editar e apagar evento, e o 💋, são `update`/`insert`/`delete` diretos. A rotina de pintura mora numa função `private.paint_one(...)`, `invoker`, chamada pelas duas RPCs, para a regra existir uma vez no banco.

### Cliente — fronteira de dados

- `src/data/calendar.ts`: `loadCalendar()` → `DataResult<{ stays, events, members, couple, settings, cities }>`, em `select`s paralelos sem filtro de casal, e as cidades resolvidas por `loadCitiesByIds` sobre os `city_id` de estadias, eventos e casas (estendida para devolver `countryCode` e `region`). `loadKisses(from, to)` → `DataResult<Map<day, count>>`. `paint(entries)`, `createEvent(draft, paint)`, `updateEvent(id, patch)`, `deleteEvent(id)`, `addKiss(day)`, `removeKiss(day)` (lê o `id` mais recente do dia e apaga por `id`). As escritas devolvem `ok` / `invalid` (constraint nomeada) / `kiss_limit` / `not_member` / `unauthenticated` / `error`. O snake_case não passa da fronteira. `insertStay` sai de `stays.ts` (ninguém grava estadia fora da pintura).
- `src/data/worldCities.ts`: `searchWorldCities(query, { signal })` reaproveita `searchPlaces(…, { mode: 'city' })` e filtra `countryCode !== 'BR'`. `ensureWorldCity(candidate)` faz `insert … on conflict (couple_id, osm_ref) do nothing` e depois `select id` pela `osm_ref`: duas pessoas escolhendo Lisboa ao mesmo tempo terminam no mesmo `id`. `places.ts` passa a mapear `osm_type` + `osm_id` do Photon para `osmRef` (`'R' + 5400890`), e as fixtures gravadas da Fase 4 ganham esse campo.
- `CalendarApi` injetável (como `ListApi`), com `today` e `newId` injetados, para o teste de interface andar sem rede e sem relógio.

### Compatibilidade

- `database.types.ts` regenerado. O export vai para `version: 3` (R24), e `export.test.ts` é estendido.
- `src/app/Shell.tsx`: sai a prop `calendar`, entra `calendarApi`, a rota `calendar` renderiza `src/calendar/CalendarScreen.tsx`, e entra o botão Adicionar (R1). `router.ts` não muda: `/` e `/calendario` já existem, e a visão (mês/ano), o mês visível e o dia selecionado são estado da tela (ADR 0013, gatilho não atingido).
- `src/list/`: _Agendar_ no `ItemSheet` e o texto de `unknown` (R23). O modal de evento (`src/calendar/EventModal.tsx`) é importado pela Lista, e não copiado.
- `src/data/stays.ts`: `listStays` e `listMembers` ficam. `insertStay` sai.
- A spec da Fase 4 dizia _"`Agendar de novo` não aparece (Fase 5)"_: agora aparece como _Agendar_, em qualquer item.
- `CLAUDE.md` (seções _Renderização e arrasto_, _Persistência_ e _Estado atual_), `project_architecture.md`, `falhas-silenciosas.md` e a tabela de evidência do ADR 0002 citam `Calendar.tsx`, `useBarDrag.ts`, `together.ts` e `timeline/storage.ts`. Tudo isso é reescrito no fechamento.

## 6. Identidade & nomes

- **Tipos de evento:** as 6 chaves de `EVENT_KINDS` são nome de dado, e mudar custa migration. `data_especial` tem underscore, como as colunas.
- **`osm_ref`:** a primeira letra do `osm_type` do Photon (`N`, `W` ou `R`) mais o `osm_id`. É a chave de dedupe da cidade estrangeira dentro do casal. **Um `id` de OSM não é estável para sempre**, mas a cidade só é resolvida no momento de gravar: se o OSM renumerar Lisboa, a próxima escolha cria uma segunda linha, e a derivação diria _Separados_ para um casal com uma estadia em cada linha. O risco está na seção 12.
- **Quem viaja:** `travelers` `'both' | 'solo'` + `traveler_id`, por **perfil**, como o `done_with` da Fase 4.
- **Bandas:** `home1` e `home2` são por **slot**, não por cidade (a cor da Fase 3 é por slot). Trocar a cidade-casa troca o rótulo da faixa, não a cor.
- **Nomes das constraints e erros** (`calendar_events_format`, `day_kisses_limit`, `day_kisses_future`, `cities_scope`, `stays_no_overlap`): a fronteira de dados os lê para dizer o que falhou. Renomear quebra a mensagem, e o teste pega.
- **Tabela `day_kisses`:** o nome é o do ícone da tela, de propósito discreto. O significado está registrado aqui (contador de relações do casal no dia) e em nenhum texto de interface.

## 7. Comportamento em falha

- **Leitura inicial.** Qualquer `DataResult` que não seja `ok` troca a tela por _"Não deu pra carregar o calendário: {causa}"_ com _Tentar de novo_. **Nunca** mostra o cartão _Primeiro período_ (R9) sem leitura `ok`: com o projeto pausado, um calendário vazio convidando a "criar o primeiro período" faria o casal regravar a história por cima.
- **Releitura no foco falhou.** Mantém o que está na tela e mostra _"Não deu pra atualizar — mostrando o que já estava aqui"_.
- **💋 do mês falhou, o resto não.** O calendário abre, o 💋 não aparece, e fica o aviso discreto. Não se mostra _0_ sem ter lido.
- **Pintura.** `paint_stays` é tudo ou nada. Falhou → o modal continua aberto com o que foi escolhido, e a causa aparece. `stays_no_overlap` aqui é bug (a RPC corta antes de inserir) e aparece com o nome da constraint. `not_member` → _"Este espaço mudou — recarregue"_.
- **Duas pessoas pintando ao mesmo tempo.** O lock por casal põe uma atrás da outra, e vence a última. A outra pessoa vê o resultado quando a aba volta ao foco. A prévia dela pode ter sido feita sobre estadias velhas, e isso é aceito, pelo mesmo motivo da seção 7 da Fase 3.
- **Evento de viagem — cascata.** (1) Se o destino é estrangeiro e novo, `ensureWorldCity`. (2) `create_event` com a pintura. Se (1) falha, nada é gravado. Se (2) falha, a cidade fica em `cities` sem uso, e isso é aceito: a próxima escolha de Lisboa a reaproveita pela `osm_ref`. O modal mostra a causa e mantém tudo preenchido.
- **Photon fora.** O seletor mostra só o Brasil com o aviso (R17). Com IBGE e Photon fora, o seletor diz _"A busca de cidades está fora do ar — tente de novo em instantes"_, e salvar fica desabilitado onde a cidade é obrigatória.
- **Item da lista apagado com evento vinculado.** O vínculo vira nulo (FK `set null`), e o evento continua. O subtítulo deixa de dizer _"da nossa lista"_.
- **Integrante saiu do casal.** As estadias dele continuam (ADR 0002 não apaga história). Com um integrante só, `coupleStateOn` não roda: a tela mostra o calendário sem faixas e a mensagem _"O calendário precisa de vocês dois — convide de novo em Configurações"_, e não o cartão _Primeiro período_.
- **💋 no limite ou em corrida.** `day_kisses_limit` → _"Esse dia já está no máximo"_ e releitura. _−_ que apaga zero linhas (a outra pessoa tirou antes) → releitura, sem erro.
- **Relógio do cliente adiantado ou atrasado.** _Hoje_ é a data local do aparelho. A tolerância de um dia do `day_kisses_future` cobre fuso (Lisboa está 4 h à frente). Nenhuma outra regra do banco depende de hoje.
- **Import do `localStorage`.** Não existe. A chave é removida e ponto (seção 13, decisão 4).

## 8. Limites & orçamentos

- **Leitura:** estadias, eventos e cidades inteiros, sem paginação. Esperado: dezenas de estadias por ano por pessoa e centenas de eventos. O teto de cuidado é **2000 estadias ou 2000 eventos**: acima disso, paginar ou recortar por janela. Não acontece nesta fase.
- **💋:** lido por janela (`day between` o primeiro e o último dia da grade visível), para não crescer com os anos. No máximo 42 dias × 20 = 840 linhas por leitura, e na prática dezenas.
- **Derivação:** a visão Ano chama `coupleStateOn` 365 vezes, cada uma varrendo as estadias. O `coupleState.perf.test.ts` existente prova o teto, e ele ganha um caso para `runs` num ano com 200 estadias, em menos de 50 ms no CI.
- **Pintura:** até 8 entradas por chamada, e um intervalo de no máximo 366 dias por entrada, exceto quando é em aberto.
- **Photon:** o mesmo orçamento da Fase 4 (≥ 3 caracteres, 350 ms, uma requisição em voo, `limit=5`), agora também no seletor de cidade.
- **Cidades estrangeiras:** uma linha por cidade distinta que o casal visita. Sem teto: dezenas na vida do casal.

## 9. Segurança & permissões

- **Casal:** `calendar_events` e `day_kisses` são cortadas por `private.my_couple_ids()`. O cliente não filtra por `couple_id` (ADR 0001). No `insert` ele manda o `couple_id`, e o `with check` recusa outro.
- **Cidades:** a linha estrangeira é visível só ao casal que a criou. Uma estadia ou evento não pode apontar para cidade de outro casal (trigger), mesmo sabendo o `uuid`. A busca por nome (`search_cities`) nunca devolve cidade de casal. Sem `update`/`delete` em `cities` para o cliente: uma cidade referenciada não muda de nome embaixo de uma estadia.
- **Pintura:** `paint_stays` e `create_event` são `invoker`, e a RLS de `stays` vale dentro delas. Os triggers conferem que cada pessoa pintada é do casal. Nenhum `security definer` novo em `public`.
- **💋 é dado íntimo.** Fica só na tela do Calendário e no export (I12). Não entra em aviso, e-mail, Home, painel da Lista, contagem das Configurações nem log. Não se registra `added_by` na tela: o número é do casal.
- **Terceiro (Photon):** o que se digita no seletor de cidade sai para `photon.komoot.io`, nas mesmas condições do ADR 0016 (`credentials: 'omit'`, `referrerPolicy: 'no-referrer'`). Título, nota, 💋 e estadias **nunca** saem.
- **Testes em produção:** `supabase/tests/calendar.test.ts` cria e apaga só casais `@test.local` (ADR 0014), e as cidades estrangeiras que ele cria morrem com o casal (`on delete cascade`).

## 10. Critérios de aceite (testáveis)

| # | Critério (Dado/Quando/Então) | Como provar |
| --- | --- | --- |
| A1 | `EVENT_KINDS` é idêntico ao `CHECK` de `calendar_events.kind`, e `CALENDAR_LIMITS` bate com os `CHECK` de tamanho e com o trigger do 💋 | `supabase/tests/calendar.test.ts` (lê `pg_constraint` e `pg_proc`) + `src/domain/calendar.test.ts` |
| A2 | `paintStays` e `paint_stays` dão **o mesmo** conjunto de estadias para cada caso de `paintCases.ts` (inclusive partir estadia aberta, pintar em aberto, fundir vizinhas e duas entradas em ordem) | `src/domain/calendar.test.ts` + `calendar.test.ts` (db), a mesma tabela importada pelos dois |
| A3 | `validateEvent` recusa e aceita exatamente o que `calendar_events_format` recusa e aceita (viagem sem destino, date com `city_id`, `solo` sem viajante, `repeats_yearly` em compromisso, `ends_on` em lembrete, `all_day` com hora, 367 dias) | `calendar.test.ts` (domínio e db), `eventValidationCases.ts` compartilhado |
| A4 | `runs` e `runAround` (trecho em aberto, trecho que cruza o mês, `unknown` no meio); `bandOf` para as 5 bandas, inclusive a casa dos dois; `countDrawn` conta futuro e estadia aberta até o fim da janela, e `countStates` não; `bandLabel` e `shortCityName` (_SJC_, _Rio de Janeiro_, _Lisboa_) | `src/domain/calendar.test.ts` |
| A5 | `nowSummary` para visitando, casa dos dois, viajando, separados e `unknown`, com _"há {n} dias"_, _"dia {k} de {N}"_ e os dois contadores (e a ausência deles quando não há resposta); `personStatus` para os 4 status | `src/domain/calendar.test.ts` |
| A6 | `occurrences`: data especial anual em 3 anos, com _"{n} anos"_; 29/2 em ano não bissexto; aniversário de namoro derivado (`n ≥ 1`); evento de vários dias cruzando o mês. `upcoming` corta em 6. `eventSubtitle` para cada ramo de I11. `previewImpact` do cenário da seção 2 | `src/domain/calendar.test.ts` |
| A7 | Pessoa A do casal 1 lê, cria, edita ou apaga evento, 💋, estadia e cidade estrangeira do casal 2 → zero linhas ou recusa. Evento ou estadia com `city_id` de cidade estrangeira do casal 2 → recusa. `paint_stays` com `profile_id` de fora → recusa, e nada muda | `calendar.test.ts` (db), padrão de `rls.test.ts` |
| A8 | `cities`: inserir cidade com `country_code = 'BR'` e `couple_id` → recusa (`cities_scope`); a mesma `osm_ref` duas vezes no casal → um `id` só; `update`/`delete` em `cities` → zero linhas; `search_cities('Lisboa')` não devolve a cidade do casal | `calendar.test.ts` (db) |
| A9 | `create_event` de visita com pintura grava o evento **e** parte a estadia aberta do viajante. Com um destino de outro casal, **nada** é gravado. Evento de date com `p_paint = true` não mexe em estadia. Editar e apagar o evento não mexem em estadia (I6). Apagar o item vinculado deixa o evento com `list_item_id` nulo | `calendar.test.ts` (db) |
| A10 | 💋: o 21º do dia → `day_kisses_limit`; dia depois de amanhã → `day_kisses_future`; B apaga o 💋 de A (o número é do casal) | `calendar.test.ts` (db) |
| A11 | `public` continua com as doze `security definer`; `paint_stays` e `create_event` são `invoker`, sem `EXECUTE` para `anon` | A20 de `onboarding.test.ts`, sem mudar a lista + asserção nova |
| A12 | `places.ts` mapeia `osmRef` das fixtures gravadas; `searchWorldCities` descarta resultado BR; `ensureWorldCity` com conflito devolve o `id` existente | `src/data/places.test.ts` + `src/data/worldCities.test.ts` (fetch e db simulados) |
| A13 | Tela: leitura em voo → esqueleto; `error` → mensagem e _Tentar de novo_ e **nunca** o _Primeiro período_; `ok` com zero estadias → _Primeiro período_; _Separados_ + _Criar no calendário_ chama `paint` com as duas casas em aberto | `src/calendar/CalendarScreen.test.tsx` |
| A14 | Mês: `week_starts_on = 'mon'` começa em _SEG_; `show_adjacent_days = false` esvazia as células vizinhas; `show_day_markers = false` esconde avatares e 💋; as faixas usam as cores de `couple_settings`; dia `unknown` não tem faixa nem avatar, e a legenda ganha _Sem registro_; evento de vários dias vira chip corrido com _"(cont.)"_; o kicker usa `countDrawn` | `src/calendar/MonthView.test.tsx` |
| A15 | Ano: `calendar_default_view = 'year'` abre no ano; kicker do ano corrente usa `countStates` e o percentual; tocar numa linha abre o mês | `src/calendar/YearView.test.tsx` |
| A16 | Painel: os textos de _Agora_ para visitando, separados e `unknown` (com _Criar período_); os contadores; selecionar um dia troca o bloco 2, e _Hoje_ volta; _Próximos eventos_ mostra 6 e inclui o aniversário; o _Resumo_ ganha _Sem registro_ quando há | `src/calendar/CalendarPanel.test.tsx` |
| A17 | Novo período: os 4 cartões, com os nomes e as casas; _Cidade_ só com _Viajando juntos_; casas iguais → 3 cartões; _Fim_ antes do _Início_ bloqueia; a prévia mostra o depois e _"Substitui {n} dias…"_; salvar chama `paint` com `entriesForPeriod`. Editar período: tocar numa faixa abre preenchido; encurtar manda os dias tirados para casa; _Apagar período_ pede confirmação | `src/calendar/PeriodModal.test.tsx` |
| A18 | Novo evento: cada um dos 6 tipos mostra exatamente os campos da tabela de R18; Visita traz o destino na casa da outra pessoa; _Período automático_ só em viagem e visita e só ao criar, com as três linhas do cenário; _"Avisar a…"_ não existe; editar não troca o tipo e mostra o aviso do período; apagar viagem avisa que o período continua; o seletor de cidade põe as casas primeiro, descarta Photon BR e chama `ensureWorldCity` antes de `createEvent` | `src/calendar/EventModal.test.tsx` |
| A19 | 💋: _+_ chama `addKiss` e só muda o número no `ok`; _−_ desabilitado em zero; _+_ desabilitado em 20; dia futuro sem 💋; falha no 💋 do mês não derruba a tela | `MonthView.test.tsx` |
| A20 | `visibilitychange` → `visible` relê; releitura com `error` mantém a tela e avisa | `CalendarScreen.test.tsx` |
| A21 | Casca: `/` renderiza o Calendário novo; o botão Adicionar abre o seletor e cada opção leva ao lugar certo; nenhum arquivo importa `src/timeline/`, e a pasta não existe | `src/app/Shell.test.tsx` + `test ! -d src/timeline` no verify |
| A22 | Lista: _Agendar_ abre o evento Date com título e vínculo; o texto de `unknown` do painel mudou; com estadias de _juntos em SJC_ no banco, o _Perto de vocês_ aparece | `ItemSheet.test.tsx` + `ListPanel.test.tsx` |
| A23 | Export `version: 3` com `calendar_events` (slots, sem UUID de perfil nem `couple_id`) e `day_kisses` agregado por dia; cidade estrangeira da estadia sai com `country_code` | `src/data/export.test.ts` |
| A24 | Fluxo real no online, com duas contas: primeiro período _Separados_; visita do Gabriel a Marau criando o período; viagem dos dois a Lisboa (cidade estrangeira nova), com a outra conta vendo _Lisboa_ na faixa amarela ao voltar à aba; editar um período encurtando; um 💋 de cada lado; o painel da Lista mostrando _Perto de vocês_ num dia juntos | roteiro manual, com prints no ledger |
| A25 | `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:db` e `npm run build` limpos (há arquivo apagado e movido: o build é obrigatório, ver CLAUDE.md) | saída dos comandos no verify |

## 11. Abordagem de teste

O domínio puro (`src/domain/calendar.ts`) é onde está quase toda a regra: pintura, trechos, bandas, as duas contagens, o _Agora_, as ocorrências e os subtítulos. Ele fica no projeto `domain` do vitest. As duas regras que moram em dois lugares (a pintura, com a RPC, e o formato do evento, com o `CHECK`) se provam com **a mesma tabela de casos** rodando no domínio e no banco (A2, A3), como na Fase 4.

Interface em jsdom (ADR 0005), com `CalendarApi`, `today` e `newId` injetados: cada tela se prova renderizando e clicando. O seletor de cidade se prova com `fetch` simulado e as fixtures gravadas do Photon, agora com `osm_id`.

Banco: `supabase/tests/calendar.test.ts`, contra o online (ADR 0014), com dois casais `@test.local`. Roda no verify, fora do hook `Stop`.

Manual, e por quê: A24. Ele cruza o Photon real, duas sessões e a Lista lendo as estadias gravadas pelo Calendário, que é o uso de verdade.

## 12. Riscos & mitigações

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| A pintura cortar ou fundir errado numa borda (inclusivo, em aberto) | História apagada sem erro | A tabela de casos (A2) roda nos dois lados. A prévia mostra _"Substitui {n} dias"_ antes de salvar. As bordas são as mesmas de `falhas-silenciosas.md` |
| _"Volta pra casa"_ não ser o que aconteceu (a Lana foi de SJC direto para Curitiba) | Dias gravados na cidade errada | O modal mostra o depois antes de salvar, e o caso real se registra com uma Visita ou Viagem por cima. Gatilho para rever: o casal corrigir isso à mão mais de uma vez |
| O evento pinta uma vez, e mudar a data dele depois não move o período | Evento e faixa discordando | O modal de edição diz isso no lugar do _Período automático_ (R20). Ligar evento e estadias foi descartado no ADR 0018: é a segunda verdade que o ADR 0002 proíbe |
| `osm_ref` renumerado pelo OSM | Duas linhas para Lisboa no casal, e _Separados_ onde era _juntos_ | Raro para cidade, e só afeta escolhas novas. O teste A8 garante a dedupe. Se acontecer, é uma migration de fusão de duas linhas. O ADR 0017 registra o gatilho |
| Photon devolver bairro ou distrito como "cidade" | Cidade estrangeira com nome estranho | É a mesma camada `city` que a Fase 4 já usa (ADR 0016), e o casal vê o nome antes de escolher |
| 💋 vazar para outra superfície | Constrangimento | I12, com a lista de onde **não** aparece. Revisão cobra que `day_kisses` só é importado por `src/calendar/` e por `export.ts` (`grep` no verify) |
| Apagar a timeline quebrar algo que dependia dela | App sem estilo, import quebrado | `npm run build` obrigatório (A25), porque na Fase 1 só o build pegou um import de CSS |
| Visão Ano lenta com muitas estadias | Tela travando | Teste de desempenho de `runs` (seção 8). A materialização continua no backlog até a lentidão ser medida |

## 13. Open questions (bloqueiam a implementação)

Nenhuma. Decisões tomadas com o Gabriel em 2026-09-26:

1. **💋 = quantas vezes o casal transou no dia.** É um contador do casal (qualquer um soma ou tira), com uma linha por marca, no máximo 20 por dia, e só na tela do Calendário (I12).
2. **Cidades do mundo entram agora** (ADR 0017), como linhas do casal em `cities`, a partir do Photon, deduplicadas por `osm_ref`. O Brasil continua sendo só o IBGE.
3. **Sem arrasto de faixa.** Edita-se pelo modal (_Ver período_ ou tocando na faixa), e os dias que saem de um período voltam para a casa de cada um (ADR 0018).
4. **Começar do zero.** Nada do `localStorage` é importado. A timeline antiga, com os arquivos, o CSS, o seed e a chave, é apagada.

Decisões tomadas na spec, dentro do que o design deixa em aberto. **Ficam registradas para veto antes do build:**

5. **O evento pinta uma vez** e não fica ligado às estadias (I6, ADR 0018). O design diz _"Dá pra ajustar o período depois"_, e o ADR 0002 descartou exatamente a segunda verdade que nasceria se o evento continuasse mandando no período.
6. **Viagem é um tipo de evento nesta fase**, com os mesmos campos da Visita. A Fase 6 decide se roteiro e galeria penduram nele (FK para `calendar_events`) ou se a viagem vira tabela própria. Esta fase não cria nada que impeça as duas saídas.
7. **Os campos dos 5 tipos sem frame** (tabela de R18) e o `eventSubtitle` (I11).
8. **Duas contagens** (I5): o kicker do mês e o _Resumo_ contam o desenhado, inclusive planejado, como o frame (_22 + 8 = 30_ em setembro, com hoje em 25). O ano, _"% do ano até agora"_ e as Configurações contam só o vivido.
9. **Cidade curta por iniciais** (_SJC_) no Calendário (I9). Lista e Configurações continuam com o nome inteiro.
10. **O 💋 vai no export**, agregado por dia (R24): o export promete "tudo", e esconder um dado do próprio casal seria mentir.
11. **O cartão _Primeiro período_ da Home** (`W9BK5`) é o estado vazio do Calendário até a Home existir.

## 14. Fora de escopo

- **Arrastar faixas** (decisão 3). `useBarDrag.ts` morre com a timeline.
- **Avisar a outra pessoa** (_"Avisar a Lana quando salvar"_), lembretes com hora e o lembrete do aniversário: vão com os avisos e o agendador, no fim do roadmap. Os `notify_*` e `remind_anniversary` já estão gravados.
- **Realtime** (ADR 0015).
- **Roteiro, galeria e o detalhe da viagem**: Fase 6. O _"14 viagens"_ das Configurações também espera por ela.
- **Os ícones de evento dentro das barras da visão Ano** e o _Ver todos_ dos próximos eventos: não há tela desenhada para onde levar.
- **Recorrência** além de _todo ano_ na data especial (semanal, mensal).
- **Evento com horário em fuso diferente**: a hora é a local, sem fuso.
- **Estadias por GPS** ou "onde estou agora" automático.
- **Cidade-casa fora do Brasil** e cidades salvas fora do Brasil (Configurações continuam no IBGE).
- **Importar o `localStorage`** (decisão 4) ou um calendário externo (Google, iCal).
- **Marcar item da lista como feito a partir do evento.**

---

## Plano (Gate 2)

> Toda tarefa que toca `supabase/migrations/` termina com `npx supabase db push --dry-run`, `npm run db:push`, `npm run types:gen` e `npm run typecheck` limpos. Antes do `db:push` da migration 1: `select count(*) from cities where country_code <> 'BR'`. Tarefas que apagam ou movem arquivo terminam com `npm run build`.

1. [x] **ADRs que destravam.** _(feito em 2026-09-26, `Proposed` até a implementação)_ 0017 (cidades do mundo por casal; nota de revisão no 0007), 0018 (pintura, _volta pra casa_, evento pinta uma vez), a linha do Calendário no 0015 e a nota no 0002. Índice em `Decisions/README.md`. → base para tudo
2. [ ] **Contrato de domínio.** `src/domain/calendar.ts` + `paintCases.ts` + `eventValidationCases.ts` + `calendar.test.ts` + o caso de desempenho. → A2 e A3 (lado cliente), A4–A6
3. [ ] **Migration 1 (cidades do mundo)** + asserções de `cities` em `supabase/tests/calendar.test.ts`. → A8
4. [ ] **Migration 2 (eventos, 💋, triggers, `paint_stays`, `create_event`)** + o resto de `calendar.test.ts` + a asserção nova no A20 do onboarding. → A1, A2 e A3 (lado banco), A7, A9–A11
5. [ ] **Fronteira de dados.** `src/data/calendar.ts`, `worldCities.ts`, `osmRef` em `places.ts` e nas fixtures, `loadCitiesByIds` estendida, `insertStay` fora, `CalendarApi`. → A12
6. [ ] **Apagar a timeline e ligar a casca.** `src/timeline/` fora, `App.tsx`/`Shell.tsx` com `calendarApi`, o botão Adicionar, a remoção da chave do `localStorage`, as exportações mortas de `date.ts`. `npm run build`. → A21
7. [ ] **Tela: mês, cartão _Primeiro período_, estados de carga e erro, releitura, 💋.** `src/calendar/CalendarScreen.tsx`, `MonthView.tsx`, `FirstPeriodCard.tsx`, `calendar.css` (tokens do `.pen`, claro e escuro). → A13, A14, A19, A20
8. [ ] **Visão Ano.** → A15
9. [ ] **Painel _Onde a gente está_.** → A16
10. [ ] **Seletor de cidade + Novo/Editar período.** → A17
11. [ ] **Novo/Editar evento** (6 tipos, período automático, vínculo com a lista). → A18
12. [ ] **Lista e export.** _Agendar_, o texto de `unknown`, export v3. → A22, A23
13. [ ] **Fechar.** A24 manual, A25, `grep -rn day_kisses src` só em `calendar/`, `data/calendar.ts` e `data/export.ts`, skill `verify`, `project_architecture.md`, `CLAUDE.md`, `falhas-silenciosas.md`, `Tasks/README.md`, ledger, spec → 🟢.

---

## Related

- Brainstorm: pulado (fase desenhada). As quatro decisões de contrato foram tomadas com o Gabriel em 2026-09-26 (seção 13)
- ADRs desta fase: [0017](../Decisions/0017-cidades-do-mundo-por-casal.md) · [0018](../Decisions/0018-periodo-se-grava-pintando-estadias.md) · notas no [0002](../Decisions/0002-estadia-por-pessoa-estado-derivado.md), [0007](../Decisions/0007-cidades-brasileiras-por-seed-do-ibge.md) e [0015](../Decisions/0015-lista-sem-realtime-reler-ao-voltar.md)
- ADRs que esta fase não pode violar: [0001](../Decisions/0001-supabase-com-rls-por-casal.md) · [0002](../Decisions/0002-estadia-por-pessoa-estado-derivado.md) · [0005](../Decisions/0005-interface-se-prova-em-jsdom.md) · [0011](../Decisions/0011-preferencias-em-tres-escopos.md) · [0013](../Decisions/0013-casca-e-navegacao-por-caminho.md) · [0014](../Decisions/0014-testes-de-integracao-no-projeto-online.md) · [0016](../Decisions/0016-busca-de-lugares-pelo-photon-osm.md)
- Design (lido pelo MCP do Pencil em 2026-09-26): `D1Zny4` Mês · `XEnYP` Ano · `n2aVYz` Painel · `BOR8L` Novo evento (Visita) · `DLeES` Novo período · `o1JAVm` Configurações › Calendário · componentes `fDD1M` Calendar Day, `TyU3G` Event Pill, `K30c7` Event Row, `FphzW` Legend Item, `TRoUw`/`CVJkd` Casal juntos/separados, `W9BK5` First Period Card, `NVoXy` Add Button
- Ledger da execução: `fase-5-calendario.ledger.md`
