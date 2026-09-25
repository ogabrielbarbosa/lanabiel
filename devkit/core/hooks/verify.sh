#!/usr/bin/env bash
# Stop hook — prova o trabalho antes de a sessão terminar.
#
# Roda os comandos de qualidade declarados em `.devkit/profile.sh` e depois os
# invariantes do projeto em `.devkit/checks/*.sh`.
# Silencioso no sucesso; `exit 2` devolve os erros para o agente corrigir.
#
#   DEVKIT_SKIP_TEST=1    pula os testes (use só em sessão de documentação)
#   DEVKIT_RUN_BUILD=1    inclui o build (fora do padrão — ver abaixo)
#   DEVKIT_FORCE=1        ignora o stamp e roda mesmo sem mudança nova
#
# ---------------------------------------------------------------------------
# Cinco armadilhas, todas tratadas aqui. Elas são a razão de este arquivo ser
# mais comprido do que "rode o teste" — cada uma já matou um gate de verdade:
#
#   1. SEM GUARDA DE LAÇO. O `exit 2` reinvoca o agente, que ao parar dispara o
#      hook de novo. Laço infinito. O host manda `stop_hook_active: true`
#      justamente para isso; ignorar é travar a sessão.
#   2. BUILD NO CONJUNTO. O build costuma levar minutos e não prova NADA que o
#      typecheck já não prove. Timeout de hook é curto: o hook morre no meio e a
#      sessão fecha "verde" sem ter verificado nada — indistinguível do sucesso.
#   3. TASK QUE FALHOU NÃO CACHEIA. Com um teste quebrado ou instável, a suíte
#      re-executa inteira em todo stop, para sempre. Daí o stamp.
#   4. GUARDA DE MUDANÇA OLHANDO O DIFF. Numa branch com 120 arquivos pendentes
#      o diff é sempre não-vazio: o hook roda até no turno que só leu arquivo. O
#      gatilho certo é a árvore ter MUDADO desde a última verificação.
#   5. ARQUIVO NOVO É INVISÍVEL PARA `git diff`. Untracked não aparece em
#      `diff HEAD` nem em `diff --cached`. Uma sessão que só criou arquivos
#      passava pelo gate sem verificar nada.
# ---------------------------------------------------------------------------

set -uo pipefail
PROJECT_DIR="$(pwd)"
ERRORS=()

# 1) Anti-laço.
PAYLOAD="$(cat 2>/dev/null || true)"
if [ -n "$PAYLOAD" ] && command -v jq >/dev/null 2>&1; then
  [ "$(printf '%s' "$PAYLOAD" | jq -r '.stop_hook_active // false' 2>/dev/null)" = "true" ] && exit 0
fi

PROFILE="$PROJECT_DIR/.devkit/profile.sh"
[ -f "$PROFILE" ] || exit 0          # devkit não instalado aqui: não é erro, é ausência
# shellcheck source=/dev/null
source "$PROFILE"

# Dependências não instaladas: o gate falharia por motivo errado.
[ -n "${DEVKIT_READY_MARKER:-}" ] && [ ! -e "$PROJECT_DIR/$DEVKIT_READY_MARKER" ] && exit 0

# 5) Arquivo novo entra na lista.
UNTRACKED="$(git -C "$PROJECT_DIR" ls-files --others --exclude-standard 2>/dev/null)"
CHANGED="$( { git -C "$PROJECT_DIR" diff --name-only HEAD; git -C "$PROJECT_DIR" diff --cached --name-only; printf '%s\n' "$UNTRACKED"; } 2>/dev/null | grep -v '^$' | sort -u )"
[ -z "$CHANGED" ] && exit 0

# 2) Stamp: só verifica se a árvore mudou desde a última verificação. O
# fingerprint é do CONTEÚDO — do diff e dos arquivos novos. Editar de volta ao
# estado já verificado não re-dispara; qualquer edição real dispara.
STAMP_FILE="$PROJECT_DIR/.git/devkit-verify-stamp"
FINGERPRINT="$( { git -C "$PROJECT_DIR" diff HEAD; git -C "$PROJECT_DIR" diff --cached;
    [ -n "$UNTRACKED" ] && printf '%s\n' "$UNTRACKED" | tr '\n' '\0' | (cd "$PROJECT_DIR" && xargs -0 shasum 2>/dev/null);
  } 2>/dev/null | shasum | cut -d' ' -f1)"
