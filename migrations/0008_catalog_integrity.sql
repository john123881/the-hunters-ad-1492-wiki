-- 增量補上跨欄位、跨表完整性；不重建或清空既有資料。
PRAGMA foreign_keys = ON;

CREATE TRIGGER items_integrity_insert BEFORE INSERT ON items
WHEN (typeof(NEW.slot_count) != 'integer') OR trim(NEW.name) = '' OR trim(NEW.code) = '' OR trim(NEW.slug) = ''
BEGIN SELECT RAISE(ABORT, 'Items require a name, code, slug and integer slot count'); END;

CREATE TRIGGER items_integrity_update BEFORE UPDATE ON items
WHEN (typeof(NEW.slot_count) != 'integer') OR trim(NEW.name) = '' OR trim(NEW.code) = '' OR trim(NEW.slug) = ''
BEGIN SELECT RAISE(ABORT, 'Items require a name, code, slug and integer slot count'); END;

CREATE TRIGGER action_modes_integrity_insert BEFORE INSERT ON item_action_modes
WHEN (NEW.value_source = 'character_attribute' AND NEW.attribute_code IS NULL)
  OR (NEW.value_source != 'character_attribute' AND NEW.attribute_code IS NOT NULL)
  OR (NEW.value_source = 'fixed' AND NEW.fixed_value IS NULL)
  OR (NEW.value_source != 'fixed' AND NEW.fixed_value IS NOT NULL)
  OR (NEW.range_type != 'fixed' AND (NEW.range_min IS NOT NULL OR NEW.range_max IS NOT NULL))
  OR (NEW.fixed_value IS NOT NULL AND typeof(NEW.fixed_value) != 'integer')
  OR (NEW.dice_count IS NOT NULL AND typeof(NEW.dice_count) != 'integer')
  OR (NEW.range_min IS NOT NULL AND typeof(NEW.range_min) != 'integer')
  OR (NEW.range_max IS NOT NULL AND typeof(NEW.range_max) != 'integer')
  OR (typeof(NEW.check_modifier) != 'integer')
  OR (typeof(NEW.display_order) != 'integer')
  OR (EXISTS (SELECT 1 FROM item_effects e WHERE e.action_mode_id = NEW.id AND e.item_id != NEW.item_id))
BEGIN SELECT RAISE(ABORT, 'Inconsistent action mode source, range, integer value or effect owner'); END;

CREATE TRIGGER action_modes_integrity_update BEFORE UPDATE ON item_action_modes
WHEN (NEW.value_source = 'character_attribute' AND NEW.attribute_code IS NULL)
  OR (NEW.value_source != 'character_attribute' AND NEW.attribute_code IS NOT NULL)
  OR (NEW.value_source = 'fixed' AND NEW.fixed_value IS NULL)
  OR (NEW.value_source != 'fixed' AND NEW.fixed_value IS NOT NULL)
  OR (NEW.range_type != 'fixed' AND (NEW.range_min IS NOT NULL OR NEW.range_max IS NOT NULL))
  OR (NEW.fixed_value IS NOT NULL AND typeof(NEW.fixed_value) != 'integer')
  OR (NEW.dice_count IS NOT NULL AND typeof(NEW.dice_count) != 'integer')
  OR (NEW.range_min IS NOT NULL AND typeof(NEW.range_min) != 'integer')
  OR (NEW.range_max IS NOT NULL AND typeof(NEW.range_max) != 'integer')
  OR (typeof(NEW.check_modifier) != 'integer')
  OR (typeof(NEW.display_order) != 'integer')
  OR (EXISTS (SELECT 1 FROM item_effects e WHERE e.action_mode_id = NEW.id AND e.item_id != NEW.item_id))
BEGIN SELECT RAISE(ABORT, 'Inconsistent action mode source, range, integer value or effect owner'); END;

CREATE TRIGGER weapon_specs_category_insert BEFORE INSERT ON weapon_specs
WHEN NOT EXISTS (SELECT 1 FROM items i JOIN item_categories c ON c.id = i.category_id WHERE i.id = NEW.item_id AND c.code IN ('weapon'))
BEGIN SELECT RAISE(ABORT, 'Item category does not match profile'); END;

