# 正式站部署前圖片載入驗收

產生時間：2026-10-10T01:52:23.507Z

測試環境：production build、本機預覽、393×852 viewport、100 ms latency、1.5 Mbps download。

## 結果

- 圖片：**108 張／4.38 MB**
- HTTP 或圖片格式錯誤：**0**
- 瀏覽器載入或解碼錯誤：**0**
- 結論：**通過**

| 圖片組 | 張數 | 容量 | 慢速網路完成時間 | 結果 |
| --- | ---: | ---: | ---: | --- |
| 物品卡圖片 | 93 | 1.13 MB | 9740 ms | 通過 |
| 裝備面板基本載入組 | 3 | 315 KB | 1860 ms | 通過 |
| 角色面板 | 9 | 2.46 MB | 13922 ms | 通過 |
| 馬車面板 | 1 | 329 KB | 1928 ms | 通過 |
| 首頁主視覺 | 2 | 169 KB | 769 ms | 通過 |

## 資產明細

| 路徑 | HTTP | 容量 | 解碼尺寸 | Cache-Control |
| --- | ---: | ---: | --- | --- |
| `/images/items/accuracy-infusion.webp` | 200 | 9 KB | 173×173 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/acid-grenade.webp` | 200 | 10 KB | 173×173 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/agilitas.webp` | 200 | 8 KB | 160×160 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/antidote.webp` | 200 | 10 KB | 173×173 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/arbalest.webp` | 200 | 23 KB | 180×470 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/armet.webp` | 200 | 9 KB | 173×173 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/arquebus.webp` | 200 | 19 KB | 195×340 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/aurillac-beret.webp` | 200 | 9 KB | 173×173 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/avicenna-necklace.webp` | 200 | 10 KB | 173×173 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/axe.webp` | 200 | 15 KB | 175×315 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/blunderbuss.webp` | 200 | 20 KB | 195×340 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/bodkin-arrows.webp` | 200 | 10 KB | 170×170 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/bracelet-of-cursing.webp` | 200 | 11 KB | 173×173 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/breastplate.webp` | 200 | 18 KB | 173×342 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/brigandine.webp` | 200 | 18 KB | 173×342 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/buckler.webp` | 200 | 8 KB | 173×173 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/camouflage-cloak.webp` | 200 | 9 KB | 173×173 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/cervelliere.webp` | 200 | 9 KB | 173×172 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/chain-mail.webp` | 200 | 18 KB | 173×342 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/cinquedea.webp` | 200 | 8 KB | 150×155 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/cobalt-pendant.webp` | 200 | 10 KB | 173×173 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/courage-infusion.webp` | 200 | 10 KB | 173×173 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/dagger.webp` | 200 | 8 KB | 150×155 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/demonic-grease-bow.webp` | 200 | 10 KB | 170×170 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/demonic-grease.webp` | 200 | 8 KB | 155×155 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/diamond-sharpening.webp` | 200 | 8 KB | 155×155 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/elongated-barrel.webp` | 200 | 9 KB | 170×170 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/falchion.webp` | 200 | 15 KB | 175×310 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/flail.webp` | 200 | 20 KB | 159×470 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/formido.webp` | 200 | 7 KB | 160×160 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/frag-bomb.webp` | 200 | 10 KB | 173×173 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/frag-grenade.webp` | 200 | 10 KB | 173×173 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/gambeson.webp` | 200 | 17 KB | 175×343 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/halberd.webp` | 200 | 23 KB | 180×470 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/hardened-blade.webp` | 200 | 7 KB | 155×155 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/headscarf-of-anglesey.webp` | 200 | 10 KB | 173×173 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/healing-infusion.webp` | 200 | 10 KB | 173×173 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/horseman-pick.webp` | 200 | 16 KB | 175×315 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/humanoid-grease-bow.webp` | 200 | 10 KB | 170×170 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/humanoid-grease.webp` | 200 | 7 KB | 155×155 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/hunting-bow.webp` | 200 | 15 KB | 180×310 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/hunting-crossbow.webp` | 200 | 16 KB | 180×310 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/ignis.webp` | 200 | 7 KB | 160×160 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/improved-gunpowder.webp` | 200 | 9 KB | 170×170 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/incendiary-bomb.webp` | 200 | 10 KB | 173×173 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/ira.webp` | 200 | 8 KB | 160×160 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/javelins.webp` | 200 | 14 KB | 175×315 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/katzbalger.webp` | 200 | 15 KB | 175×310 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/kettle-hat.webp` | 200 | 9 KB | 173×173 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/kicker-infusion.webp` | 200 | 9 KB | 173×173 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/lead-balls.webp` | 200 | 9 KB | 170×170 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/leather-handle.webp` | 200 | 7 KB | 155×155 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/long-bow.webp` | 200 | 25 KB | 190×500 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/long-sword.webp` | 200 | 16 KB | 175×315 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/lucerne-hammer.webp` | 200 | 21 KB | 179×470 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/mace.webp` | 200 | 15 KB | 175×315 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/magic-staff.webp` | 200 | 18 KB | 173×344 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/medicine.webp` | 200 | 10 KB | 173×173 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/modern-lock.webp` | 200 | 9 KB | 171×170 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/monster-grease-bow.webp` | 200 | 9 KB | 170×170 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/monster-grease.webp` | 200 | 8 KB | 155×155 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/musket.webp` | 200 | 27 KB | 195×507 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/net.webp` | 200 | 18 KB | 159×315 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/pavise.webp` | 200 | 19 KB | 173×344 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/petronel.webp` | 200 | 10 KB | 193×170 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/plate-armor.webp` | 200 | 18 KB | 175×342 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/protection-infusion.webp` | 200 | 10 KB | 173×173 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/protection-ring.webp` | 200 | 10 KB | 173×173 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/recurve-bow.webp` | 200 | 14 KB | 180×310 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/refreshing-infusion.webp` | 200 | 10 KB | 173×173 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/reinforced-limb.webp` | 200 | 9 KB | 170×170 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/ring-of-power.webp` | 200 | 11 KB | 173×173 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/ring-of-ulm.webp` | 200 | 10 KB | 173×173 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/sagacitate.webp` | 200 | 8 KB | 160×160 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/shapeshifter-grease-bow.webp` | 200 | 8 KB | 155×155 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/shapeshifter-grease.webp` | 200 | 9 KB | 170×170 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/silver-balls.webp` | 200 | 8 KB | 170×170 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/silver-blade.webp` | 200 | 7 KB | 155×155 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/sling.webp` | 200 | 7 KB | 160×160 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/slowing-arrows.webp` | 200 | 9 KB | 170×170 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/snare.webp` | 200 | 9 KB | 173×173 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/spear.webp` | 200 | 21 KB | 180×470 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/staff-of-domination.webp` | 200 | 21 KB | 195×345 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/staff-of-doubt.webp` | 200 | 19 KB | 173×344 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/steel-shield.webp` | 200 | 18 KB | 173×342 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/stun-arrows.webp` | 200 | 10 KB | 170×170 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/stun-grenade.webp` | 200 | 10 KB | 173×173 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/torch.webp` | 200 | 14 KB | 145×310 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/two-handed-axe.webp` | 200 | 23 KB | 177×470 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/vita.webp` | 200 | 7 KB | 160×160 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/wheellock-pistol.webp` | 200 | 10 KB | 192×170 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/wooden-shield.webp` | 200 | 18 KB | 173×342 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/items/zweihander.webp` | 200 | 23 KB | 177×470 | `public, max-age=86400, stale-while-revalidate=604800` |
| `/images/campaign/characters/equipment-board-gridless-v5.webp` | 200 | 211 KB | 1200×960 | `public, max-age=31536000, immutable` |
| `/images/campaign/characters/slot-cover-10xp-v3.webp` | 200 | 52 KB | 384×384 | `public, max-age=31536000, immutable` |
| `/images/campaign/characters/slot-cover-blocked-x-v3.webp` | 200 | 52 KB | 384×384 | `public, max-age=31536000, immutable` |
| `/images/campaign/characters/brawler-board-v2.webp` | 200 | 280 KB | 900×1200 | `public, max-age=31536000, immutable` |
| `/images/campaign/characters/crossbowman-board-v2.webp` | 200 | 290 KB | 900×1200 | `public, max-age=31536000, immutable` |
| `/images/campaign/characters/cutthroat-board-v2.webp` | 200 | 283 KB | 900×1200 | `public, max-age=31536000, immutable` |
| `/images/campaign/characters/huntress-board-v2.webp` | 200 | 316 KB | 900×1200 | `public, max-age=31536000, immutable` |
| `/images/campaign/characters/landsknecht-board-v2.webp` | 200 | 311 KB | 900×1200 | `public, max-age=31536000, immutable` |
| `/images/campaign/characters/man-at-arms-board-v2.webp` | 200 | 300 KB | 900×1200 | `public, max-age=31536000, immutable` |
| `/images/campaign/characters/medic-board-v2.webp` | 200 | 245 KB | 900×1200 | `public, max-age=31536000, immutable` |
| `/images/campaign/characters/sorceress-board-v2.webp` | 200 | 259 KB | 900×1200 | `public, max-age=31536000, immutable` |
| `/images/campaign/characters/witch-board-v2.webp` | 200 | 234 KB | 900×1200 | `public, max-age=31536000, immutable` |
| `/images/campaign/wagon-board-concept-v3.webp` | 200 | 329 KB | 1536×1024 | `public, max-age=31536000, immutable` |
| `/images/hero-keyart.webp` | 200 | 119 KB | 1200×865 | `public, max-age=31536000, immutable` |
| `/images/hero-keyart-640.webp` | 200 | 50 KB | 640×461 | `public, max-age=31536000, immutable` |

時間是依序測試各圖片組的單次結果，只用於發現明顯退化，不作為正式站 CDN 的固定 SLA。
