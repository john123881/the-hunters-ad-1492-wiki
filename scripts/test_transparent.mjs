import sharp from 'sharp';
import path from 'path';

async function testTransparent() {
  const inputPath = path.resolve('public/images/items/zweihander.png');
  const outputPath = path.resolve('public/images/items/zweihander-transparent.png');

  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const channels = info.channels; // 4 (RGBA)

  // 使用 BFS (廣度優先搜尋 / Flood fill) 從四個邊界的白色像素向內侵蝕，
  // 這樣絕不會誤傷卡牌內部的白色亮點（如刀刃反光）！
  const isBackground = (idx) => {
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    // PDF 底色通常是白、近白或淺灰（RGB > 230）
    return r > 230 && g > 230 && b > 230;
  };

  const visited = new Uint8Array(width * height);
  const queue = [];

  // 將四條邊界的白色點加入佇列
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

  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    const x = curr % width;
    const y = Math.floor(curr / width);

    // 將此像素設為完全透明
    const pixelIdx = curr * 4;
    data[pixelIdx + 3] = 0; // Alpha = 0

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

  await sharp(data, {
    raw: {
      width,
      height,
      channels: 4
    }
  })
  .png()
  .toFile(outputPath);

  console.log('✅ zweihander-transparent.png 製作完成！');
}

testTransparent().catch(console.error);
