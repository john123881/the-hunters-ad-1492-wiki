import { categoryCodes, consumptionLabels, usageLabels, attackLabels, attributeLabels } from '../shared/types';

export class InvalidQuery extends Error {}
const enumFilters = {
  category: categoryCodes,
  consumption: Object.keys(consumptionLabels), usage: Object.keys(usageLabels),
  attackType: Object.keys(attackLabels), attribute: Object.keys(attributeLabels),
  negative: ['0', '1'], sort: ['number', 'name'],
};
const numericFilters = {
  page: [1, 1_000_000], pageSize: [1, 48], slotCount: [1, 4],
  rangeMin: [0, 1000], rangeMax: [0, 1000],
  minMeleeDefense: [0, 1000], minRangedDefense: [0, 1000], minMagicDefense: [0, 1000],
} as const;
export type ItemQuery = {
  q: string; page: number; pageSize: number; sort: string;
  category?: string; consumption?: string; usage?: string; attackType?: string; attribute?: string;
  negative?: string; trait?: string; connector?: string; effect?: string;
  slotCount?: number; rangeMin?: number; rangeMax?: number;
  minMeleeDefense?: number; minRangedDefense?: number; minMagicDefense?: number;
};

export function parseQuery(params: Record<string, string>): ItemQuery {
  const result: Record<string, string | number> = { q: '', page: 1, pageSize: 12, sort: 'number' };
  const codes = ['trait', 'connector', 'effect'];
  for (const [key, raw] of Object.entries(params)) {
    const value = raw.trim();
    if (!value) continue;
    if (key === 'q') {
      if (value.length > 100) throw new InvalidQuery('搜尋文字最多 100 字。');
      result.q = value;
    } else if (key in enumFilters) {
      if (!(enumFilters[key as keyof typeof enumFilters] as readonly string[]).includes(value)) throw new InvalidQuery('篩選選項不正確。');
      result[key] = value;
    } else if (key in numericFilters) {
      const [min, max] = numericFilters[key as keyof typeof numericFilters];
      const number = Number(value);
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < min || number > max) throw new InvalidQuery('頁碼、格數、距離與數值須為範圍內的整數。');
      result[key] = number;
    } else if (codes.includes(key)) {
      if (!/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(value)) throw new InvalidQuery('篩選代碼格式不正確。');
      result[key] = value;
    } else throw new InvalidQuery('包含不支援的查詢參數。');
  }
  const query = result as ItemQuery;
  if (query.rangeMin !== undefined && query.rangeMax !== undefined && query.rangeMin > query.rangeMax) throw new InvalidQuery('最小距離不能大於最大距離。');
  return query;
}
