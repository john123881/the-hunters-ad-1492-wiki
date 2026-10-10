# 正式站部署前圖片載入驗收

產生時間：2026-10-10T01:19:20.509Z

測試環境：production build、本機預覽、393×852 viewport、100 ms latency、1.5 Mbps download。

## 結果

- 圖片：**15 張／3.25 MB**
- HTTP 或圖片格式錯誤：**0**
- 瀏覽器載入或解碼錯誤：**0**
- 結論：**通過**

| 圖片組 | 張數 | 容量 | 慢速網路完成時間 | 結果 |
| --- | ---: | ---: | ---: | --- |
| 裝備面板基本載入組 | 3 | 315 KB | 4610 ms | 通過 |
| 角色面板 | 9 | 2.46 MB | 13922 ms | 通過 |
| 馬車面板 | 1 | 329 KB | 1925 ms | 通過 |
| 首頁主視覺 | 2 | 169 KB | 771 ms | 通過 |

## 資產明細

| 路徑 | HTTP | 容量 | 解碼尺寸 | Cache-Control |
| --- | ---: | ---: | --- | --- |
| `/images/campaign/characters/equipment-board-gridless-v5.webp` | 200 | 211 KB | 1200×960 | `public, max-age=31536000, immutable` |
| `/images/campaign/characters/slot-cover-10xp-v3.webp` | 200 | 52 KB | 384×384 | `public, max-age=31536000, immutable` |
| `/images/campaign/characters/slot-cover-blocked-x-v3.webp` | 200 | 52 KB | 384×384 | `public, max-age=31536000, immutable` |
| `/images/campaign/characters/brawler-board-v2.webp` | 200 | 280 KB | 900×1200 | `public, max-age=31536000, immutable` |
| `/images/campaign/characters/crossbowman-board-v2.webp` | 200 | 290 KB | 900×1200 | `public, max-age=31536000, immutable` |
| `/images/campaign/characters/cutthroat-board-v2.webp` | 200 | 283 KB | 900×1200 | `public, max-age=31536000, immutable` |
| `/images/campaign/characters/huntress-board-v2.webp` | 200 | 316 KB | 900×1200 | `public, max-age=31536000, immutable` |
| `/images/campaign/characters/landsknecht-board-v2.webp` | 200 | 311 KB | 900×1200 | `public, max-age=31536000, immutable` |
| `/images/campaign/characters/man-at-arms-board-v2.webp` | 200 | 300 KB | 900×1200 | `public, max-age=31536000, immutable` |
| `/images/campaign/characters/medic-board-v2.webp` | 200 | 245 KB | 900×1200 | `public, max-age=31536000, immutable` |
| `/images/campaign/characters/sorceress-board-v2.webp` | 200 | 259 KB | 900×1200 | `public, max-age=31536000, immutable` |
| `/images/campaign/characters/witch-board-v2.webp` | 200 | 234 KB | 900×1200 | `public, max-age=31536000, immutable` |
| `/images/campaign/wagon-board-concept-v3.webp` | 200 | 329 KB | 1536×1024 | `public, max-age=31536000, immutable` |
| `/images/hero-keyart.webp` | 200 | 119 KB | 1200×865 | `public, max-age=31536000, immutable` |
| `/images/hero-keyart-640.webp` | 200 | 50 KB | 640×461 | `public, max-age=31536000, immutable` |

時間是依序測試各圖片組的單次結果，只用於發現明顯退化，不作為正式站 CDN 的固定 SLA。