CREATE TRIGGER weapon_specs_category_update BEFORE UPDATE ON weapon_specs
WHEN NOT EXISTS (SELECT 1 FROM items i JOIN item_categories c ON c.id = i.category_id WHERE i.id = NEW.item_id AND c.code IN ('weapon'))
BEGIN SELECT RAISE(ABORT, 'Item category does not match profile'); END;

CREATE TRIGGER weapon_traits_category_insert BEFORE INSERT ON weapon_traits
WHEN NOT EXISTS (SELECT 1 FROM items i JOIN item_categories c ON c.id = i.category_id WHERE i.id = NEW.weapon_item_id AND c.code IN ('weapon'))
BEGIN SELECT RAISE(ABORT, 'Item category does not match profile'); END;

CREATE TRIGGER weapon_traits_category_update BEFORE UPDATE ON weapon_traits
WHEN NOT EXISTS (SELECT 1 FROM items i JOIN item_categories c ON c.id = i.category_id WHERE i.id = NEW.weapon_item_id AND c.code IN ('weapon'))
BEGIN SELECT RAISE(ABORT, 'Item category does not match profile'); END;

CREATE TRIGGER weapon_sockets_category_insert BEFORE INSERT ON weapon_sockets
WHEN NOT EXISTS (SELECT 1 FROM items i JOIN item_categories c ON c.id = i.category_id WHERE i.id = NEW.weapon_item_id AND c.code IN ('weapon'))
BEGIN SELECT RAISE(ABORT, 'Item category does not match profile'); END;

CREATE TRIGGER weapon_sockets_category_update BEFORE UPDATE ON weapon_sockets
WHEN NOT EXISTS (SELECT 1 FROM items i JOIN item_categories c ON c.id = i.category_id WHERE i.id = NEW.weapon_item_id AND c.code IN ('weapon'))
BEGIN SELECT RAISE(ABORT, 'Item category does not match profile'); END;

CREATE TRIGGER attachment_specs_category_insert BEFORE INSERT ON attachment_specs
WHEN NOT EXISTS (SELECT 1 FROM items i JOIN item_categories c ON c.id = i.category_id WHERE i.id = NEW.item_id AND c.code IN ('weapon_attachment'))
BEGIN SELECT RAISE(ABORT, 'Item category does not match profile'); END;

CREATE TRIGGER attachment_specs_category_update BEFORE UPDATE ON attachment_specs
WHEN NOT EXISTS (SELECT 1 FROM items i JOIN item_categories c ON c.id = i.category_id WHERE i.id = NEW.item_id AND c.code IN ('weapon_attachment'))
BEGIN SELECT RAISE(ABORT, 'Item category does not match profile'); END;

CREATE TRIGGER defense_specs_category_insert BEFORE INSERT ON defense_specs
WHEN NOT EXISTS (SELECT 1 FROM items i JOIN item_categories c ON c.id = i.category_id WHERE i.id = NEW.item_id AND c.code IN ('armor','helmet','accessory'))
BEGIN SELECT RAISE(ABORT, 'Item category does not match profile'); END;

CREATE TRIGGER defense_specs_category_update BEFORE UPDATE ON defense_specs
WHEN NOT EXISTS (SELECT 1 FROM items i JOIN item_categories c ON c.id = i.category_id WHERE i.id = NEW.item_id AND c.code IN ('armor','helmet','accessory'))
BEGIN SELECT RAISE(ABORT, 'Item category does not match profile'); END;

CREATE TRIGGER shield_roll_rules_category_insert BEFORE INSERT ON shield_roll_rules
WHEN NOT EXISTS (SELECT 1 FROM items i JOIN item_categories c ON c.id = i.category_id WHERE i.id = NEW.shield_item_id AND c.code IN ('shield'))
BEGIN SELECT RAISE(ABORT, 'Item category does not match profile'); END;

CREATE TRIGGER shield_roll_rules_category_update BEFORE UPDATE ON shield_roll_rules
WHEN NOT EXISTS (SELECT 1 FROM items i JOIN item_categories c ON c.id = i.category_id WHERE i.id = NEW.shield_item_id AND c.code IN ('shield'))
BEGIN SELECT RAISE(ABORT, 'Item category does not match profile'); END;

CREATE TRIGGER sockets_integrity_insert BEFORE INSERT ON weapon_sockets
WHEN (typeof(NEW.slot_index) != 'integer') OR (typeof(NEW.socket_index) != 'integer') OR NEW.slot_index > (SELECT slot_count FROM items WHERE id = NEW.weapon_item_id)
BEGIN SELECT RAISE(ABORT, 'Socket must fit within item slots'); END;

