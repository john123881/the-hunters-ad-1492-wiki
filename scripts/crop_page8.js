import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const inputImagePath = path.resolve('.cache/pdf/page-8.png');
const outputDir = path.resolve('public/images/items');

// 已確認合格並鎖定
// { name: 'medicine', 
//   left: 34, top: 68, 
//   width: 173, height: 173 },
// { name: 'antidote', 
//   left: 251, top: 68, 
//   width: 173, height: 173 },
// { name: 'healing-infusion', 
//   left: 471, top: 68, 
//   width: 173, height: 173 },
// { name: 'refreshing-infusion', 
//   left: 689, top: 68, 
//   width: 173, height: 173 }

// 已確認合格並鎖定
// { name: 'accuracy-infusion', 
//   left: 35, top: 307, 
//   width: 173, height: 173 },
// { name: 'kicker-infusion', 
//   left: 253, top: 307, 
//   width: 173, height: 173 },
// { name: 'protection-infusion', 
//   left: 476, top: 307, 
//   width: 173, height: 173 },
// { name: 'courage-infusion', 
//   left: 691, top: 309, 
//   width: 173, height: 173 }

// 已確認合格並鎖定
// { name: 'frag-bomb', 
//   left: 140, top: 594, 
//   width: 173, height: 173 },
// { name: 'incendiary-bomb', 
//   left: 360, top: 595, 
//   width: 173, height: 173 },
// { name: 'snare', 
//   left: 585, top: 595, 
//   width: 173, height: 173 }

// Page 8 第四排：3 款投擲手榴彈（全書最後 3 張，均為 3 行呈現）
const currentItems = [
  { name: 'acid-grenade', 
    left: 141, top: 883, 
    width: 173, height: 173 },
  { name: 'frag-grenade', 
    left: 359, top: 883, 
    width: 173, height: 173 },
  { name: 'stun-grenade', 
    left: 584, top: 885, 
    width: 173, height: 173 }
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

    const neighbors = [
      curr - 1, curr + 1, curr - width, curr + width
    ];

    for (const n of neighbors) {
      if (n >= 0 && n < width * height && !visited[n]) {
        const nx = n % width;
        const ny = Math.floor(n / width);
        if (Math.abs(nx - x) <= 1 && Math.abs(ny - y) <= 1) {
          if (isBackground(n * 4)) {
            visited[n] = 1;
            queue.push(n);
          }
        }
      }
    }
  }

  for (let i = 0; i < width * height; i++) {
    if (visited[i]) {
      data[i * 4 + 3] = 0;
    }
  }

  await sharp(data, { raw: { width, height, channels: 4 } }).png().toFile(filePath);
}

async function run() {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const item of currentItems) {
    const dest = path.join(outputDir, `${item.name}.png`);
    await sharp(inputImagePath)
      .extract({ left: item.left, top: item.top, width: item.width, height: item.height })
      .png()
      .toFile(dest);

    await makeTransparent(dest);
    console.log(`✅ 成功裁切並去背: ${item.name}`);
  }
}

run().catch(console.error);
