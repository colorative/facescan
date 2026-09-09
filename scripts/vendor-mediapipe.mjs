/**
 * Vendors MediaPipe's two halves into public/ so the kiosk runs offline.
 *
 *   wasm  -> copied from node_modules (local, always works)
 *   model -> downloaded from Google's model CDN (needs network)
 *
 * This runs as `postinstall`, so it must never break `npm install`:
 * a network failure warns and exits 0. A missing model surfaces in the app
 * as the ERR_MODEL_LOAD state, fixable with `npm run vendor:mediapipe`.
 */
import { cp, mkdir, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const MODEL_DEST = join(ROOT, 'public/models/face_landmarker.task')
const WASM_DEST = join(ROOT, 'public/mediapipe/wasm')

/** Model is ~3.7MB. Anything much smaller is a truncated download or an error page. */
const MIN_MODEL_BYTES = 1_000_000

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`)
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`)

async function sizeOf(path) {
  try {
    return (await stat(path)).size
  } catch {
    return -1
  }
}

async function vendorWasm() {
  const require = createRequire(import.meta.url)
  let wasmSrc
  try {
    // Resolve the root export ('.') rather than a subpath: the package's
    // exports map deliberately exposes no './vision_bundle.mjs' entry, so
    // resolving one throws ERR_PACKAGE_PATH_NOT_EXPORTED.
    const entry = require.resolve('@mediapipe/tasks-vision')
    wasmSrc = join(dirname(entry), 'wasm')
  } catch {
    warn('@mediapipe/tasks-vision not installed yet — skipping wasm copy')
    return false
  }

  if ((await sizeOf(wasmSrc)) < 0) {
    warn(`no wasm folder at ${wasmSrc} — skipping`)
    return false
  }

  await mkdir(WASM_DEST, { recursive: true })
  await cp(wasmSrc, WASM_DEST, { recursive: true })
  ok('wasm runtime -> public/mediapipe/wasm/')
  return true
}

async function vendorModel() {
  const existing = await sizeOf(MODEL_DEST)
  if (existing >= MIN_MODEL_BYTES) {
    ok(`model already present (${(existing / 1e6).toFixed(1)}MB) — skipping download`)
    return true
  }

  await mkdir(dirname(MODEL_DEST), { recursive: true })

  try {
    const res = await fetch(MODEL_URL, { signal: AbortSignal.timeout(120_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)

    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength < MIN_MODEL_BYTES) {
      throw new Error(`suspiciously small response (${bytes.byteLength} bytes)`)
    }

    await writeFile(MODEL_DEST, bytes)
    ok(`face_landmarker.task (${(bytes.byteLength / 1e6).toFixed(1)}MB) -> public/models/`)
    return true
  } catch (err) {
    warn(`could not download the face model: ${err.message}`)
    warn('the kiosk will show ERR_MODEL_LOAD until you run: npm run vendor:mediapipe')
    return false
  }
}

console.log('\nvendoring MediaPipe for offline kiosk use')
const wasmOk = await vendorWasm()
const modelOk = await vendorModel()
console.log(
  wasmOk && modelOk
    ? '\nready to scan offline\n'
    : '\nvendoring incomplete — see warnings above (install itself is fine)\n',
)
