#!/usr/bin/env bash
# Perfil: React Native / Expo.

DEVKIT_STACK="expo-rn"

DEVKIT_CMD_TYPECHECK="pnpm exec tsc --noEmit"
DEVKIT_CMD_LINT="pnpm exec eslint . --max-warnings=0"
DEVKIT_CMD_TEST="pnpm exec jest --ci"
# Build nativo leva dezenas de minutos. NUNCA no gate de sessão: é trabalho de
# CI/EAS. `expo-doctor` é a checagem barata que pega o que costuma quebrar aqui —
# versão de dependência incompatível com a SDK.
DEVKIT_CMD_BUILD="pnpm exec expo-doctor"

DEVKIT_CMD_FORMAT_FILE="pnpm exec prettier --write"
DEVKIT_FORMAT_EXT="ts|tsx|js|jsx|json|md"

DEVKIT_CODE_EXT="ts|tsx|js|jsx|json"
DEVKIT_READY_MARKER="node_modules"

DEVKIT_CONTRACT_PATH="src/shared/"
DEVKIT_CMD_CONTRACT_BUILD=""

DEVKIT_MIGRATIONS_DIR=""
DEVKIT_CMD_MIGRATE_CHECK=""

# `app.json`/`app.config.ts` é editado por toda frente que adiciona permissão,
# plugin ou esquema de deep link — e a colisão não dá conflito de merge, dá
# chave sobrescrita.
DEVKIT_INDEX_FILES="app.json app.config.ts package.json .agent/Decisions/README.md"
