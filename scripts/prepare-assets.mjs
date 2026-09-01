// Copies MediaPipe wasm files and downloads segmentation models into public/
// so the production build runs fully offline (spec §46: no CDN dependency).
import { cp, mkdir, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const WASM_SRC = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const WASM_DST = path.join(root, 'public', 'wasm');
const MODEL_DIR = path.join(root, 'public', 'models');

const MODELS = [
  {
    file: 'selfie_segmenter_landscape.tflite',
    url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite',
  },
  {
    file: 'deeplab_v3.tflite',
    url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/latest/deeplab_v3.tflite',
  },
];

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyWasm() {
  if (!(await exists(WASM_SRC))) {
    console.warn('[prepare-assets] node_modules not found — run `npm install` first.');
    return;
  }
  await mkdir(WASM_DST, { recursive: true });
  await cp(WASM_SRC, WASM_DST, { recursive: true, force: true });
  console.log('[prepare-assets] wasm copied to public/wasm');
}

async function fetchModels() {
  await mkdir(MODEL_DIR, { recursive: true });
  for (const model of MODELS) {
    const dst = path.join(MODEL_DIR, model.file);
    if (await exists(dst)) continue;
    try {
      console.log(`[prepare-assets] downloading ${model.file} ...`);
      const res = await fetch(model.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(dst, buf);
      console.log(`[prepare-assets] saved ${model.file} (${(buf.length / 1024).toFixed(0)} KB)`);
    } catch (err) {
      console.warn(
        `[prepare-assets] could not download ${model.file} (${err.message}).\n` +
          `  Place it manually at public/models/${model.file}\n` +
          `  Source: ${model.url}`,
      );
    }
  }
}

await copyWasm();
await fetchModels();
