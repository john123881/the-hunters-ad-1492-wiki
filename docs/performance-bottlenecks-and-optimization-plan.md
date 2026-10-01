# 系統效能瓶頸評估與未來優化規劃 (Performance & Architecture Bottlenecks)

本文件彙整目前《The Hunters AD 1492》專案在 Cloudflare Workers + Cloudflare D1 + React SPA 架構下的潛在效能瓶頸、影響分析與後續優化建議。

---

## 1. 地圖多層關聯查詢 (`loadMap` 中的 130+ 筆卡片多重 LEFT JOIN)

### 📌 現況與位置
- **檔案**：[`server/map.ts`](file:///home/john/projects/the-hunters-ad-1492/server/map.ts#L176-L217)
- **實作內容**：
  ```typescript
  const cardProgress = await db
    .select(...)
    .from(campaignCardCatalog) // 102 張 S 卡 + 16 張 J 卡 + 擴充 = 130+ 筆
    .leftJoin(campaignCardStatuses, ...)
    .leftJoin(campaignMapCardPlacements, ...)
    .leftJoin(campaignCardsProgress, ...)
    .leftJoin(campaignCardTimeTokens, ...)
    .orderBy(campaignCardCatalog.sortOrder);
  ```

### 🔍 潛在問題
1. **多表乘積與 CPU 負載**：
   在 SQLite / D1 中對 `campaignCardCatalog` 進行 4 個子表的 `LEFT JOIN`。每次玩家開啟地圖頁面、移動或更新標記時，後端都要即時在資料庫內計算這條多層關聯，耗費 D1 的查詢時間。
2. **全量輸出 Payload**：
   玩家在畫面上通常只關注當前所處板塊或地點的卡片，但目前 API 會將 130+ 張卡片的所有狀態完整序列化成 JSON 傳回前端。

### 💡 優化建議
- **常駐目錄記憶體快取**：`campaignCardCatalog` 是不變的卡片主清單，可於 Worker 啟動或記憶體中靜態快取，只向 D1 查詢目前戰役「有狀態變更」的紀錄並進行記憶體合併。
- **複合索引覆蓋**：持續確保 `campaignCardStatuses(campaign_id, card_code)`、`campaignMapCardPlacements(campaign_id, card_code)` 具備複合覆蓋索引。

---

## 2. 讀取即初始化 (`ensureWagon` / `ensureMap` Read-time Overhead)

### 📌 現況與位置
- **檔案**：
  - [`server/wagon.ts`](file:///home/john/projects/the-hunters-ad-1492/server/wagon.ts#L65) 的 `loadWagon()` 會呼叫 `ensureWagon()`
  - [`server/map.ts`](file:///home/john/projects/the-hunters-ad-1492/server/map.ts#L93) 的 `loadMap()` 會呼叫 `ensureMap()`

### 🔍 潛在問題
- 雖然目前已加入 `COUNT(*)` 的快速旁路檢查，避免每次寫入；但在 Cloudflare D1 架構下，每一次查詢都是一次邊緣資料庫的 round-trip。
- **單純的 GET 請求依然伴隨額外 1~2 次 SQL 檢查**，累積下來會略微墊高 API 的 TTFB（Time To First Byte）延遲。

### 💡 優化建議
- **建立戰役時一次性初始化**：
  將 20 張地圖板塊、14 張地點卡與工坊基礎資料的建立，移至 `createAdminCampaign` 或初次戰役設定流程中。
- **讀取端回歸純粹（Pure Read）**：
  `GET /api/campaign/map` 與 `GET /api/campaign/wagon` 只做純查詢，不再隱式觸發初始化檢查。

---

## 3. 玩家 Session 的每次請求重複驗證 (No In-Memory Cache)

### 📌 現況與位置
- **檔案**：[`server/auth.ts`](file:///home/john/projects/the-hunters-ad-1492/server/auth.ts#L61-L75)
- **實作內容**：
  ```typescript
  export async function readSession(c: Ctx) {
    const token = getCookie(c, COOKIE);
    const hash = await digest(token);
    // 每次請求都查 D1: auth_sessions JOIN campaigns JOIN campaign_players
  }
  ```

### 🔍 潛在問題
- 當前端載入頁面或切換標籤時，往往同時平行發出 2~4 個 API 請求。
- 每個請求到達 Cloudflare Worker 後，都會個別執行一次 SHA-256 與一次 D1 關聯查詢，造成短時間內重複讀取資料庫。

### 💡 優化建議
- **無狀態簽名 Token (Stateless JWT / HMAC Cookie)**：
  短期內身分資訊可直接經由伺服器私鑰簽名存在 Cookie 中，Worker 驗證簽名即可獲取玩家與戰役資訊，不需每次叩訪 D1。
- **邊緣短暫快取 (Worker Memory / Cloudflare KV)**：
  在 Worker 實例內對 token hash 做 30~60 秒的極短暫記憶體快取。

---

## 4. 前端資料更新後的全量重新抓取 (Full Refetch on Mutation)

### 📌 現況與位置
- **前端頁面**：`CampaignPage.tsx`、`CampaignCharactersPage.tsx`、`CampaignMapPage.tsx`

### 🔍 潛在問題
- 目前只要變更一個數值（例如：修改 1 枚金幣、勾選 1 個中毒標記、損壞 1 件裝備），後端 API 就會重新回傳該模組的全部完整資料，前端將整份物件覆蓋至 React State。
- 雖然狀態能保證絕對一致，但會觸發多個大型子元件（全地圖網格、工坊面板、多位角色卡片）整頁重新渲染。

### 💡 優化建議
- **元件級別優化 (`React.memo`)**：
  對地圖網格背景、靜態素材卡列表等大體積元件加上 `React.memo`，隔離不相關數值變更的重繪。
- **局部狀態更新（局部 Patch）**：
  在成功取得 API 200/201 回應後，優先局部更新異動的子欄位，或讓後端輕量回傳 diff。

---

## 5. 圖床與靜態資源權限 (External CDN Availability)

### 📌 現況說明
- 遊戲素材與圖片目前存放在外部雲端儲存／CDN。
- 部分請求可能因防盜鏈或 Bucket 權限設定引發 `403 Forbidden`。

### 💡 優化建議
- 盤點所有裝備、獵人面板與卡片素材的圖片 URL，確保 CDN 物件具有公開讀取權限（Public Read）並啟用長效快取（Cache-Control: public, max-age=31536000）。
