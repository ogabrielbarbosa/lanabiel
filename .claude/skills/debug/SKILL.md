---
name: debug
description: Achar a causa raiz de um bug em vez de tratar o sintoma. Use quando algo falha, quebra, dá erro, some, fica lento ou "às vezes não funciona" — e sempre que a segunda tentativa de correção não pegou. Triggers - bug, erro, não funciona, quebrou, falha intermitente, flaky, está lento, comportamento estranho, investigar, causa raiz, não sei por que.
---

# Depuração sistemática

Quatro fases, em ordem. A tentação é pular para a 3 — é assim que se conserta o
sintoma e o bug volta com outra roupa em duas semanas.

**Você não tem permissão de escrever correção antes de conseguir reproduzir a
falha.** Se não reproduz, não sabe se corrigiu — sabe apenas que parou de ver.

---

## Fase 1 — Reproduzir

Antes de qualquer teoria:

1. **Qual é o comportamento exato?** Não "a listagem bugou": "ao abrir o registro
   X com o filtro Y, a lista mostra 0 e o contador mostra 12".
2. **Qual o menor caminho até ele?** Reduza até o passo mínimo. Cada passo que
   você remove sem a falha sumir é uma variável eliminada.
3. **Ele é determinístico?** Se falha 1 em 5, você tem concorrência, cache,
   ordem de eventos ou relógio. Anote isso — muda toda a investigação.
4. **Escreva o teste que falha.** Vermelho antes de verde. Um bug reproduzido em
   teste nunca mais volta em silêncio; um bug reproduzido na mão volta.

Não reproduz? Então a investigação é sobre **por que não reproduz** — ambiente,
dado, permissão, versão, fuso. Não avance para a fase 2 com "vou tentar uma coisa".

## Fase 2 — Localizar

Estreite antes de teorizar. Bissecção é mais barata que intuição.

- **No tempo:** `git log` no arquivo; `git bisect` quando o bug tem um "antes".
- **No espaço:** a falha está no cliente, no contrato ou no servidor? Um log no
  meio responde em um minuto o que meia hora de leitura não responde.
- **No dado:** o valor errado nasceu errado ou foi corrompido no caminho? Vá à
  fonte. A saída mostrando errado não diz onde errou.

Regra: **cada passo tem que eliminar metade das possibilidades.** Se o próximo
passo não elimina nada, é chute — troque o passo.

## Fase 3 — Explicar

Só agora. Você tem que conseguir completar isto sem "acho que":

```
A falha acontece porque <mecanismo>.
Ela aparece só quando <condição>, e é por isso que <observação que não batia> acontecia.
Se eu mudar <X>, ela para porque <consequência do mecanismo>.
```

**O teste da explicação:** ela tem que explicar _tudo_ que você observou,
inclusive o detalhe estranho que você quase ignorou. Explicação que cobre 90%
dos sintomas está errada — os 10% restantes são o bug de verdade.

### Três arquétipos em que o sintoma mente

Valem em qualquer stack. Reconhecê-los economiza horas:

- **A regra que nunca casa.** Estilo/seletor/matcher "não aplica". A regra
  existe, está no bundle, e simplesmente nunca corresponde ao que o runtime
  emite. Nenhuma ferramenta acusa: não é erro de tipo nem de lint, é uma string
  que não bate com outra string.
- **A regra escrita duas vezes.** Dois lugares implementam a mesma decisão de
  negócio e divergem. O sintoma parece bug de formatação ou de máscara; a causa
  é que não existe fonte única. Corrigir um lado adia o bug para o outro.
- **A etapa que nunca rodou.** Migração fora do índice, job não registrado,
  arquivo fora do build. O código está certo e nunca foi executado. O sintoma é
  "o banco/serviço ignora o que eu escrevi".

## Fase 4 — Corrigir na raiz

Pergunte, nesta ordem:

1. **Qual é a menor mudança que remove o mecanismo?** Não a que esconde o efeito.
2. **Existe outro caminho para o mesmo mecanismo?** Se a causa é "regra em dois
   lugares", corrigir um lugar é adiar. Corrija a duplicação.
3. **O que impede a volta?** O teste da fase 1 vira permanente. Se a **classe**
   do bug for repetível, ela vira verificação em `.devkit/checks/` — ver
   `devkit/docs/02-autoria-de-regra.md`.
4. **Isso é decisão estrutural?** Então é `/adr`.

Depois: skill `verify`.

---

## Quando parar e pedir ajuda

- Três explicações testadas e derrubadas → você está no lugar errado. Volte à fase 2.
- A correção exige mudar um contrato compartilhado → é decisão, não conserto.
- O bug está em dado de produção → **pare antes de escrever**. Escrita corretiva
  em produção se combina, não se descobre depois.

## Related

- Skill `verify` — provar que a correção pegou
- `.agent/SOP/review-checklist.md` — as classes de bug que este projeto já colecionou
