import fs from 'node:fs';

const recipes = JSON.parse(fs.readFileSync('data/recipes.json', 'utf8'));
console.log('Total recipes in recipes.json:', recipes.length);

const itemSlugs = new Set();
for (let i = 1; i <= 8; i++) {
  const f = `data/equipment_page${i}.json`;
  if (fs.existsSync(f)) {
    const list = JSON.parse(fs.readFileSync(f, 'utf8'));
    list.forEach(x => itemSlugs.add(x.slug));
  }
}
console.log('Total equipment catalog slugs:', itemSlugs.size);

const validStations = new Set([
  'armorers_tools',
  'alchemists_lab',
  'bowyers_table',
  'workshop',
  'blacksmiths_tools'
]);

const validResources = new Set([
  'yarn', 'leather', 'steel', 'silver', 'saltpeter', 'diamond',
  'mushroom', 'fruit', 'leaf', 'root', 'stalk', 'flower',
  'monster-blood', 'monster-bone', 'monster-venom', 'monster-fur', 'monster-fat', 'monster-egg'
]);

let errors = 0;
const recipeItemSlugs = new Set();

for (const [idx, r] of recipes.entries()) {
  if (!itemSlugs.has(r.item_slug)) {
    console.error(`[Error] Recipe #${idx} has invalid item_slug: ${r.item_slug}`);
    errors++;
  }
  if (recipeItemSlugs.has(r.item_slug)) {
    console.error(`[Error] Duplicate recipe for item_slug: ${r.item_slug}`);
    errors++;
  }
  recipeItemSlugs.add(r.item_slug);

  if (!validStations.has(r.station_code)) {
    console.error(`[Error] Recipe for ${r.item_slug} has invalid station_code: ${r.station_code}`);
    errors++;
  }

  if (![1, 2, 3].includes(r.required_station_level)) {
    console.error(`[Error] Recipe for ${r.item_slug} has invalid required_station_level: ${r.required_station_level}`);
    errors++;
  }

  if (!Array.isArray(r.resources) || r.resources.length === 0) {
    console.error(`[Error] Recipe for ${r.item_slug} has no resources.`);
    errors++;
  }

  for (const res of r.resources) {
    if (!validResources.has(res.slug)) {
      console.error(`[Error] Recipe for ${r.item_slug} has invalid resource slug: ${res.slug}`);
      errors++;
    }
    if (typeof res.quantity !== 'number' || res.quantity <= 0) {
      console.error(`[Error] Recipe for ${r.item_slug} resource ${res.slug} invalid quantity: ${res.quantity}`);
      errors++;
    }
  }
}

if (errors === 0) {
  console.log(`✅ All ${recipes.length} recipes completely verified against items, stations, and resources!`);
} else {
  console.error(`❌ Validation failed with ${errors} errors.`);
  process.exit(1);
}
