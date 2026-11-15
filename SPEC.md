# WICK & RUIN — build contract

Top-down multiplayer arena brawler. Every player is a small living CANDLE in a pitch-dark flooded crypt.
Your **flame is your health AND your light radius** — hurt candles are dim and half-blind.
Spit embers (costs a little flame), gust-dash through rivals, slurp wax puddles to grow brighter.
A huge shadowy hand, **THE SNUFFER**, drifts through walls hunting whichever candle burns brightest.
A kill = 1 soul. First to 13 souls wins the round. Tone: whimsical, storybook-gothic, a little dark.

Stack: Node 22 ESM server (`ws` only dep), server-authoritative. Browser client: plain ES modules + Canvas 2D +
WebAudio, NO build step, NO external assets/libraries/fonts-from-CDN (everything drawn/synthesised in code).
All numbers live in `shared/constants.js` (`C`, `lightRadius`, `WALLS`, `WATER`) — READ IT, import it, never hardcode.
Server imports `../shared/constants.js`; browser imports `/shared/constants.js`.

## Files & owners (only write YOUR file(s); never edit others)
- `shared/constants.js`, `public/main.js`, package.json, Dockerfile — lead (exists / being written)
- `server/index.js`  — http static + websocket + loops
- `server/game.js`   — simulation
- `server/bots.js`   — AI bots
- `public/index.html`, `public/style.css`, `public/hud.js` — page, join screen, HUD
- `public/input.js`  — keyboard/mouse/touch
- `public/render.js` — camera, floor, darkness/lighting, particles, screen shake
- `public/sprites.js`— drawing of individual entities
- `public/audio.js`  — synthesised sound

## Wire protocol (JSON text frames over WebSocket at path `/ws`)
Client → server:
- `{t:'join', name}` (name trimmed to 16 chars; empty → server invents a silly candle name)
- `{t:'in', mx, my, aim, fire, dash}` ~30/s. mx,my in [-1,1] move vector; aim radians (atan2, y down); fire/dash booleans (held state)
Server → client:
- `{t:'welcome', id}` after join
- `{t:'state', ...snapshot}` 30/s

### Snapshot (returned by `game.snapshot()`; index.js adds `t:'state'`)
```
{ time,                       // server seconds since start
  players: [{id,name,x,y,aim,flame,alive,souls,dash,dashCd,hue,bot,respawn}],
       // dash: bool currently dashing; dashCd: seconds until dash ready; hue: 0-359 wax colour;
       // respawn: seconds until respawn (0 if alive); flame 0..C.FLAME_MAX
  embers:  [{id,x,y,vx,vy,owner}],
  wax:     [{id,x,y}],
  snuffer: {x,y,target,stun},       // target: player id or null; stun: bool
  round:   {phase,winner,timer},    // phase 'play'|'over'; winner: name|null; timer: secs left of intermission
  events:  [ ... ] }                // everything that happened since the previous snapshot (then cleared)
```
Round x,y,flame etc. to 1 decimal. All ids are strings.

### Events
- `{k:'fire',id,x,y}` ember spat   · `{k:'dash',id,x,y}`   · `{k:'fizzle',x,y}` ember died on a wall
- `{k:'hit',id,by,x,y,dmg}` id=victim, by=attacker id
- `{k:'snuff',id,x,y}` the Snuffer pinched a player
- `{k:'death',id,by,x,y,msg}` by = player id | 'snuffer' | 'water'; msg = ready-to-show whimsical kill-feed line
- `{k:'pickup',id,x,y}` wax eaten · `{k:'spawn',id,x,y}` (re)spawn · `{k:'win',id,name}` round won

## Rules (server/game.js)
- World 0..WORLD_W × 0..WORLD_H, clamped. Candles are circles (PLAYER_R) that collide with WALLS (push out) — not with each other.
- Move at SPEED (normalise input vector). In WATER: speed × WATER_SLOW and flame drains WATER_DRAIN/s (can kill → by:'water').
- Flame: spawn with FLAME_START; if below REGEN_TO, regen REGEN_RATE/s; cap FLAME_MAX; ≤0 → death.
- Fire (held): every FIRE_CD spawn ember at candle edge going EMBER_SPEED along aim, costs EMBER_COST flame
  (cannot fire if flame ≤ EMBER_COST+1). Embers live EMBER_LIFE s, die on walls/world edge (fizzle), hit other alive
  candles (circle test) for EMBER_DMG, and stun the Snuffer for SNUFFER_STUN s if they touch it (ember consumed).
