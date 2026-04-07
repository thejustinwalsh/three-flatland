#!/usr/bin/env bash
set -euo pipefail

# Vendor Skia's third-party deps into packages/skia/vendor/.
#
# Clones from GitHub (not Google's rate-limited mirrors), extracts only
# the source/headers we compile, and checks the result into git.
#
# CI never runs this — vendor/ is checked in. Run locally when:
#   - Updating the Skia pin (new chrome/m* branch)
#   - Changing which deps/files are needed
#
# Usage:
#   ./scripts/sync-skia-deps.sh                 # Vendor deps (skip if already present)
#   ./scripts/sync-skia-deps.sh --force          # Re-vendor even if already present
#   ./scripts/sync-skia-deps.sh --with-dawn      # Also clone Dawn (for regenerating WGPU shim/WIT)
#
# When updating the Skia pin to a new chrome/m* branch:
#   1. ./scripts/sync-skia-deps.sh --force --with-dawn
#   2. ./scripts/setup-skia.sh  (regenerates shim headers, GN, skia_sources.zig)
#   3. git add vendor/ src/zig/ wit/

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SKIA_DIR="$PKG_ROOT/third_party/skia"
VENDOR_DIR="$PKG_ROOT/vendor"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
error() { echo -e "${RED}[error]${NC} $*" >&2; }

FORCE=false
WITH_DAWN=false
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=true ;;
    --with-dawn) WITH_DAWN=true ;;
  esac
done

# ── Check if vendor dir already has what we need ──
if [ "$FORCE" = false ] && \
   [ -f "$VENDOR_DIR/freetype/src/autofit/autofit.c" ] && \
   [ -d "$VENDOR_DIR/harfbuzz/src" ] && \
   [ -d "$VENDOR_DIR/expat/lib" ]; then
  ok "vendor/ already present (use --force to re-sync)"
  exit 0
fi

# ── GitHub source repos ──
# We use upstream repos, not Chromium forks. The source files are identical
# for the subset we compile. Pinned versions come from Skia's DEPS file.

FREETYPE_REPO="https://github.com/freetype/freetype.git"
HARFBUZZ_REPO="https://github.com/harfbuzz/harfbuzz.git"
EXPAT_REPO="https://github.com/libexpat/libexpat.git"

# ── Extract pinned revisions from Skia DEPS ──
get_pinned_rev() {
  local name="$1"
  python3 -c "
import re, sys
with open('$SKIA_DIR/DEPS') as f:
    content = f.read()
pattern = r'\"third_party/externals/$name\"\s*:\s*\"[^\"]+@([a-f0-9]+)\"'
m = re.search(pattern, content)
if m:
    print(m.group(1))
else:
    print('HEAD')
" 2>/dev/null || echo "HEAD"
}

# ── Clone a repo to a temp dir, checkout pinned rev ──
clone_at_rev() {
  local name="$1"
  local repo="$2"
  local dest="$3"
  local rev

  rev=$(get_pinned_rev "$name")
  info "$name: cloning from $repo" >&2

  local tmpdir
  tmpdir=$(mktemp -d)
  git clone --depth 1 "$repo" "$tmpdir/$name" --quiet 2>/dev/null || {
    error "$name: clone failed"
    rm -rf "$tmpdir"
    return 1
  }

  # Try to fetch the exact pinned rev (may fail for Chromium-fork-specific commits)
  if [ "$rev" != "HEAD" ]; then
    (cd "$tmpdir/$name" && git fetch --depth 1 origin "$rev" 2>/dev/null && git checkout FETCH_HEAD --quiet 2>/dev/null) || {
      warn "$name: pinned rev $rev not found on GitHub, using HEAD" >&2
    }
  fi

  echo "$tmpdir/$name"
}

# ── Vendor freetype ──
# We compile ~28 .c files and need include/ headers.
vendor_freetype() {
  local src
  src=$(clone_at_rev "freetype" "$FREETYPE_REPO" "$VENDOR_DIR/freetype") || return 1
  local rev
  rev=$(cd "$src" && git rev-parse --short HEAD)

  rm -rf "$VENDOR_DIR/freetype"
  mkdir -p "$VENDOR_DIR/freetype"

  # Copy source files we compile (from build.zig)
  cp -r "$src/src" "$VENDOR_DIR/freetype/src"
  # Copy all headers
  cp -r "$src/include" "$VENDOR_DIR/freetype/include"
  # License
  cp "$src/LICENSE.TXT" "$VENDOR_DIR/freetype/"

  rm -rf "$(dirname "$src")"
  ok "freetype @ $rev"
}

