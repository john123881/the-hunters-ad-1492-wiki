# 裝備 PDF 轉 JSON 與資料庫匯入標準作業流程 (SOP)

本文件完整記錄如何從《The Hunters A.D. 1492》裝備圖鑑手冊（`Equipment Compendium`）中精準辨識牌面資訊、結構化轉換為 `data/equipment_pageX.json`，並透過腳本匯入 Cloudflare D1 資料庫的標準規範。  
未來若開啟全新對話 Session，AI 助理或開發者**讀取本文件即可無縫承襲資料契約、圖示轉換規則與結構化標準**。

---

## 一、核心原則與重要約束

1. **使用者整理資料聲明（遵守專案規則）**：
   - 介面與資料一律使用繁體中文。
   - 資料來源為 PDF 擷取整理；頁面與資料欄位必須清楚標示來源（`Equipment Compendium p.X`）。
   - **嚴禁宣稱為官方中文規則**。
2. **底部材料忽略原則**：
   - 牌面最底部的**鍛造材料 / 合成素材圖示**現階段一律**不錄入**。
3. **資料流與單一真實來源（SSOT）**：
   - `data/equipment_page1.json`、`data/equipment_page2.json` ... 為結構化原始來源。
   - 嚴禁手動編寫混亂的 SQL；必須透過 `scripts/build-seed.mjs` 統一校驗並生成 `seeds/equipment_catalog.sql`。
   - 所有 SQL 必須參數化且可重複執行（idempotent）。

---

## 二、牌面圖示與資料契約對照字典 (Icon & Rules Mapping)

### 1. 基礎屬性 (Attributes / Value Source)
- **紅色拳頭圖示**：`strength`（力量）。
- **綠色手刀/疾風圖示**：`agility`（敏捷）。
- **紫色大腦圖示**：`wisdom`（智慧）。
- **無屬性 / 單純擲骰**：`value_source: "none"`，`attribute_code: null`。

### 2. 數值欄位結構 (Action Modes)
卡牌底部的條狀數值欄（如 `[力量圖示] 3 [骰子] +2 [射程] 0 [波浪]`）：
- **骰子圖示（Dice）**：代表擲骰顆數 ➔ `dice_count: 3`。
- **準心/瞄準圖示（Modifier）**：代表判定修正 ➔ `check_modifier: 2`（若為 `-1` 則寫 `-1`）。
- **波浪/雷達圖示（Range）**：代表射程範圍
  - 若標示具體數字（如 `1-2`）：`range_type: "fixed"`，`range_min: 1, range_max: 2`（若為 `0` 則 `min: 0, max: 0`）。
  - 若標示星號（如 `*`，如法杖等魔法武器）：代表依據打出的行動卡判定距離 ➔ `range_type: "action_card"`，`range_min: null, range_max: null`。
- **多行數值**：如 `Javelins` 同時有綠色列與紅色列，必須拆成兩個 `action_modes`（`display_order: 1` 投擲、`display_order: 2` 近戰）。

### 3. 官方戰鬥特性 (Combat Traits，依規則書第 21 頁強制結算順序)
若一次攻擊觸發多種特性，依規則書規定必須按以下順序依序結算：
1. **`light`（輕武器）**：交叉雙刃圖示。輕量敏捷武器特性，可與特定行動卡連動。
2. **`area`（範圍）**：雷達同心圓圖示。攻擊影響目標格內所有人（包括友軍）。*（可選擇不啟動）*
3. **`pierce`（穿甲）**：穿孔盾牌 + 數字。降低目標對應防禦值 `numeric_value`（上限為 3）。
4. **`burn`（燃燒）**：燃燒火苗圖示。結算時目標防禦值減半（向下取整）。
5. **`poison`（中毒）**：骷髏滴液圖示。造成至少 1 傷害後，目標在其每回合開始時額外受 1 點傷害。
6. **`mighty`（破防 / 強擊）**：裂開盾牌圖示。即使未造成傷害，仍永久降低目標所有防禦 1 點（Destruction Token）。
7. **`stun`（眩暈）**：旋轉星芒圖示。造成至少 1 傷害後，目標下回合無法執行任何行動、反應或藉機攻擊。
8. **`immobilize`（定身 / 束縛）**：一圈藤蔓/繩網圖示。造成至少 1 傷害後，目標下回合無法移動。
9. **`push`（擊退）**：雙重推開箭頭。強制將目標推移 1 格拉開距離。*（可選擇不啟動）*
10. **`reload`（裝填）**：白色羽毛箭矢斜角圖示。攻擊後標記翻至 Empty，需花費 Interact 行動裝填。

