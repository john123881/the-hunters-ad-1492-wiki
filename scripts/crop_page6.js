import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const inputImagePath = path.resolve('.cache/pdf/page-6.png');
const outputDir = path.resolve('public/images/items');

// 已確認合格並鎖定
// { name: 'plate-armor', 
//   left: 31, top: 52, 
//   width: 175, height: 342 },
// { name: 'breastplate', 
//   left: 255, top: 52, 
//   width: 173, height: 342 },
// { name: 'brigandine', 
//   left: 475, top: 52, 
//   width: 173, height: 342 },
// { name: 'chain-mail', 
//   left: 695, top: 53, 
//   width: 173, height: 342 }

// 已確認合格並鎖定
// { name: 'gambeson', 
//   left: 30, top: 454, 
//   width: 175, height: 343 },
// { name: 'cervelliere', 
//   left: 255, top: 443, 
//   width: 173, height: 172 },
// { name: 'kettle-hat', 
//   left: 477, top: 443, 
//   width: 173, height: 173 },
// { name: 'armet', 
//   left: 693, top: 443, 
//   width: 173, height: 173 },
// { name: 'aurillac-beret', 
//   left: 400, top: 651, 
//   width: 173, height: 173 },
// { name: 'headscarf-of-anglesey', 
//   left: 646, top: 651, 
//   width: 173, height: 173 }

// Page 6 下方：4 款盾牌（均為 3 行呈現）
const currentItems = [
  { name: 'buckler', 
    left: 32, top: 915, 
    width: 173, height: 173 },
  { name: 'wooden-shield', 
    left: 255, top: 872, 
    width: 173, height: 342 },
  { name: 'steel-shield', 
    left: 475, top: 872, 
    width: 173, height: 342 },
  { name: 'pavise', 
    left: 695, top: 872, 
    width: 173, height: 344 }
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
