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
// 基準星號格在 index 2 (52.4)，gapFactor 縮放會以星號基準格為中心向上下等比縮放
const moraleBaseYs = [71.2, 64.8, 52.4, 45.6, 38.8, 32.5, 25.5];
const morale = (x: number, offset = 0, gapFactor = 1.0): BoardPoint[] => {
  const center = moraleBaseYs[2]; // 52.4
  return moraleBaseYs.map(baseY => ({
    x,
    y: center + (baseY - center) * gapFactor + offset,
  }));
};

/**
 * 角色面板熱區佈局設定函式
 * 
 * @param trackStart       1. 屬性軌起點 X（預設 ~57.7）
 * @param trackGap         2. 屬性軌孔距（預設 ~5.8）
 * @param trackYOffset     3. 屬性軌整體上下偏移（負數往上、正數往下）
 * @param moraleX          4. 士氣軌 X（預設 ~11.7）
 * @param moraleYOffset    5. 士氣軌整體上下偏移（負數往上、正數往下）
 * @param moraleGap        6. 士氣軌孔距縮放（預設 1.0，大於 1 拉開、小於 1 縮緊）
 * @param healthY          7. 當前生命 Y 高度（上下）
 * @param healthXOffset    8. 當前生命 X 偏移（起始點左右平移，負數往左、正數往右）
 * @param healthGap        9. 當前生命孔距（預設 5.8）
 * @param maxHealthGap     10. 最大生命孔距（預設 5.9）
 * @param maxHealthYOffset 11. 最大生命上下高低（負數往上、正數往下）
 * @param maxHealthXOffset 12. 最大生命初始起點（負數往左、正數往右）
 * @param rowGap           13. 屬性列垂直行距（預設 8.03，力量~敏捷四行之間的間距）
 * @param caption          14. 名字/稱號專屬微調物件（放最後）
 */
function layout(
  trackStart: number,
  trackGap: number,
  trackYOffset = 0,
  moraleX = 17.7,
  moraleYOffset = 0,
  moraleGap = 1.0,
  healthY = 89.4,
  healthXOffset = 0,
  healthGap = 5.8,
  maxHealthGap = 5.9,
  maxHealthYOffset = 0,
  maxHealthXOffset = 0,
  rowGap = 8.03,
  caption?: { left?: number; right?: number; top?: number }
): HeroBoardHotspots {
  const attributeXs = Array.from({ length: 5 }, (_, index) => trackStart + index * trackGap);
  const maxHealthXs = Array.from({ length: 6 }, (_, index) => (trackStart - 6.1 + maxHealthXOffset) + index * maxHealthGap);
  const currentHealthXs = Array.from({ length: 12 }, (_, index) => (17.2 + healthXOffset) + index * healthGap);
  const baseAttrY = 46.5 + trackYOffset;
  return {
    morale: morale(moraleX, moraleYOffset, moraleGap),
    strength: points(attributeXs, baseAttrY),
    knowledge: points(attributeXs, baseAttrY + rowGap),
    perception: points(attributeXs, baseAttrY + rowGap * 2),
    agility: points(attributeXs, baseAttrY + rowGap * 3),
    maxHealth: points(maxHealthXs, 78.7 + trackYOffset + maxHealthYOffset),
    currentHealth: points(currentHealthXs, healthY),
    caption,
  };
}

/**
 * 百分比座標以各自的 900 × 1200 角色板為基準。
 * 每張 ImageGen 成品的框線與軌道有些微差異，因此保留逐角微調值。
 */
