# The Hunters AD 1492 — 物品圖鑑 Schema Notes

## 1. 文件目的

本文件定義第一階段「物品圖鑑、篩選、查詢與合成資訊」的資料模型，供 Coding Agent 建立 Cloudflare D1／SQLite migrations、TypeScript 型別與 API 使用。

第一階段不包含帳號、隊伍、角色持有物、裝備盤擺放、戰役紀錄與實際使用次數。這些功能日後應以角色物品實例關聯本文件中的 `items`。

## 2. 核心設計原則

1. `items` 儲存所有物品共用資料，不放各類物品的特殊面板數值。
2. 所有同類物品固定具有的面板數值，放在專屬規格表。
3. 一件物品可執行的攻擊、控制或其他判定，放在 `item_action_modes`。
4. 數量不固定的正面、負面與特殊能力，放在 `item_effects`。
5. 保存 `original_effect_text`，結構化效果不能取代牌面原文。
6. 不建立 `effect_1`、`effect_2`、`effect_3` 等固定欄位。
7. JSON 只用於極少數無法用共通欄位描述的效果參數，不應作為主要查詢資料。
8. 武器的攻擊模式與附件接口是不同概念，必須分開建模。
9. 所有列舉代碼使用英文穩定代碼，前端另行顯示繁體中文名稱。

## 3. Migration 建議順序

```text
migrations/
├── 0001_create_catalog_core.sql
├── 0002_create_item_profiles.sql
├── 0003_create_item_effects.sql
├── 0004_create_crafting.sql
├── 0005_create_catalog_indexes.sql
└── 0006_seed_catalog_lookups.sql
```

所有 migration 應啟用外鍵：

```sql
PRAGMA foreign_keys = ON;
```

## 4. 物品主資料

### 4.1 `item_categories`

物品的主要語意分類。一件物品第一版只有一個主要分類。

建議初始代碼：

| code | 中文名稱 | 裝備區域 |
|---|---|---|
| `weapon` | 武器 | 武器／盾牌區 |
| `shield` | 盾牌 | 武器／盾牌區 |
| `weapon_attachment` | 武器附件 | 武器附件區 |
| `helmet` | 頭盔 | 頭盔區 |
| `armor` | 上衣／護甲 | 衣服區 |
| `accessory` | 飾品 | 飾品區 |
| `utility` | 一般道具 | 道具區 |
| `consumable` | 消耗道具 | 道具區 |
| `trap` | 陷阱 | 道具區 |
| `grenade` | 投擲物／炸彈 | 道具區 |
| `material` | 合成材料 | 不一定可裝備 |

分類與裝備區域不要視為同一概念。例如 `weapon` 與 `shield` 是不同分類，但都能放入武器／盾牌區。

### 4.2 `items`

建議欄位：

| 欄位 | 用途 |
|---|---|
| `id` | 主鍵 |
| `code` | 穩定內部代碼，唯一 |
| `slug` | 網址代碼，唯一 |
| `name` | 顯示名稱 |
| `category_id` | 主要分類 |
| `slot_count` | 占用格數，目前允許 1～4 |
| `consumption_type` | 物品何時消失 |
| `usage_limit_type` | 使用次數限制 |
| `description` | 一般說明 |
| `original_effect_text` | 牌面原始效果文字 |
| `image_url` | 圖片位置；資料庫只存 URL／物件鍵，不存圖片二進位 |
| `language_code` | 預設 `zh-TW` |
| `edition_code` | 遊戲版本，可為空 |
| `source_reference` | PDF 頁碼、牌號或資料來源 |
| `is_published` | 是否在公開圖鑑顯示，SQLite 使用 0/1 |
| `sort_order` | 自訂排序 |
| `created_at`、`updated_at` | ISO 8601 UTC 時間字串 |

目前物品都是直向、寬度固定為一格，因此 `slot_count` 是唯一尺寸來源。不要同時保存 `grid_height` 造成重複。未來若出現 2×2 等形狀，再 migration 加入寬、高與形狀資料。

### 4.3 物品持久性

「何時消失」與「多久能用一次」是兩個不同維度。

`consumption_type`：

| code | 意義 |
|---|---|
| `permanent` | 永久保留 |
| `consumed_on_use` | 使用後立即消失 |
| `consumed_after_combat` | 使用後維持到本場戰鬥結束，再消失 |

`usage_limit_type`：

| code | 意義 |
|---|---|
| `unlimited` | 無使用次數限制或被動效果 |
| `single_use` | 只能使用一次 |
| `once_per_combat` | 每場戰鬥一次，物品本身不一定消失 |

範例：

| 物品 | consumption_type | usage_limit_type |
|---|---|---|
| 藥草 | `consumed_on_use` | `single_use` |
| 火焰符文 | `permanent` | `once_per_combat` |
| 油脂 | `consumed_after_combat` | `single_use` |
| 永久項鍊 | `permanent` | `unlimited` |

