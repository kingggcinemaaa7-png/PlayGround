#!/usr/bin/env node
// Copies the Three.js ESM build + the post-processing addons we use into
// public/vendor so the game is fully self-contained (works offline and on a
// plain static host, without a bundler).
import { cpSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules', 'three')
const dst = join(root, 'public', 'vendor', 'three')
if (!existsSync(src)) {
  console.error('[vendor] three is not installed, run npm install first')
  process.exit(1)
}

const files = [
  'build/three.module.js',
  'build/three.core.js',
  'examples/jsm/postprocessing/Pass.js',
  'examples/jsm/postprocessing/EffectComposer.js',
  'examples/jsm/postprocessing/RenderPass.js',
  'examples/jsm/postprocessing/ShaderPass.js',
  'examples/jsm/postprocessing/MaskPass.js',
  'examples/jsm/postprocessing/UnrealBloomPass.js',
  'examples/jsm/postprocessing/OutputPass.js',
  'examples/jsm/shaders/CopyShader.js',
  'examples/jsm/shaders/LuminosityHighPassShader.js',
  'examples/jsm/shaders/OutputShader.js'
]

for (const file of files) {
  const target = join(dst, file.replace(/^examples\/jsm\//, 'addons/').replace(/^build\//, ''))
  mkdirSync(dirname(target), { recursive: true })
  cpSync(join(src, file), target)
}

console.log(`[vendor] synced ${files.length} Three.js files -> public/vendor/three`)
