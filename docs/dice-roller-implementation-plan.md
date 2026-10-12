# 3D 物理擲骰系統實施計畫

本功能為《THE HUNTERS A.D. 1492》提供本機 3D 物理擲骰工具。系統以手機效能為首要條件，不同步其他玩家的投擲結果。

> 骰子面數、各面圖案、結果意義與重骰規則尚待提供。本計畫先建立可替換的骰子定義與技術基礎，不預先寫死遊戲規則。

## 1. 產品範圍

第一階段包含：

- 從全站導覽或常駐按鈕開啟骰盤。
- 桌面使用 Overlay，手機使用全螢幕介面。
- 在目前瀏覽器完成投擲、碰撞、停止判定與朝上面辨識。
- 顯示個別結果，提供再次投擲與清空。
- 以抽象定義承接之後提供的正式骰子規格。

第一階段不包含：

- 多人同步、房間、即時連線或跨裝置重播。
- 伺服器權威判定、防作弊或永久保存投擲歷史。
- 尚未確認的正式骰面及重骰規則。
- Owlbear Rodeo SDK、原始碼或素材整合。

## 2. 前端介面

- 採用全站可開啟的骰盤 Overlay，玩家不必離開目前的角色、地圖或馬車頁面。
- 桌面約使用 `960 × 720` 置中面板，左側 3D 骰盤，右側選骰與結果。
- 手機改為全螢幕，上方是 3D 骰盤，下方是可捲動控制區。
- 關閉後回到原頁面與原本捲動位置。
- 第一次開啟顯示引擎載入狀態；WebGL 或 WASM 失敗時提供說明與重試。
- 結果使用 `aria-live` 宣告，所有控制可用鍵盤操作並符合觸控尺寸。
- 支援 `prefers-reduced-motion`，減少非必要鏡頭動畫。

操作狀態：

```text
尚未載入 → 載入 3D 引擎 → 可操作 → 投擲中 → 結果已確定
                         └────────────→ 載入或執行失敗
```

## 3. 技術選型

- **Three.js**：WebGL 場景、相機、燈光、材質與模型。
- **`@dimforge/rapier3d-compat`**：本機剛體、碰撞、重力、休眠與停止判定。
- **React + TypeScript**：操作狀態與結果介面。

選擇 Rapier 是因為手機效能、碰撞穩定度及擴充性較適合本功能。由於不做多人同步，不需要同步亂數種子、初始速度或物理世界狀態。

### 延遲載入與清理

- 未開啟骰盤時不載入 Three.js、Rapier、模型或貼圖。
- 使用動態 `import()` 或 `React.lazy()` 建立獨立 chunk。
- 開啟後才初始化 Rapier WASM 與 WebGL renderer。
- 關閉時取消動畫幀、移除監聽，並釋放 geometry、material、texture、renderer 和物理世界。

### 骰子定義與規則解耦

```ts
export interface DieDefinition {
  id: string;
  name: string;
  faceCount: number;
  faces: Array<{
    id: string;
    label: string;
    value?: number;
    textureUrl?: string;
  }>;
  modelUrl?: string;
}

export interface DiceResult {
  dieId: string;
  faceId: string;
  value?: number;
}
```

- `diceDefinitions`：面數、面圖與標籤。
- `dicePhysics`：Rapier 投擲、碰撞、休眠與朝上面判定。
- `diceRules`：之後加入結果解讀及重骰規則。
- React 元件只負責選骰、投擲、清除與顯示結果。

## 4. 手機效能策略

- 初始同時投擲上限為 **8 顆**，真機驗收後再決定是否提高到 10 顆。
- pixel ratio 上限使用 `Math.min(window.devicePixelRatio, 1.5)`。
- 使用一盞主光與環境光；陰影先採低解析度，低效能裝置可關閉陰影。
- 骰子使用低面數模型及共用 geometry/material，圖案優先使用 texture atlas。
- 不加入後製、動態反射、高解析度環境貼圖或大量透明材質。
- 只在投擲及尚未靜止時執行物理 step 和 `requestAnimationFrame`。
- 全部骰子休眠後停止連續渲染；分頁進入背景時暫停運算。
- 不讓骰盤內的狀態更新觸發底下戰役頁面重新渲染。
- 3D 元件使用錯誤邊界，避免 WebGL 錯誤影響網站其他功能。

## 5. 分階段實施

### 階段 0：響應式介面原型

1. 建立 Overlay、關閉控制、選骰區及結果區骨架。
2. 驗證手機全螢幕高度、瀏覽器工具列、橫直向切換和捲動。
3. 確認關閉後回到原頁面位置。

### 階段 1：Rapier 手機技術驗證

先使用一顆中性測試立方體，不代表正式遊戲骰子。

1. 動態載入 Three.js 與 Rapier。
2. 建立地面、碰撞邊界和一顆剛體。
3. 完成初速度、角速度、碰撞、休眠及朝上面判定。
4. 骰子靜止後停止動畫和物理更新。
5. 關閉後驗證 GPU、物理世界與事件監聽均被清理。

### 階段 2：抽象定義與多骰支援

1. 實作 `DieDefinition` 與 `DiceResult`。
2. 支援多顆測試骰及個別結果。
3. 加入數量上限、清空及再次投擲。
4. 壓力測試 1、4、8 顆骰子的手機表現。

### 階段 3：正式規格與素材

收到每種骰子的面數、各面內容、外觀和結果規則後：

1. 建立正式模型與貼圖。
2. 建立各骰子的朝上面對應表。
3. 以單元測試驗證每一面的旋轉方向與結果。
4. 壓縮模型及貼圖並重新執行手機驗收。

### 階段 4：遊戲規則與重骰

1. 將結果解讀放入獨立 `diceRules` 模組。
2. 依正式規格加入可重骰條件、選取方式和結果摘要。
3. 規則介面只接收 `DiceResult[]`，不直接依賴 Three.js 或 Rapier。

## 6. 建議檔案結構

```text
src/
├── components/dice/
│   ├── DiceRollerOverlay.tsx
│   ├── DiceArena3D.tsx
│   ├── DiceControls.tsx
│   ├── DiceResultSummary.tsx
│   └── DiceErrorBoundary.tsx
├── features/dice/
│   ├── definitions.ts
│   ├── dicePhysics.ts
│   ├── diceRules.ts
│   └── types.ts
└── styles/dice-roller.css
```

`DiceArena3D.tsx` 只負責同步 Rapier 剛體與 Three.js mesh，不放遊戲規則。

## 7. 手機效能驗收

階段 1 和階段 2 必須使用實際手機或瀏覽器遠端除錯驗證：

- 未開啟骰盤時不下載 3D 引擎 chunk。
- 首次初始化有載入畫面，不長時間空白。
- 1、4、8 顆投擲期間操作流暢，沒有明顯長時間主執行緒阻塞。
- 全部靜止後停止動畫與物理 step，CPU 回到接近閒置。
- 進入背景時停止運算，回到前景後可正常繼續或完成判定。
- 連續開啟、投擲及關閉 10 次後，記憶體沒有持續累積趨勢。
- 不支援 WebGL/WASM 時顯示錯誤與重試，且不影響其他功能。

實際 FPS、初始化時間與記憶體門檻應在第一輪真機測試取得基準後寫入。

## 8. 下一步

1. 完成階段 0 的桌面與手機介面原型。
2. 完成階段 1 的單顆中性測試骰與 Rapier 效能基準。
3. 手機效能達標後再加入多骰。
4. 收到正式骰子規格後，再製作正式骰面、素材與規則。