export const heroBoardHotspots: Record<string, HeroBoardHotspots> = {
  // 鬥者
  brawler: layout(
    57.7,  // 1. 屬性軌起點 X
    5.9,   // 2. 屬性軌孔距
    -0.2,  // 3. 屬性軌上下偏移
    12.5,  // 4. 士氣軌 X
    -1.0,  // 5. 士氣軌上下偏移
    1.0,   // 6. 士氣軌孔距縮放
    86.5,  // 7. 當前生命 Y
    0,     // 8. 當前生命 X 偏移
    5.8,   // 9. 當前生命孔距
    5.9,   // 10. 最大生命孔距
    0,     // 11. 最大生命上下
    0,     // 12. 最大生命起點
    8.03,  // 13. 屬性列垂直行距
    { left: 20, right: 11, top: 3.5 } // 14. 標題位置
  ),

  // 十字弩手
  crossbowman: layout(
    55.5,  // 1. 屬性軌起點 X
    5.8,   // 2. 屬性軌孔距
    0,     // 3. 屬性軌上下偏移
    10.9,  // 4. 士氣軌 X
    -0.8,  // 5. 士氣軌上下偏移
    1.0,   // 6. 士氣軌孔距縮放
    86.5,  // 7. 當前生命 Y
    -1.9,  // 8. 當前生命 X 偏移
    5.8,   // 9. 當前生命孔距
    5.9,   // 10. 最大生命孔距
    0,     // 11. 最大生命上下
    0      // 12. 最大生命起點
  ),

  // 割喉者
  cutthroat: layout(
    56.0,  // 1. 屬性軌起點 X
    5.9,   // 2. 屬性軌孔距
    1.3,   // 3. 屬性軌上下偏移
    11.6,  // 4. 士氣軌 X
    0,    // 5. 士氣軌上下偏移
    0.99,   // 6. 士氣軌孔距縮放
    87.3,  // 7. 當前生命 Y
    -1.3,     // 8. 當前生命 X 偏移
    5.75,   // 9. 當前生命孔距
    5.8,   // 10. 最大生命孔距
    -0.5,     // 11. 最大生命上下
    0.35      // 12. 最大生命起點
  ),

  // 獵人
  huntress: layout(
    56.85, // 1. 屬性軌起點 X
    5.92,  // 2. 屬性軌孔距
    -3.8,  // 3. 屬性軌上下偏移
    11.5,  // 4. 士氣軌 X
    -4.85, // 5. 士氣軌上下偏移
    0.99,  // 6. 士氣軌孔距縮放（小於 1 縮小）
    85.5,  // 7. 當前生命 Y
    -1.5,     // 8. 當前生命 X 偏移
    5.92,   // 9. 當前生命孔距
    5.9,   // 10. 最大生命孔距
    0,     // 11. 最大生命上下
    0      // 12. 最大生命起點
  ),

  // 傭兵
  landsknecht: layout(
    57.7,  // 1. 屬性軌起點 X
    6.0,   // 2. 屬性軌孔距
    0.5,   // 3. 屬性軌上下偏移
    12.3,  // 4. 士氣軌 X
    -0.75, // 5. 士氣軌上下偏移
    1.0,   // 6. 士氣軌孔距縮放
    87.0,  // 7. 當前生命 Y
    0,     // 8. 當前生命 X 偏移
    5.8,   // 9. 當前生命孔距
    5.9,   // 10. 最大生命孔距
    0,     // 11. 最大生命上下
    0,     // 12. 最大生命起點
    8.03,  // 13. 屬性列垂直行距
    { left: 20, right: 11, top: 3.5 } // 14. 標題位置
  ),

  // 步兵
  'man-at-arms': layout(
    56.3,  // 1. 屬性軌起點 X
    5.9,   // 2. 屬性軌孔距
    -0.2,  // 3. 屬性軌上下偏移
    12.2,  // 4. 士氣軌 X
    -1.0,  // 5. 士氣軌上下偏移
    0.97,  // 6. 士氣軌孔距縮放
    85.65,  // 7. 當前生命 Y
    -0.4,  // 8. 當前生命 X 偏移
    5.7,   // 9. 當前生命孔距
    5.8,   // 10. 最大生命孔距
    -0.4,  // 11. 最大生命上下（-0.2 約往上 2px）
    0.4,   // 12. 最大生命起點
  ),

  // 醫師
  medic: layout(
    57.2,  // 1. 屬性軌起點 X
    5.95,   // 2. 屬性軌孔距
    -0.6,   // 3. 屬性軌上下偏移
    11.8,  // 4. 士氣軌 X
    -1.9,  // 5. 士氣軌上下偏移
    1,   // 6. 士氣軌孔距縮放
    86,  // 7. 當前生命 Y
    -1.15,     // 8. 當前生命 X 偏移
    5.9,   // 9. 當前生命孔距
    5.9,   // 10. 最大生命孔距
    -0.3,     // 11. 最大生命上下
    -0.1      // 12. 最大生命起點
  ),

  // 術士
  sorceress: layout(
    55.7,  // 1. 屬性軌起點 X
    5.8,   // 2. 屬性軌孔距
    -0.25, // 3. 屬性軌上下偏移
    11.45,  // 4. 士氣軌 X
    -0.9,  // 5. 士氣軌上下偏移
    0.98,   // 6. 士氣軌孔距縮放
    85.7,  // 7. 當前生命 Y
    -0.51, // 8. 當前生命 X 偏移
    5.68,  // 9. 當前生命孔距
    5.8,   // 10. 最大生命孔距
    -0.5,  // 11. 最大生命上下
    0.7    // 12. 最大生命起點
  ),

  // 女巫
  witch: layout(
    57.1,  // 1. 屬性軌起點 X
    6.12,   // 2. 屬性軌孔距
    -1.1,   // 3. 屬性軌上下偏移
    11,  // 4. 士氣軌 X
    -2,  // 5. 士氣軌上下偏移
    1.03,   // 6. 士氣軌孔距縮放
    86.7,  // 7. 當前生命 Y
    -1.6,     // 8. 當前生命 X 偏移
    5.95,   // 9. 當前生命孔距
    6,   // 10. 最大生命孔距
    0.8,     // 11. 最大生命上下
    0.3,      // 12. 最大生命起點
    8.38
  ),
};
