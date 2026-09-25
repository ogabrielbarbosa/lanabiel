#!/usr/bin/env bash
# Instala o devkit num projeto.
#
#   devkit/install.sh <caminho-do-projeto> [perfil]
#
# Perfis: ts-node-web · nextjs · expo-rn · swift · _template
#
# Idempotente e conservador: NUNCA sobrescreve arquivo existente. O que já
# existe é reportado como "mantido" — reinstalar sobre um projeto em uso não
# pode apagar regra que alguém escreveu.
#
# Depois de rodar, abra o projeto e execute `/devkit-init`: é o passo que troca
# os comandos de exemplo do perfil pelos comandos REAIS deste repositório.

set -euo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-}"
PROFILE="${2:-_template}"

if [ -z "$TARGET" ]; then
  echo "uso: devkit/install.sh <caminho-do-projeto> [perfil]" >&2
  echo "perfis: $(ls "$KIT_DIR/profiles" | grep -v README | tr '\n' ' ')" >&2
  exit 1
fi
[ -d "$TARGET" ] || { echo "erro: '$TARGET' não é um diretório" >&2; exit 1; }
[ -d "$KIT_DIR/profiles/$PROFILE" ] || { echo "erro: perfil '$PROFILE' não existe" >&2; exit 1; }

TARGET="$(cd "$TARGET" && pwd)"
COPIED=(); KEPT=()

copy() {                              # copy <origem> <destino-relativo>
  local dst="$TARGET/$2"
  if [ -e "$dst" ]; then KEPT+=("$2"); return 0; fi
  mkdir -p "$(dirname "$dst")"
  cp -R "$1" "$dst"
  COPIED+=("$2")
}

echo "Instalando devkit em $TARGET (perfil: $PROFILE)"

