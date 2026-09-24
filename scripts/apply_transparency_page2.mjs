import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const inputImagePath = path.resolve('.cache/pdf/page-3.png');
const outputDir = path.resolve('public/images/items');

// 已確認合格並鎖定
// { name: 'ignis', left: 40, top: 89, width: 160, height: 160 },
// { name: 'ira', left: 247, top: 89, width: 160, height: 160 },
// { name: 'vita', left: 454, top: 89, width: 160, height: 160 },
// { name: 'sagacitate', left: 654, top: 89, width: 160, height: 160 },
// { name: 'agilitas', left: 39, top: 319, width: 160, height: 160 },
// { name: 'formido', left: 247, top: 319, width: 160, height: 160 },
// { name: 'sling', left: 38, top: 591, width: 160, height: 160 },

// 目前審查目標：Hunting Crossbow (獵弩，2格，左側含雙鋸齒槍弩接口)
const currentItem = { name: 'hunting-crossbow', left: 18, top: 765, width: 190, height: 330 };











async function makeTransparent(filePath) {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  const isBackground = idx => data[idx] > 230 && data[idx + 1] > 230 && data[idx + 2] > 230;
  const visited = new Uint8Array(width * height);
  const queue = [];

  for (let x = 0; x < width; x++) {
    if (isBackground(x * 4)) { queue.push(x); visited[x] = 1; }
    const b = ((height - 1) * width + x) * 4;
    if (isBackground(b)) { queue.push((height - 1) * width + x); visited[(height - 1) * width + x] = 1; }
  }
  for (let y = 0; y < height; y++) {
    const l = (y * width) * 4;
    if (isBackground(l) && !visited[y * width]) { queue.push(y * width); visited[y * width] = 1; }
    const r = (y * width + (width - 1)) * 4;
    if (isBackground(r) && !visited[y * width + (width - 1)]) { queue.push(y * width + (width - 1)); visited[y * width + (width - 1)] = 1; }
  }

  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    const x = curr % width;
    const y = Math.floor(curr / width);
    data[curr * 4 + 3] = 0;

    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nPos = ny * width + nx;
        if (!visited[nPos] && isBackground(nPos * 4)) {
          visited[nPos] = 1;
          queue.push(nPos);
        }
      }
    }
  }

  const tempPath = filePath.replace('.png', '.tmp.png');
  await sharp(data, { raw: { width, height, channels: 4 } }).png().toFile(tempPath);
  fs.renameSync(tempPath, filePath);
}

async function run() {
  const targetPath = path.join(outputDir, `${currentItem.name}.png`);
  await sharp(inputImagePath)
    .extract({ left: currentItem.left, top: currentItem.top, width: currentItem.width, height: currentItem.height })
    .toFile(targetPath);
  await makeTransparent(targetPath);
  console.log(`✅ 成功裁切並去背: ${currentItem.name}`);
}

run().catch(console.error);
