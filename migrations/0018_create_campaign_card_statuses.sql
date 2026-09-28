-- S/J 卡片固定目錄與每場戰役的全局完成狀態。
PRAGMA foreign_keys = ON;

CREATE TABLE campaign_card_catalog (
  card_code TEXT PRIMARY KEY,
  card_type TEXT NOT NULL CHECK (card_type IN ('STORY', 'MISSION')),
  edition TEXT NOT NULL CHECK (edition IN ('CORE', 'EXPANSION')),
  sort_order INTEGER NOT NULL UNIQUE
);

WITH RECURSIVE numbers(value) AS (
  SELECT 1 UNION ALL SELECT value + 1 FROM numbers WHERE value < 102
)
INSERT INTO campaign_card_catalog (card_code, card_type, edition, sort_order)
SELECT printf('S%03d', value), 'STORY', 'CORE', value FROM numbers;

WITH RECURSIVE numbers(value) AS (
  SELECT 201 UNION ALL SELECT value + 1 FROM numbers WHERE value < 210
)
INSERT INTO campaign_card_catalog (card_code, card_type, edition, sort_order)
SELECT printf('S%03d', value), 'STORY', 'EXPANSION', value FROM numbers;

WITH RECURSIVE numbers(value) AS (
  SELECT 1 UNION ALL SELECT value + 1 FROM numbers WHERE value < 16
)
INSERT INTO campaign_card_catalog (card_code, card_type, edition, sort_order)
SELECT printf('J%03d', value), 'MISSION', 'CORE', 1000 + value FROM numbers;

WITH RECURSIVE numbers(value) AS (
  SELECT 101 UNION ALL SELECT value + 1 FROM numbers WHERE value < 102
)
INSERT INTO campaign_card_catalog (card_code, card_type, edition, sort_order)
SELECT printf('J%03d', value), 'MISSION', 'EXPANSION', 1000 + value FROM numbers;

CREATE TABLE campaign_card_statuses (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  card_code TEXT NOT NULL REFERENCES campaign_card_catalog(card_code) ON DELETE RESTRICT,
  is_resolved INTEGER NOT NULL DEFAULT 0 CHECK (is_resolved IN (0, 1)),
  resolved_at TEXT,
  updated_by_player INTEGER CHECK (updated_by_player BETWEEN 1 AND 4),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, card_code),
  CHECK (
    (is_resolved = 0 AND resolved_at IS NULL)
    OR (is_resolved = 1 AND resolved_at IS NOT NULL)
  )
);

CREATE INDEX idx_campaign_card_statuses_resolved
  ON campaign_card_statuses(campaign_id, is_resolved, card_code);

INSERT INTO campaign_card_statuses
  (campaign_id, card_code, is_resolved, resolved_at, updated_at)
SELECT p.campaign_id,
       p.card_code,
       MAX(CASE WHEN p.status = 'RESOLVED' THEN 1 ELSE 0 END),
       CASE WHEN MAX(CASE WHEN p.status = 'RESOLVED' THEN 1 ELSE 0 END) = 1
         THEN MAX(p.updated_at)
         ELSE NULL
       END,
       MAX(p.updated_at)
FROM campaign_map_card_placements p
JOIN campaign_card_catalog c ON c.card_code = p.card_code
GROUP BY p.campaign_id, p.card_code;

PRAGMA optimize;
