#!/usr/bin/env bash
#
# release-omni.sh — build the umbrella vega package and publish a self-contained
# git tag on the omni-dist branch. Consumers reference that tag from package.json:
#
#   "vega": "exploreomni/vega-omni#v6.2.0-omni.1"
#
# Source stays on omni/main. Built artifacts live on omni-dist. The two never mix.
#
# Usage:
#   scripts/release-omni.sh <version-suffix>
# Example:
#   scripts/release-omni.sh omni.1     # tag becomes v<upstream>-omni.1
#
# Pre-requisites: working tree clean, on omni/main, deps installed.

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <version-suffix>  (e.g. omni.1)" >&2
  exit 2
fi

SUFFIX="$1"
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# 1. Validate state
if [ -n "$(git status --porcelain)" ]; then
  echo "error: working tree not clean" >&2
  exit 1
fi

CURRENT_BRANCH="$(git branch --show-current)"
if [ "$CURRENT_BRANCH" != "omni/main" ] && [ "${ALLOW_BRANCH:-}" != "1" ]; then
  echo "error: not on omni/main (current: $CURRENT_BRANCH). Set ALLOW_BRANCH=1 to override." >&2
  exit 1
fi

UPSTREAM_BASE="$(git describe --tags --abbrev=0 --match 'v[0-9]*' 2>/dev/null | head -1)"
if [ -z "$UPSTREAM_BASE" ]; then
  echo "error: no upstream version tag found" >&2
  exit 1
fi

# Guard: omni/main must be anchored on the release tag itself, not on
# upstream/main HEAD past it. If git describe (with --abbrev=N) doesn't
# equal git describe --abbrev=0 + the omni patch count, we drifted.
EXPECTED_PATCH_COUNT="$(git rev-list --count "$UPSTREAM_BASE..HEAD")"
DESCRIBE_FULL="$(git describe --tags --match 'v[0-9]*' 2>/dev/null)"
if ! [[ "$DESCRIBE_FULL" =~ ^${UPSTREAM_BASE}-${EXPECTED_PATCH_COUNT}-g[0-9a-f]+$ ]]; then
  echo "error: omni/main is not cleanly anchored on $UPSTREAM_BASE." >&2
  echo "       git describe says: $DESCRIBE_FULL" >&2
  echo "       expected: ${UPSTREAM_BASE}-${EXPECTED_PATCH_COUNT}-gXXXX (i.e. $EXPECTED_PATCH_COUNT omni commits past the tag)" >&2
  echo "       Likely the branch was rebased onto upstream/main HEAD instead of $UPSTREAM_BASE." >&2
  echo "       Fix:  git rebase --onto $UPSTREAM_BASE upstream/main HEAD" >&2
  exit 1
fi

TAG="${UPSTREAM_BASE}-${SUFFIX}"
echo "→ Releasing $TAG (based on upstream $UPSTREAM_BASE, $EXPECTED_PATCH_COUNT omni commits)"

# 2. Build the umbrella package
echo "→ Building monorepo"
npx lerna run build

UMBRELLA_DIR="packages/vega"
BUILD_DIR="$UMBRELLA_DIR/build"
if [ ! -d "$BUILD_DIR" ]; then
  echo "error: $BUILD_DIR not produced by build" >&2
  exit 1
fi

# 3. Verify the bundle has no surviving runtime imports of vega-* subpackages
#    (this is the §3 invariant from the plan: subpackages are bundled, not depended on)
echo "→ Verifying bundle is self-contained"
if grep -E "from ['\"]vega-[a-z-]+['\"]" "$BUILD_DIR/vega.module.js" >/dev/null 2>&1; then
  echo "error: bundle still imports vega-* subpackages at runtime — bundling is incomplete" >&2
  grep -nE "from ['\"]vega-[a-z-]+['\"]" "$BUILD_DIR/vega.module.js" | head -5 >&2
  exit 1
fi

# 4. Stage artifacts in a temp dir (we'll move them onto omni-dist worktree)
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
echo "→ Staging artifacts at $STAGE"
cp -R "$BUILD_DIR" "$STAGE/build"
cp "$UMBRELLA_DIR/index.d.ts" "$STAGE/" 2>/dev/null || true
cp "$REPO_ROOT/LICENSE" "$STAGE/" 2>/dev/null || true

# Write a slimmed package.json: name + version + entry points + true externals only.
# No vega-* runtime deps (those are bundled), but vega-typings stays — it has no
# runtime code, only .d.ts files, and the umbrella's index.d.ts re-exports from
# it (`declare module 'vega' { export * from 'vega-typings' }`). Stripping it
# would break consumer TypeScript (`import type { View } from 'vega'` fails).
node - "$STAGE" "$TAG" "$UPSTREAM_BASE" "$REPO_ROOT/$UMBRELLA_DIR/package.json" <<'NODE'
const fs = require('fs');
const [stage, tag, upstreamBase, srcPkgPath] = process.argv.slice(2);
const src = JSON.parse(fs.readFileSync(srcPkgPath, 'utf8'));

// vega-typings is types-only — keep it. Strip every other vega-* (those are
// runtime-bundled via rollup).
const TYPES_ONLY_VEGA_DEPS = new Set(['vega-typings']);
const externals = Object.fromEntries(
  Object.entries(src.dependencies || {}).filter(([name]) =>
    !name.startsWith('vega-') || TYPES_ONLY_VEGA_DEPS.has(name)
  )
);

const slim = {
  name: src.name,                                 // "vega" (upstream-shaped)
  version: tag.replace(/^v/, ''),                 // "6.2.0-omni.1"
  description: src.description,
  license: src.license,
  type: src.type,
  exports: src.exports,
  unpkg: src.unpkg,
  jsdelivr: src.jsdelivr,
  repository: src.repository,
  dependencies: externals,                        // d3-*, tslib, etc.
};
fs.writeFileSync(stage + '/package.json', JSON.stringify(slim, null, 2) + '\n');
NODE

# 5. Create or update the omni-dist worktree, replace its tree with the staged artifacts
DIST_DIR="$(mktemp -d)/omni-dist"
trap 'rm -rf "$STAGE" "$(dirname "$DIST_DIR")"' EXIT

if git show-ref --verify --quiet refs/heads/omni-dist || \
   git show-ref --verify --quiet refs/remotes/origin/omni-dist; then
  git worktree add "$DIST_DIR" omni-dist
  echo "→ Clearing existing omni-dist tree (preserving .git worktree link)"
  ( cd "$DIST_DIR" && git rm -rf -q . 2>/dev/null || true )
else
  echo "→ Bootstrapping omni-dist as a fresh orphan branch"
  git worktree add --orphan -b omni-dist "$DIST_DIR"
fi

echo "→ Copying built artifacts onto omni-dist worktree"
# Use rsync-style copy-without-touching .git
( cd "$STAGE" && tar c . ) | ( cd "$DIST_DIR" && tar x )

# 6. Commit + tag on omni-dist
cd "$DIST_DIR"
git add -A
SOURCE_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
git -c commit.gpgsign=false commit -m "release: $TAG (from $SOURCE_SHA)"
git tag "$TAG"
echo "→ Tagged $TAG on omni-dist (source: $SOURCE_SHA)"

cd "$REPO_ROOT"
git worktree remove --force "$DIST_DIR"

cat <<EOF

✓ Done. To publish:
    git push origin omni-dist --tags

Consumers reference this release as:
    "vega": "exploreomni/vega-omni#$TAG"

EOF
