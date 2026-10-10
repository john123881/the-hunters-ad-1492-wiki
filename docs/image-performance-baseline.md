# 圖片效能基準

產生時間：2026-10-10T01:47:05.306Z

執行方式：

```bash
npm run images:audit
```

## 整體基準

- `public/images` 圖片數：**281**
- 靜態圖片總容量：**8.63 MB**
- 程式、資料與 seed 中可直接辨識的引用：**108 張／1.96 MB**
- 單檔超過 500 KB：**0 張**
- 裝備面板基本載入組：**約 315 KB**（底板與兩張蓋板）
- 目標：首屏必要圖片控制在 1 MB 內；單張介面圖片原則上低於 500 KB。

「直接引用」只辨識完整字串路徑。地圖卡、角色卡及資料庫組合出的動態路徑可能顯示為未直接引用，移除資產前仍須檢查實際 API 資料與瀏覽器請求。

## 格式分布

| 格式 | 數量 | 容量 |
| --- | ---: | ---: |
| WEBP | 180 | 8.12 MB |
| PNG | 73 | 469 KB |
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
| `/images/campaign/characters/medic-board-v2.webp` | 245 KB | 900×1200 | 否／可能由動態路徑載入 |
| `/images/campaign/characters/witch-board-v2.webp` | 234 KB | 900×1200 | 否／可能由動態路徑載入 |
| `/images/campaign/characters/equipment-board-gridless-v5.webp` | 211 KB | 1200×960 | 是 |
| `/images/campaign/characters/huntress-initial-layout.webp` | 124 KB | 900×900 | 否／可能由動態路徑載入 |
| `/images/hero-keyart.webp` | 119 KB | 1200×865 | 是 |
| `/images/campaign/characters/brawler-initial-layout.webp` | 115 KB | 900×900 | 否／可能由動態路徑載入 |
| `/images/campaign/maps/M18-front.webp` | 94 KB | 720×420 | 否／可能由動態路徑載入 |
| `/images/campaign/characters/crossbowman-initial-layout.webp` | 93 KB | 900×900 | 否／可能由動態路徑載入 |
| `/images/campaign/maps/M10-front.webp` | 90 KB | 720×420 | 否／可能由動態路徑載入 |
| `/images/campaign/characters/medic-initial-layout.webp` | 89 KB | 900×900 | 否／可能由動態路徑載入 |
| `/images/campaign/maps/M19-front.webp` | 89 KB | 720×420 | 否／可能由動態路徑載入 |
| `/images/campaign/maps/M17-front.webp` | 87 KB | 720×420 | 否／可能由動態路徑載入 |
| `/images/campaign/maps/M20-front.webp` | 87 KB | 720×420 | 否／可能由動態路徑載入 |
| `/images/campaign/characters/cutthroat-initial-layout.webp` | 87 KB | 900×900 | 否／可能由動態路徑載入 |
| `/images/campaign/characters/landsknecht-initial-layout.webp` | 86 KB | 900×900 | 否／可能由動態路徑載入 |
| `/images/campaign/maps/M11-front.webp` | 85 KB | 720×420 | 否／可能由動態路徑載入 |
| `/images/campaign/characters/witch-initial-layout.webp` | 85 KB | 900×900 | 否／可能由動態路徑載入 |
| `/images/campaign/maps/M15-front.webp` | 84 KB | 720×420 | 否／可能由動態路徑載入 |
| `/images/campaign/maps/M14-front.webp` | 83 KB | 720×420 | 否／可能由動態路徑載入 |
| `/images/campaign/maps/M09-front.webp` | 82 KB | 720×420 | 否／可能由動態路徑載入 |
| `/images/campaign/maps/M03-front.webp` | 81 KB | 720×420 | 否／可能由動態路徑載入 |
| `/images/campaign/maps/M06-front.webp` | 79 KB | 720×420 | 否／可能由動態路徑載入 |

## 驗收方式

每一批圖片優化後重新執行本指令，比較圖片總容量、超過 500 KB 的數量，以及該頁首屏必要圖片合計。圖片轉檔後仍需進行桌面與手機視覺驗收，確認文字、槽位、透明邊緣與卡片細節沒有失真。
