# Como este processo funciona

Três ideias sustentam tudo. O resto é consequência.

---

## 1. O gate tem de executar

Um processo documentado e não executado é pior que nenhum processo: ele produz
a sensação de rigor sem o rigor. Todo mundo acredita que a revisão pegaria
aquilo — e ninguém checa se ela pegaria.

Por isso o Gate 3 não é um parágrafo em documento; é um hook que roda quando a
sessão fecha. Enquanto o gate é documento, a taxa de "esqueci" é a taxa normal
de gente ocupada. Quando vira hook, é zero.

O corolário é duro. **Gate que falha por motivo errado é pior que gate nenhum**,
porque ensina o time a ignorá-lo — e o dia em que ele acertar, ninguém vai
prestar atenção. Daí cuidados que parecem detalhe e são estruturais:

- O gate roda no **escopo do trabalho da sessão**, não na árvore inteira. Acusar
  a quebra de outra pessoa é a forma mais rápida de perder credibilidade.
- O gate **cabe no timeout**. Um hook morto no meio da execução devolve sucesso,
  e sucesso falso é indistinguível de sucesso.
- O gate **enxerga arquivo novo**. Guarda de mudança baseada só em `git diff`
  não vê arquivo untracked, e a sessão que só criou arquivos passa em branco.
- O gate **ignora a própria documentação**. Um check que acusa o arquivo onde a
  regra está explicada é um check que se aprende a silenciar.

## 2. A prova é saída de execução

Uma afirmação sem saída de comando é uma previsão.

Isso é mais restritivo do que parece, e é de propósito. Ler o código não prova
nada: o código lido é o mesmo que você escreveu, e você já acreditava nele. A UI
mostrar o valor certo não prova que o valor certo foi gravado. "Adicionei o
índice" não prova que a consulta ficou rápida.

O par dessa regra é o que a torna praticável: **"não verificado" é uma resposta
legítima**. Quem exige prova de tudo e não aceita lacuna declarada recebe
relatórios que mentem. Quem aceita a lacuna declarada recebe relatórios que
servem para decidir — porque quem lê consegue avaliar o risco do que ficou de
fora, e não pode avaliar o que nem sabe que existe.

## 3. A decisão é registrada, não lembrada

Um sistema com dois anos carrega centenas de escolhas. As que estão só na cabeça
de quem as tomou serão desfeitas por engano — normalmente por alguém que acha
que encontrou um descuido.

O registro tem três níveis, e a diferença entre eles é o custo:

| Nível              | Custo  | Quando                                     |
| ------------------ | ------ | ------------------------------------------ |
| Mensagem de commit | grátis | Toda vez. Responda "por quê", não "o quê". |
| Ruling no ledger   | baixo  | Decisão tomada durante a execução          |
| ADR                | alto   | Trade-off estrutural que outros vão seguir |

Registrar de menos produz o sistema que ninguém entende. Registrar de mais
produz um diretório de trivialidades que ninguém consulta — e o efeito prático é
o mesmo. O filtro do ADR é simples: **houve alternativa rejeitada e há custo do
outro lado?** Se não, não era decisão.

---

## Por que os gates estão nessa ordem

Cada gate é mais caro que o anterior e existe para não pagar o seguinte à toa.

```
/brainstorm   conversa      evita pesquisar o problema errado
/research     horas         evita especificar o que não vale existir
/spec         horas         evita construir o que não foi entendido
plan          minutos       evita a ordem errada de construção
build         dias          ← o caro
verify        minutos       evita revisar o que não funciona
/code-review  minutos       evita mergear o que funciona mal
finish-branch minutos       evita a colisão que só aparece depois do merge
```

Pular um gate barato para chegar antes no caro é a troca ruim clássica. Mas o
inverso — rodar os oito para trocar uma string — é burocracia, e burocracia
também destrói o processo, só que mais devagar: as pessoas param de segui-lo
quando ele passa a atrapalhar mais do que ajuda.

**Dimensione à incerteza.** A pergunta não é "qual é o processo?", é "qual é a
menor coisa que resolve a dúvida que eu tenho agora?".

## A regra de lugar

O arquivo de instruções da raiz é carregado em **todo** turno e em **todo**
subagente. Só pode conter o que vale em todo turno.

Quando um catálogo, um mapa ou uma tabela de referência entra ali, ele passa a
custar contexto em cada sessão e em cada subagente, para ser lido em praticamente
nenhuma. Esse arquivo mora em `.agent/` e é linkado da raiz.

## Related

- [`02-autoria-de-regra.md`](02-autoria-de-regra.md) — como uma cicatriz vira gate
- [`04-mapa-de-artefatos.md`](04-mapa-de-artefatos.md) — onde cada coisa mora
