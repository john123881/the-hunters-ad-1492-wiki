import fs from 'fs';

const text = fs.readFileSync('/tmp/target_app.js', 'utf-8');

// 1. 取得 Hx70 的物件定義
const hx70Pos = text.indexOf('Hx70:');
const chunk = text.substring(hx70Pos, hx70Pos + 35000);
const match = chunk.match(/var\s+e\s*=\s*(\{[^}]+\})/);

if (!match) {
  console.error('找不到 Hx70 對照表物件！');
  process.exit(1);
}

const hx70Map = JSON.parse(
  match[1]
    .replace(/(['"])?([a-zA-Z0-9_.\/+-]+)(['"])?:/g, '"$2":')
    .replace(/'/g, '"')
);

// 2. 模組對照
const moduleMap = {};
const modRegex = /"?([A-Za-z0-9+/=]{4})"?:function\(t,i,p\)\{t\.exports=p\.p\+"(static\/media\/[^"]+)"\}/g;
let m;
while ((m = modRegex.exec(text)) !== null) {
  moduleMap[m[1]] = m[2];
}

const BASE_MEDIA_URL = 'http://124.223.63.219/';
const rawKeys = Object.keys(hx70Map).map(k => k.replace(/^\.\//, '').replace(/\.mp3$/, ''));

// 分類規則定義（對應到 data/audio/ 底下的子資料夾名稱）
function classifyCode(code) {
  // VW 擴充任務勝利（優先於 V）
  if (/^VW\d+[A-Za-z0-9]*$/i.test(code)) return { category: 'w_quest_win', categoryName: 'VW擴充任務勝利', folder: 'w_quest_win' };
  // LW 擴充任務失敗（優先於 L）
  if (/^LW\d+[A-Za-z0-9]*$/i.test(code)) return { category: 'w_quest_loss', categoryName: 'LW擴充任務失敗', folder: 'w_quest_loss' };
  // W 擴充任務
  if (/^W\d+[A-Za-z0-9]*$/i.test(code)) return { category: 'w_quest', categoryName: 'W擴充任務', folder: 'w_quest' };
  
  // 任務卡 Q
  if (/^Q\d+[A-Za-z0-9]*$/i.test(code)) return { category: 'quest', categoryName: '任務', folder: 'quest' };
  // 任務勝利 V（包含 V1 ~ V49 及 V27A, V32A1 等分支卡）
  if (/^V\d+[A-Za-z0-9]*$/i.test(code)) return { category: 'quest_win', categoryName: '任務勝利', folder: 'quest_win' };
  // 任務失敗 L（包含 L1 ~ L49 及 L27A, L41A 等分支卡）
  if (/^L\d+[A-Za-z0-9]*$/i.test(code)) return { category: 'quest_loss', categoryName: '任務失敗', folder: 'quest_loss' };
  // 角色卡 F（包含 F001 ~ F016, F101）
  if (/^F\d+[A-Za-z0-9]*$/i.test(code)) return { category: 'character', categoryName: '角色卡', folder: 'character' };
  // 劇情卡（純數字及後綴字母，如 101, 102, 1101, 009A）
  if (/^\d+[A-Za-z]?$/.test(code)) return { category: 'story', categoryName: '劇情卡', folder: 'story' };

  return null;
}

const audioMap = {};
const categoryStats = {};
const ignoredKeys = [];

for (const code of rawKeys) {
  const categoryInfo = classifyCode(code);
  if (!categoryInfo) {
    ignoredKeys.push(code);
    continue;
  }

  const modId = hx70Map[`./${code}.mp3`];
  const mediaRelPath = moduleMap[modId];
  if (!mediaRelPath) {
    console.warn(`[跳過] 模組遺失: ${code} (${modId})`);
    continue;
  }

  const filename = mediaRelPath.replace(/^static\/media\//, '');
  audioMap[code] = {
    code,
    category: categoryInfo.category,
    categoryName: categoryInfo.categoryName,
    subfolder: categoryInfo.folder,
    relativePath: `${categoryInfo.folder}/${filename}`,
    filename,
    url: `${BASE_MEDIA_URL}${mediaRelPath}`,
  };

  categoryStats[categoryInfo.categoryName] = (categoryStats[categoryInfo.categoryName] || 0) + 1;
}

console.log('=== 分類統計結果 ===');
for (const [catName, count] of Object.entries(categoryStats)) {
  console.log(`- ${catName}: ${count} 首`);
}
console.log(`- 總計收錄: ${Object.keys(audioMap).length} 首`);
console.log(`- 排除之非規則代號 (${ignoredKeys.length} 筆):`, ignoredKeys);

fs.writeFileSync('data/audio_map.json', JSON.stringify(audioMap, null, 2), 'utf-8');
console.log('data/audio_map.json 已精準更新！');