# ── Vendor harfbuzz ──
# Headers only — Skia compiles its own harfbuzz wrapper.
vendor_harfbuzz() {
  local src
  src=$(clone_at_rev "harfbuzz" "$HARFBUZZ_REPO" "$VENDOR_DIR/harfbuzz") || return 1
  local rev
  rev=$(cd "$src" && git rev-parse --short HEAD)

  rm -rf "$VENDOR_DIR/harfbuzz"
  mkdir -p "$VENDOR_DIR/harfbuzz/src"

  # Copy headers from src/ (hb-*.h, hb-*.hh)
  cp "$src"/src/hb.h "$src"/src/hb-*.h "$src"/src/hb-*.hh "$VENDOR_DIR/harfbuzz/src/" 2>/dev/null || true
  # License
  cp "$src/COPYING" "$VENDOR_DIR/harfbuzz/"

  rm -rf "$(dirname "$src")"
  ok "harfbuzz @ $rev"
}

# ── Vendor expat ──
# Headers only — Skia compiles its own expat wrapper.
vendor_expat() {
  local src
  src=$(clone_at_rev "expat" "$EXPAT_REPO" "$VENDOR_DIR/expat") || return 1
  local rev
  rev=$(cd "$src" && git rev-parse --short HEAD)

  rm -rf "$VENDOR_DIR/expat"
  mkdir -p "$VENDOR_DIR/expat/lib"

  # Copy headers from expat/lib/
  cp "$src"/expat/lib/*.h "$VENDOR_DIR/expat/lib/"
  # License
  cp "$src/expat/COPYING" "$VENDOR_DIR/expat/"

  rm -rf "$(dirname "$src")"
  ok "expat @ $rev"
}

# ── Main ──

echo ""
echo "=== Vendoring Skia third-party deps ==="
echo ""

mkdir -p "$VENDOR_DIR"

failed=0
vendor_freetype || ((failed++))
vendor_harfbuzz  || ((failed++))
vendor_expat     || ((failed++))

echo ""
if [ "$failed" -gt 0 ]; then
  error "$failed dep(s) failed. Check network connectivity."
  exit 1
fi

# ── Optional: Dawn (needed to regenerate WGPU shim/WIT when updating Skia pin) ──
if [ "$WITH_DAWN" = true ]; then
  DAWN_REPO="https://github.com/nicebyte/nicedawn.git"
  DAWN_DEST="$PKG_ROOT/third_party/skia/third_party/externals/dawn"
  if [ -d "$DAWN_DEST/.git" ]; then
    ok "dawn already present"
  else
    info "dawn: cloning (for WGPU shim generation)..."
    # Use Dawn's official GitHub mirror
    git clone --depth 1 https://dawn.googlesource.com/dawn.git "$DAWN_DEST" --quiet 2>/dev/null || \
    git clone --depth 1 https://github.com/nicebyte/nicedawn.git "$DAWN_DEST" --quiet 2>/dev/null || {
      error "dawn: clone failed — try manually: git clone https://dawn.googlesource.com/dawn.git $DAWN_DEST"
      ((failed++))
    }
    if [ -d "$DAWN_DEST/.git" ]; then
      local rev
      rev=$(get_pinned_rev "dawn")
      if [ "$rev" != "HEAD" ]; then
        (cd "$DAWN_DEST" && git fetch --depth 1 origin "$rev" 2>/dev/null && git checkout FETCH_HEAD --quiet 2>/dev/null) || \
          warn "dawn: pinned rev not found, using HEAD" >&2
      fi
      ok "dawn @ $(cd "$DAWN_DEST" && git rev-parse --short HEAD)"
    fi
  fi
fi

ok "All deps vendored to vendor/"
echo "  Run 'git add vendor/' to check them in."
echo ""