## 5. 武器與行動模式

### 5.1 `weapon_specs`

一對一關聯 `items`，只用來確認該物品具有武器規格。不要在此放單一 `weapon_type`，因為長矛、法杖可有多種攻擊模式。

盾牌不建立 `weapon_specs`。

### 5.2 `item_action_modes`

一件物品可以有零至多個行動模式。適用於武器、網子、陷阱、炸彈，以及其他需要判定的物品。

建議欄位：

| 欄位 | 建議代碼／意義 |
|---|---|
| `item_id` | 所屬物品 |
| `action_type` | `damage`、`control`、`healing`、`defense`、`other` |
| `attack_type` | `melee`、`physical_ranged`、`magic`、`trap`，非攻擊可為空 |
| `resolution_method` | `normal_attack`、`dice_check`、`automatic` |
| `value_source` | `character_attribute`、`fixed`、`action_card`、`none` |
| `attribute_code` | `strength`、`agility`、`wisdom`、`insight`，不適用時為空 |
| `fixed_value` | 牌面固定基礎值；非固定來源時為空 |
| `dice_count` | 擲骰數，可為空 |
| `check_modifier` | 判定加成，可正、可負，預設 0 |
| `range_type` | `fixed`、`action_card`、`none` |
| `range_min`、`range_max` | 固定距離範圍；非固定距離時為空 |
| `target_attribute_code` | 特殊對抗判定的敵方屬性，可為空 |
| `comparison_operator` | 如 `greater_than`，僅特殊判定使用 |
| `description` | 判定原文／補充說明 |
| `display_order` | 雙模式牌面的顯示順序 |

資料驗證規則：

- `value_source = character_attribute` 時，`attribute_code` 必填。
- `value_source = fixed` 時，`fixed_value` 必填。
- `range_type = fixed` 時，`range_min` 與 `range_max` 必填，且最小值不得大於最大值。
- `range_type = action_card` 時，距離欄應為空；牌面 `*` 不存成字串。
- 無法確定的特殊判定應保留 `description`，不要猜測公式。

範例：

- 長劍：一筆 `melee`，使用 `strength`，3 骰，+1，距離 0。
- 十字弩：一筆 `physical_ranged`，使用 `agility`，4 骰，+2，距離 1～4。
- 長矛：兩筆模式，一筆敏捷遠程、一筆力量近戰。
- 法杖：兩筆模式，一筆智慧魔法且距離來自行動卡、一筆力量近戰。
- 網子：`action_type = control`、`resolution_method = dice_check`，成功後的控制另存 `item_effects`。
- 陷阱：`value_source = fixed`，不讀取人物基礎屬性。

### 5.3 `weapon_traits`

存放不是每把武器都有的特性。

建議欄位：`weapon_item_id`、`trait_code`、`numeric_value`、`description`。

已確認代碼：

- `reload`：攻擊後，下次攻擊前需要填充動作。

其他代碼只能在牌面或規則確認後新增，不要預先猜測。

## 6. 武器附件接口

### 6.1 `connector_types`

| code | 牌面形狀 | 接受附件 |
|---|---|---|
| `melee` | 小半圓 | 近戰附件／油脂等 |
| `rune` | 半橢圓 | 符文附件 |
| `bow` | 單三角鋸齒 | 弓類附件 |
| `firearm` | 雙三角鋸齒 | 槍械附件 |

形狀名稱是顯示資訊；相容性判斷使用穩定 `code`。

### 6.2 `weapon_sockets`

記錄某把武器在哪一格具有哪種接口。

建議唯一鍵：

```text
(weapon_item_id, slot_index, socket_index)
```

`slot_index` 由上到下從 1 開始。`socket_index` 用於未來同一格有多個接口的情況，預設 1。

三格武器範例：

| slot_index | connector_type |
|---:|---|
| 1 | `melee` |
| 2 | `melee` |
| 3 | `rune` |

盾牌沒有附件接口，因此不建立 `weapon_sockets`。

### 6.3 `attachment_specs`

一對一關聯附件物品，保存 `connector_type_id`。它只負責安裝相容性；附件提供的數值或特殊能力一律放入 `item_effects`。

## 7. 防具與盾牌固定面板

### 7.1 `defense_specs`

適用於 `armor`、`helmet`、`accessory`。一件物品最多一筆。

固定欄位：

- `melee_defense`
- `ranged_defense`
- `magic_defense`

牌面上的其他正面或負面能力不是固定防禦面板，應建立多筆 `item_effects`。

### 7.2 `shield_roll_rules`

盾牌的規則與一般防具不同，使用獨立表。每個盾牌依牌面可建立力量與敏捷規則。

建議欄位：

- `shield_item_id`
- `attribute_code`：`strength` 或 `agility`
- `fixed_value`
- `dice_count`

