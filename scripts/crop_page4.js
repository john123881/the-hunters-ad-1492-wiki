import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const inputImagePath = path.resolve('.cache/pdf/page-4.png');
const outputDir = path.resolve('public/images/items');

// 已確認合格並鎖定
// { name: 'long-bow', left: 339, top: 85, width: 190, height: 500 },
// { name: 'stun-arrows', left: 31, top: 698, width: 170, height: 170 },
// { name: 'slowing-arrows', left: 257, top: 698, width: 170, height: 170 },
// { name: 'bodkin-arrows', left: 481, top: 699, width: 170, height: 170 },
// { name: 'reinforced-limb', left: 695, top: 700, width: 170, height: 170 },

// Page 4 第三排：4 款弓用塗油（一次全部裁切與去背）
const row3Items = [
  { name: 'humanoid-grease-bow', left: 33, top: 975, width: 170, height: 170 },
  { name: 'monster-grease-bow', left: 260, top: 975, width: 170, height: 170 },
  { name: 'demonic-grease-bow', left: 481, top: 975, width: 170, height: 170 },
  { name: 'shapeshifter-grease-bow', left: 696, top: 975, width: 170, height: 170 }
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
  for (const item of row3Items) {
    const targetPath = path.join(outputDir, `${item.name}.png`);
    await sharp(inputImagePath)
      .extract({ left: item.left, top: item.top, width: item.width, height: item.height })
      .toFile(targetPath);
    await makeTransparent(targetPath);
    console.log(`✅ 成功裁切並去背: ${item.name}`);
  }
}

run().catch(console.error);
