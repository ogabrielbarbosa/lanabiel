#!/usr/bin/env bash
# Perfil: iOS/macOS nativo (Swift).
#
# Ajuste esquema e destino. `-quiet` mantém a saída do hook legível; sem ele, o
# xcodebuild devolve milhares de linhas e o erro real se perde no meio.

DEVKIT_STACK="swift"

SCHEME="App"
DEST="platform=iOS Simulator,name=iPhone 16"

# Não existe "typecheck" separado em Swift: a compilação é a verificação. O
# build para simulador é o passo barato; arquivar é que não.
DEVKIT_CMD_TYPECHECK="xcodebuild -scheme $SCHEME -destination '$DEST' build -quiet"
DEVKIT_CMD_LINT="swiftlint --strict --quiet"
DEVKIT_CMD_TEST="xcodebuild -scheme $SCHEME -destination '$DEST' test -quiet"
DEVKIT_CMD_BUILD="xcodebuild -scheme $SCHEME archive -quiet"

DEVKIT_CMD_FORMAT_FILE="swiftformat"
DEVKIT_FORMAT_EXT="swift"

DEVKIT_CODE_EXT="swift"
DEVKIT_READY_MARKER=""        # SPM resolve sozinho; com CocoaPods, use "Pods"

DEVKIT_CONTRACT_PATH="Sources/Shared/"
DEVKIT_CMD_CONTRACT_BUILD=""

DEVKIT_MIGRATIONS_DIR=""      # Core Data: os .xcdatamodeld versionados
DEVKIT_CMD_MIGRATE_CHECK=""

# O `project.pbxproj` é o arquivo-índice por excelência: toda frente que
# adiciona um arquivo o edita, e o merge dele é notoriamente hostil.
DEVKIT_INDEX_FILES="App.xcodeproj/project.pbxproj Package.swift"
