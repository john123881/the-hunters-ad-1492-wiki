# 角色裝備預覽優化實施計畫 (Equipment Preview Implementation Plan)


> 實作狀態：已完成（2026-10-11）
>
> 實際採用共用 `EquipmentCandidatePreview`／`EquipmentCandidateThumbnail` 元件。候選清單改為獨立捲動，選中預覽固定在抽屜底部；桌面放大圖使用固定定位避開抽屜 overflow 裁切，並支援滑鼠 Hover 與鍵盤焦點。手機版沿用專案既有的 700px 斷點，另針對橫向低高度視窗縮小預覽。選中圖片會先經過共用 `preloadImage()` 解碼，再顯示完整比例圖片；載入失敗時顯示圖示 fallback。


本文件規劃角色裝備面板（`CharacterEquipmentBoard`）在選擇更換／裝備時的預覽優化方案。

## 1. 背景與現有問題

1. **縮圖過小且變形**：
   - 抽屜候選清單（`.equipment-candidate-list`）中的裝備圖被硬性限制為 `72px × 72px`（`object-fit: contain`）。
   - 裝備卡原圖多為高長型（特別是 2 格武器如斗劍、長矛），在 72px 內被嚴重縮小，導致卡片下方的**擲骰圖示、攻擊射程、傷害與附帶效果**完全無法辨識。
2. **操作體驗差異**：
   - **桌面端（電腦）**：滑鼠游標移動敏捷，若每次想看細節都要切換頁面或點開彈窗，操作流暢度會被打斷；使用懸停放大鏡（Hover Tooltip Zoom）體驗最佳。
   - **觸控端（手機／平板）**：沒有原生精確 hover，點擊候選清單後，使用者需要一處穩定清晰的「大圖與數值摘要區」，看清卡片效果無誤後再按「確認放置」。

---

## 2. 解決方案架構

依據裝置特性採用響應式雙軌設計：

```text
┌────────────────────────────────────────────────────────┐
│               裝備抽屜 (.equipment-drawer)              │
│                                                        │
│  [搜尋框 / 馬車或圖鑑 Tab]                                │
│                                                        │
│  ┌─ 候選清單 (.equipment-candidate-list) ───────────┐  │
│  │ 斗劍 #28  [72px縮圖] ──(桌面 Hover)──> [高解析放大鏡] │
│  │ 獵刀 #03  [72px縮圖]                                │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ▼ 點擊選中（手機 / 平板 / 桌面皆生效）                 │
│  ┌─ 抽屜底部展開預覽 (.equipment-selected-preview) ──┐  │
│  │  ┌──────────┐  斗劍 #28                             │
│  │  │          │  類別：近戰武器 · 占 2 格              │
│  │  │  大尺寸   │  預覽占用：HAND_1、HAND_2             │
│  │  │  完整比例 │  [確認從馬車放置 / 確認更換] 按鈕     │
│  │  └──────────┘                                      │
│  └─────────────────────────────────────────────────────┘
└────────────────────────────────────────────────────────┘
```

- **方案 A（電腦版 - Hover 高解析放大鏡）**：
  - 判定條件：CSS `@media (hover: hover) and (pointer: fine)`。
  - 行為：滑鼠移動到清單項目的縮圖時，浮出 `width: 240px` 的高清大圖預覽窗。
  - 特性：`pointer-events: none`、高 z-index、煤黑微透光底色與金邊，不干擾原本的點擊流程。
- **方案 B（手機／平板版 - 抽屜選中展開大圖與摘要區）**：
  - 判定條件：使用者點擊選中候選項目（`preview` 或 `catalogPreview` 存在）。
  - 行為：在抽屜底部 `footer` 展開 `.equipment-selected-preview` 區塊。
  - 特性：
    - 展示自適應高度（`max-height: 180px~220px`）的完整比例卡片圖，不再擠在正方形框內。
    - 右側／下方附帶結構化摘要（名稱、ID、類別、格數、毀損標記、占用孔位預覽）。
    - 底部放置醒目的主要操作按鈕（`確認更換` / `確認從馬車放置`）。

---

## 3. 具體修改檔案與改動細節

### 3.1 前端邏輯：`src/components/CharacterEquipmentBoard.tsx`

#### (1) 清單項目的縮圖包裝與 Hover 放大結構
- **修改位置**：`CharacterEquipmentBoard.tsx` 的 `.equipment-candidate-list` 渲染迴圈（Wagon 候選與 Catalog 候選兩處）。
- **改動方式**：
  - 將原 `<img src={item.imageUrl} alt="" />` 改為包裝在 `<div className="equipment-candidate-thumb-wrap">` 中。
  - 內部加入：
    ```tsx
    <div className="equipment-candidate-thumb-wrap">
      {item.imageUrl ? <img src={item.imageUrl} alt={item.name} loading="lazy" /> : <PackageOpen />}
      {item.imageUrl && (
        <div className="equipment-candidate-hover-zoom" aria-hidden="true">
          <img src={item.imageUrl} alt="" />
        </div>
      )}
    </div>
    ```

