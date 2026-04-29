// Omni override: bundle vega-* subpackages into the umbrella ESM output, so
// consumers installing only `vega` get a fully self-contained module without
// having to pull every vega-* sibling from the registry.
//
// We produce TWO ESM bundles, mapped via the package.json `exports` field:
//   - `vega.node.module.js` — for Node (SSR, scheduler/rip.server.cjs, etc.).
//     Pulls vega-canvas's `node` export, which includes nodeCanvas + the
//     `await import('canvas')` integration. The `canvas` package itself is
//     marked external so it resolves at consumer install time.
//   - `vega.module.js` — for browser/worker. Pulls vega-canvas's default
//     (browser) export with only domCanvas + offscreenCanvas. No `canvas`
//     dependency. Smaller.
//
// d3-*, topojson-* and other true externals stay external for both. UMD
// bundles for CDN are browser-only and unchanged.
import { readFile } from 'fs/promises';
import babel from '@rollup/plugin-babel';
import json from '@rollup/plugin-json';
import nodeResolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import bundleSize from 'rollup-plugin-bundle-size';

const pkg = JSON.parse(await readFile('./package.json'));

const trueExternals = Object.keys(pkg.dependencies || {})
  .filter((d) => !d.startsWith('vega-'));

const globals = {};
for (const dep of trueExternals) {
  if (dep.startsWith('d3')) globals[dep] = 'd3';
  else if (dep.startsWith('topojson')) globals[dep] = 'topojson';
}

function plugins(targets, conditions) {
  return [
    nodeResolve({
      // For browser bundles, prefer the `browser` field/condition.
      // For node bundles, prefer the `node` condition so vega-canvas resolves
      // to vega-canvas.node.js (with nodeCanvas + the canvas package import).
      ...(conditions === 'browser' ? { browser: true } : { exportConditions: conditions }),
      modulesOnly: true,
      customResolveOptions: { preserveSymlinks: false },
    }),
    json(),
    babel({
      presets: [['@babel/preset-env', { targets }]],
      babelHelpers: 'bundled',
      extensions: ['.js', '.ts'],
      generatorOpts: { importAttributesKeyword: 'with' },
    }),
    bundleSize(),
  ];
}

function onwarn(warning, defaultHandler) {
  if (warning.code !== 'CIRCULAR_DEPENDENCY') defaultHandler(warning);
}

export default function (commandLineArgs) {
  const test = !!commandLineArgs['config-test'];

  // Browser/worker ESM (default consumer condition)
  const esmBrowser = {
    input: './index.js',
    external: trueExternals,
    onwarn,
    output: {
      file: './build/vega.module.js',
      format: 'esm',
      sourcemap: true,
    },
    plugins: plugins('defaults', 'browser'),
  };

  // Node ESM — for SSR. `canvas` is a native module and must be external.
  const esmNode = {
    input: './index.js',
    external: [...trueExternals, 'canvas'],
    onwarn,
    output: {
      file: './build/vega.node.module.js',
      format: 'esm',
      sourcemap: true,
    },
    plugins: plugins({ node: true }, ['node', 'default']),
  };

  if (test) return [esmBrowser, esmNode];

  const umdBundle = (file, external) => ({
    input: './index.js',
    external,
    onwarn,
    output: [
      { file, format: 'umd', name: 'vega', globals, sourcemap: true, plugins: [terser()] },
      { file: file.replace('.min', ''), format: 'umd', name: 'vega', globals, sourcemap: true },
    ],
    plugins: plugins('defaults', 'browser'),
  });

  return [
    esmBrowser,
    esmNode,
    umdBundle(pkg.jsdelivr, []),
    umdBundle(
      pkg.jsdelivr.replace('.min.js', '-core.min.js'),
      trueExternals.filter((d) => d.startsWith('d3') || d.startsWith('topojson')),
    ),
  ];
}
