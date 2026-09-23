-- 前六份 migration 已套用；以增量方式加入圖鑑所需的來源與牌號。
ALTER TABLE items ADD COLUMN card_number TEXT;
ALTER TABLE items ADD COLUMN original_name TEXT NOT NULL DEFAULT '';
ALTER TABLE items ADD COLUMN usage_verified INTEGER NOT NULL DEFAULT 0 CHECK (usage_verified IN (0, 1));
ALTER TABLE items ADD COLUMN image_alt TEXT NOT NULL DEFAULT '';
ALTER TABLE items ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'unverified'
  CHECK (source_kind IN ('demo', 'reference', 'official', 'unverified'));
ALTER TABLE items ADD COLUMN source_note TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_items_card_number ON items(card_number COLLATE NOCASE);
CREATE INDEX idx_items_visibility ON items(is_published, source_kind, sort_order, id);

-- 舊表 is_published 的預設值為 1，不改寫已套用的 migration。
-- 沒有明確來源的新增資料，在同一 INSERT 交易中自動轉為草稿。
UPDATE items SET is_published = 0 WHERE source_kind = 'unverified';
CREATE TRIGGER items_unverified_draft AFTER INSERT ON items
WHEN NEW.source_kind = 'unverified' AND NEW.is_published = 1
BEGIN
  UPDATE items SET is_published = 0 WHERE id = NEW.id;
END;

CREATE TRIGGER items_publish_insert BEFORE INSERT ON items
WHEN NEW.is_published = 1 AND NEW.source_kind != 'unverified'
  AND (trim(NEW.image_url) = '' OR trim(NEW.original_effect_text) = '' OR trim(NEW.source_note) = '')
BEGIN SELECT RAISE(ABORT, 'Published items require image, original text and source note'); END;

CREATE TRIGGER items_publish_update BEFORE UPDATE ON items
WHEN NEW.is_published = 1 AND (NEW.source_kind = 'unverified'
  OR trim(NEW.image_url) = '' OR trim(NEW.original_effect_text) = '' OR trim(NEW.source_note) = '')
BEGIN SELECT RAISE(ABORT, 'Published items require verified provenance, image and original text'); END;

-- 僅在呼叫端未提供新時間時補上時間；遞迴 trigger 啟用時也不會無限更新。
CREATE TRIGGER items_touch AFTER UPDATE ON items
WHEN NEW.updated_at = OLD.updated_at AND NEW.updated_at != strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
BEGIN
  UPDATE items SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