# 1. Comandos, skills e agentes
for f in "$KIT_DIR"/core/commands/*.md; do copy "$f" ".claude/commands/$(basename "$f")"; done
for d in "$KIT_DIR"/core/skills/*/;    do d="${d%/}"; copy "$d" ".claude/skills/$(basename "$d")"; done
for f in "$KIT_DIR"/core/agents/*.md;  do copy "$f" ".claude/agents/$(basename "$f")"; done

# 2. Hooks
for f in "$KIT_DIR"/core/hooks/*.sh; do copy "$f" ".claude/hooks/$(basename "$f")"; done
chmod +x "$TARGET"/.claude/hooks/*.sh 2>/dev/null || true

# 3. Esqueleto do .agent/
T="$KIT_DIR/core/templates/agent"
copy "$T/README.md"                          ".agent/README.md"
copy "$T/Decisions/README.md"                ".agent/Decisions/README.md"
copy "$T/Decisions/0000-template.md"         ".agent/Decisions/0000-template.md"
copy "$T/System/ai-development-workflow.md"  ".agent/System/ai-development-workflow.md"
copy "$T/System/project_architecture.md"     ".agent/System/project_architecture.md"
copy "$T/templates/spec-template.md"         ".agent/templates/spec-template.md"
copy "$T/templates/research-template.md"     ".agent/templates/research-template.md"
copy "$T/templates/ledger-template.md"       ".agent/templates/ledger-template.md"
mkdir -p "$TARGET/.agent/Tasks" "$TARGET/.agent/Research"

# O checklist sai do perfil: as SEÇÕES vêm, os itens não. Cada item tem de
# nascer de um bug deste projeto — regra emprestada não tem cicatriz.
copy "$KIT_DIR/profiles/$PROFILE/checklist.md" ".agent/SOP/review-checklist.md"
[ -f "$KIT_DIR/profiles/$PROFILE/notas.md" ] && \
  copy "$KIT_DIR/profiles/$PROFILE/notas.md" ".agent/SOP/falhas-silenciosas.md"

# 4. Perfil e ponto de extensão dos invariantes
copy "$KIT_DIR/profiles/$PROFILE/profile.sh" ".devkit/profile.sh"
mkdir -p "$TARGET/.devkit/checks"
if [ ! -f "$TARGET/.devkit/checks/README.md" ]; then
  cat > "$TARGET/.devkit/checks/README.md" <<'EOF'
# Invariantes deste projeto

Cada `.sh` aqui é uma **cicatriz**: uma classe de bug que já aconteceu neste
projeto e que nenhuma ferramenta padrão pega. O hook `Stop` roda todos.

Contrato: recebe a lista de arquivos mudados em `$1`; imprime o que está errado
e sai com status != 0. Silencioso quando está tudo bem.

```bash
#!/usr/bin/env bash
# Por que existe: <o bug concreto, com data e sintoma>.
# Por que nada mais pega: <não é erro de tipo nem de lint porque…>
CHANGED="$1"
echo "$CHANGED" | grep -q '^src/' || exit 0
HITS=$(grep -rn '<padrão>' src/ | grep -vE '^[^:]+:[0-9]+:\s*(//|\*|#)' || true)
[ -z "$HITS" ] && exit 0
echo "<o que está errado e qual é a forma certa>"
echo "$HITS"
exit 1
```

Não escreva check preventivo contra bug hipotético — isso é ruído, e ruído
ensina o time a ignorar o gate. Escreva depois que o bug custar um dia.

Duas regras aprendidas na prática:

1. **Ignore comentários.** A documentação cita a forma errada de propósito. Um
   gate que acusa a própria documentação é um gate que se aprende a ignorar.
2. **Olhe a janela, não a linha.** Quando o padrão depende de contexto (uma
   exceção legítima três linhas acima), um check linha-a-linha reprova o caso
   legítimo e, no meio do ruído, esconde a violação de verdade.
EOF
  COPIED+=(".devkit/checks/README.md")
fi

# 5. settings.json — merge com jq quando disponível; nunca sobrescreve
SETTINGS="$TARGET/.claude/settings.json"
HOOKS_JSON="$KIT_DIR/core/templates/settings.hooks.json"
if [ ! -f "$SETTINGS" ]; then
  cp "$HOOKS_JSON" "$SETTINGS"; COPIED+=(".claude/settings.json")
elif grep -q 'verify.sh' "$SETTINGS"; then
  KEPT+=(".claude/settings.json (hooks já registrados)")
elif command -v jq >/dev/null 2>&1; then
  tmp="$(mktemp)"
  # Concatena as listas de hooks em vez de substituir: um `*` simples trocaria
  # o PostToolUse existente do projeto pelo nosso.
  jq -s '.[0] as $a | .[1] as $b | $a * {hooks: (($a.hooks // {}) as $h |
         reduce ($b.hooks | keys[]) as $k ($h; .[$k] = ((.[$k] // []) + $b.hooks[$k])))}' \
     "$SETTINGS" "$HOOKS_JSON" > "$tmp" && mv "$tmp" "$SETTINGS"
  COPIED+=(".claude/settings.json (hooks mesclados)")
else
  KEPT+=(".claude/settings.json — sem jq; registre os hooks à mão: $HOOKS_JSON")
fi

# --- Relatório -------------------------------------------------------------
echo
echo "Instalados (${#COPIED[@]}):"
[ ${#COPIED[@]} -gt 0 ] && printf '  + %s\n' "${COPIED[@]}" || echo "  (nenhum)"
if [ ${#KEPT[@]} -gt 0 ]; then
  echo; echo "Mantidos, já existiam (${#KEPT[@]}):"; printf '  = %s\n' "${KEPT[@]}"
fi

cat <<EOF

Próximo passo, e ele não é opcional:

  cd "$TARGET" && claude
  /devkit-init $PROFILE

O perfil copiado tem comandos de exemplo. Enquanto o \`/devkit-init\` não trocar
por comandos reais e executá-los uma vez, o gate falha por motivo errado — que é
pior que não ter gate, porque ensina o time a ignorá-lo.
EOF
