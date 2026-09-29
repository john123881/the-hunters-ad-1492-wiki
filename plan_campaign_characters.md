# 戰役角色面板開發計畫

> 最後更新：2026-09-29  
> 狀態：第一階段已實作（角色選擇、面板狀態、故事與初始配置）；裝備槽位待逐角核對  
> 定位：實體桌遊的角色面板與裝備面板存檔工具；忠實記錄桌面狀態，不替玩家自動執行規則。

## 1. 目標與範圍

角色面板接續現有的「馬車／地圖／角色」戰役系統，讓每個玩家席位保存自己的獵人狀態，並讓同戰役隊友唯讀查看。

第一版包含：

- 選擇獵人與自訂角色名稱。
- 記錄士氣、四項屬性、最大生命軌、當前生命及 XP 雙軌的位置。
- 記錄中毒等會跨任務保留的角色標記。
- 顯示角色正面圖；角色故事以文字呈現，初始面板配置以獨立圖片彈窗呈現。
- 將既有的獨立裝備實體從馬車移到角色槽位，或由角色歸還馬車。
- 保存槽位解鎖狀態、護甲損壞及既有附件關係。
- 本人可編輯、隊友唯讀、多人版本衝突提示與角色操作紀錄。
- 桌面與手機均可操作，網址可直接開啟指定席位。

第一版不包含：

- 戰鬥數值計算、攻擊是否合法、擲骰或傷害自動結算。
- 自動扣除 XP、自動治療、自動套用裝備效果。
- 自動根據日期處理中毒傷害。
- 角色行動卡牌組管理。這會在角色面板穩定且行動卡資料完成後另開階段。
- 依規則強制阻擋玩家修正實體桌面的狀態。網站提供警示與確認，但仍允許補登與更正。

## 2. 已核對的資料來源

### 2.1 實體素材

`campaign_characters/` 目前有九組獵人素材：

| hero slug | 正面照片 | 背面配置 | 人物透明圖 |
| --- | --- | --- | --- |
| `brawler` | `brawler1.jpg` | `brawler2.jpg` | `brawler.png` |
| `crossbowman` | `crossbowman1.jpg` | `crossbowman2.jpg` | `crossbowman.png` |
| `cutthroat` | `cutthroat1.jpg` | `cutthroat2.jpg` | `cutthroat.png` |
| `huntress` | `huntress1.jpg` | `huntress2.jpg` | `huntress.png` |
| `landsknecht` | `landsknecht1.jpg` | `landsknecht2.jpg` | `landsknecht.png` |
| `man-at-arms` | `man-at-arms1.jpg` | `man-at-arms2.jpg` | `man-at-arms.png` |
| `medic` | `medic1.jpg` | `medic2.jpg` | `medic.png` |
| `sorceress` | `sorceress1.jpg` | `sorceress2.jpg` | `sorceress.png` |
| `witch` | `witch1.jpg` | `witch2.jpg` | `witch.png` |

另有 `full_board_reference.jpg`，可作為角色板與共用裝備板的比例及版面參考。

注意事項：

- 規則彙編的配件頁列出 5 塊 Hero Board，但素材目錄有 9 組角色；因此不能直接把九位都標成同一核心盒內容。實作時只標示為「目前可用素材」，核心／擴充來源需另行核對。
- 照片中的中文名稱屬於實體素材內容。網站的文字欄位要另外人工核對，不能以 OCR 結果當成正式資料。
- 正面照片是正式角色板的視覺基準。使用 ImageGen 只清除上方中文職業與姓名，保留原本直式構圖、角色立繪、材質、圖示、軌道、數字與孔位。
- 九位正面角色板統一輸出尺寸與外框位置，互動熱點由同一套 HTML/SVG/CSS 座標覆蓋。角色姓名、職業與故事由角色資料及介面呈現。
- 背面原圖只作為資料來源，不直接出現在介面。角色故事轉錄為繁體中文文字；下半部起始物品與槽位配置裁成統一的 `900 × 900` 初始面板圖。每位角色仍須逐一人工核對後才可進入正式規格表。
- 初始面板圖位於 `campaign_characters/normalized/*-initial-layout.webp`，完整背面 WebP 不再作為網站資產。
- 角色故事存放於 `campaign_characters/character-stories.zh-TW.json`，九位繁體中文文字已由使用者確認，狀態為 `VERIFIED`。

