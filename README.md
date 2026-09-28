# The Hunters A.D. 1492 Wiki

《The Hunters A.D. 1492》非官方繁體中文物品圖鑑。網站提供裝備列表、關鍵字搜尋、條件篩選與物品詳情，並支援桌面和手機版。

> 本專案由玩家整理，不代表官方翻譯或規則。物品內容仍應以遊戲原始資料與規則書為準。

## 功能

### 1. 裝備與物品圖鑑 (Equipment Compendium)
- 瀏覽目前收錄的裝備與物品（涵蓋武器、防具、頭盔、飾品、附件、藥劑與材料等）
- 依名稱、資料代碼、效果文字搜尋，或依格數、攻擊類型、屬性、效果及接口篩選
- 查看去背卡片縮圖、行動面板、數值加成、效果說明與工坊合成需求
- 搜尋及篩選條件完整保留在網址中，支援直接分享

### 2. 戰役管理系統 (Campaign System)
- **多玩家席位與權限**：支援 1~4 人跑團憑證登入，具備樂觀鎖（Optimistic Locking）版本防衝突控制
- **馬車營地系統 (Wagon Management)**：
  - 追蹤戰役天數（Elapsed Days）與推進歷程
  - 5 大工坊升級槽位（鐵匠、製弓、煉金、工藝、防具）等級與升級紀錄
  - 馬車共用裝備倉庫與材料庫存管理
  - 時間標記（Time Token A/B/C/D）排程放置與到期提醒
- **大世界戰役地圖 (Campaign World Map)**：
  - 完整 20 張地圖板塊（M01 ~ M20）網格連續地圖與雙面切換（正面探險地圖 / 背面純色底圖）
  - 移動指示物（Hunters Move Token）放置與獵人隊伍當前位置標記
  - 支援地圖卡片放置、狀態切換（未完成／進行中／已解決）、加入城鎮牌庫標記
  - **卡片即時備註**：直接在地圖抽屜中針對放置卡片新增與修改備註（notes）
  - **到期時間標記指示**：在地圖卡片上直接顯示已綁定的 Time Token 與預計解鎖天數
  - **地點卡（Location Cards）**：支援地點揭示、資源備註與探索歷程紀錄
  - **沉浸式體驗與行動端優化**：具備 3D 卡牌翻轉動效（Card Flip）、卡號快速搜尋、地圖全景檢視與手機 Safe-area 底部操作列

> 目前資料來源包含裝備圖鑑資料集、工坊合成資料以及戰役地圖母版。物品內容仍以遊戲原始實體配件與規則書為準。

## 技術架構

- React 19、TypeScript、Vite
- Hono API（Worker 邊緣運行）
- Cloudflare D1（關聯式 SQLite 邊緣資料庫）
- Cloudflare Workers（全球部署，結合 Assets 靜態託管）
- Playwright（視覺回歸與行動裝置適配測試）
- 已部署至 [Cloudflare Workers](https://the-hunters-ad-1492.boardgame-wiki.workers.dev)

前端資料嚴格透過 `/api` 讀取，重要操作均採 D1 batch 原子批次交易防護。

```text
React (SPA) → /api → Hono Router → Cloudflare D1 (hunters-db)
```

詳細設計請參閱 [系統架構](docs/architecture.md) 與 [資料庫設計](docs/database-review.md)。

## 本機執行

需求：Node.js 22.12 以上及 npm。

```bash
git clone https://github.com/john123881/the-hunters-ad-1492-wiki.git
cd the-hunters-ad-1492-wiki
npm ci
npm run data:seed
npm run db:setup
npm run dev
```

開啟 <http://localhost:5173>。

`npm run db:setup` 會自動執行 D1 migration 並匯入裝備目錄。

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 啟動 React、Hono 與本機 D1 開發伺服器 |
| `npm run typecheck` | 檢查前後端 TypeScript 型別 |
| `npm run build` | 型別檢查並建立正式版產物 |
| `npm run preview` | 在本機預覽正式建置結果與 API |
| `npm run data:seed` | 驗證來源 JSON 並產生 D1 seed SQL |
| `npm run db:migrate` | 套用本機 D1 migrations |
| `npm run db:setup` | 套用 migrations 並重設本機基礎資料 |
| `npm run test:visual` | 執行 Playwright 行動端視覺回歸測試 |
| `npm run deploy:prod` | 一鍵完成型別檢查、打包、遠端遷移與部署至 Cloudflare |

## 主要目錄

| 路徑 | 用途 |
| --- | --- |
| `src/` | React 頁面（圖鑑、馬車、地圖、角色）、元件與 CSS 樣式 |
| `server/` | Hono 路由模組（items, campaigns, wagon, map）與 D1 SQL 交易 |
| `shared/` | 前後端共用 TypeScript 資料契約與常數定義 |
| `data/` | 裝備與材料來源資料 |
| `migrations/` | Cloudflare D1 資料庫 schema 增量遷移檔案 |
| `seeds/` | 資料庫匯入 SQL |
| `public/` | 靜態資產（物品圖片、地圖板塊切圖、資源圖示、工坊圖示） |
| `tests/visual/` | 行動端視覺回歸測試與快照 |
| `docs/` | 架構、資料庫與合成系統設計文件 |

## 專案狀態

本專案現已完成：
1. **物品圖鑑與合成系統（MVP）**
2. **馬車營地與天數推進系統**
3. **M01~M20 大世界戰役地圖與卡片標記系統**
4. **角色面板系統（Hero & Equipment Boards）規格規劃中（見 `plan_campaign_characters.md`）**