CREATE TRIGGER sockets_integrity_update BEFORE UPDATE ON weapon_sockets
WHEN (typeof(NEW.slot_index) != 'integer') OR (typeof(NEW.socket_index) != 'integer') OR NEW.slot_index > (SELECT slot_count FROM items WHERE id = NEW.weapon_item_id)
BEGIN SELECT RAISE(ABORT, 'Socket must fit within item slots'); END;

CREATE TRIGGER items_profile_consistency_insert BEFORE INSERT ON items
WHEN EXISTS (SELECT 1 FROM weapon_sockets WHERE weapon_item_id = NEW.id AND slot_index > NEW.slot_count)
  OR ((EXISTS (SELECT 1 FROM weapon_specs WHERE item_id = NEW.id) OR EXISTS (SELECT 1 FROM weapon_sockets WHERE weapon_item_id = NEW.id) OR EXISTS (SELECT 1 FROM weapon_traits WHERE weapon_item_id = NEW.id)) AND (SELECT code FROM item_categories WHERE id = NEW.category_id) != 'weapon')
  OR (EXISTS (SELECT 1 FROM attachment_specs WHERE item_id = NEW.id) AND (SELECT code FROM item_categories WHERE id = NEW.category_id) != 'weapon_attachment')
  OR (EXISTS (SELECT 1 FROM shield_roll_rules WHERE shield_item_id = NEW.id) AND (SELECT code FROM item_categories WHERE id = NEW.category_id) != 'shield')
  OR (EXISTS (SELECT 1 FROM defense_specs WHERE item_id = NEW.id) AND (SELECT code FROM item_categories WHERE id = NEW.category_id) NOT IN ('armor','helmet','accessory'))
BEGIN SELECT RAISE(ABORT, 'Changing item category or size conflicts with existing profiles'); END;

CREATE TRIGGER items_profile_consistency_update BEFORE UPDATE ON items
WHEN EXISTS (SELECT 1 FROM weapon_sockets WHERE weapon_item_id = NEW.id AND slot_index > NEW.slot_count)
  OR ((EXISTS (SELECT 1 FROM weapon_specs WHERE item_id = NEW.id) OR EXISTS (SELECT 1 FROM weapon_sockets WHERE weapon_item_id = NEW.id) OR EXISTS (SELECT 1 FROM weapon_traits WHERE weapon_item_id = NEW.id)) AND (SELECT code FROM item_categories WHERE id = NEW.category_id) != 'weapon')
  OR (EXISTS (SELECT 1 FROM attachment_specs WHERE item_id = NEW.id) AND (SELECT code FROM item_categories WHERE id = NEW.category_id) != 'weapon_attachment')
  OR (EXISTS (SELECT 1 FROM shield_roll_rules WHERE shield_item_id = NEW.id) AND (SELECT code FROM item_categories WHERE id = NEW.category_id) != 'shield')
  OR (EXISTS (SELECT 1 FROM defense_specs WHERE item_id = NEW.id) AND (SELECT code FROM item_categories WHERE id = NEW.category_id) NOT IN ('armor','helmet','accessory'))
BEGIN SELECT RAISE(ABORT, 'Changing item category or size conflicts with existing profiles'); END;

CREATE TRIGGER effects_integrity_insert BEFORE INSERT ON item_effects
WHEN (NEW.action_mode_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM item_action_modes m WHERE m.id = NEW.action_mode_id AND m.item_id = NEW.item_id))
  OR (NEW.params_json IS NOT NULL AND NOT json_valid(NEW.params_json))
  OR (NEW.numeric_value IS NOT NULL AND typeof(NEW.numeric_value) != 'integer')
  OR (typeof(NEW.sort_order) != 'integer')
BEGIN SELECT RAISE(ABORT, 'Effect mode must belong to the item; JSON and numeric fields must be valid'); END;

CREATE TRIGGER effects_integrity_update BEFORE UPDATE ON item_effects
WHEN (NEW.action_mode_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM item_action_modes m WHERE m.id = NEW.action_mode_id AND m.item_id = NEW.item_id))
  OR (NEW.params_json IS NOT NULL AND NOT json_valid(NEW.params_json))
  OR (NEW.numeric_value IS NOT NULL AND typeof(NEW.numeric_value) != 'integer')
  OR (typeof(NEW.sort_order) != 'integer')
