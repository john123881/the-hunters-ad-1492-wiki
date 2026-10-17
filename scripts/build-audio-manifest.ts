import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AUDIO_CATEGORIES, classifyAudioCode, type AudioCategory } from '../shared/audio';

interface SourceAudioEntry {
  code: string;
  category: string;
  categoryName: string;
  subfolder: string;
  relativePath: string;
  filename: string;
}

interface AudioManifestEntry {
  code: string;
  category: AudioCategory;
  title: string;
  path: string;
  sourcePath: string;
  bytes: number;
}

interface ValidationIssue {
  code: string;
  message: string;
}

const root = process.cwd();
const sourceMapPath = path.join(root, 'data/audio_map.json');
const audioRoot = path.join(root, 'data/audio');
const manifestPath = path.join(root, 'data/audio_manifest.json');
const reportPath = path.join(root, 'data/audio_manifest-report.json');
const publicManifestPath = path.join(root, 'public/audio/manifest.json');
const testManifestPath = path.join(root, 'data/audio_test_manifest.json');
const testCodes = ['1', 'F001', 'Q1', 'V1', 'L1', 'W2', 'VW1', 'LW2'];
const configuredMediaBaseUrl = process.env.AUDIO_MEDIA_BASE_URL?.trim();
const mediaBaseUrl = configuredMediaBaseUrl
  ? (configuredMediaBaseUrl.endsWith('/') ? configuredMediaBaseUrl : configuredMediaBaseUrl + '/')
  : undefined;

if (mediaBaseUrl && !mediaBaseUrl.startsWith('/') && !/^https:\/\//.test(mediaBaseUrl)) {
  throw new Error('AUDIO_MEDIA_BASE_URL 必須是 HTTPS 網址或以 / 開頭的同站路徑。');
}

function isSourceAudioEntry(value: unknown): value is SourceAudioEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return ['code', 'category', 'categoryName', 'subfolder', 'relativePath', 'filename']
    .every(key => typeof entry[key] === 'string');
}

function titleFor(entry: SourceAudioEntry): string {
  return entry.categoryName + ' ' + entry.code;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}

const raw = JSON.parse(await readFile(sourceMapPath, 'utf8')) as unknown;
if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
  throw new Error('data/audio_map.json 必須是以語音代碼為 key 的物件。');
}

const issues: ValidationIssue[] = [];
const entries: AudioManifestEntry[] = [];
const normalizedCodes = new Set<string>();

for (const [mapCode, unknownEntry] of Object.entries(raw)) {
  if (!isSourceAudioEntry(unknownEntry)) {
    issues.push({ code: mapCode, message: '資料欄位不完整。' });
    continue;
  }

  const parsed = classifyAudioCode(mapCode);
  if (!parsed) {
    issues.push({ code: mapCode, message: '語音代碼格式無法辨識。' });
    continue;
  }
  if (unknownEntry.code !== mapCode) {
    issues.push({ code: mapCode, message: 'key 與 entry.code 不一致：' + unknownEntry.code });
  }
  if (parsed.category !== unknownEntry.category) {
    issues.push({
      code: mapCode,
      message: '分類不一致：預期 ' + parsed.category + '，實際 ' + unknownEntry.category,
    });
    continue;
  }
  if (normalizedCodes.has(parsed.code)) {
    issues.push({ code: mapCode, message: '正規化代碼重複：' + parsed.code });
    continue;
  }
  normalizedCodes.add(parsed.code);

  const sourcePath = path.join(audioRoot, unknownEntry.relativePath);
  let fileSize = 0;
  try {
    const file = await stat(sourcePath);
    if (!file.isFile()) throw new Error('不是檔案');
    fileSize = file.size;
  } catch {
    issues.push({ code: mapCode, message: '找不到音檔：data/audio/' + unknownEntry.relativePath });
    continue;
  }

  const normalizedPath = unknownEntry.relativePath.replaceAll(path.sep, '/');
  entries.push({
    code: parsed.code,
    category: parsed.category,
    title: titleFor(unknownEntry),
    path: normalizedPath,
    sourcePath: 'data/audio/' + normalizedPath,
    bytes: fileSize,
  });
}

entries.sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));

const categoryCounts = Object.fromEntries(AUDIO_CATEGORIES.map(category => [
  category,
  entries.filter(entry => entry.category === category).length,
]));

const sourceDigest = createHash('sha256')
  .update(await readFile(sourceMapPath))
  .digest('hex');

const manifest = {
  version: 1,
  source: 'data/audio_map.json',
  sourceSha256: sourceDigest,
  ...(mediaBaseUrl ? { mediaBaseUrl } : {}),
  entryCount: entries.length,
  entries: Object.fromEntries(entries.map(entry => [entry.code, entry])),
};

const publicManifest = {
  version: manifest.version,
  sourceSha256: manifest.sourceSha256,
  ...(mediaBaseUrl ? { mediaBaseUrl } : {}),
  entryCount: entries.length,
  entries: Object.fromEntries(entries.map(entry => [entry.code, {
    code: entry.code,
    category: entry.category,
    title: entry.title,
    path: entry.path,
  }])),
};

const selectedTestEntries = Object.fromEntries(
  testCodes
    .map(code => entries.find(entry => entry.code === code))
    .filter((entry): entry is AudioManifestEntry => Boolean(entry))
    .map(entry => [entry.code, entry]),
);

const report = {
  valid: issues.length === 0,
  sourceCount: Object.keys(raw).length,
  manifestCount: entries.length,
  totalBytes: entries.reduce((total, entry) => total + entry.bytes, 0),
  categoryCounts,
  testCodes,
  missingTestCodes: testCodes.filter(code => !selectedTestEntries[code]),
  issues,
};

await Promise.all([
  writeFile(manifestPath, stableJson(manifest), 'utf8'),
  writeFile(publicManifestPath, stableJson(publicManifest), 'utf8'),
  writeFile(reportPath, stableJson(report), 'utf8'),
  writeFile(testManifestPath, stableJson({
    version: 1,
    purpose: '第一階段播放器本機驗證清單；音檔沿用 data/audio，不複製大型檔案。',
    entryCount: Object.keys(selectedTestEntries).length,
    entries: selectedTestEntries,
  }), 'utf8'),
]);

console.log('Audio manifest: ' + entries.length + ' entries, ' + issues.length + ' issues');
console.log('Validation report: ' + path.relative(root, reportPath));

if (issues.length > 0) process.exitCode = 1;
