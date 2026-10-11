import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const TARGET_JS_URL = 'http://124.223.63.219/static/js/app.c8193c85bc6723833e89.js';
const BASE_MEDIA_URL = 'http://124.223.63.219/static/media/';
const OUTPUT_DIR = path.resolve(process.cwd(), 'data/audio');
const MAP_FILE = path.resolve(process.cwd(), 'data/audio_map.json');
const CONCURRENCY = 8; // 同時下載 8 個檔案，穩定且不壓垮對方伺服器

async function fetchText(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch ${url}: ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
      resolve('SKIPPED');
      return;
    }

    const file = fs.createWriteStream(destPath);
    http.get(url, res => {
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve('DOWNLOADED');
      });
    }).on('error', err => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

async function main() {
  console.log('1. 正在分析目標網站音頻對照表 (Hunters 1492 / music=base)...');
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 讀取由 generate-clean-audio-map.mjs 依據 Hx70 (music=base) 精準產生的對照表
  if (!fs.existsSync(MAP_FILE)) {
    console.error(`找不到對照表 ${MAP_FILE}，請先執行 node scripts/generate-clean-audio-map.mjs`);
    process.exit(1);
  }

  const audioMap = JSON.parse(fs.readFileSync(MAP_FILE, 'utf-8'));
  const codes = Object.keys(audioMap);
  console.log(`2. 成功載入 Hunters 1492 專屬音頻代號共 ${codes.length} 個！`);
  console.log(`   (已自動排除所有非 1492 的無關代號如 HQ / BHQ，且 101 精準對應 101.a19ac3e.mp3)`);

  console.log(`3. 開始批次下載（並行數: ${CONCURRENCY}）...`);
  let completed = 0;
  let downloadedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  async function worker(queue) {
    while (queue.length > 0) {
      const code = queue.shift();
      const item = audioMap[code];
      const subfolder = item.subfolder || '';
      const targetDir = subfolder ? path.join(OUTPUT_DIR, subfolder) : OUTPUT_DIR;
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      const dest = path.join(targetDir, item.filename);

      try {
        const res = await downloadFile(item.url, dest);
        if (res === 'DOWNLOADED') downloadedCount++;
        else skippedCount++;
      } catch (err) {
        failedCount++;
        console.error(`[下載失敗] ${code}: ${err.message}`);
      }

      completed++;
      if (completed % 50 === 0 || completed === codes.length) {
        process.stdout.write(`\r進度: ${completed}/${codes.length} (新下載: ${downloadedCount}, 已存在: ${skippedCount}, 失敗: ${failedCount})`);
      }
    }
  }

  const queue = [...codes];
  const workers = Array.from({ length: CONCURRENCY }, () => worker(queue));
  await Promise.all(workers);

  console.log('\n\n✅ 下載任務全部完成！');
  console.log(`總數: ${codes.length}`);
  console.log(`本次下載: ${downloadedCount}`);
  console.log(`略過: ${skippedCount}`);
  console.log(`失敗: ${failedCount}`);
}

main().catch(err => {
  console.error('執行發生錯誤:', err);
  process.exit(1);
});
