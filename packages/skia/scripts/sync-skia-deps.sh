#!/usr/bin/env bash
set -euo pipefail

# Targeted sync of only the Skia third-party deps we actually need.
# Much faster and more reliable than `python3 tools/git-sync-deps` which
# tries to clone all 45+ externals (many we don't use).
#
# Usage: ./scripts/sync-skia-deps.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SKIA_DIR="$PKG_ROOT/third_party/skia"
EXTERNALS="$SKIA_DIR/third_party/externals"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
error() { echo -e "${RED}[error]${NC} $*" >&2; }

# ── Deps we need and their source URLs ──
# Extracted from Skia's DEPS file. Update these when pinning a new Skia version.
#
# Core deps (always needed):
#   freetype  — font rasterization
#   harfbuzz  — text shaping
#   expat     — XML parser for SVG
#   abseil-cpp — Skia core dependency
#
# These are the only externals required for our WebGL WASM build with
# text + SVG support. GPU backend sources (GL, Dawn) are part of Skia core.

declare -A DEPS=(
  ["abseil-cpp"]="https://skia.googlesource.com/external/github.com/abseil/abseil-cpp.git"
  ["freetype"]="https://chromium.googlesource.com/chromium/src/third_party/freetype2.git"
  ["harfbuzz"]="https://chromium.googlesource.com/external/github.com/harfbuzz/harfbuzz.git"
  ["expat"]="https://chromium.googlesource.com/external/github.com/libexpat/libexpat.git"
)

# ── Extract pinned revisions from DEPS ──
get_pinned_rev() {
  local name="$1"
  python3 -c "
import re, sys
with open('$SKIA_DIR/DEPS') as f:
    content = f.read()
# Look for: 'third_party/externals/$name' : '<url>@<rev>'
pattern = r'\"third_party/externals/$name\"\s*:\s*\"[^\"]+@([a-f0-9]+)\"'
m = re.search(pattern, content)
if m:
    print(m.group(1))
else:
    print('HEAD')
" 2>/dev/null
}

# ── Clone or update a single dep ──
sync_dep() {
  local name="$1"
  local url="$2"
  local dest="$EXTERNALS/$name"
  local rev

  rev=$(get_pinned_rev "$name")

  if [ -d "$dest/.git" ] || [ -f "$dest/.git" ]; then
    info "$name: updating..."
    # Clean up any stale lock files from interrupted runs
    rm -f "$dest/.git/index.lock" 2>/dev/null || true

    (cd "$dest" && git fetch --depth 1 origin "$rev" 2>/dev/null && git checkout FETCH_HEAD --quiet 2>/dev/null) || {
      warn "$name: fetch failed, re-cloning..."
      rm -rf "$dest"
      git clone --depth 1 "$url" "$dest" --quiet
      if [ "$rev" != "HEAD" ]; then
        (cd "$dest" && git fetch --depth 1 origin "$rev" && git checkout FETCH_HEAD --quiet) 2>/dev/null || true
      fi
    }
  else
    info "$name: cloning..."
    mkdir -p "$EXTERNALS"
    git clone --depth 1 "$url" "$dest" --quiet 2>/dev/null || {
      error "$name: clone failed from $url"
      return 1
    }
    if [ "$rev" != "HEAD" ]; then
      (cd "$dest" && git fetch --depth 1 origin "$rev" && git checkout FETCH_HEAD --quiet) 2>/dev/null || true
    fi
  fi

  ok "$name → $(cd "$dest" && git rev-parse --short HEAD)"
}

# ── Main ──

echo ""
echo "=== Syncing required Skia third-party deps ==="
echo ""

failed=0
for name in "${!DEPS[@]}"; do
  sync_dep "$name" "${DEPS[$name]}" || ((failed++))
done

echo ""
if [ "$failed" -gt 0 ]; then
  error "$failed dep(s) failed to sync. Retry or check network connectivity."
  exit 1
fi

ok "All deps synced (${#DEPS[@]} packages)"