### 2.2 規則彙編

`Rules_Compendium_EN_small.pdf` 已確認的角色面板規則：

- 屬性包含 Strength、Agility、Perception、Knowledge 與最大 Health。
- 四項屬性軌的等級為 0～4，最大 Health 軌為 0～5；面板格內數字是推進到下一格所需 XP，不等於屬性值。
- 提升最大 Health 時，當前 Health 同步提高相同格數；但本工具第一版只提示，不自動強制連動。
- 當前 Health 不可高於最大 Health；第一版顯示警示並允許玩家更正。
- Morale 軌下方兩格為低士氣區，上方可用格數依角色而異。
- XP 可用於屬性、行動卡池及裝備槽位。
- 裝備槽封板分成「支付指定 XP 後可開啟」與「永久不可開啟」。
- 裝備類型各有對應槽位；背包類物品通常占 1 格，護甲占 2 格，其餘占用格數依物品資料。
- 護甲可能具有損壞標記，現有系統已把護甲限制為完好／損壞。
- 中毒會跨任務保留，適合列入角色持久狀態。

### 2.3 現有系統

必須沿用：

- `campaign_players(campaign_id, player_number)`：玩家席位與 Session 權限來源。
- `campaign_equipment_instances`：每一張實體裝備卡的唯一實例。
- `campaign_equipment_attachments`：裝備附件關係。
- `items` 及其分類、格數、圖片與說明：裝備選擇器的資料來源。
- 現有共用 JSON 錯誤格式、樂觀鎖版本處理、toast 與手機側欄模式。
- 重要資料更新與 activity log 使用同一個 D1 batch。

不得另建一套 `campaign_character_equipment` 複製物品；否則馬車與角色會出現兩份互相不同步的裝備實體。

## 3. 先完成角色規格資料

新增 `shared/heroesData.ts`，只保存不隨戰役改變的角色版圖定義。資料必須由照片逐一核對，不由前端自行猜測。

建議契約：

```ts
type TrackStep = {
  level: number;
  xpCost: number | null; // null 表示此角色無法到達
};

type SlotBlueprint = {
  slotKey: string;
  category: 'WEAPON' | 'ADDITION' | 'HELMET' | 'ARMOR' | 'ACCESSORY' | 'BACKPACK';
  index: number;
  capacity: 1 | 2 | 3;
  initialState: 'OPEN' | 'LOCKED' | 'BLOCKED';
  unlockXp: number | null;
};

type HeroDefinition = {
  slug: string;
  displayNameZh: string;
  displayNameEn: string;
  sourceSet: 'CORE' | 'EXPANSION' | 'UNKNOWN';
  portraitUrl: string;
  boardFrontReferenceUrl: string;
  initialLayoutImageUrl: string;
  storyZhTw: string;
  storyVerified: boolean;
  starting: {
    moralePosition: number;
    strengthLevel: number;
    knowledgeLevel: number;
    perceptionLevel: number;
    agilityLevel: number;
    maxHealthLevel: number;
    currentHealth: number;
    xpTens: number;
    xpOnes: number;
  };
  tracks: {
    moralePositions: number;
    strength: TrackStep[];
    knowledge: TrackStep[];
    perception: TrackStep[];
    agility: TrackStep[];
    maxHealth: TrackStep[];
  };
  slots: SlotBlueprint[];
  startingEquipment: Array<{
    itemSlug: string;
    slotKey: string;
    verified: boolean;
  }>;
};
```

### 規格核對清單

每位角色均要填寫並人工確認：