- Dash: if dashCd≤0 → DASH_TIME seconds moving at DASH_SPEED in move direction (aim direction if not moving), dashCd=DASH_CD.
  Each other candle touched during a dash takes DASH_DMG once per dash. Dashing candles are immune to embers.
- Wax: one puddle spawns every WAX_SPAWN_EVERY s at a random free spot (not in wall) while count < WAX_MAX.
  Touch → +WAX_HEAL flame (capped), pickup event. A dying candle drops DEATH_WAX puddles scattered ~40px around it.
- Death: alive=false, respawn timer RESPAWN, killer (if a player) souls+1. Respawn at a random free spot away from
  other candles & the Snuffer with FLAME_START, spawn event. 2s of spawn protection is NOT needed.
- Snuffer: circle SNUFFER_R, ignores walls, moves SNUFFER_SPEED toward its target. Every SNUFFER_RETARGET s it
  retargets the alive candle with the highest flame (ties → most souls). Touching a candle: SNUFFER_DMG damage,
  snuff event, then it cannot hit again for SNUFFER_HIT_CD (it keeps drifting). Stunned → doesn't move/hit.
- Round: first candle to WIN_SOULS → win event, phase 'over' for INTERMISSION s (simulation keeps running but no damage
  is dealt and nobody can fire), then all souls reset, everyone respawns, phase 'play'.
- Death messages: pick randomly from many whimsical templates, e.g. "{killer} snuffed {victim}",
  "{victim} was reduced to a sad puddle by {killer}", "The Snuffer pinched out {victim}", "{victim} went for a swim. Candles can't swim."

## Module interfaces (exact — other modules call these)
### server/game.js
```
export class Game {
  players  // Map<id, player>; player has at least {id,name,x,y,aim,flame,alive,souls,isBot,dashCd}
  embers   // array of {id,x,y,vx,vy,owner}
  wax      // array of {id,x,y}
  snuffer  // {x,y,target,stun}
  round    // {phase,winner,timer}
  addPlayer(id, name, isBot=false) // returns player; empty name → random silly name ("Sir Drips-a-Lot", "Waxwell", "Tallow Swift"...)
  removePlayer(id)
  setInput(id, {mx,my,aim,fire,dash})   // sanitise: non-finite → 0
  step(dt)                               // advance simulation
  snapshot()                             // object described above; clears events
}
```
### server/bots.js
```
export class BotManager { constructor(game); update(dt) }
```
update(): keeps `humans + bots >= C.MIN_PLAYERS` while at least 0 humans (bots always present so the arena is alive);
removes a bot when humans+bots > MIN_PLAYERS and a bot exists. Bot ids 'bot1','bot2'…; names whimsical with no tag.
Drives each bot through `game.setInput`. Reads game.players / embers / wax / snuffer and `WALLS`,`WATER`.
### public modules (browser ESM)
```
// input.js
export function createInput(canvas)  // → { get() → {mx,my,aim,fire,dash} }
   // The camera ALWAYS centres the local candle on screen, so aim = atan2(mouseY - innerHeight/2, mouseX - innerWidth/2).
// sprites.js — all draw in WORLD coordinates on an already-transformed ctx; t = seconds
export function drawCandle(ctx, p, t, isMe)   // p = snapshot player (alive ones only are passed)
export function drawSnuffer(ctx, s, t)
export function drawWax(ctx, w, t)
export function drawEmber(ctx, e, t)
export function drawWall(ctx, rect, t)
export function drawWater(ctx, circle, t)
// render.js
export function createRenderer(canvas) // → { draw(view, dt), event(ev) }
   // view = { meId, time, players, embers, wax, snuffer, round }  (same shapes as snapshot, already interpolated)
   // camera centred on view.players.find(p=>p.id===meId) (keep last position while dead/missing). No clamping.
// audio.js
export function createAudio() // → { unlock(), play(kind, vol=1) }
   // kinds: fire dash hit hurt death pickup fizzle snuff spawn win
// hud.js
export function createHud() // → { showJoin(onJoin /* (name) => void */), update(view), event(ev, view), setConnected(bool) }
```
`public/index.html` must contain `<canvas id="game">` (full-window), HUD DOM, and `<script type="module" src="/main.js"></script>`.

## Agent rules
- Work in /Users/kenneth/projects/wick-and-ruin. Write only your file(s). Do not run npm install, git, or any deploy.
- Syntax-check with `node --check <file>` (works for browser modules too). Keep it tight; ship working code fast.
- Final reply: 3 lines max — what you wrote and anything the lead must know.
