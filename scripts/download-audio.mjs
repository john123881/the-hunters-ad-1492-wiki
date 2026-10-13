import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const TARGET_JS_URL = 'http://124.223.63.219/static/js/app.c8193c85bc6723833e89.js';
const BASE_MEDIA_URL = 'http://124.223.63.219/static/media/';
const OUTPUT_DIR = path.resolve(process.cwd(), 'data/audio');
const MAP_FILE = path.resolve(process.cwd(), 'data/audio_map.json');
const CONCURRENCY = 3; // 降低連線併發，避免對方伺服器 socket hang up 或 ETIMEDOUT
const MAX_RETRIES = 5;

function downloadFileOnce(url, destPath) {
  return new Promise((resolve, reject) => {
    const tempPath = `${destPath}.part`;
    let startBytes = 0;
    if (fs.existsSync(tempPath)) {
      startBytes = fs.statSync(tempPath).size;
    }

    const headers = {};
    if (startBytes > 0) {
      headers['Range'] = `bytes=${startBytes}-`;
    }

    const req = http.get(url, { headers, timeout: 15000 }, res => {
      // 處理 416 Range Not Satisfiable 或不支援 Range 的情況
      if (res.statusCode === 416) {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        reject(new Error('Range not satisfiable, restart needed'));
        return;
      }

      if (res.statusCode !== 200 && res.statusCode !== 206) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }

      let totalExpected = 0;
      if (res.statusCode === 206) {
        // Content-Range: bytes 100-999/1000
        const contentRange = res.headers['content-range'];
        if (contentRange) {
          const match = contentRange.match(/\/(\d+)$/);
          if (match) totalExpected = parseInt(match[1], 10);
        }
      } else {
        // 伺服器重新發送完整檔案
        startBytes = 0;
        totalExpected = parseInt(res.headers['content-length'] || '0', 10);
      }

      // 如果已存在且完整
      if (fs.existsSync(destPath) && totalExpected > 0) {
        if (fs.statSync(destPath).size === totalExpected) {
          res.resume();
          resolve('SKIPPED');
          return;
        }
      }

      const file = fs.createWriteStream(tempPath, { flags: startBytes > 0 ? 'a' : 'w' });
      let receivedBytes = 0;

      res.on('data', chunk => {
        receivedBytes += chunk.length;
      });

      res.pipe(file);

      file.on('finish', () => {
        file.close(() => {
          const currentTotal = startBytes + receivedBytes;
          if (totalExpected > 0 && currentTotal < totalExpected) {
            reject(new Error(`未下載完整 (目前 ${currentTotal}/${totalExpected} bytes)`));
            return;
          }
          fs.renameSync(tempPath, destPath);
          resolve('DOWNLOADED');
        });
      });

      file.on('error', err => {
        file.close();
        reject(err);
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('連線逾時 (Timeout 15s)'));
    });

    req.on('error', err => {
      reject(err);
    });
  });
}

async function downloadFileWithRetry(url, destPath) {
  // 若本地已存在完整檔案，先檢查大小
  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 1000) {
    return 'SKIPPED';
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await downloadFileOnce(url, destPath);
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        throw err;
      }
      // 指數退避延遲 1s, 2s, 3s...
      await new Promise(r => setTimeout(r, attempt * 1200));
    }
  }
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
        const res = await downloadFileWithRetry(item.url, dest);
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