- [ ] 中文顯示名稱與英文名稱。
- [ ] 所屬核心盒／擴充。
- [ ] 士氣總格數及起始位置。
- [ ] 四項屬性起始等級、每級 XP 成本與不可達格。
- [ ] 最大生命起始等級、每級 XP 成本與當前生命起始值。
- [ ] 每個裝備槽的類型、位置、容量與 `OPEN／LOCKED／BLOCKED`。
- [ ] 可解鎖槽位的 XP 數字。
- [ ] 起始裝備名稱、圖鑑 slug、放置槽位及起始金幣。
- [ ] 正面圖片方向與裁切範圍。
- [x] 繁體中文角色故事逐字校對。
- [ ] 初始面板裁切圖完整包含起始物品、槽位、10／X 封板與實體錢幣。

未確認欄位必須標記 `UNKNOWN` 或 `verified: false`，不可用猜測值初始化正式戰役。

## 4. 資料模型

新增 migration：`migrations/0020_create_campaign_characters.sql`。

### 4.1 角色主表

```sql
CREATE TABLE campaign_characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  player_number INTEGER NOT NULL CHECK (player_number BETWEEN 1 AND 4),
  hero_slug TEXT NOT NULL,
  custom_name TEXT NOT NULL DEFAULT '',

  morale_position INTEGER NOT NULL,
  strength_level INTEGER NOT NULL,
  knowledge_level INTEGER NOT NULL,
  perception_level INTEGER NOT NULL,
  agility_level INTEGER NOT NULL,
  max_health_level INTEGER NOT NULL,
  current_health INTEGER NOT NULL,
  xp_tens INTEGER NOT NULL DEFAULT 0 CHECK (xp_tens BETWEEN 0 AND 60 AND xp_tens % 10 = 0),
  xp_ones INTEGER NOT NULL DEFAULT 0 CHECK (xp_ones BETWEEN 0 AND 9),
  is_poisoned INTEGER NOT NULL DEFAULT 0 CHECK (is_poisoned IN (0, 1)),
  notes TEXT NOT NULL DEFAULT '',

  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE (campaign_id, player_number),
  UNIQUE (campaign_id, hero_slug),
  FOREIGN KEY (campaign_id, player_number)
    REFERENCES campaign_players(campaign_id, player_number)
    ON DELETE CASCADE
);
```

設計原則：

- 保存木方塊所在的「位置／等級」，XP 成本與顯示文字由角色規格推導。
- 不重複保存 `max_hp`；最大生命的實際上限由角色規格及 `max_health_level` 推導。
- 同一戰役不可同時選擇相同獵人。
- 所有數值仍需由 API 依對應角色規格驗證範圍，不能只依資料庫通用 CHECK。
- 選角後若要換角，必須先處理身上裝備，並用明確確認流程，不能直接覆蓋。

### 4.2 槽位狀態

只保存會隨戰役改變的狀態：

```sql
CREATE TABLE campaign_character_slots (
  character_id INTEGER NOT NULL REFERENCES campaign_characters(id) ON DELETE CASCADE,
  slot_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'LOCKED', 'BLOCKED')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (character_id, slot_key)
);
```

槽位類型、容量及解鎖 XP 留在 `heroesData.ts`。初始化時複製當下狀態，之後只更新狀態，不重複保存顯示名稱與類別。

### 4.3 裝備實體位置

沿用 `campaign_equipment_instances`，新增角色槽位欄位：

- `character_id` 指向 `campaign_characters.id`。
- 新增 `character_slot_key TEXT`。
- `location_type = 'CHARACTER'` 時兩者皆不可為空。
- `location_type = 'WAGON'` 時兩者皆為空。
- 同一角色同一槽位只容許一個主裝備實體；多格裝備由裝備格數及槽位占用規則驗證。
- 附件仍保留在 `campaign_equipment_attachments`，不轉存 JSON。
- 損壞與備註繼續留在裝備實體本身，移動時不丟失。

SQLite 無法安全地直接補上所有外鍵限制；migration 應重建 `campaign_equipment_instances`，搬移既有資料，再重建 index。migration 必須先在現有本機 D1 副本驗證資料筆數及附件關係。

### 4.4 操作紀錄

