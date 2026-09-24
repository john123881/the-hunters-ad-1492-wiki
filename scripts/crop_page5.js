import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const inputImagePath = path.resolve('.cache/pdf/page-5.png');
const outputDir = path.resolve('public/images/items');

// 已確認合格並鎖定
// { name: 'petronel', 
//   left: 18, top: 59, 
//   width: 193, height: 170 },
// { name: 'wheellock-pistol', 
//   left: 17, top: 291, 
//   width: 192, height: 170 },
// { name: 'arquebus', 
//   left: 239, top: 61, 
//   width: 195, height: 340 },
// { name: 'blunderbuss', 
//   left: 463, top: 61, 
//   width: 195, height: 340 },
// { name: 'musket', 
//   left: 679, top: 62, 
//   width: 195, height: 507 },

// Page 5 剩餘 5 款槍械強化配件（均為 3 行呈現，一次全部裁切與去背）
const currentItems = [
  { name: 'elongated-barrel', 
    left: 32, top: 666, 
    width: 170, height: 170 },
  { name: 'lead-balls', 
    left: 263, top: 667, 
    width: 170, height: 170 },
  { name: 'silver-balls', 
    left: 488, top: 668, 
    width: 170, height: 170 },
  { name: 'improved-gunpowder', 
    left: 701, top: 670, 
    width: 170, height: 170 },
  { name: 'modern-lock', 
    left: 380, top: 918, 
    width: 171, height: 170 }
];





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
  for (const item of currentItems) {
    const targetPath = path.join(outputDir, `${item.name}.png`);
    await sharp(inputImagePath)
      .extract({ left: item.left, top: item.top, width: item.width, height: item.height })
      .toFile(targetPath);
    await makeTransparent(targetPath);
    console.log(`✅ 成功裁切並去背: ${item.name}`);
  }
}

run().catch(console.error);
