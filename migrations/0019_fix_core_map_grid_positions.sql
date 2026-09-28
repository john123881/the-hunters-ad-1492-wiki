-- 核心地圖固定為橫向 4 張、縱向 5 列。
PRAGMA foreign_keys = OFF;

ALTER TABLE campaign_map_tiles RENAME TO campaign_map_tiles_legacy;

CREATE TABLE campaign_map_tiles (
  campaign_id TEXT NOT NULL REFERENCES campaign_maps(campaign_id) ON DELETE CASCADE,
  map_code TEXT NOT NULL,
  row_index INTEGER NOT NULL CHECK (row_index BETWEEN 1 AND 5),
  column_index INTEGER NOT NULL CHECK (column_index BETWEEN 1 AND 4),
  is_revealed INTEGER NOT NULL DEFAULT 0 CHECK (is_revealed IN (0, 1)),
  face TEXT NOT NULL DEFAULT 'BACK' CHECK (face IN ('FRONT', 'BACK')),
  resource_notes TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, map_code),
  UNIQUE (campaign_id, row_index, column_index)
);

INSERT INTO campaign_map_tiles (
  campaign_id, map_code, row_index, column_index,
  is_revealed, face, resource_notes, notes, updated_at
)
SELECT campaign_id,
       map_code,
       CAST((CAST(SUBSTR(map_code, 2) AS INTEGER) - 1) / 4 AS INTEGER) + 1,
       ((CAST(SUBSTR(map_code, 2) AS INTEGER) - 1) % 4) + 1,
       is_revealed,
       face,
       resource_notes,
       notes,
       updated_at
FROM campaign_map_tiles_legacy;

DROP TABLE campaign_map_tiles_legacy;

PRAGMA foreign_keys = ON;
PRAGMA optimize;
