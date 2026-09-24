const iconFiles: Record<string, string> = {
  accessory: 'accessory', armor: 'armor', backpack: 'backpack', consumable: 'backpack', grenade: 'grenade',
  helmet: 'helmet', shield: 'shield', trap: 'trap', utility: 'backpack', weapon: 'weapon',
  weapon_attachment: 'weapon_attachment', melee: 'melee_attack', physical_ranged: 'ranged_attack',
  magic: 'magic_attack', strength: 'strength', agility: 'agility', wisdom: 'wisdom', insight: 'perception',
  melee_defense: 'melee_defense', ranged_defense: 'ranged_defense', magic_defense: 'magic_defense',
  area: 'area', burn: 'burn', immobilize: 'immobilize', light: 'light', mighty: 'mighty', pierce: 'pierce',
  poison: 'poison', stun: 'stun', reload: 'reload', regenerate: 'regenerate', heal_health: 'health',
  agility_modifier: 'agility', wisdom_modifier: 'wisdom', strength_modifier: 'strength',
  insight_modifier: 'perception', movement_modifier: 'movement', dice_modifier: 'attack_dice',
  enemy_dice_modifier: 'attack_dice', hit_modifier: 'attack_modifier', range_modifier: 'attack_range',
  reroll_die: 'reroll_die', offense_token_modifier: 'offense_token', permanent: 'permanent',
  consumed_on_use: 'single_use', single_use: 'single_use', once_per_combat: 'once_per_combat', connector_melee: 'connector_melee',
  connector_rune: 'connector_rune',
};

export function glyphPath(code: string | null | undefined) {
  if (!code) return null;
  const file = iconFiles[code];
  return file ? `/images/icons/equipment/${file}.png` : null;
}

export function connectorGlyphCode(code: string) {
  return code === 'melee' || code === 'rune' ? `connector_${code}` : null;
}

export function ItemGlyph({ code, label, size = 22, className = '' }: { code: string | null | undefined; label: string; size?: number; className?: string }) {
  const src = glyphPath(code);
  if (!src) return null;
  return <img className={`item-glyph ${className}`.trim()} src={src} width={size} height={size} alt="" aria-hidden="true" title={label} />;
}
