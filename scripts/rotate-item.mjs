import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const inputArg = process.argv[2] || 'public/images/items/zweihander.png';
const angleArg = parseFloat(process.argv[3] || '0.6');

async function main() {
  const filePath = path.resolve(process.cwd(), inputArg);
  const relPath = path.relative(process.cwd(), filePath);

  console.log(`=== 正在處理: ${relPath} ===`);

  // 1. 永遠從 git HEAD 讀取無失真的原始圖片，避免多次旋轉累加失真
  let sourceBuffer;
  try {
    sourceBuffer = execSync(`git show HEAD:${relPath}`, { maxBuffer: 10 * 1024 * 1024 });
    console.log(`成功載入 Git 原始母檔 (避免反覆插值累加失真)`);
  } catch {
    console.log(`無法從 Git 讀取，直接讀取現有檔案`);
    sourceBuffer = fs.readFileSync(filePath);
  }

  console.log(`以最高品質旋轉 ${angleArg}° 並保護文字銳利度...`);

  // 2. 旋轉時使用 bicubic 高階插值，並適度銳化以保持文字清晰
  const pipeline = sharp(sourceBuffer)
    .rotate(angleArg, {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      interpolator: sharp.interpolators.bicubic,
    })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .sharpen({ sigma: 0.8, m1: 0.5, m2: 1.5 }); // 微銳化邊緣，消除旋轉帶來的模糊感

  const pngBuf = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(filePath, pngBuf);
  console.log(`已寫入高品質 PNG: ${relPath}`);

  // 3. WebP 使用高品質 (96) 與 nearLossless 設定，防止小字產生有損噪點
  const webpPath = filePath.replace(/\.png$/i, '.webp');
  await sharp(pngBuf)
    .webp({
      quality: 96,
      alphaQuality: 100,
      nearLossless: true,
      effort: 6,
    })
    .toFile(webpPath);

  console.log(`已產出銳利 WebP: ${path.relative(process.cwd(), webpPath)}`);
  console.log(`=== 完成 ===\n`);
}

main().catch(err => {
  console.error('執行失敗:', err);
  process.exit(1);
});
