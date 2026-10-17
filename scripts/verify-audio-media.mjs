import { readFile } from 'node:fs/promises';

const baseUrl = process.argv[2] || process.env.AUDIO_MEDIA_BASE_URL;
if (!baseUrl) {
  throw new Error('請提供正式媒體網址，例如 npm run audio:r2:verify -- https://example.workers.dev/media/audio/');
}
const normalizedBase = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
const manifest = JSON.parse(await readFile('data/audio_test_manifest.json', 'utf8'));
const entries = Object.values(manifest.entries);
let failures = 0;

for (const entry of entries) {
  const url = new URL(entry.path, normalizedBase);
  const head = await fetch(url, { method: 'HEAD' });
  const range = await fetch(url, { headers: { Range: 'bytes=0-31' } });
  const valid = head.ok
    && head.headers.get('content-type')?.startsWith('audio/')
    && head.headers.get('cache-control')?.includes('immutable')
    && range.status === 206
    && range.headers.get('content-range')?.startsWith('bytes 0-31/');
  console.log((valid ? 'OK   ' : 'FAIL ') + entry.code + ' ' + url);
  if (!valid) failures += 1;
}

if (failures) {
  throw new Error('正式媒體驗證失敗：' + failures + '/' + entries.length);
}
console.log('Audio media verification passed: ' + entries.length + ' representative files.');
