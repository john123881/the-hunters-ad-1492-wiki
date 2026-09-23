import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const items = [
  'axe',
  'cinquedea',
  'dagger',
  'falchion',
  'horseman-pick',
  'javelins',
  'katzbalger',
  'long-sword',
  'mace',
  'torch',
  'two-handed-axe',
  'zweihander'
];

async function makeTransparent(itemName) {
  const filePath = path.resolve(`public/images/items/${itemName}.png`);
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    return;
  }

  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;

  // 白色底色判斷：PDF 頁面白底或微灰 (RGB > 230)
  const isBackground = (idx) => {
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    return r > 230 && g > 230 && b > 230;
  };

  const visited = new Uint8Array(width * height);
  const queue = [];

  // 1. 上下邊界
  for (let x = 0; x < width; x++) {
    const topIdx = (0 * width + x) * 4;
    const bottomIdx = ((height - 1) * width + x) * 4;
    if (isBackground(topIdx)) {
      queue.push(0 * width + x);
      visited[0 * width + x] = 1;
    }
    if (isBackground(bottomIdx)) {
      queue.push((height - 1) * width + x);
      visited[(height - 1) * width + x] = 1;
    }
  }

  // 2. 左右邊界
  for (let y = 0; y < height; y++) {
    const leftIdx = (y * width + 0) * 4;
    const rightIdx = (y * width + (width - 1)) * 4;
    if (isBackground(leftIdx) && !visited[y * width + 0]) {
      queue.push(y * width + 0);
      visited[y * width + 0] = 1;
    }
    if (isBackground(rightIdx) && !visited[y * width + (width - 1)]) {
      queue.push(y * width + (width - 1));
      visited[y * width + (width - 1)] = 1;
    }
  }

  // 3. 廣度優先搜尋 (Flood Fill)
  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    const x = curr % width;
    const y = Math.floor(curr / width);

    // 將背景設為透明
    const pixelIdx = curr * 4;
    data[pixelIdx + 3] = 0;

    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1]
    ];

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nPos = ny * width + nx;
        if (!visited[nPos]) {
          const nIdx = nPos * 4;
          if (isBackground(nIdx)) {
            visited[nPos] = 1;
            queue.push(nPos);
          }
        }
      }
    }
  }

  // 覆寫回原檔案
  const tempPath = path.resolve(`public/images/items/${itemName}.tmp.png`);
  await sharp(data, {
    raw: {
      width,
      height,
      channels: 4
    }
  })
  .png()
  .toFile(tempPath);

  fs.renameSync(tempPath, filePath);
  console.log(`✅ [透明化完成] ${itemName}.png`);
}

async function run() {
  for (const item of items) {
    await makeTransparent(item);
  }
  console.log('🎉 Page 1 全部 12 件卡片透明去背已全部完成！');
}

run().catch(console.error);
