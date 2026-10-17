import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const option = name => {
  const prefix = '--' + name + '=';
  return process.argv.slice(2).find(value => value.startsWith(prefix))?.slice(prefix.length);
};
const upload = args.has('--upload');
const bucket = option('bucket') || process.env.AUDIO_R2_BUCKET || 'the-hunters-ad-1492-audio';
const concurrency = Math.max(1, Math.min(8, Number(option('concurrency') || 4)));
const retries = Math.max(0, Math.min(8, Number(option('retries') || 4)));
const limit = option('limit') ? Math.max(1, Number(option('limit'))) : Infinity;
const manifest = JSON.parse(await readFile('data/audio_manifest.json', 'utf8'));
const entries = Object.values(manifest.entries).slice(0, limit);

if (!upload) {
  const bytes = entries.reduce((total, entry) => total + entry.bytes, 0);
  console.log('R2 sync preview only. Add --upload to start.');
  console.log('Bucket: ' + bucket);
  console.log('Objects: ' + entries.length);
  console.log('Bytes: ' + bytes);
  console.log('Example: ' + bucket + '/' + entries[0]?.path);
  process.exit(0);
}

function putOnce(entry) {
  return new Promise((resolve, reject) => {
    const file = path.resolve(entry.sourcePath);
    const child = spawn(process.execPath, [
      'node_modules/wrangler/bin/wrangler.js',
      'r2', 'object', 'put', bucket + '/' + entry.path,
      '--remote',
      '--file', file,
      '--content-type', 'audio/mpeg',
      '--cache-control', 'public, max-age=31536000, immutable',
      '--force',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0
      ? resolve()
      : reject(new Error('Upload failed for ' + entry.code + ': ' + stderr.trim())));
  });
}

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function put(entry) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await putOnce(entry);
      return;
    } catch (error) {
      if (attempt >= retries) throw error;
      const delay = 1_000 * (2 ** attempt);
      console.warn('Upload retry ' + (attempt + 1) + '/' + retries + ' for ' + entry.code + ' in ' + delay + 'ms');
      await wait(delay);
    }
  }
}

let next = 0;
let completed = 0;
async function worker() {
  while (next < entries.length) {
    const entry = entries[next++];
    await put(entry);
    completed += 1;
    if (completed % 25 === 0 || completed === entries.length) {
      console.log('Uploaded ' + completed + '/' + entries.length);
    }
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, () => worker()));
console.log('R2 audio sync complete: ' + completed + ' objects.');
