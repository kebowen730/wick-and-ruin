// Shared by server (node ESM) and client (browser ESM, served at /shared/constants.js)
export const C = {
  WORLD_W: 2400, WORLD_H: 1600,
  TICK: 60, SNAP: 30,
  PLAYER_R: 16, SPEED: 230,
  FLAME_START: 70, FLAME_MAX: 150, REGEN_TO: 50, REGEN_RATE: 3,
  EMBER_COST: 4, EMBER_DMG: 20, EMBER_SPEED: 620, EMBER_LIFE: 1.1, EMBER_R: 6, FIRE_CD: 0.32,
  DASH_SPEED: 780, DASH_TIME: 0.18, DASH_CD: 2.5, DASH_DMG: 22,
  WAX_HEAL: 18, WAX_R: 10, WAX_MAX: 14, WAX_SPAWN_EVERY: 2.5, DEATH_WAX: 4,
  WATER_SLOW: 0.55, WATER_DRAIN: 9,
  SNUFFER_R: 34, SNUFFER_SPEED: 120, SNUFFER_DMG: 45, SNUFFER_HIT_CD: 1.5, SNUFFER_RETARGET: 6, SNUFFER_STUN: 0.6,
  RESPAWN: 3, WIN_SOULS: 13, INTERMISSION: 8,
  MIN_PLAYERS: 4, MAX_PLAYERS: 12,
  LIGHT_MIN: 90, LIGHT_PER_FLAME: 2.2,
};

// light radius (world px) of a candle with the given flame
export const lightRadius = (flame) => C.LIGHT_MIN + Math.max(0, flame) * C.LIGHT_PER_FLAME;

// Solid tombs / pillars: axis-aligned rects {x,y,w,h} (top-left origin)
export const WALLS = [
  { x: 1120, y: 720, w: 160, h: 160 },   // central mausoleum
  { x: 380, y: 300, w: 60, h: 220 }, { x: 1960, y: 300, w: 60, h: 220 },
  { x: 380, y: 1080, w: 60, h: 220 }, { x: 1960, y: 1080, w: 60, h: 220 },
  { x: 700, y: 180, w: 240, h: 50 }, { x: 1460, y: 180, w: 240, h: 50 },
  { x: 700, y: 1370, w: 240, h: 50 }, { x: 1460, y: 1370, w: 240, h: 50 },
  { x: 760, y: 620, w: 50, h: 360 }, { x: 1590, y: 620, w: 50, h: 360 },
  { x: 1010, y: 420, w: 380, h: 44 }, { x: 1010, y: 1136, w: 380, h: 44 },
  { x: 140, y: 770, w: 150, h: 60 }, { x: 2110, y: 770, w: 150, h: 60 },
];

// Puddles of crypt-water: circles {x,y,r}. Slow candles and drain flame.
export const WATER = [
  { x: 560, y: 800, r: 110 }, { x: 1840, y: 800, r: 110 },
  { x: 1200, y: 260, r: 90 }, { x: 1200, y: 1340, r: 90 },
  { x: 960, y: 800, r: 60 }, { x: 1440, y: 800, r: 60 },
];
