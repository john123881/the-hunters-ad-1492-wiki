export type BoardPoint = { x: number; y: number };
export type HeroBoardHotspots = {
  morale: BoardPoint[];
  strength: BoardPoint[];
  knowledge: BoardPoint[];
  perception: BoardPoint[];
  agility: BoardPoint[];
  maxHealth: BoardPoint[];
  currentHealth: BoardPoint[];
  caption?: { left?: number; right?: number; top?: number };
};

const points = (xs: number[], y: number): BoardPoint[] => xs.map(x => ({ x, y }));
// 士氣軌共 7 格，由下到上對應數值：-2, -1, 0 (❖ 星號基準格), +1, +2, +3, +4
const morale = (x: number, offset = 0): BoardPoint[] =>
  [71.2, 64.8, 52.4, 45.6, 38.8, 32.5, 25.5].map(y => ({ x, y: y + offset }));
// 當前生命值（1~12）水平 X 座標：起始 17.2，等距間隔 5.8
const healthXs = [17.2, 23.0, 28.8, 34.6, 40.4, 46.2, 52.0, 57.8, 63.6, 69.4, 75.2, 81.0];

function layout(trackStart: number, trackGap: number, trackYOffset = 0, moraleX = 17.7, moraleYOffset = 0, healthY = 89.4, caption?: { left?: number; right?: number; top?: number }): HeroBoardHotspots {
  const attributeXs = Array.from({ length: 5 }, (_, index) => trackStart + index * trackGap);
  const maxHealthXs = Array.from({ length: 6 }, (_, index) => (trackStart - 6.1) + index * 5.9);
  return {
    morale: morale(moraleX, moraleYOffset),
    strength: points(attributeXs, 46.5 + trackYOffset),
    knowledge: points(attributeXs, 54.5 + trackYOffset),
    perception: points(attributeXs, 62.5 + trackYOffset),
    agility: points(attributeXs, 70.6 + trackYOffset),
    maxHealth: points(maxHealthXs, 78.7 + trackYOffset),
    currentHealth: points(healthXs, healthY),
    caption,
  };
}

/**
 * 百分比座標以各自的 900 × 1200 角色板為基準。
 * 每張 ImageGen 成品的框線與軌道有些微差異，因此保留逐角微調值。
 */
export const heroBoardHotspots: Record<string, HeroBoardHotspots> = {
  brawler: layout(57.7, 5.9, -0.2, 12.5, -1, 86.5, { left: 20, right: 11, top: 3.5 }),
  crossbowman: layout(58.8, 6.7, 0, 11.4, 0.2, 89.2),
  cutthroat: layout(59.7, 6.7, 0.1, 11.7, 0, 89.2),
  huntress: layout(59.0, 6.8, 0.2, 11.8, 0.1, 89.4),
  landsknecht: layout(58.9, 6.7, 0.2, 11.5, 0.2, 89.5),
  'man-at-arms': layout(59.6, 6.7, 0.1, 11.6, 0, 89.3),
  medic: layout(59.4, 6.7, 0.1, 11.6, 0, 89.3),
  sorceress: layout(59.5, 6.7, 0, 11.7, 0, 89.4),
  witch: layout(59.5, 6.7, 0.2, 11.8, 0, 89.4),
};
