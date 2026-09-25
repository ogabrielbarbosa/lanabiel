#!/usr/bin/env bash
# PostToolUse (Edit|Write) — formata só o arquivo que acabou de ser tocado.
#
# Formatar o projeto inteiro a cada edição produz um diff que esconde a mudança
# real, e é a forma mais rápida de tornar um code review inútil.

set -uo pipefail
PROFILE="$(pwd)/.devkit/profile.sh"
[ -f "$PROFILE" ] || exit 0
# shellcheck source=/dev/null
source "$PROFILE"
[ -n "${DEVKIT_CMD_FORMAT_FILE:-}" ] || exit 0

PAYLOAD="$(cat 2>/dev/null || true)"
command -v jq >/dev/null 2>&1 || exit 0
FILE="$(printf '%s' "$PAYLOAD" | jq -r '.tool_input.file_path // empty' 2>/dev/null)"
[ -n "$FILE" ] && [ -f "$FILE" ] || exit 0

# Extensões que o formatador deste projeto conhece. Chamá-lo num arquivo que ele
# não entende gera erro no hook e ruído na sessão, sem ganho nenhum.
echo "$FILE" | grep -qE "\.(${DEVKIT_FORMAT_EXT:-ts|tsx|js|jsx|json|css|md})$" || exit 0

eval "$DEVKIT_CMD_FORMAT_FILE \"\$FILE\"" >/dev/null 2>&1 || true
exit 0
