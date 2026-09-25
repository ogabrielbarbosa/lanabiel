#!/usr/bin/env bash
# .devkit/profile.sh — como se prova alguma coisa NESTE projeto.
#
# Fonte única para skills e hooks. Pacote único (Vite + React + TS), sem
# monorepo, sem backend próprio, sem testes ainda configurados.

DEVKIT_STACK="vite-react-ts"

# --- Qualidade -------------------------------------------------------------
DEVKIT_CMD_TYPECHECK="npm run typecheck"
DEVKIT_CMD_LINT="npm run lint"
DEVKIT_CMD_TEST=""            # nenhum test runner configurado ainda (sem vitest)
DEVKIT_CMD_BUILD="npm run build"   # fora do gate por padrão; DEVKIT_RUN_BUILD=1 inclui

# --- Formatação de um arquivo ----------------------------------------------
DEVKIT_CMD_FORMAT_FILE=""     # sem prettier/formatter instalado ainda
DEVKIT_FORMAT_EXT=""

# --- O que dispara o gate ---------------------------------------------------
DEVKIT_CODE_EXT="ts|tsx|js|jsx|css"
DEVKIT_READY_MARKER="node_modules"

# --- Contrato compartilhado (fonte única de verdade) ------------------------
DEVKIT_CONTRACT_PATH=""       # pacote único: não há contrato compartilhado
DEVKIT_CMD_CONTRACT_BUILD=""

# --- Migrações --------------------------------------------------------------
DEVKIT_MIGRATIONS_DIR=""      # sem backend/banco neste projeto
DEVKIT_CMD_MIGRATE_CHECK=""

# --- Arquivos que toda frente edita (colidem sem dar conflito de merge) -----
DEVKIT_INDEX_FILES=".agent/README.md .agent/Decisions/README.md"

# --- Recorte por módulo tocado ---------------------------------------------
# Pacote único: não declarar devkit_scope_args — o comando roda inteiro.
