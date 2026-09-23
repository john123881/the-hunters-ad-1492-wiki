import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const inputImagePath = path.resolve('.cache/pdf/page-2.png');
const outputDir = path.resolve('public/images/items');

// Page 2 底圖尺寸與 Page 1 完全一致：834 x 1179 px
// 包含 13 件物品：
// 1. Melee Weapons (3格長柄武器 x 4)：
//    - spear: 第 1 欄 (left: 15 附近)
//    - halberd: 第 2 欄 (left: 220 附近)
//    - flail: 第 3 欄 (left: 440 附近，無左凸榫，直接矩形)
//    - lucerne-hammer: 第 4 欄 (left: 630 附近)
// 2. Net (2格網子 x 1)：
//    - net: 第 1 欄中段
// 3. Additions: Improvements (1格強化卡 x 4)：
//    - diamond-sharpening, silver-blade, leather-handle, hardened-blade
// 4. Additions: Grease (1格毒油/油膏 x 4)：
//    - humanoid-grease, monster-grease, demonic-grease, shapeshifter-grease

const items = [
  // --- 頂部 3 格長柄武器 (依 Page 1 的 Zweihänder / Two-handed Axe 高度標準 top ~48, height ~470 估計) ---
  // 先以 Spear 為首張基準進行測試
  { name: 'spear', left: 13, top: 43, width: 180, height: 470 },
  // { name: 'halberd', left: 225, top: 48, width: 177, height: 470 },
  // { name: 'flail', left: 450, top: 48, width: 160, height: 470 },
  // { name: 'lucerne-hammer', left: 632, top: 48, width: 177, height: 470 },

  // --- 中段 Net (2格) ---
  // { name: 'net', left: 35, top: 575, width: 160, height: 315 },

  // --- Improvements (1格強化，含右凹槽，寬約 150，高約 155) ---
  // { name: 'diamond-sharpening', left: 550, top: 590, width: 155, height: 155 },
  // { name: 'silver-blade', left: 745, top: 590, width: 155, height: 155 },
  // { name: 'leather-handle', left: 550, top: 780, width: 155, height: 155 },
  // { name: 'hardened-blade', left: 745, top: 780, width: 155, height: 155 },

  // --- Grease (1格油膏，底排 4 張) ---
  // { name: 'humanoid-grease', left: 40, top: 970, width: 160, height: 155 },
  // { name: 'monster-grease', left: 250, top: 970, width: 160, height: 155 },
  // { name: 'demonic-grease', left: 460, top: 970, width: 160, height: 155 },
  // { name: 'shapeshifter-grease', left: 670, top: 970, width: 160, height: 155 },
];

async function cropPage2() {
  for (const item of items) {
    const targetPath = path.join(outputDir, `${item.name}.png`);
    await sharp(inputImagePath)
      .extract({ left: item.left, top: item.top, width: item.width, height: item.height })
      .toFile(targetPath);
    console.log(`[裁切完成] ${item.name}.png`);
  }
}

cropPage2().catch(console.error);