#### (2) 抽屜底部選中預覽區塊（手機／平板／桌面通用展開）
- **修改位置**：`CharacterEquipmentBoard.tsx` 的 `.equipment-drawer > footer`。
- **改動方式**：
  - 當 `preview` 或 `catalogPreview` 有值時，將純文字 `<p>預覽占用：...</p>` 升級為結構化預覽元件：
    ```tsx
    {preview && pickerSource === 'WAGON' && (
      <footer className="equipment-drawer-footer">
        <div className="equipment-selected-preview">
          {preview.imageUrl && (
            <div className="equipment-preview-card-frame">
              <img src={preview.imageUrl} alt={preview.name} />
            </div>
          )}
          <div className="equipment-preview-details">
            <div className="equipment-preview-header">
              <strong>{preview.name}</strong>
              <span className="equipment-preview-id">#{preview.instanceId}</span>
            </div>
            <div className="equipment-preview-meta">
              <span className="badge">{preview.categoryName}</span>
              <span className="badge">占 {preview.slotCount} 格</span>
              {preview.damageMarkers ? <span className="badge danger">已毀損</span> : null}
            </div>
            <p className="equipment-preview-slots">
              預覽占用：<strong>{preview.previewSlotKeys.join('、')}</strong>
            </p>
            {preview.notes && <p className="equipment-preview-notes">{preview.notes}</p>}
          </div>
        </div>
        <button
          className="button primary full-width"
          type="button"
          disabled={busy}
          onClick={() => void confirmEquip()}
        >
          {replacementTarget ? '確認更換裝備' : '確認從馬車放置'}
        </button>
      </footer>
    )}
    ```
  - `CATALOG` 分頁亦套用相同預覽結構，標註「圖鑑新增」。

---

### 3.2 樣式系統：`src/styles/equipment-board.css`

#### (1) 縮圖容器與桌面懸停放大鏡
```css
/* 縮圖外框 */
.equipment-candidate-thumb-wrap {
  position: relative;
  width: 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 僅在支援精確滑鼠懸停的環境啟用浮動放大鏡 */
@media (hover: hover) and (pointer: fine) {
  .equipment-candidate-hover-zoom {
    display: none;
    position: absolute;
    left: 84px;
    top: 50%;
    transform: translateY(-50%);
    width: 240px;
    max-height: 340px;
    padding: 6px;
    background: rgba(9, 18, 20, 0.96);
    border: 1px solid #d6ae55;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8), 0 0 12px rgba(214, 174, 85, 0.3);
    border-radius: 4px;
    z-index: 100;
    pointer-events: none;
  }

  .equipment-candidate-hover-zoom img {
    width: 100%;
    height: auto;
    max-height: 320px;
    object-fit: contain;
    display: block;
  }

  /* 滑鼠移入時顯示 */
  .equipment-candidate-thumb-wrap:hover .equipment-candidate-hover-zoom,
  .equipment-candidate-list button:hover .equipment-candidate-hover-zoom {
    display: block;
  }
}
```

#### (2) 抽屜選中展開區（手機／平板響應式優化）
```css
/* 抽屜底部擴展為直向卡片式佈局 */
.equipment-drawer-footer {
  position: sticky;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
  border-top: 1px solid #695830;
  background: rgba(8, 17, 19, 0.98);
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.6);
}

.equipment-selected-preview {
  display: flex;
  gap: 14px;
  align-items: center;
  background: rgba(13, 25, 27, 0.85);
  border: 1px solid #4a5c5e;
  padding: 10px 12px;
  border-radius: 4px;
}

.equipment-preview-card-frame {
  flex-shrink: 0;
  width: 90px;
  max-height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #060c0d;
  border: 1px solid #756338;
}

.equipment-preview-card-frame img {
  width: 100%;
  height: auto;
  max-height: 140px;
  object-fit: contain;
}

.equipment-preview-details {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.equipment-preview-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.equipment-preview-header strong {
  font-size: 16px;
  color: #f5eedb;
}

.equipment-preview-id {
  font-size: 13px;
  color: #d6ae55;
  font-family: var(--serif);
}

.equipment-preview-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.equipment-preview-meta .badge {
  font-size: 12px;
  padding: 2px 6px;
  background: #17282b;
  border: 1px solid #36494b;
  color: #9fb0ae;
}

.equipment-preview-meta .badge.danger {
  border-color: #8f3434;
  color: #ff9e9e;
}

.equipment-preview-slots {
  margin: 0;
  font-size: 13px;
  color: #d8c8a7;
}

/* 行動版與窄螢幕（max-width: 600px）調整 */
@media (max-width: 600px) {
  .equipment-selected-preview {
    gap: 10px;
    padding: 8px;
  }
  .equipment-preview-card-frame {
    width: 76px;
    max-height: 120px;
  }
}
```

---

## 4. 驗證與測試計畫

1. **TypeScript 型別安全**：
   - 執行 `npm run typecheck` 確保無任何型別錯誤。
2. **單元與整合測試**：
   - 執行 `npm test` 確認既有測試全數通過。
3. **瀏覽器實機與模擬驗證**：
   - **桌面瀏覽器**：滑鼠游標懸停在裝備縮圖上，驗證 240px 放大鏡是否順暢顯示，卡片底部的骰子與文字是否銳利可讀；確認點擊依然能正常選中。
   - **手機／平板模擬（DevTools Touch Simulation & 窄螢幕）**：
     - 點擊任一裝備（如斗劍），抽屜下方順暢展開大圖與詳細標籤。
     - 驗證「確認放置」或「確認更換」按鈕在 iOS 安全區域（Safe Area）及直立／橫向畫面皆無遮擋。
     - 點擊「確認放置」後成功寫入後端 API，關閉抽屜並正常裝備至角色面板。
