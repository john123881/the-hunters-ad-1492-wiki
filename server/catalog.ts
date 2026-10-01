import { eq, and, inArray, sql } from 'drizzle-orm';
import type { ItemSummary, ItemDetail, ItemsResponse, CatalogResponse, ActionMode, Connector, Lookup, CraftingRecipe, CraftingResource, CraftingStationRequirement } from '../shared/types';
import type { ItemQuery } from './query';
import { getDb } from './db';
import {
  items,
  itemCategories,
  connectorTypes,
  recipes as recipesTable,
  recipeResources,
  recipeStationRequirements,
  weaponSockets,
  attachmentSpecs,
  itemActionModes,
  defenseSpecs,
  shieldRollRules,
  weaponTraits,
  effectDefinitions,
  itemEffects,
  craftingStations,
  craftingResources,
} from './db/schema/index';

async function loadCrafting(db: D1Database, itemIds: number[]) {
  const recipesMap = new Map<number, CraftingRecipe>();
  if (itemIds.length === 0) return recipesMap;

  const drizzleDb = getDb(db);

  const recipeRows = await drizzleDb
    .select({
      id: recipesTable.id,
      itemId: recipesTable.outputItemId,
      outputQuantity: recipesTable.outputQuantity,
      description: recipesTable.description,
    })
    .from(recipesTable)
    .where(inArray(recipesTable.outputItemId, itemIds));

  const resourceRows = await drizzleDb
    .select({
      itemId: recipesTable.outputItemId,
      code: craftingResources.code,
      slug: craftingResources.slug,
      name: craftingResources.name,
      originalName: craftingResources.originalName,
      categoryCode: craftingResources.categoryCode,
      imageUrl: craftingResources.imageUrl,
      imageAlt: craftingResources.imageAlt,
      quantity: recipeResources.quantity,
      sortOrder: recipeResources.sortOrder,
    })
    .from(recipesTable)
    .innerJoin(recipeResources, eq(recipeResources.recipeId, recipesTable.id))
    .innerJoin(craftingResources, eq(craftingResources.id, recipeResources.resourceId))
    .where(and(inArray(recipesTable.outputItemId, itemIds), eq(craftingResources.isPublished, true)))
    .orderBy(recipesTable.outputItemId, recipeResources.sortOrder, craftingResources.id);

  const stationRows = await drizzleDb
    .select({
      itemId: recipesTable.outputItemId,
      code: craftingStations.code,
      name: craftingStations.name,
      originalName: craftingStations.originalName,
      imageUrl: craftingStations.imageUrl,
      requiredLevel: recipeStationRequirements.requiredLevel,
      sortOrder: recipeStationRequirements.sortOrder,
    })
    .from(recipesTable)
    .innerJoin(recipeStationRequirements, eq(recipeStationRequirements.recipeId, recipesTable.id))
    .innerJoin(craftingStations, eq(craftingStations.id, recipeStationRequirements.craftingStationId))
    .where(inArray(recipesTable.outputItemId, itemIds))
    .orderBy(recipesTable.outputItemId, recipeStationRequirements.sortOrder, craftingStations.id);

  for (const row of recipeRows) {
    recipesMap.set(row.itemId, {
      id: row.id,
      outputQuantity: row.outputQuantity,
      description: row.description,
      resources: [],
      stations: [],
    });
  }

  for (const row of resourceRows) {
    recipesMap.get(row.itemId)?.resources.push(row as CraftingResource & { itemId: number });
  }

  for (const row of stationRows) {
    recipesMap.get(row.itemId)?.stations.push(row as CraftingStationRequirement & { itemId: number });
  }

  return recipesMap;
}
export async function listItems(db: D1Database, query: ItemQuery): Promise<ItemsResponse> {
  const drizzleDb = getDb(db);
  const conditions = [
    eq(items.isPublished, true),
    inArray(items.sourceKind, ['demo', 'reference', 'official']),
  ];

  if (query.q) {
    const term = query.q.toLowerCase();
    conditions.push(
      sql`(
        instr(lower(${items.name}), ${term}) > 0
        OR instr(lower(${items.code}), ${term}) > 0
        OR instr(lower(COALESCE(${items.cardNumber}, '')), ${term}) > 0
        OR instr(lower(COALESCE(${items.originalName}, '')), ${term}) > 0
        OR instr(lower(COALESCE(${items.description}, '')), ${term}) > 0
        OR instr(lower(COALESCE(${items.originalEffectText}, '')), ${term}) > 0
        OR EXISTS (
          SELECT 1 FROM recipes r
          JOIN recipe_resources rr ON rr.recipe_id = r.id
          JOIN crafting_resources cr ON cr.id = rr.resource_id
          WHERE r.output_item_id = ${items.id} AND (
            instr(lower(cr.name), ${term}) > 0 OR instr(lower(COALESCE(cr.original_name, '')), ${term}) > 0
          )
        )
        OR EXISTS (
          SELECT 1 FROM recipes r
          JOIN recipe_station_requirements rs ON rs.recipe_id = r.id
          JOIN crafting_stations cs ON cs.id = rs.crafting_station_id
          WHERE r.output_item_id = ${items.id} AND (
            instr(lower(cs.name), ${term}) > 0 OR instr(lower(COALESCE(cs.original_name, '')), ${term}) > 0
          )
        )
      )`,
    );
  }

  if (query.category) conditions.push(eq(itemCategories.code, query.category));
  if (query.slotCount !== undefined) conditions.push(eq(items.slotCount, query.slotCount));
  if (query.consumption) conditions.push(eq(items.consumptionType, query.consumption));
  if (query.usage) {
    conditions.push(eq(items.usageLimitType, query.usage));
    conditions.push(eq(items.usageVerified, true));
  }

  const modeClauses = [];
  if (query.attackType) modeClauses.push(sql`m.attack_type = ${query.attackType}`);
  if (query.attribute) modeClauses.push(sql`m.attribute_code = ${query.attribute}`);
  if (query.rangeMin !== undefined || query.rangeMax !== undefined) modeClauses.push(sql`m.range_type = 'fixed'`);
  if (query.rangeMin !== undefined) modeClauses.push(sql`m.range_max >= ${query.rangeMin}`);
  if (query.rangeMax !== undefined) modeClauses.push(sql`m.range_min <= ${query.rangeMax}`);
  if (modeClauses.length) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM item_action_modes m WHERE m.item_id = ${items.id} AND ${sql.join(modeClauses, sql` AND `)})`,
    );
  }

  if (query.trait) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM weapon_traits t WHERE t.weapon_item_id = ${items.id} AND t.trait_code = ${query.trait})`,
    );
  }

  if (query.connector) {
    conditions.push(
      sql`(
        EXISTS (SELECT 1 FROM weapon_sockets s JOIN connector_types ct ON ct.id = s.connector_type_id WHERE s.weapon_item_id = ${items.id} AND ct.code = ${query.connector})
        OR EXISTS (SELECT 1 FROM attachment_specs a JOIN connector_types ct ON ct.id = a.connector_type_id WHERE a.item_id = ${items.id} AND ct.code = ${query.connector})
      )`,
    );
  }

  const defenseClauses = [];
  if (typeof query.minMeleeDefense === 'number') defenseClauses.push(sql`d.melee_defense >= ${query.minMeleeDefense}`);
  if (typeof query.minRangedDefense === 'number') defenseClauses.push(sql`d.ranged_defense >= ${query.minRangedDefense}`);
  if (typeof query.minMagicDefense === 'number') defenseClauses.push(sql`d.magic_defense >= ${query.minMagicDefense}`);
  if (defenseClauses.length) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM defense_specs d WHERE d.item_id = ${items.id} AND ${sql.join(defenseClauses, sql` AND `)})`,
    );
  }

  const effectClauses = [];
  if (query.effect) effectClauses.push(sql`ed.code = ${query.effect}`);
  if (query.negative !== undefined) effectClauses.push(sql`e.is_negative = ${Number(query.negative)}`);
  if (effectClauses.length) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM item_effects e JOIN effect_definitions ed ON ed.id = e.effect_definition_id WHERE e.item_id = ${items.id} AND ${sql.join(effectClauses, sql` AND `)})`,
    );
  }

  const whereClause = and(...conditions);
  const orderByClause = query.sort === 'name'
    ? [sql`${items.name} COLLATE NOCASE`, items.id]
    : [sql`COALESCE(${items.cardNumber}, ${items.code}) COLLATE NOCASE`, items.id];

  const [countResult] = await drizzleDb
    .select({ total: sql<number>`COUNT(*)` })
    .from(items)
    .innerJoin(itemCategories, eq(itemCategories.id, items.categoryId))
    .where(whereClause);

  const total = Number(countResult?.total ?? 0);

  const rows = await drizzleDb
    .select({
      id: items.id,
      code: items.code,
      slug: items.slug,
      cardNumber: items.cardNumber,
      name: items.name,
      categoryCode: itemCategories.code,
      categoryName: itemCategories.name,
      slotCount: items.slotCount,
      consumptionType: items.consumptionType,
      usageLimitType: sql<string | null>`CASE WHEN ${items.usageVerified} = 1 THEN ${items.usageLimitType} ELSE NULL END`,
      description: items.description,
      imageUrl: items.imageUrl,
      imageAlt: items.imageAlt,
      sourceKind: items.sourceKind,
    })
    .from(items)
    .innerJoin(itemCategories, eq(itemCategories.id, items.categoryId))
    .where(whereClause)
    .orderBy(...orderByClause)
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  const crafting = await loadCrafting(db, rows.map(item => item.id));

  return {
    data: rows.map(item => ({
      ...item,
      categoryCode: item.categoryCode as ItemSummary['categoryCode'],
      consumptionType: item.consumptionType as ItemSummary['consumptionType'],
      usageLimitType: item.usageLimitType as ItemSummary['usageLimitType'],
      sourceKind: item.sourceKind as ItemSummary['sourceKind'],
      crafting: crafting.get(item.id) ?? null,
    })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

export async function getCatalog(db: D1Database): Promise<CatalogResponse> {
  const drizzleDb = getDb(db);

  const [countResult] = await drizzleDb
    .select({
      total: sql<number>`COUNT(*)`,
      demoCount: sql<number>`COALESCE(SUM(${items.sourceKind} = 'demo'), 0)`,
    })
    .from(items)
    .where(
      and(
        eq(items.isPublished, true),
        inArray(items.sourceKind, ['demo', 'reference', 'official']),
      ),
    );

  const categories = await drizzleDb
    .select({
      code: itemCategories.code,
      name: itemCategories.name,
      count: sql<number>`COUNT(${items.id})`,
    })
    .from(itemCategories)
    .innerJoin(
      items,
      and(
        eq(items.categoryId, itemCategories.id),
        eq(items.isPublished, true),
        inArray(items.sourceKind, ['demo', 'reference', 'official']),
      ),
    )
    .groupBy(itemCategories.id)
    .orderBy(itemCategories.id);

  const connectors = await drizzleDb
    .select({
      code: connectorTypes.code,
      name: connectorTypes.name,
    })
    .from(connectorTypes)
    .orderBy(connectorTypes.id);

  const effects = await drizzleDb
    .select({
      code: effectDefinitions.code,
      name: effectDefinitions.name,
    })
    .from(effectDefinitions)
    .orderBy(effectDefinitions.id);

  const traits = await drizzleDb
    .selectDistinct({
      code: weaponTraits.traitCode,
      name: sql<string>`CASE WHEN ${weaponTraits.traitCode} = 'reload' THEN '裝填' ELSE ${weaponTraits.traitCode} END`,
    })
    .from(weaponTraits)
    .innerJoin(
      items,
      and(
        eq(items.id, weaponTraits.weaponItemId),
        eq(items.isPublished, true),
        inArray(items.sourceKind, ['demo', 'reference', 'official']),
      ),
    )
    .orderBy(weaponTraits.traitCode);

  return {
    data: {
      total: Number(countResult?.total ?? 0),
      demoCount: Number(countResult?.demoCount ?? 0),
      categories: categories as unknown as CatalogResponse['data']['categories'],
      connectors: connectors as unknown as Lookup[],
      effects: effects as unknown as Lookup[],
      traits: traits as unknown as Lookup[],
    },
  };
}

export async function getItem(db: D1Database, slug: string): Promise<ItemDetail | null> {
  const drizzleDb = getDb(db);

  const [row] = await drizzleDb
    .select({
      id: items.id,
      code: items.code,
      slug: items.slug,
      cardNumber: items.cardNumber,
      name: items.name,
      categoryCode: itemCategories.code,
      categoryName: itemCategories.name,
      slotCount: items.slotCount,
      consumptionType: items.consumptionType,
      usageLimitType: sql<string | null>`CASE WHEN ${items.usageVerified} = 1 THEN ${items.usageLimitType} ELSE NULL END`,
      description: items.description,
      imageUrl: items.imageUrl,
      imageAlt: items.imageAlt,
      sourceKind: items.sourceKind,
      originalName: items.originalName,
      originalEffectText: items.originalEffectText,
      sourceReference: items.sourceReference,
      sourceNote: items.sourceNote,
      languageCode: items.languageCode,
      editionCode: items.editionCode,
      slotZone: itemCategories.slotZone,
    })
    .from(items)
    .innerJoin(itemCategories, eq(itemCategories.id, items.categoryId))
    .where(
      and(
        eq(items.slug, slug),
        eq(items.isPublished, true),
        inArray(items.sourceKind, ['demo', 'reference', 'official']),
      ),
    );

  if (!row) return null;
  const id = row.id;
  const crafting = await loadCrafting(db, [id]);

  const modes = await drizzleDb
    .select({
      id: itemActionModes.id,
      actionType: itemActionModes.actionType,
      attackType: itemActionModes.attackType,
      resolutionMethod: itemActionModes.resolutionMethod,
      valueSource: itemActionModes.valueSource,
      attributeCode: itemActionModes.attributeCode,
      fixedValue: itemActionModes.fixedValue,
      diceCount: itemActionModes.diceCount,
      checkModifier: itemActionModes.checkModifier,
      rangeType: itemActionModes.rangeType,
      rangeMin: itemActionModes.rangeMin,
      rangeMax: itemActionModes.rangeMax,
      targetAttributeCode: itemActionModes.targetAttributeCode,
      comparisonOperator: itemActionModes.comparisonOperator,
      description: itemActionModes.description,
      displayOrder: itemActionModes.displayOrder,
    })
    .from(itemActionModes)
    .where(eq(itemActionModes.itemId, id))
    .orderBy(itemActionModes.displayOrder, itemActionModes.id);

  const [defense] = await drizzleDb
    .select({
      meleeDefense: defenseSpecs.meleeDefense,
      rangedDefense: defenseSpecs.rangedDefense,
      magicDefense: defenseSpecs.magicDefense,
    })
    .from(defenseSpecs)
    .where(eq(defenseSpecs.itemId, id));

  const shieldRules = await drizzleDb
    .select({
      attributeCode: shieldRollRules.attributeCode,
      fixedValue: shieldRollRules.fixedValue,
      diceCount: shieldRollRules.diceCount,
    })
    .from(shieldRollRules)
    .where(eq(shieldRollRules.shieldItemId, id))
    .orderBy(shieldRollRules.id);

  const traits = await drizzleDb
    .select({
      code: weaponTraits.traitCode,
      numericValue: weaponTraits.numericValue,
      description: weaponTraits.description,
    })
    .from(weaponTraits)
    .where(eq(weaponTraits.weaponItemId, id))
    .orderBy(weaponTraits.id);

  const sockets = await drizzleDb
    .select({
      slotIndex: weaponSockets.slotIndex,
      socketIndex: weaponSockets.socketIndex,
      code: connectorTypes.code,
      name: connectorTypes.name,
      shapeDescription: connectorTypes.shapeDescription,
    })
    .from(weaponSockets)
    .innerJoin(connectorTypes, eq(connectorTypes.id, weaponSockets.connectorTypeId))
    .where(eq(weaponSockets.weaponItemId, id))
    .orderBy(weaponSockets.slotIndex, weaponSockets.socketIndex);

  const [attachment] = await drizzleDb
    .select({
      code: connectorTypes.code,
      name: connectorTypes.name,
      shapeDescription: connectorTypes.shapeDescription,
    })
    .from(attachmentSpecs)
    .innerJoin(connectorTypes, eq(connectorTypes.id, attachmentSpecs.connectorTypeId))
    .where(eq(attachmentSpecs.itemId, id));

  const effects = await drizzleDb
    .select({
      id: itemEffects.id,
      code: effectDefinitions.code,
      name: effectDefinitions.name,
      actionModeId: itemEffects.actionModeId,
      targetType: itemEffects.targetType,
      numericValue: itemEffects.numericValue,
      operation: itemEffects.operation,
      triggerTiming: itemEffects.triggerTiming,
      durationType: itemEffects.durationType,
      isNegative: itemEffects.isNegative,
      description: itemEffects.description,
    })
    .from(itemEffects)
    .innerJoin(effectDefinitions, eq(effectDefinitions.id, itemEffects.effectDefinitionId))
    .where(eq(itemEffects.itemId, id))
    .orderBy(itemEffects.sortOrder, itemEffects.id);

  return {
    ...row,
    categoryCode: row.categoryCode as ItemDetail['categoryCode'],
    consumptionType: row.consumptionType as ItemDetail['consumptionType'],
    usageLimitType: row.usageLimitType as ItemDetail['usageLimitType'],
    sourceKind: row.sourceKind as ItemDetail['sourceKind'],
    crafting: crafting.get(id) ?? null,
    actionModes: modes as unknown as ActionMode[],
    defense: (defense ?? null) as ItemDetail['defense'],
    shieldRules: shieldRules as unknown as ItemDetail['shieldRules'],
    traits: traits as unknown as ItemDetail['traits'],
    sockets: sockets as unknown as ItemDetail['sockets'],
    attachment: (attachment ?? null) as Connector | null,
    effects: effects.map(effect => ({ ...effect, isNegative: Boolean(effect.isNegative) })),
  };
}
