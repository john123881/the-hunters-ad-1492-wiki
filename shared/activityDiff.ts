/**
 * 格式化單一資料差異項目
 */
export interface DiffItem {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
  displayBefore: string;
  displayAfter: string;
}

const COMMON_FIELD_LABELS: Record<string, string> = {
  // 馬車相關
  elapsedDays: '累計天數',
  sharedGold: '團隊金幣',
  notes: '備註',
  campaignName: '戰役名稱',
  locationCode: '所在位置',
  level: '等級',
  stationId: '工坊設施',
  quantity: '數量',
  resourceCode: '素材代碼',
  status: '狀態',
  damageMarkers: '損壞標記',
  storyCardCode: '劇情卡代碼',
  tokenCode: '指示物代碼',
  unlockAtDay: '解鎖天數',

  // 地圖相關
  isRevealed: '翻牌狀態',
  face: '卡面',
  roadEventNotes: '道路事件',
  townEventNotes: '城鎮事件',
  resourceNotes: '素材備註',
  currentLocationType: '當前地點類型',
  currentLocationCode: '當前地點代碼',
  cardType: '卡片類型',
  isInTownDeck: '城鎮牌堆',
  isResolved: '完成狀態',

  // 角色相關
  heroSlug: '英雄角色',
  customName: '自訂名稱',
  moralePosition: '士氣軌位置',
  strengthLevel: '力量等級',
  knowledgeLevel: '知識等級',
  perceptionLevel: '洞察等級',
  agilityLevel: '敏捷等級',
  maxHealthLevel: '最大生命軌',
  currentHealth: '當前生命值',
  xpTens: '經驗值十位',
  xpOnes: '經驗值個位',
  isPoisoned: '中毒狀態',

  // 管理者與系統
  isActive: '啟用狀態',
  passwordReset: '密碼重設',
};

const DISPLAY_VALUE_MAX_LENGTH = 120;

function truncateDisplayValue(value: string): string {
  if (value.length <= DISPLAY_VALUE_MAX_LENGTH) return value;
  return value.slice(0, DISPLAY_VALUE_MAX_LENGTH - 1) + '…';
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(無)';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'object') {
    try {
      return truncateDisplayValue(JSON.stringify(value));
    } catch {
      return truncateDisplayValue(String(value));
    }
  }
  return truncateDisplayValue(String(value));
}

function normalizeFields(
  value: Record<string, unknown>,
  fieldAliases: Record<string, string>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([field, fieldValue]) => [fieldAliases[field] ?? field, fieldValue]),
  );
}

/**
 * 比較前後 JSON 物件並產生結構化差異清單
 */
export function formatActivityDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  customLabels: Record<string, string> = {},
  fieldAliases: Record<string, string> = {},
): DiffItem[] {
  if (!before && !after) return [];

  const labels = { ...COMMON_FIELD_LABELS, ...customLabels };

  // 若只有 after（新建）
  if (!before && after) {
    return Object.entries(after).map(([field, val]) => ({
      field,
      label: labels[field] ?? field,
      before: null,
      after: val,
      displayBefore: '(新建)',
      displayAfter: formatValue(val),
    }));
  }

  // 若只有 before（刪除）
  if (before && !after) {
    return Object.entries(before).map(([field, val]) => ({
      field,
      label: labels[field] ?? field,
      before: val,
      after: null,
      displayBefore: formatValue(val),
      displayAfter: '(已刪除)',
    }));
  }

  const b = normalizeFields(before ?? {}, fieldAliases);
  const a = normalizeFields(after ?? {}, fieldAliases);
  // 現有 Log 的 before 可能是完整資料列，after 只包含本次可編輯欄位。
  // 雙方都存在時只比較共同欄位，避免把「未提供」誤顯示成「已刪除」。
  const comparableKeys = Object.keys(b).filter(key => Object.hasOwn(a, key));
  const diffs: DiffItem[] = [];

  for (const key of comparableKeys) {
    const valBefore = b[key];
    const valAfter = a[key];

    // 略過未變更或純時間戳
    if (key === 'updatedAt' || key === 'createdAt') continue;

    const strBefore = JSON.stringify(valBefore);
    const strAfter = JSON.stringify(valAfter);

    if (strBefore !== strAfter) {
      diffs.push({
        field: key,
        label: labels[key] ?? key,
        before: valBefore,
        after: valAfter,
        displayBefore: formatValue(valBefore),
        displayAfter: formatValue(valAfter),
      });
    }
  }

  return diffs;
}