### 4. 屬性修正、資源與其他被動效果 (Attribute & Resource Modifiers)
- **`strength_modifier`（力量修正）**：紅色拳頭符號。
- **`agility_modifier`（敏捷修正）**：綠色手掌/疾風符號。
- **`wisdom_modifier`（智慧修正）**：紫色大腦/法杖符號。
- **`insight_modifier`（洞察修正）**：眼睛符號。
- **`movement_modifier`（移動步數修正）**：腳印/鞋印符號。
- **`heal_health`（生命變化）**：綠色心臟 + 數字（治療）；裂開愛心 - 數字（受傷扣血）。
- **`melee_defense_modifier` / `ranged_defense_modifier` / `magic_defense_modifier`**：防禦盾牌加成。
- **`hit_modifier`（命中加成）**：準心符號。
- **`dice_modifier`（擲骰顆數修正）**：骰子符號。
- **`reroll_die`（允許重擲骰子）**：旋轉箭頭。
- **`action_card_limit_modifier`（手牌/行動上限修正）**：卡牌上限提升。
- **`offense_token_modifier`（進攻標記）**：雙刀進攻標記。
- **`enemy_dice_modifier`（敵人骰數減少）**：削弱敵人擲骰數。

### 4. 接口與榫槽結構 (Sockets & Attachments)
- **武器左側凸榫**：`sockets`
  - 近戰凸榫（小半圓）：`connector_type_code: "melee"`
  - 槍弩凸榫（一組雙三角鋸齒代表 1 個槍械接口）：`connector_type_code: "firearm"`
  - 弓類凸榫（單三角鋸齒）：`connector_type_code: "bow"`
- **配件右側凹槽**：`category_code: "weapon_attachment"`
  - 近戰凹槽（半圓凹槽）：`"attachment_connector_type_code": "melee"`
  - 符文凹槽（半橢圓凹槽）：`"attachment_connector_type_code": "rune"`
  - 弓類凹槽（單三角鋸齒）：`"attachment_connector_type_code": "bow"`
  - 槍械凹槽（雙三角鋸齒）：`"attachment_connector_type_code": "firearm"`

### 5. 持久性與使用限制標準 (Consumption & Usage)
- **正方形內標記 1（如彈丸、火藥、藥草）**：`consumption_type: "consumed_on_use"`, `usage_limit_type: "single_use"`（使用後立即消耗）。
- **圓形箭頭/循環標記（如毒油、塗抹油脂）**：`consumption_type: "consumed_after_combat"`, `usage_limit_type: "single_use"`（戰鬥後消耗）。
- **無限符號 ∞（如機鎖、強化弓臂、刀刃）**：`consumption_type: "permanent"`, `usage_limit_type: "unlimited"`（常駐生效、永久保留）。

---

## 三、JSON 資料標準結構範例

```json
[
  {
    "code": "item_spear",
    "slug": "spear",
    "name": "Spear",
    "category_code": "weapon",
    "slot_count": 3,
    "consumption_type": "permanent",
    "usage_limit_type": "unlimited",
    "description": "長矛。人物基礎力量判定，3 骰，命中 +2，距離 0。具備 2 個近戰接口。",
    "original_effect_text": "Strength: 3 dice, +2 mod, Range 0.",
    "image_url": "/images/items/spear.png",
    "edition_code": "all-in",
    "source_reference": "Equipment Compendium p.2",
    "is_published": 1,
    "sort_order": 13,
    "sockets": [
      { "slot_index": 1, "connector_type_code": "melee" },
      { "slot_index": 2, "connector_type_code": "melee" }
    ],
    "action_modes": [
      {
        "display_order": 1,
        "action_type": "damage",
        "attack_type": "melee",
        "resolution_method": "normal_attack",
        "value_source": "character_attribute",
        "attribute_code": "strength",
        "dice_count": 3,
        "check_modifier": 2,
        "range_type": "fixed",
        "range_min": 0,
        "range_max": 0,
        "description": "長矛突刺"
      }
    ],
    "effects": []
  }
]
```