建議唯一鍵：

```text
(shield_item_id, attribute_code)
```

此表的精確語意應在錄入第一批盾牌前，對照規則書確認「固定值改投骰」的完整判定文字；資料表先保存牌面兩側數值，不在程式中猜測結果計算公式。

## 8. 效果系統

### 8.1 `effect_definitions`

效果字典，讓圖鑑能依效果篩選。

建議欄位：`code`、`name`、`effect_group`、`description`。

`effect_group` 建議值：

- `attribute_modifier`
- `defense_modifier`
- `attack_modifier`
- `status`
- `reroll`
- `resource`
- `rule_modifier`
- `other`

範例 `code`：

- `burning`
- `controlled`
- `strength_modifier`
- `agility_modifier`
- `wisdom_modifier`
- `insight_modifier`
- `melee_defense_modifier`
- `ranged_defense_modifier`
- `magic_defense_modifier`
- `hit_modifier`
- `dice_modifier`
- `action_card_limit_modifier`
- `heal_health`
- `reroll_die`

只 seed 已從牌面或規則確認的效果。

### 8.2 `item_effects`

物品與效果為一對多。建議欄位：

| 欄位 | 意義 |
|---|---|
| `item_id` | 所屬物品 |
| `effect_definition_id` | 效果字典 |
| `action_mode_id` | 可空；有值時只作用於指定行動模式 |
| `target_type` | `self`、`weapon`、`attack`、`ally`、`enemy`、`area` |
| `numeric_value` | 數值，可空 |
| `operation` | `add`、`subtract`、`set`、`apply`、`reroll` |
| `trigger_timing` | 如 `passive`、`on_use`、`on_attack`、`on_action_success` |
| `duration_type` | 如 `instant`、`this_attack`、`combat`、`while_equipped`、`while_installed`、`permanent` |
| `is_negative` | 0/1，供 UI 顯示與篩選 |
| `description` | 該效果原文或補充文字 |
| `sort_order` | 顯示順序 |
| `params_json` | 僅放無法正規化的特殊參數 |

使用規則：

- 附件的屬性提升與附帶效果直接放 `item_effects`，不另開附件效果表。
- 防具的額外正負面能力放 `item_effects`。
- 藥水的治療、屬性、防禦、命中等加成放 `item_effects`。
- 網子或陷阱成功後的控制、燃燒等結果放 `item_effects`。
- 混合武器若效果只影響其中一個模式，填入 `action_mode_id`；作用整件物品則為空。
- `is_negative` 是顯示語意，數值正負仍以 `numeric_value` 與 `operation` 為準。

## 9. 合成系統

### 9.1 `crafting_stations`

建議欄位：`code`、`name`、`description`。合成台代碼只依合成表實際資料建立。

### 9.2 `recipes`

一筆代表一種製作方式。建議欄位：

- `output_item_id`
- `output_quantity`，預設 1
- `crafting_station_id`，可空
- `required_station_level`，可空
- `description`

同一物品若有不同製作方式，建立多筆 recipe。

### 9.3 `recipe_ingredients`

建議主鍵：

```text
(recipe_id, ingredient_item_id)
```

欄位包含 `quantity > 0`。第一版將合成材料也視為 `items`，分類为 `material`，讓材料同樣可以查詢與顯示圖片。

如果同一配方未來允許「A 或 B」替代材料，應另設 ingredient group；第一版在合成表未確認有替代材料前不要過度設計。

## 10. 圖鑑查詢需求

API 至少應支援：

- 關鍵字：名稱、說明、原始效果文字。
- 主要分類。
- 占用格數 `slot_count`。
- 消耗方式與使用限制。
- 攻擊類型：近戰、物理遠程、魔法、陷阱。
- 判定屬性：力量、敏捷、智慧等。
- 固定距離範圍。
- 武器特性，例如 `reload`。
- 附件接口類型。
- 防禦數值。
- 正面／負面效果及效果代碼。
- 合成台與最低等級。
- 是否可合成、需要哪些材料、可合成哪些物品。

第一版資料量不大時，名稱與文字搜尋可以先用 `LIKE`。不要在未確認部署環境前把全文檢索實作綁死在特定 SQLite 擴充功能。

## 11. 索引

至少建立：

- `items(category_id)`
- `items(slot_count)`
- `items(is_published)`
- `items(slug)`（唯一索引）
- `item_action_modes(item_id)`
- `item_action_modes(action_type, attack_type)`
- `item_action_modes(attribute_code)`
- `item_effects(item_id)`
- `item_effects(effect_definition_id)`
- `item_effects(action_mode_id)`
- `weapon_sockets(weapon_item_id)`
- `weapon_sockets(connector_type_id)`
- `recipes(output_item_id)`
- `recipes(crafting_station_id)`
- `recipe_ingredients(ingredient_item_id)`

