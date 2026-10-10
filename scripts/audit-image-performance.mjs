import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const imageRoot = path.join(root, 'public', 'images');
const scanRoots = ['src', 'server', 'shared', 'data', 'seeds', 'migrations'];
const reportPath = path.join(root, 'docs', 'image-performance-baseline.md');
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg']);
const textExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.sql', '.md']);
const largeAssetBytes = 500 * 1024;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

const sourceFiles = [];
for (const directory of scanRoots) {
  const absolute = path.join(root, directory);
  try {
    sourceFiles.push(...(await walk(absolute)).filter(file => textExtensions.has(path.extname(file).toLowerCase())));
  } catch {
    // Optional source directories may not exist in every checkout.
  }
}

const referencedPaths = new Set();
const imagePattern = /\/images\/[A-Za-z0-9_./@+-]+\.(?:png|jpe?g|webp|gif|avif|svg)/gi;
for (const file of sourceFiles) {
  const contents = await readFile(file, 'utf8');
  for (const match of contents.matchAll(imagePattern)) referencedPaths.add(match[0]);
}

const imageFiles = (await walk(imageRoot)).filter(file => imageExtensions.has(path.extname(file).toLowerCase()));
const assets = [];
for (const file of imageFiles) {
  const fileStat = await stat(file);
  const publicPath = '/' + path.relative(path.join(root, 'public'), file).split(path.sep).join('/');
  let width = null;
  let height = null;
  try {
    const metadata = await sharp(file).metadata();
    width = metadata.width ?? null;
    height = metadata.height ?? null;
  } catch {
    // SVG or unsupported files still contribute to byte totals.
  }
  assets.push({
    path: publicPath,
    bytes: fileStat.size,
    format: path.extname(file).slice(1).toLowerCase(),
    width,
    height,
    directlyReferenced: referencedPaths.has(publicPath),
  });
}

assets.sort((a, b) => b.bytes - a.bytes);
const totalBytes = assets.reduce((sum, asset) => sum + asset.bytes, 0);
const referenced = assets.filter(asset => asset.directlyReferenced);
const referencedBytes = referenced.reduce((sum, asset) => sum + asset.bytes, 0);
const largeAssets = assets.filter(asset => asset.bytes >= largeAssetBytes);
const formatTotals = new Map();
for (const asset of assets) {
  const current = formatTotals.get(asset.format) ?? { count: 0, bytes: 0 };
  current.count += 1;
  current.bytes += asset.bytes;
  formatTotals.set(asset.format, current);
}

const generatedAt = new Date().toISOString();
const largestRows = assets.slice(0, 30).map(asset =>
  `| \`${asset.path}\` | ${formatBytes(asset.bytes)} | ${asset.width && asset.height ? `${asset.width}×${asset.height}` : '—'} | ${asset.directlyReferenced ? '是' : '否／可能由動態路徑載入'} |`
).join('\n');
const formatRows = [...formatTotals.entries()]
  .sort((a, b) => b[1].bytes - a[1].bytes)
  .map(([format, value]) => `| ${format.toUpperCase()} | ${value.count} | ${formatBytes(value.bytes)} |`)
  .join('\n');

const report = `# 圖片效能基準

產生時間：${generatedAt}

執行方式：

\`\`\`bash
npm run images:audit
\`\`\`

## 整體基準

- \`public/images\` 圖片數：**${assets.length}**
- 靜態圖片總容量：**${formatBytes(totalBytes)}**
- 程式、資料與 seed 中可直接辨識的引用：**${referenced.length} 張／${formatBytes(referencedBytes)}**
- 單檔超過 500 KB：**${largeAssets.length} 張**
- 裝備面板基本載入組：**約 315 KB**（底板與兩張蓋板）
- 目標：首屏必要圖片控制在 1 MB 內；單張介面圖片原則上低於 500 KB。

「直接引用」只辨識完整字串路徑。地圖卡、角色卡及資料庫組合出的動態路徑可能顯示為未直接引用，移除資產前仍須檢查實際 API 資料與瀏覽器請求。

## 格式分布

| 格式 | 數量 | 容量 |
| --- | ---: | ---: |
${formatRows}

## 最大的 30 張圖片

| 路徑 | 容量 | 尺寸 | 可直接辨識引用 |
| --- | ---: | ---: | --- |
${largestRows}

## 驗收方式

每一批圖片優化後重新執行本指令，比較圖片總容量、超過 500 KB 的數量，以及該頁首屏必要圖片合計。圖片轉檔後仍需進行桌面與手機視覺驗收，確認文字、槽位、透明邊緣與卡片細節沒有失真。
`;

await writeFile(reportPath, report);
console.log(`Audited ${assets.length} images (${formatBytes(totalBytes)} total).`);
console.log(`Direct references: ${referenced.length} images (${formatBytes(referencedBytes)}).`);
console.log(`Assets over 500 KB: ${largeAssets.length}.`);
console.log(`Wrote ${path.relative(root, reportPath)}.`);
