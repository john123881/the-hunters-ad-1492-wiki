# The Hunters A.D. 1492 Wiki

《The Hunters A.D. 1492》非官方繁體中文物品圖鑑。網站提供裝備列表、關鍵字搜尋、條件篩選與物品詳情，並支援桌面和手機版。

> 本專案由玩家整理，不代表官方翻譯或規則。物品內容仍應以遊戲原始資料與規則書為準。

## 功能

- 瀏覽目前收錄的物品與裝備
- 依名稱、資料代碼或效果文字搜尋
- 依格數、攻擊類型、屬性、效果及接口篩選
- 查看物品圖片、行動面板、效果與接口資訊
- 搜尋及篩選條件保留在網址中，可直接分享
- 響應式版面、鍵盤焦點、載入／無結果／錯誤狀態

目前資料來源是 [`data/equipment_page1.json`](data/equipment_page1.json) 與 [`data/equipment_page2.json`](data/equipment_page2.json)，共收錄 25 件武器與武器附件。物品卡片與詳情已加入合成材料及工坊需求；獨立合成查詢與角色行動卡尚未開放。詳見 [合成規劃](docs/crafting-plan.md)。

## 技術架構

- React 19、TypeScript、Vite
- Hono API
- Cloudflare D1
- Cloudflare Workers Vite plugin
- 已部署至 ChatGPT Sites

前端只透過 `/api` 讀取資料，物品列表並未重複寫死在 React 程式中。

```text
React → /api → Hono → D1
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

`npm run db:setup` 只操作 `.wrangler/` 內的本機 D1。物品 seed 可重跑，並會以 `data/equipment_page1.json` 與 `data/equipment_page2.json` 產生的 `seeds/equipment_catalog.sql`，重建本機物品及其行動模式、效果和接口。

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 啟動 React、Hono 與本機 D1 開發環境 |
| `npm run typecheck` | 檢查前後端 TypeScript |
| `npm run build` | 型別檢查並建立正式版產物 |
| `npm run preview` | 在 http://localhost:4173 預覽建置結果與本機 API |
| `npm run data:seed` | 驗證來源 JSON 並產生 D1 seed SQL |
| `npm run db:migrate` | 套用本機 D1 migrations |
| `npm run db:setup` | 套用 migrations 並匯入目前物品資料 |

## 主要目錄

| 路徑 | 用途 |
| --- | --- |
| `src/` | React 頁面、元件與樣式 |
| `server/` | Hono 路由、查詢參數與 D1 SQL |
| `shared/` | 前後端共用 TypeScript 資料契約 |
| `data/` | 可公開的整理資料來源 |
| `migrations/` | D1 schema 與增量變更 |
| `seeds/` | 由資料來源產生的 D1 匯入 SQL |
| `public/images/` | 網站使用的本機圖片資源 |
| `docs/` | 架構與資料庫設計文件 |

## 資料與圖片

`equipment_page1.json` 與 `equipment_page2.json` 是使用者整理且允許訪客查閱的資料。原始 PDF、先前擷取圖片與舊版轉錄產物已由 `.gitignore` 排除，不會提交至 repository。

物品圖片目前存放於 `public/images/items/`，共包含 25 張 PNG。若日後加入第三方素材，應先確認公開與部署授權。

## 部署

專案使用標準 Worker `fetch` 入口、靜態前端產物及名稱為 `DB` 的 D1 binding，並已部署至 [ChatGPT Sites](https://the-hunters-ad-1492.a123881.chatgpt.site/)。本機設定中的 `local-hunters-db` 不是正式資料庫 ID；`npm run db:setup` 不會更新正式網站的 D1。

## 專案狀態

目前為物品圖鑑 MVP，資料來源涵蓋 Equipment Compendium Page 1 與 Page 2，共 25 件物品。暫不包含登入、隊伍、戰役紀錄、角色狀態及管理後台。