```sql
CREATE TABLE character_activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  actor_player_number INTEGER NOT NULL,
  target_player_number INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

角色狀態、角色版本、裝備位置與相關 log 必須在同一個 D1 batch 成功或一起失敗。

## 5. API 與權限

新增 `server/characters.ts`，掛載在 `/api/campaign/characters`。

### 5.1 讀取

- `GET /api/campaign/characters`
  - 回傳四個席位摘要、是否已有角色、角色名稱、獵人類型、目前生命／士氣摘要。
- `GET /api/campaign/characters/:playerNumber`
  - 回傳單一角色完整面板、槽位、裝備實體、附件及可供 UI 使用的角色規格。
  - 同戰役所有已登入玩家可讀取。

### 5.2 建立與基本資料

- `POST /api/campaign/characters`
  - Body：`{ heroSlug, customName }`
  - 目標席位只取 Session 的 `playerNumber`。
  - 驗證角色規格已完整核對、同戰役未被選用。
  - 使用 batch 建立角色、槽位、確認存在的起始裝備及 log。
- `PATCH /api/campaign/characters/:playerNumber`
  - Body 包含要修改的軌道位置、狀態、備註與 `expectedVersion`。
  - 只允許本人。
  - API 驗證各軌範圍，但對「目前生命高於最大生命」等桌面不一致狀態回傳可理解的驗證錯誤；前端可讓玩家先修正另一軌。
- `POST /api/campaign/characters/:playerNumber/change-hero`
  - 不列入首個切片；等角色建立流程穩定後再做。
  - 必須要求角色身上無裝備，或明確選擇全部歸還馬車。

### 5.3 槽位與裝備

- `PATCH /api/campaign/characters/:playerNumber/slots/:slotKey`
  - Body：`{ status, expectedVersion }`
  - 第一版僅記錄解鎖結果，不自動扣 XP。
  - 從 `BLOCKED` 開啟時回傳驗證錯誤。
- `POST /api/campaign/characters/:playerNumber/equipment/move`
  - Body：`{ equipmentInstanceId, to: { type: 'CHARACTER', slotKey } | { type: 'WAGON' }, expectedCharacterVersion, expectedWagonVersion }`
  - 驗證實體屬於同戰役、槽位已開啟、類型與容量可放置。
  - 馬車與角色版本、裝備位置、wagon log、character log 使用同一個 D1 batch。
  - 成功回傳更新後的角色及馬車版本，避免前端再猜狀態。

### 5.4 錯誤格式

延續既有 JSON 格式，至少區分：

- `CHARACTER_NOT_FOUND`
- `CHARACTER_READ_ONLY`
- `HERO_ALREADY_TAKEN`
- `HERO_DEFINITION_INCOMPLETE`
- `CHARACTER_VERSION_CONFLICT`
- `WAGON_VERSION_CONFLICT`
- `SLOT_LOCKED`
- `SLOT_BLOCKED`
- `INVALID_SLOT_TYPE`
- `SLOT_CAPACITY_EXCEEDED`
- `EQUIPMENT_NOT_AVAILABLE`

## 6. 前端資訊架構

現有 `CampaignCharactersPage.tsx` 只有席位頁籤與預覽空狀態。逐步擴充，不一次把所有控制塞進單一元件。

建議結構：

```text
src/pages/CampaignCharactersPage.tsx
src/components/characters/CharacterRosterTabs.tsx
src/components/characters/CharacterSetupPanel.tsx
src/components/characters/HeroBoard.tsx
src/components/characters/TrackControl.tsx
src/components/characters/EquipmentBoard.tsx
src/components/characters/EquipmentSlot.tsx
src/components/characters/EquipmentPickerDrawer.tsx
src/components/characters/CharacterActivityLog.tsx
src/hooks/useCharacterEditor.ts
```

### 6.1 路由與席位

- `/campaigns/characters` 導向登入者的席位。
- `/campaigns/characters/:playerNumber` 可重整並分享給同戰役玩家。
- 本人顯示「你的角色」及編輯控制。
- 隊友顯示「唯讀」；後端仍需再次驗證權限。
- 從缺席位顯示空狀態，不建立假角色資料。

### 6.2 尚未選角

本人空角色頁顯示九位目前可用素材，但：

- 已被同戰役選走的角色停用並顯示玩家。
- 規格尚未核對完成的角色顯示「資料整理中」，不可建立。
- 點擊角色先顯示正面、說明、起始刻度、起始裝備與槽位摘要。
- 最後以確認對話框建立角色，避免誤選。

### 6.3 角色資料輔助內容

角色摘要區提供兩個明確按鈕：

- **角色故事**：開啟可關閉的 dialog，只顯示角色名稱、職業與繁體中文故事文字，不載入背面照片。
- **初始面板**：開啟圖片 dialog，顯示對應的 `900 × 900` 初始物品與槽位配置圖；支援放大檢視、Esc 關閉、焦點回到觸發按鈕。
- 兩個 dialog 在手機上使用接近全螢幕的安全區版面，背景捲動鎖定。
- 隊友唯讀模式也能查看這兩項資料。
- 故事文字或面板資料尚未校對完成時顯示「資料待核對」，不把未確認內容當成正式規則。

### 6.4 角色主板

- 保留實體板的直覺：左側士氣、中央屬性、底部當前生命。
- 每條軌道都用語意化按鈕顯示所有可達格，不用把控制畫進照片。
- 點擊格子先更新草稿，統一由固定操作列「儲存」。
- 顯示「尚未儲存」、儲存中、已儲存與版本衝突。
- 關閉或切換席位前若有草稿，提示是否放棄。
- XP 成本顯示在格子旁，清楚標為「升至此級所需 XP」。
- 手機版不縮成無法點擊的整塊桌板；改成可折疊的「生命與士氣／屬性／XP」區塊，每個觸控目標至少 44px。

### 6.5 裝備板

- 桌面可用接近實體比例的兩欄板面。
- 手機依類別垂直排列武器、強化、頭盔、護甲、飾品與背包。
- 空槽位點擊後開啟物品選擇抽屜，預設只列馬車內可移動的裝備實體。
- 選擇器顯示卡號、名稱、圖片、格數、損壞與附件摘要，並支援搜尋。
- 已裝備項目提供「查看圖鑑」、「移回馬車」；護甲沿用完好／損壞狀態。
- `LOCKED` 顯示所需 XP 與「標記為已解鎖」；確認文案明確說明網站不會自動扣 XP。
- `BLOCKED` 只顯示，不可操作。
- 多格裝備先採「選擇起始槽後由系統標示占用範圍」，避免拖曳在手機上難以操作。
- 拖放只能作為桌面增強功能，不能是唯一操作方式。

### 6.6 狀態與紀錄

- 角色頁頂部摘要顯示目前生命、士氣、XP、中毒與未儲存狀態。
- 中毒採明確切換與確認，不由馬車日期自動扣血。
- 最近操作紀錄放在頁尾，可依類型篩選。
- 隊友預設可看到目前角色狀態；詳細 before/after log 第一版只顯示本人。

## 7. 開發階段

### Phase 0：角色資料盤點與規格驗證

產出：

- `shared/heroesData.ts`
- `docs/character-source-audit.md`
- `campaign_characters/character-stories.zh-TW.json`
- `campaign_characters/normalized/*-initial-layout.webp`
- 九位角色核對表
- 正面最佳化版本、初始面板裁切圖與 asset manifest

完成條件：

- 至少一位角色的正反面、起始刻度、槽位與起始裝備全部人工確認。
- 不確定資料有明確標記，不進入正式初始化。
- 確認現有 `items` 中能否對應其起始裝備。

### Phase 1：垂直切片，只完成一位角色

產出：

- migration 0020
- 共用型別
- 單一角色建立／讀取／更新 API
- 一位已驗證角色的選角、軌道編輯、手機介面
- 角色 version 與 activity log

目的：

先驗證資料形狀、權限、草稿儲存及實際操作，不在規格尚未穩定時一次建立九位錯誤資料。

### Phase 2：九位角色與唯讀隊友檢視

產出：

- 所有已核對角色規格
- 席位選角防重
- 四席摘要
- 隊友唯讀頁
- 角色更換前置檢查

### Phase 3：裝備板與馬車搬移

產出：

- 裝備實體 schema 調整
- EquipmentBoard 與 EquipmentPickerDrawer
- 馬車 ↔ 角色原子搬移
- 槽位開啟／鎖定／永久封閉
- 多格占用、損壞與附件保留
- 雙方 activity logs

### Phase 4：體驗補強與驗收

產出：

- 手機固定儲存列與背景捲動鎖定
- 網路錯誤、Session 失效、版本衝突及驗證錯誤的不同提示
- iPhone 直向／橫向、Android 小螢幕視覺測試
- 鍵盤操作、焦點、對比與 reduced motion 驗證
- README 與 migration/schema notes 更新

### Phase 5：角色行動卡（後續獨立工作）

啟動條件：

- 行動卡卡號、角色歸屬、起始／進階、XP 成本及圖片來源已完成結構化資料。
- 角色面板 API 與版本衝突流程穩定。

此階段才新增行動卡資料表與牌池介面，避免用手打卡號或未驗證的固定陣列。

## 8. 測試與驗收

### 8.1 API 與 D1 整合

測試必須走實際 Hono → D1，不使用 mock 冒充整合測試：

- 建立本人角色並依角色規格初始化。
- 同戰役重複選角被拒絕。
- 隊友可讀取但無法修改。
- 軌道越界、不可達等級及錯誤版本被拒絕。
- 角色狀態與 log 同批成功。
- 裝備由馬車移到角色後只剩同一個實體 ID。
- 裝備搬移保留損壞、備註及附件。
- 裝備搬移失敗時，馬車、角色與 log 均不留下半套資料。
- 鎖定、永久封閉、類型錯誤及容量不足的槽位被拒絕。

### 8.2 瀏覽器功能

- 選角、取消及確認流程。
- 軌道草稿、尚未儲存、放棄修改與成功回饋。
- 本人編輯與隊友唯讀。
- 裝備搜尋、放入槽位、查看詳情與歸還馬車。
- 版本衝突後重新載入。
- 指定席位網址可直接開啟與重新整理。

### 8.3 視覺與無障礙

固定驗證：

- 桌面寬螢幕。
- iPhone 直向與橫向。
- Android 小螢幕。
- 200% 縮放。
- 鍵盤依序操作所有軌道與槽位。
- 焦點框不遮住數值，文字對比足夠，減少動畫模式不播放裝飾動畫。

### 8.4 每階段指令

- `npm run typecheck`
- `npm run build`
- Hono → 本機 D1 整合測試
- `npm run test:visual`（介面階段）

## 9. 開始實作前的決策清單

以下項目必須在對應階段開始前確認：

1. 九位素材各自屬於核心盒或哪個擴充。
2. 九位角色的正式中文／英文顯示名稱。
3. 第一個垂直切片要使用哪位資料最完整的角色；目前建議先用 `landsknecht`，因為已有完整正面、背面及全板參考照。
4. 角色起始裝備是否已存在於 `items`，且 slug 是否正確。
5. 槽位允許類型與多格占用的精確對應。
6. 詳細角色 activity log 是否允許隊友查看。
7. 玩家是否可以手動標記任意 `LOCKED` 槽位為已解鎖；本計畫預設可以，但會顯示 XP 提醒且不自動扣除。
8. 換角時身上裝備的處理方式；本計畫預設必須先全部歸還馬車。

## 10. 建議的第一個可交付版本

第一個可實際檢查的版本只做一位角色，但走完整資料鏈：

1. 玩家在自己的席位選擇已驗證的 Landsknecht。
2. API 在 D1 建立角色、槽位及 log。
3. 角色頁顯示士氣、屬性、最大生命、當前生命、XP 與中毒。
4. 玩家修改多項數值後一次儲存。
5. 隊友開啟同一角色時只能查看。
6. 手機可以完成相同操作。
7. 重新整理後資料保持一致。
8. 第二台裝置造成版本衝突時可理解地提示並重新載入。

完成這個垂直切片並由實際畫面確認後，再擴充到其餘角色與裝備搬移，可大幅降低整批重做角色資料及版面的風險。
