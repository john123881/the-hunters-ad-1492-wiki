-- 0005_create_catalog_indexes.sql
-- 建立目錄查詢索引

CREATE INDEX idx_items_category ON items(category_id);
CREATE INDEX idx_items_slot_count ON items(slot_count);
CREATE INDEX idx_items_published ON items(is_published);
CREATE INDEX idx_items_sort_order ON items(sort_order);

CREATE INDEX idx_action_modes_item ON item_action_modes(item_id);
CREATE INDEX idx_action_modes_type ON item_action_modes(action_type, attack_type);
CREATE INDEX idx_action_modes_attr ON item_action_modes(attribute_code);

CREATE INDEX idx_item_effects_item ON item_effects(item_id);
CREATE INDEX idx_item_effects_definition ON item_effects(effect_definition_id);
CREATE INDEX idx_item_effects_action_mode ON item_effects(action_mode_id);

CREATE INDEX idx_weapon_sockets_item ON weapon_sockets(weapon_item_id);
CREATE INDEX idx_weapon_sockets_connector ON weapon_sockets(connector_type_id);

CREATE INDEX idx_recipes_output ON recipes(output_item_id);
CREATE INDEX idx_recipes_station ON recipes(crafting_station_id);
CREATE INDEX idx_recipe_ingredients_item ON recipe_ingredients(ingredient_item_id);
