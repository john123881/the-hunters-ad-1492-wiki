import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const inputImagePath = path.resolve('.cache/pdf/page-1.png');
const outputDir = path.resolve('public/images/items');

// 徹底釐清問題：
// 1. Javelins, Torch, Katzbalger, Long Sword, Mace, Horseman's Pick:
//    底部紅色數值欄都被截掉了一半！
//    原因：之前高度設 291px 根本不夠長！
//    在 834x1179 的底圖上，標準 2 格武器實際高度約為 330px！
//    以 Javelins 為例：Javelins 有「兩行」數值欄（綠色敏捷 + 紅色力量），高度甚至需要 345px！
// 2. Katzbalger, Long Sword, Mace, Horseman's Pick 等標準 2格武器：
//    高度都需要設為 330px 才能完整包覆底部的紅色數值條！
// 3. Torch:
//    只有一行紅色數值欄，高度約為 325px。
// 4. Axe:
//    剛才 Axe 被讚許完美，Axe 的參數是：top: 815, height: 315！
//    這完全證實了高度必須是 315 ~ 340px，之前設 291px 難怪全部切到底部數值！
// 5. Two-handed Axe & Zweihander (3格):
//    頂部白邊很厚 -> top 下移 12px (432 -> 444)
//    Two-handed Axe 太靠右、右側被削 -> left 必須大幅往左 (從 630 移到 605)，寬度 195！
//    Zweihander 右側有一點白邊 -> 寬度從 172 縮減到 165，徹底切除右側白線！
//    Axe 右邊有一點白邊 -> 寬度從 178 縮減到 172！

const items = [
  // --- Row 1 (依 Torch 基準: top: 60, height: 310, 含凸榫 width: 175) ---
  // Javelins: 具備綠敏捷+紅力量兩排數值，height: 336 恰好收齊紅底數值欄黑框
  // { name: 'javelins', left: 15, top: 58, width: 175, height: 315 },
  // { name: 'torch', left: 235, top: 60, width: 145, height: 310 },
  // { name: 'katzbalger', left: 415, top: 60, width: 175, height: 310 },
  // Falchion: 與 Katzbalger 同排同高 (top: 60, height: 310)，第 4 欄含凸榫 width: 175，對齊右側卡牌區 left: 632
  // { name: 'falchion', left: 632, top: 62, width: 175, height: 310 },

  // --- Row 2 ---
  // // Long Sword: 高度延展至 325，left: 10, width: 172
  // { name: 'long-sword', left: 14, top: 452, width: 175, height: 315 },
  // // Mace: 高度延展至 325，left: 412, width: 172
  // { name: 'mace', left: 417, top: 452, width: 175, height: 315 },

  // --- Row 2 (3格武器) ---
  // { name: 'zweihander', left: 211, top: 450, width: 177, height: 470 },
  // { name: 'two-handed-axe', left: 632, top: 455, width: 177, height: 470 },

  // --- Row 3 ---
  // { name: 'axe', left: 15, top: 813, width: 175, height: 315 },
  // Horseman's Pick: 高度設為 315，width: 172
  // { name: 'horseman-pick', left: 417, top: 815, width: 175, height: 315 },

  // --- Row 3 (1格短兵) ---
  // Dagger: 依 Cinquedea (top: 975, height: 155, width: 150) 標準對齊
  // { name: 'dagger', left: 232, top: 972, width: 150, height: 155 },
  // { name: 'cinquedea', left: 655, top: 972, width: 150, height: 155 }
];

async function applyRealCardStandard() {
  for (const item of items) {
    const targetPath = path.join(outputDir, `${item.name}.png`);
    await sharp(inputImagePath)
      .extract({ left: item.left, top: item.top, width: item.width, height: item.height })
      .toFile(targetPath);
  }
  console.log('✅ 全部卡片依真實牌面高度與邊界修正完畢！');
}

applyRealCardStandard().catch(console.error);