if [ "${DEVKIT_FORCE:-0}" != "1" ] && [ "$FINGERPRINT" = "$(cat "$STAMP_FILE" 2>/dev/null)" ]; then
  exit 0
fi
# Grava ANTES de rodar: a mesma árvore já reportada não volta a ser cobrada.
printf '%s' "$FINGERPRINT" > "$STAMP_FILE" 2>/dev/null || true

# Sessão que só tocou documentação não precisa de typecheck.
CODE_TOUCHED=0
echo "$CHANGED" | grep -qE "\.(${DEVKIT_CODE_EXT:-ts|tsx|js|jsx})$" && CODE_TOUCHED=1

run_step() {                          # run_step "<rótulo>" "<comando>"
  [ -z "${2// /}" ] && return 0
  local out
  out="$(eval "$2" </dev/null 2>&1)" || ERRORS+=("$1:\n$(printf '%s' "$out" | tail -n 60)")
}

if [ "$CODE_TOUCHED" = "1" ]; then
  # Escopo: se o perfil sabe restringir aos módulos tocados, use. Rodar a árvore
  # inteira num monorepo com frentes paralelas devolve a quebra de OUTRA pessoa —
  # e gate que acusa o trabalho errado é gate que se aprende a ignorar. A
  # varredura completa pertence à CI, onde o PR tem um dono só.
  SCOPE=""
  if declare -f devkit_scope_args >/dev/null 2>&1; then
    SCOPE="$(devkit_scope_args "$CHANGED")"
  fi

  [ -n "${DEVKIT_CMD_TYPECHECK:-}" ] && run_step "Typecheck" "$DEVKIT_CMD_TYPECHECK $SCOPE"
  [ -n "${DEVKIT_CMD_LINT:-}" ]      && run_step "Lint"      "$DEVKIT_CMD_LINT $SCOPE"
  [ -n "${DEVKIT_CMD_TEST:-}" ] && [ "${DEVKIT_SKIP_TEST:-0}" != "1" ] && run_step "Testes" "$DEVKIT_CMD_TEST $SCOPE"
  [ -n "${DEVKIT_CMD_BUILD:-}" ] && [ "${DEVKIT_RUN_BUILD:-0}" = "1" ] && run_step "Build"  "$DEVKIT_CMD_BUILD $SCOPE"
fi

# Contrato compartilhado: consumidor que lê o build antigo passa no typecheck e
# quebra em runtime. Reconstruir é barato; descobrir isso em produção, não.
if [ -n "${DEVKIT_CONTRACT_PATH:-}" ] && echo "$CHANGED" | grep -q "^$DEVKIT_CONTRACT_PATH"; then
  run_step "Build do contrato" "${DEVKIT_CMD_CONTRACT_BUILD:-}"
fi

# Migrações: o clássico é o arquivo existir no disco e não estar no índice — ele
# nunca roda e não dá erro nenhum.
if [ -n "${DEVKIT_MIGRATIONS_DIR:-}" ] && echo "$CHANGED" | grep -q "^$DEVKIT_MIGRATIONS_DIR"; then
  run_step "Migrações" "${DEVKIT_CMD_MIGRATE_CHECK:-}"
fi

# --- Invariantes do projeto ------------------------------------------------
# Cada arquivo em .devkit/checks/ é uma cicatriz: uma classe de bug que já
# aconteceu aqui e que nenhuma ferramenta padrão pega. Recebe a lista de
# arquivos mudados em $1; imprime o que está errado e sai != 0.
if [ -d "$PROJECT_DIR/.devkit/checks" ]; then
  for check in "$PROJECT_DIR"/.devkit/checks/*.sh; do
    [ -f "$check" ] || continue
    out="$(bash "$check" "$CHANGED" </dev/null 2>&1)" \
      || ERRORS+=("$(basename "$check" .sh):\n$out")
  done
fi

if [ ${#ERRORS[@]} -gt 0 ]; then
  echo "=== Verificação falhou ===" >&2
  for err in "${ERRORS[@]}"; do echo -e "$err" >&2; done
  exit 2
fi

exit 0
