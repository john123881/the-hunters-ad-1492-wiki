-- 一份配方可以同時要求多個工坊與各自等級。
PRAGMA foreign_keys = ON;

CREATE TABLE recipe_station_requirements (
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  crafting_station_id INTEGER NOT NULL REFERENCES crafting_stations(id) ON DELETE RESTRICT,
  required_level INTEGER NOT NULL CHECK (required_level BETWEEN 1 AND 3),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (recipe_id, crafting_station_id)
);

INSERT INTO recipe_station_requirements
  (recipe_id, crafting_station_id, required_level, sort_order)
SELECT id, crafting_station_id, required_station_level, 1
FROM recipes
WHERE crafting_station_id IS NOT NULL
  AND required_station_level IS NOT NULL;

CREATE INDEX idx_recipe_station_requirements_station
ON recipe_station_requirements(crafting_station_id);

UPDATE crafting_resources
SET image_url = '/images/resources/' || slug || '.webp';

UPDATE crafting_stations
SET image_url = '/images/workshops/' || code || '.webp';

PRAGMA optimize;
