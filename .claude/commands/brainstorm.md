# /brainstorm — Afiar a ideia antes de pesquisar (Gate −1)

Transforma um desejo vago ("queria melhorar o pipeline") num **problema
declarado** que sustenta uma `/research` ou uma `/spec`. É conversa, não
relatório: o resultado é uma frase que a pessoa aprova, não uma lista de vinte
ideias que ninguém vai ler.

Uso: `/brainstorm <ideia crua>`

---

## Instruções para o agente

**Método socrático, uma coisa por vez.** Você não sabe o que a pessoa quer, e
ela provavelmente também não sabe ainda. Descubra perguntando — nunca proponha
solução antes de saber qual problema ela resolve.

### Regras da conversa

1. **Uma pergunta por vez.** Um bloco de seis perguntas recebe uma resposta que
   cobre duas e o resto se perde.
2. **Pergunte o que muda o desenho**, não o que enfeita. Se a resposta não
   altera o que seria construído, não pergunte.
3. **Ancore no código antes de perguntar.** Leia a feature, o schema e os ADRs
   do assunto. Metade das perguntas se responde sozinha assim — e perguntar o
   que está escrito no repositório queima a confiança.
4. **Ofereça alternativas, não um caminho.** Duas ou três opções com o custo de
   cada uma. Quem decide é a pessoa.
5. **Traga a evidência contrária.** Se um ADR já rejeitou a ideia, diga qual e
   por quê — antes de continuar. Se a spec de uma tela vizinha já resolveu o
   mesmo problema de outro jeito, mostre.

### O que descobrir, nesta ordem

1. **Quem sente a dor, e como ela aparece hoje?** Sem um sintoma concreto, não
   há o que construir. "Seria legal ter" não é sintoma.
2. **O que a pessoa faz hoje no lugar disso?** O contorno atual é o baseline
   contra o qual a solução tem que ganhar.
3. **Por que agora?** O que mudou. Se nada mudou, provavelmente não é agora.
4. **Como se saberia que funcionou?** O número ou o comportamento observável.
   Isto vira os critérios de aceite da spec.
5. **O que está fora?** O escopo negativo é o que impede a feature de crescer
   até virar impossível.

### Quando parar

Pare quando conseguir escrever isto e a pessoa concordar:

```
Problema:  <quem sente, o que dói, com que frequência>
Hoje:      <o contorno atual e por que ele não basta>
Sucesso:   <o observável que prova que resolveu>
Fora:      <o que deliberadamente não entra>
Risco:     <a suposição que, se errada, invalida tudo>
```

Cinco linhas. Se não cabe em cinco linhas, ainda não está afiado.

### Encaminhamento

Com o bloco aprovado, diga qual é o próximo gate — e por quê:

- **`/research`** — quando a dúvida é de _mercado ou de produto_: como os outros
  resolvem, o que o usuário espera, se vale existir.
- **`/spec`** — quando o problema é claro e a dúvida é só de _desenho_: qual
  contrato, quais estados, quais invariantes.
- **Nenhum dos dois** — quando é bugfix, copy ou UI isolada. Dimensione à
  incerteza: vá ao menor passo que resolve a dúvida.

**Não gere documento aqui.** Este comando produz clareza, não artefato.
