#!/usr/bin/env sh
# ============================================================================
#  local-uninstall.sh — tear down the LOCAL DEV install of agents-playbook.
# ----------------------------------------------------------------------------
#  Reverses ./local-install.sh: removes the global `pb` link/install and any
#  stray pack tarballs. Leaves the repo and its node_modules intact.
#
#  Usage:
#    ./local-uninstall.sh
# ============================================================================
set -eu

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

PKG="$(node -p "require('./package.json').name")"
BIN="$(node -p "Object.keys(require('./package.json').bin)[0]")"

echo "==> agents-playbook local uninstall  ($PKG, bin: $BIN)"

# 1. remove the global link/install. `npm rm -g` handles both a linked and an
#    installed package; don't gate on `npm ls -g` (it under-reports links on
#    Windows). Tolerate "nothing to remove".
echo "==> npm rm -g $PKG"
npm rm -g "$PKG" >/dev/null 2>&1 || true

# 2. force-clean any dangling bin shim npm left behind (Windows link quirk:
#    the shim can outlive the registry entry).
if command -v "$BIN" >/dev/null 2>&1; then
  GBIN_DIR="$(dirname "$(command -v "$BIN")")"
  rm -f "$GBIN_DIR/$BIN" "$GBIN_DIR/$BIN.cmd" "$GBIN_DIR/$BIN.ps1" 2>/dev/null || true
  echo "==> cleaned dangling $BIN shim(s) in $GBIN_DIR"
fi

# 2. clean stray pack artifacts left in the repo root
if ls ./*.tgz >/dev/null 2>&1; then
  echo "==> removing stray tarball(s): $(ls ./*.tgz)"
  rm -f ./*.tgz
fi

# 3. verify
if command -v pb >/dev/null 2>&1; then
  echo "!! pb still on PATH ($(command -v pb)) — likely a separate global install"
else
  echo "==> pb removed from PATH"
fi

echo "Done."
