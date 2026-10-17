# The Hunters A.D. 1492 Wiki

以 React、TypeScript、Hono 與 Cloudflare D1 開發的《The Hunters A.D. 1492》非官方繁體中文物品圖鑑、多人戰役管理、3D 物理擲骰與全域劇情語音播放系統。

本專案將分散於卡片與規則資料中的裝備、合成、戰役與劇本語音數位化，提供條件搜尋、角色裝備、馬車倉庫、世界地圖、多人戰役狀態管理、3D 物理擲骰與 722 首全量中文劇情旁白播放，協助玩家大幅減少翻找配件及人工記錄的時間，並完整支援桌面與手機操作。

- **線上展示**：[the-hunters-ad-1492.boardgame-wiki.workers.dev](https://the-hunters-ad-1492.boardgame-wiki.workers.dev/)
- **測試帳號**：`demo-hunters`
- **測試密碼**：`hunters1492`
- **開發期間**：2026/09/23～2026/10/15

> 本專案由玩家整理，不代表官方翻譯或規則。物品與劇情內容仍應以遊戲原始資料與規則書為準。

## 專案畫面

| 管理者後台 | 物品圖鑑與條件篩選 |
| --- | --- |
| [![管理者後台](docs/screenshots/admin-dashboard-review.png)](docs/screenshots/admin-dashboard-review.png) | [![物品圖鑑與條件篩選](docs/screenshots/item-catalog-review.png)](docs/screenshots/item-catalog-review.png) |

| 馬車與共用庫存管理 | 戰役世界地圖 |
| --- | --- |
| [![馬車與共用庫存管理](docs/screenshots/wagon-management-review.png)](docs/screenshots/wagon-management-review.png) | [![戰役世界地圖](docs/screenshots/campaign-map-review.png)](docs/screenshots/campaign-map-review.png) |

| 角色裝備配置 | 裝備面板 |
| --- | --- |
| [![角色裝備配置](docs/screenshots/character-loadout-review.png)](docs/screenshots/character-loadout-review.png) | [![裝備面板](docs/screenshots/equipment-board-review.png)](docs/screenshots/equipment-board-review.png) |

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

### 3. 3D 物理擲骰工具 (3D Physics Dice Roller)
- **擬真 3D 物理碰撞**：基於 Three.js 與 Rapier3D（WASM），提供流暢的物理翻滾、碰撞與停止判定
- **輕量與延遲載入**：全站頂部常駐浮動骰盤，平常 0 byte，點擊時透過動態 `import()` 按需載入 3D 與物理引擎
- **靈活骰子模組**：支援標準 D6 與多顆投擲，具備點數統計、投擲歷史與行動端全螢幕適配

### 4. 全域劇情語音播放系統 (Story Audio Player)
- **全量劇情旁白收錄**：整理 722 首劇本伴侶來源的中文劇情旁白（涵蓋任務 Q、勝利 V、失敗 L、角色 F、W 擴充與純數字劇情卡）
- **代號即時檢索**：支援模糊搜尋、前綴過濾與即時播放
- **雲端高效串流**：串接 Cloudflare R2 物件儲存，支援 HTTP Range 斷點續傳與非同步載入
- **戰役播放歷程同步**：自動記錄隊伍最近播放的劇情卡，方便回溯與重新聆聽

> 目前資料來源包含裝備圖鑑資料集、工坊合成資料、戰役地圖母版與劇情語音資源。物品與劇情內容仍以遊戲原始實體配件與規則書為準。

## 專案目錄結構

```text
the-hunters-ad-1492/
├─ src/                         # React 前端程式
│  ├─ audio/                   # 全域語音播放器、歷史抽屜與 Manifest 解析
│  ├─ components/              # 共用 UI、角色裝備面板與 3D 骰盤元件
│  │  └─ dice/                 # 3D 物理骰盤 (Three.js + Rapier3D)
│  ├─ features/                # 骰子物理、規則與定義模組
│  ├─ lib/                     # API client、共用 hooks 與樂觀更新邏輯
│  ├─ pages/                   # 圖鑑、登入、戰役、地圖與管理頁面
│  ├─ styles/                  # 依功能領域拆分的全域 CSS
│  ├─ App.tsx                  # 前端路由與全站工具整合
│  ├─ main.tsx                 # React 掛載入口
│  └─ styles.css               # 全站主樣式引入
│
├─ server/                      # Hono 後端 API
│  ├─ db/
│  │  ├─ schema/               # Drizzle 資料表定義 (含 audio schema)
│  │  ├─ batch.ts              # D1 批次操作
│  │  └─ optimistic.ts         # 樂觀鎖與版本衝突處理
│  ├─ http/                    # JSON 回應與衝突錯誤處理
│  ├─ index.ts                 # Worker 入口與路由註冊
│  ├─ audioMedia.ts            # R2 音訊串流與代理
│  ├─ audioPlayback.ts         # 戰役播放日誌與歷史查詢
│  ├─ auth.ts                  # 玩家登入、Session 與權限驗證
│  ├─ catalog.ts               # 物品圖鑑與篩選查詢
│  ├─ characters.ts            # 戰役角色資料
│  ├─ characterLoadout.ts      # 角色裝備配置查詢
│  ├─ map.ts                   # 戰役地圖與卡片狀態
│  ├─ wagon.ts                 # 馬車、庫存及時間標記
│  └─ admin.ts                 # 管理者登入與戰役管理
│
├─ shared/                      # 前後端共用型別、常數及資料模板
├─ data/                        # 裝備、材料、合成來源與語音對照清單
├─ migrations/                  # Cloudflare D1 schema 增量遷移 (0001~0027)
├─ seeds/                       # 初始資料與資料庫匯入 SQL
├─ public/                      # 靜態圖示、卡片圖與音訊 Manifest
├─ test/                        # Node 測試與 Hono → D1 整合測試
│  ├─ audio/                   # 語音代碼、manifest 與播放器控制器測試
│  └─ integration/             # D1、R2、角色裝備與戰役流程整合測試
├─ tests/
│  ├─ fixtures/                # Playwright 測試資料
│  └─ visual/                  # Playwright 視覺、骰盤與音訊播放器測試
├─ docs/                        # 架構、資料庫、3D 骰盤與 R2 語音設計文件
├─ scripts/                     # 資料轉換、音訊下載、R2 同步與部署腳本
├─ wrangler.jsonc               # Cloudflare Workers / D1 / R2 設定
├─ package.json                 # 專案指令與套件設定
└─ README.md
```

## 系統架構

```mermaid
flowchart LR
    Browser["使用者瀏覽器"] --> Frontend["React SPA - TypeScript + Vite"]
    Frontend -->|HTTP JSON| API["Hono RESTful API"]
    Frontend --> Assets["Cloudflare Assets (靜態資源)"]
    Frontend -->|Audio Stream| R2["Cloudflare R2 (音訊檔案儲存)"]
    API --> Security["Session、CSRF、權限檢查"]
    API --> Domain["Catalog、Campaign、Map、Wagon、Character、Audio"]
    Security --> Database["Cloudflare D1"]
    Domain --> ORM["Drizzle ORM"]
    Domain --> R2
    ORM --> Database
```

### 架構說明

- 前端採用 React 19、TypeScript 與 Vite 建立 SPA，負責物品查詢、戰役地圖、馬車倉庫、角色裝備、3D 骰盤及語音播放等互動介面。
- 前端統一透過 HTTP／JSON 呼叫 Hono RESTful API，不直接存取資料庫。
- 後端依領域拆分物品目錄、戰役、地圖、馬車、角色、裝備及音訊日誌等 API 模組。
- 使用 Drizzle ORM 存取 Cloudflare D1，並透過 migrations 管理資料結構演進。
- 使用 Cloudflare R2 串流大型劇情語音媒體，具備快取與斷點續傳。
- 使用 Session、CSRF 防護與戰役權限檢查保護資料異動操作。
- 多人編輯採用版本檢查與 Optimistic Locking，避免不同玩家的更新互相覆蓋。
- 前端、API 與靜態資源部署於 Cloudflare Workers／Assets。

### 技術棧

- React 19、TypeScript、Vite
- Three.js、@dimforge/rapier3d-compat（3D 物理引擎）
- Hono API（Worker 邊緣運行）
- Drizzle ORM（型別安全的 Cloudflare D1 資料庫操作與 Schema 定義）
- Cloudflare D1（關聯式 SQLite 邊緣資料庫）
- Cloudflare R2（物件儲存，託管高畫質語音檔案）
- Cloudflare Workers（全球部署，結合 Assets 靜態託管）
- Playwright（視覺回歸、3D 骰盤與行動裝置適配測試）
- 已部署至 [Cloudflare Workers](https://the-hunters-ad-1492.boardgame-wiki.workers.dev)

前端資料嚴格透過 `/api` 讀取，資料存取全面由 Drizzle ORM 處理，重要操作均採 D1 batch 原子批次交易防護。

```text
React (SPA) → /api → Hono Router → Drizzle ORM → Cloudflare D1 (hunters-db)
            ↳ /media/audio/* → Worker Range Proxy → Cloudflare R2 (the-hunters-ad-1492-audio)
```

詳細設計請參閱 [系統架構](docs/architecture.md)、[3D 擲骰規劃](docs/dice-roller-implementation-plan.md) 與 [語音播放器規劃](docs/audio-player-implementation-plan.md)。

## 主要模組

| 模組 | 功能 |
| --- | --- |
| Item Catalog | 物品搜尋、條件篩選、詳細資料與合成需求 |
| Campaign | 戰役建立、玩家登入及戰役狀態管理 |
| Character | 角色資料、裝備配置與持有物品管理 |
| Wagon | 共用庫存、工坊升級、經過天數及時間標記 |
| World Map | 地圖拼接、隊伍位置、地圖卡片與翻面狀態 |
| Dice Roller | 本機 3D 物理擲骰、多骰支援、投擲歷史與全螢幕骰盤 |
| Audio Player | 722 首全量中文劇情語音播放、代號快搜、R2 串流與播放紀錄 |
| Authentication | 玩家 Session、CSRF 防護與存取控制 |
| Data Pipeline | 來源資料驗證、語音對照清單建置、JSON／SQL 產生與種子資料匯入 |

## 開發流程

本專案採用 **AI-assisted Spec-driven Development**：

1. 先與 AI Agent 討論需求、使用情境與功能邊界。
2. 將確認後的內容整理為 implementation plan。
3. 依功能相依關係拆分為數個開發階段及可驗證的小任務。
4. 每完成一段功能後執行 typecheck、build、測試與人工操作驗證。
5. 確認結果符合預期後，再進入下一階段開發。
6. AI 產生的程式碼由開發者負責審查、修改及最終驗證。

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

`npm run db:setup` 會自動執行本機 D1 migration 並匯入裝備目錄。

語音播放器的 manifest 位於 `public/audio/manifest.json`。`wrangler.jsonc` 將 `AUDIO` binding 設為 `remote: true`，因此本機開發會透過 Worker 路由讀取正式 R2 bucket；啟動前需在未納入 Git 的 `.env` 設定具備 R2 讀取權限的 `CLOUDFLARE_API_TOKEN`。請勿提交或分享 Token。若新增 migration，先執行 `npm run db:migrate` 並重新啟動開發伺服器。

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 啟動 React、Hono 與本機 D1 開發伺服器 |
| `npm run typecheck` | 檢查前後端 TypeScript 型別 |
| `npm test` | 執行 Node 單元測試與 Hono → D1／R2 整合測試 |
| `npm run build` | 型別檢查並建立正式版產物 |
| `npm run preview` | 在本機預覽正式建置結果與 API |
| `npm run data:seed` | 驗證來源 JSON 並產生 D1 seed SQL |
| `npm run db:migrate` | 套用本機 D1 migrations |
| `npm run db:setup` | 套用 migrations 並重設本機基礎資料 |
| `npm run audio:manifest` | 產生不指定正式媒體基底的開發 manifest |
| `npm run audio:manifest:prod` | 產生以 `/media/audio/` 為基底的正式 manifest |
| `npm run audio:r2:sync` | 預覽 R2 同步物件數與容量，不會上傳 |
| `npm run audio:r2:sync -- --upload --concurrency=4` | 將 manifest 中的音檔同步到正式 R2 |
| `npm run audio:r2:verify -- <媒體基底網址>` | 驗證代表音檔的 HEAD、Range 與快取標頭 |
| `npm run test:visual` | 執行 Playwright 行動端視覺回歸測試 |
| `npm run deploy:prod` | 建置、套用遠端 migrations、部署 Worker 並執行健康檢查；預設不匯入 seed |
| `npm run deploy:prod:seed` | 部署並明確重新匯入正式裝備 seed；僅在需要更新正式資料時使用 |

## 專案狀態

本專案現已完成：
1. **物品圖鑑與合成系統（MVP）**
2. **馬車營地與天數推進系統**
3. **M01~M20 大世界戰役地圖與卡片標記系統**
4. **角色面板與裝備配置系統（Hero & Equipment Boards）**
5. **3D 物理擲骰系統（Three.js + Rapier3D）**
6. **全域劇情語音播放系統（722 首旁白 + R2 媒體串流）**
7. **管理者登入、戰役管理、備份與操作紀錄**
