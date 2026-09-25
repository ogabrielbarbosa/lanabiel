#!/usr/bin/env bash
# Perfil: Next.js (App Router) — servidor e cliente no mesmo processo.

DEVKIT_STACK="nextjs"

DEVKIT_CMD_TYPECHECK="pnpm exec tsc --noEmit"
DEVKIT_CMD_LINT="pnpm exec next lint"
DEVKIT_CMD_TEST="pnpm test"
# `next build` faz typecheck E compila rotas. É a verificação mais completa que
# existe aqui — e também a mais cara. Fora do gate por padrão; a CI que rode.
DEVKIT_CMD_BUILD="pnpm exec next build"

DEVKIT_CMD_FORMAT_FILE="pnpm exec prettier --write"
DEVKIT_FORMAT_EXT="ts|tsx|js|jsx|json|css|md|mdx"

DEVKIT_CODE_EXT="ts|tsx|js|jsx|json|css|mdx"
DEVKIT_READY_MARKER="node_modules"

DEVKIT_CONTRACT_PATH="src/lib/schemas/"
DEVKIT_CMD_CONTRACT_BUILD=""          # mesmo processo: não há build separado

DEVKIT_MIGRATIONS_DIR="drizzle/"
DEVKIT_CMD_MIGRATE_CHECK=""

DEVKIT_INDEX_FILES="src/lib/schemas/index.ts .agent/README.md .agent/Decisions/README.md"