---

## 四、從 PDF 轉換到資料庫的完整作業流程

### 步驟 1：建立 `data/equipment_page<N>.json`
1. 觀察該頁全部卡牌（可對照 `.cache/pdf/page-<N>.png`）。
2. 依照上述對照字典，將每張卡牌的名稱、格數、接口、行動模式、效果完整鍵入 JSON。
3. `image_url` 統一定義為：`/images/items/{slug}.png`。
4. `sort_order` 接續上一頁的編號遞增。

### 步驟 2：維護 `scripts/build-seed.mjs`
確保 `scripts/build-seed.mjs` 有載入新建立的頁面 JSON：
```javascript
const page1Items = JSON.parse(readFileSync(page1Url, 'utf8'));
const page2Items = JSON.parse(readFileSync(page2Url, 'utf8'));
const page3Items = JSON.parse(readFileSync(page3Url, 'utf8')); // 新增頁面
const items = [...page1Items, ...page2Items, ...page3Items];
```
若有新增的效果字典（`effect_definitions`），同步補齊定義。

### 步驟 3：校驗資料並生成 SQL 種子
執行資料驗證與編譯指令：
```bash
npm run data:seed
```
- 腳本會自動檢查：
  - 必填欄位是否存在。
  - `code` 與 `slug` 是否全域唯一。
  - `slot_count` 是否為 1~4。
  - `image_url` 指向的真實 PNG 圖片是否已存在於 `public/images/items/`。
- 驗證成功後，會將所有資料寫入 `seeds/equipment_catalog.sql`。

### 步驟 4：匯入本地 D1 資料庫
```bash
npm run db:seed
```
將 SQL 寫入本地 Cloudflare D1，並可透過以下指令驗證：
```bash
npx wrangler d1 execute hunters-db --local --command "SELECT COUNT(*) FROM items;"
```

---

## 五、歷史收錄進度追蹤

- **`data/equipment_page1.json`（已完成）**：共 12 件近戰武器（`javelins` ~ `cinquedea`，sort_order: 1 ~ 12）。
- **`data/equipment_page2.json`（已完成）**：共 13 件物品（`spear` ~ `shapeshifter-grease`，sort_order: 13 ~ 25）。
- **`data/equipment_page3.json`（已完成轉換）**：共 11 件物品（6 件符文附件 + 5 件遠程武器，sort_order: 26 ~ 36）。
- **`data/equipment_page4.json`（已完成轉換）**：共 9 件物品（1 件四格長弓 + 4 件弓類強化 + 4 件弓類毒油，sort_order: 37 ~ 45）。
- **`data/equipment_page5.json`（已完成轉換）**：共 10 件物品（5 件火器 + 5 件槍械強化附件，sort_order: 46 ~ 55）。
- **`data/equipment_page6.json`（已完成轉換）**：共 14 件物品（5 件護甲 + 5 件頭盔 + 4 件盾牌，sort_order: 56 ~ 69）。
- **`data/equipment_page7.json`（已完成轉換）**：共 10 件物品（7 件飾品 + 3 件魔法法杖，sort_order: 70 ~ 79）。
- **`data/equipment_page8.json`（已完成轉換）**：共 14 件物品（8 件藥草藥劑 + 3 件地雷陷阱 + 3 件投擲手榴彈，sort_order: 80 ~ 93）。
- **總計已收錄**：93 件物品結構化資料（《Equipment Compendium》全書 8 頁全部轉換完成！）。
