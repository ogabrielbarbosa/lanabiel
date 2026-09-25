# `swift` — o que quebra em silêncio

O compilador de Swift é estrito, então a lista é curta — e os itens são os que
ele **não** cobre.

## `project.pbxproj` mal resolvido

Merge desse arquivo é hostil: dá para resolver num estado que compila e perde um
arquivo, uma configuração ou um recurso. Confira o conflito abrindo o projeto,
não lendo o diff.

## Concorrência escapando do `@MainActor`

Atualizar interface fora da main actor pode funcionar na maior parte das
execuções e travar sob carga. O compilador pega uma parte com concorrência
estrita ligada; o resto aparece como bug intermitente. Ligue o modo estrito — é
o gate mais barato que esta stack oferece.

## Ciclo de retenção em closure

Sem `[weak self]`, a tela nunca é liberada. Nada acusa: o app só cresce em
memória até morrer, e a causa está trinta telas atrás.

## Migração de Core Data sem versão nova

Alterar o modelo sem criar uma versão faz o app **crashar na abertura** para
quem já tinha dado — e funcionar perfeitamente para quem instalou agora. O
desenvolvedor, que apaga e reinstala o tempo todo, é justamente quem nunca vê.

## Dado sensível no lugar errado

`UserDefaults` não é Keychain. Não dá erro, não dá aviso, e passa despercebido
até uma auditoria.

## Estado restaurado

O sistema suspende e restaura processos. Sessão vencida, token expirado,
conexão morta. Raramente testado, sempre vivido pelo usuário.
