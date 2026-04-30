# Omni's fork of vega/vega

This is `exploreomni/vega-omni`, a GitHub fork of [`vega/vega`](https://github.com/vega/vega) that carries Omni-specific patches we've not yet upstreamed.

## What's in this fork

`omni/main` is anchored on the most recent upstream release tag (`v6.2.0`) and carries a small linear stack of patches:

```
chore(omni): inline vega-* into umbrella ESM bundle + release script   ← omni-only
fix(scenegraph): canvas detection for node-canvas in CanvasRenderer    ← upstreamable
feat(rendering): OffscreenCanvas Support                               ← upstreamable
─────────────────────────────────────────────────────────────────────────
upstream tag v6.2.0
```

The chore commit sits at the top because everything below it is meant to be PR'd back to `vega/vega` eventually; the chore commit is the one Omni-specific thing that should never go upstream.

## Branch model

| Ref | Purpose | Mutability |
| --- | --- | --- |
| `main` | Mirror of `vega/vega:main`. No Omni commits. | Force-reset to `upstream/main` during sync. |
| `omni/main` | Default branch. Linear patch stack on top of the most recent upstream release tag. | Force-pushed during upstream sync, otherwise append-only via PRs. |
| `omni-dist` | Orphan branch holding pre-built artifacts (`build/vega.module.js`, slim `package.json`, etc.). What consumers fetch via git URL. | Force-updated by `./scripts/release-omni.sh`. |
| `v6.2.0-omni.N` (tag) | Immutable consumer reference, points to a commit on `omni-dist`. | Re-tagged only if the underlying release was wrong; in normal flow we cut a new `omni.N+1`. |

## Consumption (from a downstream package.json)

```json
{
  "dependencies": {
    "vega": "exploreomni/vega-omni#v6.2.0-omni.0"
  }
}
```

The git URL points at the `omni-dist` tag. The fetched tree is a single self-contained ESM bundle with all `vega-*` subpackages inlined. No npm publish is involved.

## How to add a patch

```bash
git clone git@github.com:exploreomni/vega-omni
cd vega-omni
git fetch origin
git checkout -b feat/your-thing origin/omni/main

DISABLE_POSTINSTALL_SCRIPT=1 npm install
# Lerna symlinks subpackages into node_modules, so edits to packages/vega-*/
# are immediately reflected when building the umbrella.

$EDITOR packages/vega-scenegraph/src/...
npx lerna run test --scope vega-scenegraph

git commit -am "feat(scenegraph): your-thing"
git push -u origin feat/your-thing
# Open PR in GitHub UI: feat/your-thing → omni/main
```

After merge into `omni/main`, cut a new release:

```bash
git checkout omni/main && git pull
./scripts/release-omni.sh omni.N    # next N
git push origin omni-dist --tags
```

Bump `~/src/omni/packages/bi-app/package.json` to point at the new tag.

## How to pull upstream

When `vega/vega` cuts `v6.3.0`:

```bash
git fetch upstream --tags

# Mirror updated upstream main
git checkout main && git reset --hard upstream/main && git push -f origin main

# Replay omni patches onto the new tag
git checkout omni/main
git rebase --onto v6.3.0 v6.2.0
# Resolve conflicts patch-by-patch — each Omni commit replays in its own context.
git push -f origin omni/main

# Cut new release
./scripts/release-omni.sh omni.0
git push origin omni-dist --tags
```

The release script's drift guard refuses to cut a tag if `omni/main` is anchored on anything other than the most recent upstream release tag. Trust it: if it complains, fix the anchor with `git rebase --onto v<release> upstream/main HEAD`.

## How to upstream a patch

Because this repo is a GitHub fork of `vega/vega`, you can PR back without a personal user-level fork:

```bash
git checkout -b upstream-pr/foo upstream/main
git cherry-pick <sha-of-foo-from-omni-main>
git push origin upstream-pr/foo
# Open PR in GitHub UI: exploreomni/vega-omni:upstream-pr/foo → vega/vega:main
```

Once upstream merges, the next `git rebase --onto` during sync will see the cherry-picked commit as already in the new base and skip it. The patch stack shrinks naturally.

## Caveats

- **`vega.version` reports the upstream version string, not the omni-tagged one.** The constant is hardcoded in vega's source. Cosmetic; consumers can identify the omni build via the dist-tag SHA.
- **`vega-typings` is kept as a runtime dep** in the published slim `package.json` because the umbrella's `index.d.ts` re-exports `declare module 'vega' { export * from 'vega-typings' }`. Stripping it would break consumer TypeScript.
- **The bundle inlines d3-\***. Bundle is ~1.2MB (311KB gzipped). If the consumer wants to share d3 with other libraries, switch d3 to a peer dep — see `packages/vega/rollup.config.js`.

## Links

- Upstream: https://github.com/vega/vega
- Migration history: ask Nate
