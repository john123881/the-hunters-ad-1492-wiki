# 合成需求顯示規劃

## 範圍

延續既有合成功能，在物品卡片與詳情顯示材料數量、工坊及等級。資料為玩家整理，不是官方中文規則。本階段只交付本機預覽，不部署或更新正式 D1。不新增獨立合成查詢、庫存、實際合成操作或角色功能。

## 資料流程與主要檔案

- `data/equipment_page1.json` 至 `data/equipment_page8.json`：目前物品來源。
- `data/recipes.json`：以 `item_slug` 對應物品；`resources` 提供材料及數量，`stations` 提供多個工坊及各自等級。
- `scripts/build-seed.mjs`：從來源生成可重跑的 `seeds/equipment_catalog.sql`。
- `migrations/0010_create_recipe_station_requirements.sql`：建立配方的多工坊需求，保存等級、順序並遷移舊的單工坊資料。
- `server/catalog.ts`：透過 Hono 查詢 D1，提供列表及詳情 API。
- `shared/types.ts`：定義 `CraftingRecipe` 與材料、工坊需求契約；無配方為 `crafting: null`。
- `src/components/CraftingStrip.tsx`：卡片的合成摘要與可存取名稱。
- `src/pages/DetailPage.tsx`：完整材料、工坊名稱與數量、等級。
- `src/styles.css`：響應式卡片與合成排版。
- `public/images/resources/`、`public/images/workshops/`：材料及工坊圖示。

前端只使用 API 資料，不加入固定配方陣列。來源 JSON、schema、seed 分開維護。

## 介面調整

1. 工坊圖示以 32px 顯示，手機亦維持尺寸；保留透明背景與圖像比例，將黑色前景以 CSS 濾鏡轉為象牙金，提高深色背景對比。
2. 材料數量只顯示數字，卡片及詳情皆移除前綴「×」。
3. 材料與工坊優先同排，空間不足時逐項換行；圖示與數字保持在一起。工坊等級只顯示數字，移除 Lv. 前綴，保留可存取等級說明。
4. 卡片隨內容增高，圖片不可縮小；列表文字欄可收縮，避免內容撐出卡片。
5. 摘要提供材料名稱、數量及工坊等級的可存取名稱，沿用鍵盤導覽與減少動畫模式。

## 本機驗證與預覽

在 WSL Node.js 環境執行：

```bash
npm run data:seed
npm run db:setup
npm run build
npm run preview
```

`db:setup` 只操作本機 D1，預覽位址為 http://localhost:4173。

- 透過實際 Hono → 本機 D1 的列表與詳情 API 核對材料和多工坊需求。
- 檢查桌面、手機的網格與列表無水平溢出，文字不被合成列遮蔽。
- 確認圖示載入、數量無「×」、多工坊等級完整顯示。
- 詳情網址可直接開啟與重新整理；無配方不顯示空白合成列。
- 型別檢查與建置成功，不執行部署。

既有 `scripts/validate-recipes.mjs` 仍檢查舊單工坊欄位，不作為本階段多工坊驗收依據；後續擴充驗證時需先改為 `stations[]` 契約。
