#!/usr/bin/env bash
# .devkit/profile.sh — como se prova alguma coisa NESTE projeto.
#
# Fonte única para skills e hooks. Pacote único (Vite + React + TS), sem
# monorepo. Backend é Supabase (Postgres + Auth + Storage + Edge Functions),
# ver .agent/Decisions/0001-supabase-com-rls-por-casal.md.

DEVKIT_STACK="vite-react-ts"

# --- Qualidade -------------------------------------------------------------
DEVKIT_CMD_TYPECHECK="npm run typecheck"
DEVKIT_CMD_LINT="npm run lint"
# vitest. `npm run test` roda os testes de `src` (domínio + interface): puros,
# sem rede, então cabem no gate a cada Stop. Os de integração
# (`supabase/tests`, onde a RLS se prova) estão DORMENTES: não há banco de
# teste, e eles não podem rodar contra produção (ADR 0010).
DEVKIT_CMD_TEST="npm run test"
DEVKIT_CMD_TEST_DB="npm run test:db"   # contra o online (ADR 0014); fora do Stop — roda no verify
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
DEVKIT_MIGRATIONS_DIR="supabase/migrations/"
# `db reset` derruba e reaplica tudo do zero no Postgres local: é a única prova
# de que os arquivos no disco realmente aplicam, que é a falha que este check
# existe para pegar (arquivo no disco fora do índice nunca roda e não acusa).
# Só dispara quando um arquivo de migração muda. Exige Docker de pé — e se o
# Docker estiver parado ele FALHA em vez de passar, o que é o comportamento
# certo: "não consegui provar" não é "está ok".
# DESLIGADO (ADR 0010): não há banco local nem de teste onde aplicar as
# migrations do zero. Comando vazio ⇒ o hook pula o passo. Religar quando
# existir o projeto de teste que o ADR descreve.
DEVKIT_CMD_MIGRATE_CHECK=""

# --- Arquivos que toda frente edita (colidem sem dar conflito de merge) -----
DEVKIT_INDEX_FILES=".agent/README.md .agent/Decisions/README.md"

# --- Recorte por módulo tocado ---------------------------------------------
# Pacote único: não declarar devkit_scope_args — o comando roda inteiro.
