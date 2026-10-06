-- 角色 Equipment Board 動態狀態、裝備占格與留置附件。
PRAGMA defer_foreign_keys = ON;

CREATE TABLE campaign_equipment_instances_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL REFERENCES campaign_wagons(campaign_id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  location_type TEXT NOT NULL DEFAULT 'WAGON' CHECK (location_type IN ('WAGON', 'CHARACTER')),
  character_id INTEGER REFERENCES campaign_characters(id) ON DELETE CASCADE,
  damage_markers INTEGER NOT NULL DEFAULT 0 CHECK (damage_markers >= 0),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((location_type = 'WAGON' AND character_id IS NULL) OR (location_type = 'CHARACTER' AND character_id IS NOT NULL))
);

INSERT INTO campaign_equipment_instances_new (
  id, campaign_id, item_id, location_type, character_id, damage_markers, notes, created_at, updated_at
)
SELECT id, campaign_id, item_id, location_type, character_id, damage_markers, notes, created_at, updated_at
FROM campaign_equipment_instances;

CREATE TABLE campaign_equipment_attachments_new (
  equipment_instance_id INTEGER NOT NULL REFERENCES campaign_equipment_instances_new(id) ON DELETE CASCADE,
  attachment_instance_id INTEGER NOT NULL UNIQUE REFERENCES campaign_equipment_instances_new(id) ON DELETE RESTRICT,
  weapon_slot_index INTEGER NOT NULL DEFAULT 1 CHECK (weapon_slot_index >= 1),
  socket_index INTEGER NOT NULL CHECK (socket_index >= 1),
  attached_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (equipment_instance_id, weapon_slot_index, socket_index),
  CHECK (equipment_instance_id <> attachment_instance_id)
);

INSERT INTO campaign_equipment_attachments_new (
  equipment_instance_id, attachment_instance_id, weapon_slot_index, socket_index, attached_at
)
SELECT equipment_instance_id, attachment_instance_id, 1, socket_index, attached_at
FROM campaign_equipment_attachments;

DROP TABLE campaign_equipment_attachments;
DROP TABLE campaign_equipment_instances;
ALTER TABLE campaign_equipment_instances_new RENAME TO campaign_equipment_instances;
ALTER TABLE campaign_equipment_attachments_new RENAME TO campaign_equipment_attachments;

CREATE INDEX idx_campaign_equipment_location
  ON campaign_equipment_instances(campaign_id, location_type, character_id);

CREATE TRIGGER trg_campaign_equipment_character_insert
BEFORE INSERT ON campaign_equipment_instances
WHEN NEW.location_type = 'CHARACTER'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM campaign_characters c
    WHERE c.id = NEW.character_id AND c.campaign_id = NEW.campaign_id
  ) THEN RAISE(ABORT, 'equipment character must belong to campaign') END;
END;

CREATE TRIGGER trg_campaign_equipment_character_update
BEFORE UPDATE OF campaign_id, location_type, character_id ON campaign_equipment_instances
WHEN NEW.location_type = 'CHARACTER'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM campaign_characters c
    WHERE c.id = NEW.character_id AND c.campaign_id = NEW.campaign_id
  ) THEN RAISE(ABORT, 'equipment character must belong to campaign') END;
END;

CREATE TABLE campaign_character_opened_slots (
  character_id INTEGER NOT NULL REFERENCES campaign_characters(id) ON DELETE CASCADE,
  slot_key TEXT NOT NULL CHECK (length(trim(slot_key)) > 0),
  opened_by_player INTEGER NOT NULL CHECK (opened_by_player BETWEEN 1 AND 4),
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (character_id, slot_key)
);

CREATE TABLE campaign_character_equipment_slots (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES campaign_characters(id) ON DELETE CASCADE,
  equipment_instance_id INTEGER NOT NULL REFERENCES campaign_equipment_instances(id) ON DELETE CASCADE,
  slot_key TEXT NOT NULL CHECK (length(trim(slot_key)) > 0),
  slot_index INTEGER NOT NULL CHECK (slot_index >= 1),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (equipment_instance_id, slot_key),
  UNIQUE (campaign_id, character_id, slot_key)
);

CREATE INDEX idx_character_equipment_slots_character
  ON campaign_character_equipment_slots(campaign_id, character_id);

CREATE TRIGGER trg_character_equipment_slot_insert
BEFORE INSERT ON campaign_character_equipment_slots
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM campaign_characters c
    WHERE c.id = NEW.character_id AND c.campaign_id = NEW.campaign_id
  ) THEN RAISE(ABORT, 'slot character must belong to campaign') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM campaign_equipment_instances e
    WHERE e.id = NEW.equipment_instance_id
      AND e.campaign_id = NEW.campaign_id
      AND e.character_id = NEW.character_id
      AND e.location_type = 'CHARACTER'
  ) THEN RAISE(ABORT, 'slot equipment must belong to character') END;
END;

CREATE TRIGGER trg_character_equipment_slot_update
BEFORE UPDATE OF campaign_id, character_id, equipment_instance_id ON campaign_character_equipment_slots
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM campaign_characters c
    WHERE c.id = NEW.character_id AND c.campaign_id = NEW.campaign_id
  ) THEN RAISE(ABORT, 'slot character must belong to campaign') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM campaign_equipment_instances e
    WHERE e.id = NEW.equipment_instance_id
      AND e.campaign_id = NEW.campaign_id
      AND e.character_id = NEW.character_id
      AND e.location_type = 'CHARACTER'
  ) THEN RAISE(ABORT, 'slot equipment must belong to character') END;
END;

CREATE TABLE campaign_character_retained_attachments (
  attachment_instance_id INTEGER PRIMARY KEY REFERENCES campaign_equipment_instances(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES campaign_characters(id) ON DELETE CASCADE,
  anchor_slot_key TEXT NOT NULL CHECK (length(trim(anchor_slot_key)) > 0),
  socket_index INTEGER NOT NULL CHECK (socket_index >= 1),
  retained_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (character_id, anchor_slot_key, socket_index)
);

CREATE INDEX idx_character_retained_attachments_character
  ON campaign_character_retained_attachments(campaign_id, character_id);

CREATE TRIGGER trg_character_retained_attachment_insert
BEFORE INSERT ON campaign_character_retained_attachments
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM campaign_characters c
    WHERE c.id = NEW.character_id AND c.campaign_id = NEW.campaign_id
  ) THEN RAISE(ABORT, 'retained attachment character must belong to campaign') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM campaign_equipment_instances e
    JOIN attachment_specs a ON a.item_id = e.item_id
    WHERE e.id = NEW.attachment_instance_id
      AND e.campaign_id = NEW.campaign_id
      AND e.character_id = NEW.character_id
      AND e.location_type = 'CHARACTER'
  ) THEN RAISE(ABORT, 'retained attachment must belong to character') END;
END;

CREATE TRIGGER trg_character_retained_attachment_update
BEFORE UPDATE OF attachment_instance_id, campaign_id, character_id ON campaign_character_retained_attachments
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM campaign_characters c
    WHERE c.id = NEW.character_id AND c.campaign_id = NEW.campaign_id
  ) THEN RAISE(ABORT, 'retained attachment character must belong to campaign') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM campaign_equipment_instances e
    JOIN attachment_specs a ON a.item_id = e.item_id
    WHERE e.id = NEW.attachment_instance_id
      AND e.campaign_id = NEW.campaign_id
      AND e.character_id = NEW.character_id
      AND e.location_type = 'CHARACTER'
  ) THEN RAISE(ABORT, 'retained attachment must belong to character') END;
END;

PRAGMA defer_foreign_keys = OFF;
PRAGMA optimize;
