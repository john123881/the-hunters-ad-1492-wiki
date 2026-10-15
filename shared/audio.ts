export const AUDIO_CATEGORIES = [
  'story',
  'character',
  'quest',
  'quest_win',
  'quest_loss',
  'w_quest',
  'w_quest_win',
  'w_quest_loss',
] as const;

export type AudioCategory = (typeof AUDIO_CATEGORIES)[number];

const PREFIX_CATEGORIES = [
  ['VW', 'w_quest_win'],
  ['LW', 'w_quest_loss'],
  ['Q', 'quest'],
  ['V', 'quest_win'],
  ['L', 'quest_loss'],
  ['W', 'w_quest'],
  ['F', 'character'],
] as const satisfies ReadonlyArray<readonly [string, AudioCategory]>;

export interface ParsedAudioCode {
  code: string;
  category: AudioCategory;
}

export function normalizeAudioCode(input: string): string | null {
  const compact = input.trim().toUpperCase().replace(/[\s.．_‐‑‒–—−-]+/gu, '');
  if (!compact) return null;

  if (/^\d+[A-Z]?$/.test(compact)) return compact;

  for (const [prefix] of PREFIX_CATEGORIES) {
    if (compact.startsWith(prefix)) {
      const suffix = compact.slice(prefix.length);
      return /^\d+[A-Z0-9]*$/.test(suffix) ? prefix + suffix : null;
    }
  }

  return null;
}

export function classifyAudioCode(input: string): ParsedAudioCode | null {
  const code = normalizeAudioCode(input);
  if (!code) return null;

  if (/^\d+[A-Z]?$/.test(code)) {
    return { code, category: 'story' };
  }

  for (const [prefix, category] of PREFIX_CATEGORIES) {
    if (code.startsWith(prefix)) return { code, category };
  }

  return null;
}

export interface AudioPlaybackLog {
  id: number;
  code: string;
  category: AudioCategory;
  title: string;
  playerNumber: number;
  playerAlias: string;
  playedAt: string;
}

export interface AudioPlaybackHistoryResponse {
  data: AudioPlaybackLog[];
}
