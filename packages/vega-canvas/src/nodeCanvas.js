// Use createRequire to load node-canvas synchronously in both ESM and CJS
// environments. The upstream form (`await import('canvas')`) is a top-level
// await dynamic import, which esbuild and other bundlers refuse to bundle
// into CJS output (the only option for some Node consumers). This rewrite
// keeps the same null-on-failure semantics without TLA.
import { createRequire } from 'module';

let NodeCanvas;

if (typeof require !== 'undefined') {
  // CommonJS environment — `require` is already in scope.
  try {
    NodeCanvas = require('canvas');
    if (!(NodeCanvas && NodeCanvas.createCanvas)) {
      NodeCanvas = null;
    }
  } catch (e) {
    NodeCanvas = null;
  }
} else {
  // ESM environment — synthesize `require` via createRequire so resolution
  // works without top-level await.
  const require = createRequire(import.meta.url);
  try {
    NodeCanvas = require('canvas');
    if (!(NodeCanvas && NodeCanvas.createCanvas)) {
      NodeCanvas = null;
    }
  } catch (e) {
    NodeCanvas = null;
  }
}

export function nodeCanvas(w, h, type) {
  if (NodeCanvas) {
    try {
      return new NodeCanvas.Canvas(w, h, type);
    } catch (e) {
      // do nothing, return null on error
    }
  }
  return null;
}

export const nodeImage = () =>
  (NodeCanvas && NodeCanvas.Image) || null;