BEGIN SELECT RAISE(ABORT, 'Effect mode must belong to the item; JSON and numeric fields must be valid'); END;

CREATE TRIGGER defense_specs_integers_insert BEFORE INSERT ON defense_specs
WHEN (typeof(NEW.melee_defense) != 'integer') OR (typeof(NEW.ranged_defense) != 'integer') OR (typeof(NEW.magic_defense) != 'integer')
BEGIN SELECT RAISE(ABORT, 'Profile values must be integers'); END;

CREATE TRIGGER defense_specs_integers_update BEFORE UPDATE ON defense_specs
WHEN (typeof(NEW.melee_defense) != 'integer') OR (typeof(NEW.ranged_defense) != 'integer') OR (typeof(NEW.magic_defense) != 'integer')
BEGIN SELECT RAISE(ABORT, 'Profile values must be integers'); END;

CREATE TRIGGER shield_roll_rules_integers_insert BEFORE INSERT ON shield_roll_rules
WHEN (typeof(NEW.fixed_value) != 'integer') OR (typeof(NEW.dice_count) != 'integer')
BEGIN SELECT RAISE(ABORT, 'Profile values must be integers'); END;

CREATE TRIGGER shield_roll_rules_integers_update BEFORE UPDATE ON shield_roll_rules
WHEN (typeof(NEW.fixed_value) != 'integer') OR (typeof(NEW.dice_count) != 'integer')
BEGIN SELECT RAISE(ABORT, 'Profile values must be integers'); END;

CREATE TRIGGER recipes_integrity_insert BEFORE INSERT ON recipes
WHEN (typeof(NEW.output_quantity) != 'integer') OR (NEW.required_station_level IS NOT NULL AND typeof(NEW.required_station_level) != 'integer') OR (NEW.crafting_station_id IS NULL AND NEW.required_station_level IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'Recipe quantities must be integers and station levels require a station'); END;

CREATE TRIGGER recipes_integrity_update BEFORE UPDATE ON recipes
WHEN (typeof(NEW.output_quantity) != 'integer') OR (NEW.required_station_level IS NOT NULL AND typeof(NEW.required_station_level) != 'integer') OR (NEW.crafting_station_id IS NULL AND NEW.required_station_level IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'Recipe quantities must be integers and station levels require a station'); END;

CREATE TRIGGER ingredients_integrity_insert BEFORE INSERT ON recipe_ingredients
WHEN (typeof(NEW.quantity) != 'integer') OR NEW.ingredient_item_id = (SELECT output_item_id FROM recipes WHERE id = NEW.recipe_id)
BEGIN SELECT RAISE(ABORT, 'Ingredient quantity must be an integer; a recipe cannot consume its output'); END;

CREATE TRIGGER ingredients_integrity_update BEFORE UPDATE ON recipe_ingredients
WHEN (typeof(NEW.quantity) != 'integer') OR NEW.ingredient_item_id = (SELECT output_item_id FROM recipes WHERE id = NEW.recipe_id)
BEGIN SELECT RAISE(ABORT, 'Ingredient quantity must be an integer; a recipe cannot consume its output'); END;

CREATE TRIGGER recipe_output_integrity_insert BEFORE INSERT ON recipes
WHEN EXISTS (SELECT 1 FROM recipe_ingredients WHERE recipe_id = NEW.id AND ingredient_item_id = NEW.output_item_id)
BEGIN SELECT RAISE(ABORT, 'Recipe cannot consume its output'); END;

CREATE TRIGGER recipe_output_integrity_update BEFORE UPDATE ON recipes
WHEN EXISTS (SELECT 1 FROM recipe_ingredients WHERE recipe_id = NEW.id AND ingredient_item_id = NEW.output_item_id)
BEGIN SELECT RAISE(ABORT, 'Recipe cannot consume its output'); END;

CREATE TRIGGER category_code_immutable BEFORE UPDATE OF code ON item_categories WHEN NEW.code != OLD.code AND EXISTS (SELECT 1 FROM items WHERE category_id = OLD.id) BEGIN SELECT RAISE(ABORT, 'Referenced category codes are immutable'); END;
