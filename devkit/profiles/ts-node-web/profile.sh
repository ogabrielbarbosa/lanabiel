#!/usr/bin/env bash
# Perfil: SPA + API como processos separados num monorepo TS.
# Ex.: Vite/React + Nest/Express/Fastify + pacote de contrato compartilhado.
#
# Ajuste os nomes de workspace antes de usar. Rode cada comando uma vez.

DEVKIT_STACK="ts-node-web"

DEVKIT_CMD_TYPECHECK="pnpm exec turbo run typecheck --continue"
DEVKIT_CMD_LINT="pnpm exec turbo run lint --continue"
DEVKIT_CMD_TEST="pnpm exec turbo run test --continue"
DEVKIT_CMD_BUILD="pnpm exec turbo run build"

DEVKIT_CMD_FORMAT_FILE="pnpm exec prettier --write"
DEVKIT_FORMAT_EXT="ts|tsx|js|jsx|json|css|md"

DEVKIT_CODE_EXT="ts|tsx|js|jsx|json|css"
DEVKIT_READY_MARKER="node_modules"

# O pacote que frente e fundo importam. É o que impede a mesma regra de negócio
# de ser escrita duas vezes e divergir em silêncio.
DEVKIT_CONTRACT_PATH="packages/shared/"
DEVKIT_CMD_CONTRACT_BUILD="pnpm --filter @app/shared build"

DEVKIT_MIGRATIONS_DIR="apps/api/drizzle/migrations/"
DEVKIT_CMD_MIGRATE_CHECK="pnpm --filter @app/api db:check"

DEVKIT_INDEX_FILES="packages/shared/src/index.ts .agent/README.md .agent/Decisions/README.md"

# Recorte por workspace tocado.
#
# O `...` ANTES do nome inclui os DEPENDENTES: mexer no contrato compartilhado
# quebra quem o consome, e é justamente essa quebra que interessa. Depois do
# nome pega as dependências, que é o inverso do que se quer aqui.
#
# Cuidado com lint que roda `--fix`: ele CONSERTA durante a verificação, sai 0,
# e a violação só some na sua máquina. Na CI, confira `git diff --exit-code`
# depois do lint; aqui no hook, o conserto aparece como mudança nova na árvore.
devkit_scope_args() {
  local changed="$1" args=""
  echo "$changed" | grep -q '^apps/web/'        && args="$args --filter=@app/web"
  echo "$changed" | grep -q '^apps/api/'        && args="$args --filter=@app/api"
  echo "$changed" | grep -q '^packages/shared/' && args="$args --filter=...@app/shared"
  echo "$args"   # vazio (config da raiz, turbo.json, tsconfig base) = árvore inteira
}