避免為低選擇性的單一布林欄位建立太多索引；實際資料與查詢出現後再用查詢計畫調整。

## 12. 完整性與 API 驗證

SQLite 的 `CHECK` 與外鍵只能處理部分跨表規則，下列條件必須由 API／service layer 驗證：

- `weapon_specs` 只能屬於 `weapon`。
- `attachment_specs` 只能屬於 `weapon_attachment`。
- `defense_specs` 只能屬於上衣、頭盔或飾品。
- `shield_roll_rules` 只能屬於盾牌。
- `weapon_sockets.slot_index` 不得大於物品 `slot_count`。
- `item_effects.action_mode_id` 必須屬於同一個 `item_id`。
- 武器接口和附件需要的 `connector_type_id` 必須一致。
- `is_published = 1` 前，應確認必要面板、圖片來源與原始效果文字已校對。

所有寫入操作應使用參數化 SQL，禁止拼接使用者輸入。

## 13. 刪除策略

- 規格、行動模式、效果、接口等純從屬資料可使用 `ON DELETE CASCADE`。
- 被 recipe、來源資料或日後角色物品引用的 `items`，正式環境優先改为下架 `is_published = 0`，不要任意刪除。
- lookup 資料已被引用時，不應刪除或修改 `code`；只調整顯示名稱。

## 14. 圖片儲存

圖片不存入 D1 BLOB。`items.image_url` 保存外部 URL 或物件儲存鍵；實體圖片應放在網站靜態資源或物件儲存服務。資料錄入時應保留來源與版權註記，不要把未知授權圖片直接公開部署。

## 15. 第一階段不建立的資料表

以下留待戰役功能：

- `users`
- `teams`
- `campaigns`
- `characters`
- `character_items`
- `character_item_placements`
- `installed_attachments`
- `combat_usage_records`
- `wagon_inventory`
- `crafting_station_upgrades`

未來的 `character_items.item_id` 應指向本圖鑑的 `items.id`，讓「物品定義」與「玩家實際持有的物品實例」分離。

## 16. 尚待實物或規則確認

以下不阻擋建立 v1 schema，但錄入正式資料前必須確認：

1. 網子的完整擲骰比較公式與目標屬性。
2. 盾牌「固定數值改投骰」的完整判定流程。
3. 是否存在同一格多個附件接口。
4. 是否存在替代材料、複數產出或無合成台配方。
5. 是否存在超过四格或非直向形狀物品。
6. 是否存在同名但不同版本／語言且數值不同的牌。
7. 特殊效果的正式發動時機與持續時間代碼。

遇到未確認规则时，应保存原文并标记为未发布，不要自行推断结构化数值。

## 17. Definition of Done

物品圖鑑 Schema v1 完成標準：

- 所有 migration 能在空白 D1／SQLite 資料庫依序執行。
- migration 能安全回放，或明確記錄只能執行一次。
- lookup seed 不會因重複執行產生重複資料。
- 至少以長劍、十字弩、長矛、法杖、網子、武器附件、鎧甲、盾牌、藥水與陷阱建立測試 fixture。
- 可以查詢一件物品的完整分類、面板、行動模式、效果、接口與合成資訊。
- 混合武器能回傳多個依 `display_order` 排序的行動模式。
- 可以依分類、格數、攻擊類型、判定屬性、效果和合成台篩選。
- API 回傳原始效果文字，結構化資料只作為篩選與輔助顯示。


## 11. 角色 Equipment Board 戰役狀態（Migration 0024）

`0024_create_character_loadouts.sql` 將固定模板與戰役狀態分離：

- 固定槽位拓撲、百分比熱點及各英雄的 `OPEN／LOCKED_10／BLOCKED` 初始分布保存在 `shared/equipmentBoardTemplates.ts`，不寫入 D1。
- `campaign_character_opened_slots` 只記錄玩家已移除的原始 `10 XP` 蓋板，不自動扣除 XP。
- `campaign_character_equipment_slots` 以逐格資料保存多格裝備占用，並對同一角色的 `slot_key` 建立唯一限制。
- `campaign_character_retained_attachments` 保存主武器離開後仍留在實體 Equipment Board 原位的附件。
- `campaign_equipment_attachments` 新增 `weapon_slot_index`，附件孔位以 `(equipment_instance_id, weapon_slot_index, socket_index)` 唯一識別。
- `campaign_equipment_instances.character_id` 建立角色外鍵；額外 trigger 驗證角色、裝備實體、占格及留置附件屬於同一戰役。
- 所有跨角色裝備流轉必須先回到馬車，再由另一名角色重新放置。
- 戰役備份格式升為 schema v2；匯入 schema v1 時，舊附件的 `weapon_slot_index` 轉為 `1`，新增的三張角色面板狀態表使用空資料。
