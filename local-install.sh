#!/usr/bin/env sh
# ============================================================================
#  local-install.sh — set up agents-playbook for LOCAL DEVELOPMENT.
# ----------------------------------------------------------------------------
#  Early-dev lifecycle: globally `npm link` the `pb` CLI so it is a live symlink
#  to this repo — edits to pb.mjs / skills / processes are reflected instantly,
#  no repack. A global `pb` operates on THIS repo's playbook; use it mainly to
#  bootstrap OTHER repos (`pb scaffold --target <repo>/.agents-playbook`).
#
#  Usage:
#    ./local-install.sh          install deps + global-link `pb`
#    ./local-install.sh --pack   also run a published-tarball smoke test
#                                (validates the `files` allowlist / standalone
#                                 install — what link alone cannot catch)
# ============================================================================
set -eu

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

PKG="$(node -p "require('./package.json').name")"
VER="$(node -p "require('./package.json').version")"
BIN="$(node -p "Object.keys(require('./package.json').bin)[0]")"

echo "==> agents-playbook local install  ($PKG@$VER, bin: $BIN)"
echo "==> repo: $ROOT"

# 1. dependencies (one runtime dep: js-yaml)
echo "==> npm install"
npm install --no-audit --no-fund

# 2. clear any stale global link/shim from a previous run. On Windows `npm link`
#    can leave a dangling bin shim that npm's registry no longer tracks, which
#    makes a fresh `npm link` fail with EEXIST. Remove both, defensively.
npm rm -g "$PKG" >/dev/null 2>&1 || true
if command -v "$BIN" >/dev/null 2>&1; then
  GBIN_DIR="$(dirname "$(command -v "$BIN")")"
  rm -f "$GBIN_DIR/$BIN" "$GBIN_DIR/$BIN.cmd" "$GBIN_DIR/$BIN.ps1" 2>/dev/null || true
fi

# 3. global link — `pb` becomes a live symlink to this repo
echo "==> npm link  (global \`$BIN\` -> this repo)"
npm link

# 4. verify the bin is reachable and runs
if command -v pb >/dev/null 2>&1; then
  echo "==> pb on PATH: $(command -v pb)"
  if pb help >/dev/null 2>&1; then echo "==> pb runs OK"; fi
else
  echo "!! pb not found on PATH. Add your npm global bin dir to PATH:"
  echo "   $(npm prefix -g)"
fi

# 5. optional: prove the PUBLISHED shape works (tarball -> install -> bootstrap)
if [ "${1:-}" = "--pack" ]; then
  echo "==> --pack: published-tarball smoke test"
  TMP="$(mktemp -d)"
  TGZ="$(npm pack --pack-destination "$TMP" | tail -1)"
  (
    cd "$TMP"
    npm init -y >/dev/null 2>&1
    npm install "$TMP/$TGZ" --no-audit --no-fund >/dev/null 2>&1
    node "node_modules/$PKG/scripts/pb.mjs" scaffold --target ./.agents-playbook >/dev/null 2>&1
    cd .agents-playbook
    node scripts/pb.mjs init >/dev/null 2>&1
    node scripts/pb.mjs validate
  )
  echo "==> tarball smoke test passed ($TGZ)"
  rm -rf "$TMP"
fi

cat <<EOF

Done. Local dev lifecycle:
  - Edits to this repo are live via the global \`pb\` link (no repack).
  - \`pb\` runs against THIS repo's playbook; use it to bootstrap others:
      pb scaffold --target <repo>/.agents-playbook
  - Pre-publish smoke test:  ./local-install.sh --pack
  - Tear down:               ./local-uninstall.sh
EOF
