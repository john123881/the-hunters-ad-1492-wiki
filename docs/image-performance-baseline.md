# 圖片效能基準

產生時間：2026-10-10T01:16:48.010Z

執行方式：

```bash
npm run images:audit
```

## 整體基準

- `public/images` 圖片數：**376**
- 靜態圖片總容量：**19.22 MB**
- 程式、資料與 seed 中可直接辨識的引用：**108 張／11.15 MB**
- 單檔超過 500 KB：**0 張**
- 裝備面板基本載入組：**約 315 KB**（底板與兩張蓋板）
- 目標：首屏必要圖片控制在 1 MB 內；單張介面圖片原則上低於 500 KB。

「直接引用」只辨識完整字串路徑。地圖卡、角色卡及資料庫組合出的動態路徑可能顯示為未直接引用，移除資產前仍須檢查實際 API 資料與瀏覽器請求。

## 格式分布

| 格式 | 數量 | 容量 |
| --- | ---: | ---: |
| PNG | 168 | 11.05 MB |
| WEBP | 180 | 8.12 MB |
| SVG | 28 | 49 KB |

## 最大的 30 張圖片

| 路徑 | 容量 | 尺寸 | 可直接辨識引用 |
| --- | ---: | ---: | --- |
| `/images/campaign/wagon-board-concept-v3.webp` | 329 KB | 1536×1024 | 是 |
| `/images/campaign/characters/huntress-board-v2.webp` | 316 KB | 900×1200 | 否／可能由動態路徑載入 |
| `/images/campaign/characters/landsknecht-board-v2.webp` | 311 KB | 900×1200 | 否／可能由動態路徑載入 |
| `/images/campaign/characters/man-at-arms-board-v2.webp` | 300 KB | 900×1200 | 否／可能由動態路徑載入 |
| `/images/campaign/characters/crossbowman-board-v2.webp` | 290 KB | 900×1200 | 否／可能由動態路徑載入 |
| `/images/campaign/characters/cutthroat-board-v2.webp` | 283 KB | 900×1200 | 否／可能由動態路徑載入 |
| `/images/campaign/characters/brawler-board-v2.webp` | 280 KB | 900×1200 | 否／可能由動態路徑載入 |
| `/images/campaign/characters/sorceress-board-v2.webp` | 259 KB | 900×1200 | 否／可能由動態路徑載入 |
| `/images/items/musket.png` | 256 KB | 195×507 | 是 |
| `/images/campaign/characters/medic-board-v2.webp` | 245 KB | 900×1200 | 否／可能由動態路徑載入 |
| `/images/items/long-bow.png` | 240 KB | 190×500 | 是 |
| `/images/campaign/characters/witch-board-v2.webp` | 234 KB | 900×1200 | 否／可能由動態路徑載入 |
| `/images/items/halberd.png` | 218 KB | 180×470 | 是 |
| `/images/items/lucerne-hammer.png` | 216 KB | 179×470 | 是 |
| `/images/items/two-handed-axe.png` | 216 KB | 177×470 | 是 |
| `/images/items/arbalest.png` | 214 KB | 180×470 | 是 |
| `/images/items/zweihander.png` | 212 KB | 177×470 | 是 |
| `/images/campaign/characters/equipment-board-gridless-v5.webp` | 211 KB | 1200×960 | 是 |
| `/images/items/spear.png` | 210 KB | 180×470 | 是 |
| `/images/items/flail.png` | 204 KB | 159×470 | 是 |
| `/images/items/staff-of-domination.png` | 184 KB | 195×345 | 是 |
| `/images/items/blunderbuss.png` | 175 KB | 195×340 | 是 |
| `/images/items/arquebus.png` | 173 KB | 195×340 | 是 |
| `/images/items/steel-shield.png` | 171 KB | 173×342 | 是 |
| `/images/items/plate-armor.png` | 171 KB | 175×342 | 是 |
| `/images/items/staff-of-doubt.png` | 169 KB | 173×344 | 是 |
| `/images/items/pavise.png` | 169 KB | 173×344 | 是 |
| `/images/items/magic-staff.png` | 168 KB | 173×344 | 是 |
| `/images/items/breastplate.png` | 165 KB | 173×342 | 是 |
| `/images/items/gambeson.png` | 165 KB | 175×343 | 是 |

## 驗收方式

每一批圖片優化後重新執行本指令，比較圖片總容量、超過 500 KB 的數量，以及該頁首屏必要圖片合計。圖片轉檔後仍需進行桌面與手機視覺驗收，確認文字、槽位、透明邊緣與卡片細節沒有失真。
