-- 損壞標記只適用於鎧甲／上衣，且只允許 0 或 1。
PRAGMA foreign_keys = ON;

UPDATE campaign_equipment_instances
SET damage_markers = CASE
  WHEN item_id IN (
    SELECT i.id FROM items i
    JOIN item_categories c ON c.id = i.category_id
    WHERE c.code = 'armor'
  ) AND damage_markers > 0 THEN 1
  ELSE 0
END;

CREATE TRIGGER campaign_equipment_damage_insert
BEFORE INSERT ON campaign_equipment_instances
WHEN NEW.damage_markers NOT IN (0, 1)
  OR (
    NEW.damage_markers = 1
    AND NOT EXISTS (
      SELECT 1 FROM items i
      JOIN item_categories c ON c.id = i.category_id
      WHERE i.id = NEW.item_id AND c.code = 'armor'
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'invalid equipment damage state');
END;

CREATE TRIGGER campaign_equipment_damage_update
BEFORE UPDATE OF damage_markers, item_id ON campaign_equipment_instances
WHEN NEW.damage_markers NOT IN (0, 1)
  OR (
    NEW.damage_markers = 1
    AND NOT EXISTS (
      SELECT 1 FROM items i
      JOIN item_categories c ON c.id = i.category_id
      WHERE i.id = NEW.item_id AND c.code = 'armor'
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'invalid equipment damage state');
END;

PRAGMA optimize;
