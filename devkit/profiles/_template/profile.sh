#!/usr/bin/env bash
# .devkit/profile.sh — como se prova alguma coisa NESTE projeto.
#
# Fonte única para skills e hooks. Preencha com os comandos REAIS (os que estão
# nos scripts ou na CI, não os que você acha que existem) e rode cada um uma vez
# antes de gravar. Placeholder aqui vira gate que nunca roda.
#
# Variável ausente = "este projeto não tem isso"; o hook pula a etapa.

DEVKIT_STACK="<nome-do-perfil>"

# --- Qualidade -------------------------------------------------------------
DEVKIT_CMD_TYPECHECK=""
DEVKIT_CMD_LINT=""
DEVKIT_CMD_TEST=""
DEVKIT_CMD_BUILD=""          # fora do gate por padrão; DEVKIT_RUN_BUILD=1 inclui

# --- Formatação de um arquivo ----------------------------------------------
DEVKIT_CMD_FORMAT_FILE=""    # recebe o caminho como argumento
DEVKIT_FORMAT_EXT=""

# --- O que dispara o gate ---------------------------------------------------
DEVKIT_CODE_EXT=""
DEVKIT_READY_MARKER=""       # ex.: node_modules · .venv · Pods

# --- Contrato compartilhado (fonte única de verdade) ------------------------
DEVKIT_CONTRACT_PATH=""
DEVKIT_CMD_CONTRACT_BUILD=""

# --- Migrações --------------------------------------------------------------
DEVKIT_MIGRATIONS_DIR=""
DEVKIT_CMD_MIGRATE_CHECK=""

# --- Arquivos que toda frente edita (colidem sem dar conflito de merge) -----
DEVKIT_INDEX_FILES=""

# --- Recorte por módulo tocado ---------------------------------------------
# Só declare em monorepo. Pacote único: apague — o comando roda inteiro.
# devkit_scope_args() {
#   local changed="$1" args=""
#   echo "$changed" | grep -q '^pacote-a/' && args="$args --filter=pacote-a"
#   echo "$args"
# }
