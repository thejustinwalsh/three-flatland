#!/usr/bin/env bash
set -euo pipefail

# Apply patches to the Skia submodule for WASM/Zig compatibility.
#
# Patches are stored in packages/skia/patches/ and applied in order.
# This script is idempotent — it checks if patches are already applied.
#
# Usage:
#   ./scripts/patch-skia.sh           # Apply all patches
#   ./scripts/patch-skia.sh --check   # Check if patches are applied (exit 1 if not)
#   ./scripts/patch-skia.sh --revert  # Revert all patches

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SKIA_DIR="$PKG_ROOT/third_party/skia"
PATCHES_DIR="$PKG_ROOT/patches"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
error() { echo -e "${RED}[error]${NC} $*" >&2; }

MODE="apply"
for arg in "$@"; do
  case "$arg" in
    --check)  MODE="check" ;;
    --revert) MODE="revert" ;;
    --help|-h)
      echo "Usage: $0 [--check | --revert]"
      exit 0
      ;;
  esac
done

if [ ! -d "$PATCHES_DIR" ] || [ -z "$(ls -A "$PATCHES_DIR"/*.patch 2>/dev/null)" ]; then
  ok "No patches to apply"
  exit 0
fi

cd "$SKIA_DIR"

for patch in "$PATCHES_DIR"/*.patch; do
  name="$(basename "$patch")"

  case "$MODE" in
    check)
      if git apply --check --reverse "$patch" 2>/dev/null; then
        ok "$name (applied)"
      else
        error "$name (not applied)"
        exit 1
      fi
      ;;
    apply)
      if git apply --check --reverse "$patch" 2>/dev/null; then
        ok "$name (already applied)"
      else
        info "Applying $name..."
        git apply "$patch"
        ok "$name applied"
      fi
      ;;
    revert)
      if git apply --check --reverse "$patch" 2>/dev/null; then
        info "Reverting $name..."
        git apply --reverse "$patch"
        ok "$name reverted"
      else
        ok "$name (not applied, skipping)"
      fi
      ;;
  esac
done
