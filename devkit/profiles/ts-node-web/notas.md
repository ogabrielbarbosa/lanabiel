# `ts-node-web` — o que quebra em silêncio

Falhas que **não** dão erro de compilação nem de lint. São as candidatas
naturais aos primeiros `.devkit/checks/` deste projeto — mas só escreva o check
depois que a falha acontecer aqui de verdade.

## Contrato compartilhado desatualizado

O consumidor importa os tipos do build anterior. O typecheck passa, o runtime
quebra. Por isso `DEVKIT_CMD_CONTRACT_BUILD` existe e o hook o dispara quando o
caminho do contrato aparece no diff.

## Migração no disco e fora do índice

O arquivo `.sql` existe, ninguém o registrou no journal/índice, ele nunca roda —
e o comando de migração sai com status zero. O sintoma aparece semanas depois
como "o banco ignora meu índice".

## Lint com `--fix` na verificação

O lint conserta o arquivo durante a execução e sai 0. Na máquina de quem rodou,
a violação some; no branch, ela entra. Na CI, rode `git diff --exit-code` logo
depois do lint.

## Classe de CSS interpolada

`bg-tag-${cor}` nunca é emitida: o Tailwind varre o código estaticamente e não
executa template string. A classe não existe no bundle, e nada acusa.

## Variante de atributo na forma "bare"

`data-side-bottom:` compila para o seletor `[data-side-bottom]`, enquanto a
biblioteca emite `data-side="bottom"`. A regra entra no CSS e nunca casa. Sem
erro de tipo, sem erro de lint — só o estilo que não acontece.

## Cache de cliente invalidado largo demais

Invalidar um prefixo largo refaz a tela inteira a cada evento. Não é bug, é
lentidão progressiva: ninguém percebe até a lista crescer.

## Assinatura de tempo real sem cleanup

Canal aberto no efeito e não removido na saída. Vaza a cada navegação; o sintoma
é memória e eventos duplicados depois de meia hora de uso.

## Filtro por lista de ids sem teto

`IN (...)` com uma lista que veio do cliente estoura o limite de parâmetros do
driver. Vira erro 500, não lentidão — e só com o cliente que tem muitos dados.
