# `<stack>` — o que quebra em silêncio

Liste aqui as falhas desta stack que **não** dão erro de compilação nem de lint:
as que só aparecem em runtime, em produção, ou no cliente que tem muitos dados.

É desta lista que nascem os primeiros `.devkit/checks/` — mas escreva o check
só depois que a falha acontecer **neste** projeto. Check preventivo contra um
bug hipotético é ruído; check contra um bug que já custou um dia é gate.

Formato por item: **sintoma** (o que a pessoa vê) · **causa** (o mecanismo) ·
**por que nada acusa**.
