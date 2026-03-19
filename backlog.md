# PhaseGame Backlog

## Current features (shipped)
- 12-month maze journey through all four seasons with distinct palettes and weather
- 4 season-specific characters, hazards, hiding spots, and objectives
- Kruskal's maze generation with keys/gates on bridge edges
- Fog of war with visibility decay (revealed cells fade back to hidden over time)
- Hard mode with faster fog decay (10s start / 8s duration vs 30s / 15s)
- 9-step hardcoded tutorial teaching movement, keys/gates, enemies, objectives, fog, and all 4 seasonal skills
- Seasonal skills with 15s cooldown: BURROW (Winter), BUZZ (Spring), GLOW (Summer), DASH (Fall)
- BURROW is a toggle skill — SPACE to dig in, SPACE to emerge (no timeout)
- Scenic obstacles (3 variants per season) shown in legend
- Side panel with objectives, lives, keys, and colour-coded legend
- Quote cards between levels; season title cards at season boundaries
- End screen after completing December
- Enemy collision check on both player move and enemy move (no fast-click evasion; dash still allows evasion)
- Hazards walk over hidden (burrowed) players instead of blocking them
- Title screen with Year One, Year One (Hard Mode), Year One (Random Start), Year Two, How to Play, Map Toolkit, My Stats
- Zone-aware entity placement — objectives spread across zones, keys pushed far off solution path
- Firebase authentication with sign in/out and stats tracking
- Version tag in bottom-right corner

---

## ✅ Season-specific level objectives (shipped)

| Season | Player | Hazard | Hiding | Objective |
|--------|--------|--------|--------|-----------|
| Spring | Bee    | Frog   | Tall grass  | Pollinate 3 flowers |
| Summer | Fairy  | Snake  | Bush        | Water 2 plants |
| Fall   | Squirrel | Fox  | Leaf pile   | Plant 2 acorns |
| Winter | Bunny  | Owl    | Snow pile   | Collect 2 snowflakes |

---

## ✅ Fog of war with decay (shipped)

Tiles fade back toward hidden after ~30s (normal) or ~10s (hard) of not being in the player's vicinity. Encourages quick movement and re-exploration.

---

## ✅ Tutorial (shipped)

9 hardcoded steps with jagged, purpose-built maps. Teaches movement, keys/gates, enemies/hiding, objectives, fog, and one skill per season. Accessible from title screen via "How to Play".

---

## ✅ Scenic obstacles / landmarks (shipped)

3 season-appropriate scenic obstacles per season, shown in legend. Non-blocking, decorative sprites placed on non-path cells.

---

## ✅ Winter scenic obstacle fix (shipped)

Replaced snowdrift with grey rock/boulder formations to distinguish from snow pile hiding spots.

---

## ✅ Color contrast / accessibility (shipped)

Text readability audit — reviewed all seasonal color schemes for contrast.

---

## ✅ Raise explore percentage (shipped)

Players previously only visited ~42% of reachable cells. Fixed with zone-aware objective placement (1 per zone minimum), keys pushed to top 5% most BFS-distant off-path candidates, wider spacing, and scaled objective counts. Explore % now averages 60%+ with 43%+ minimum.

---

## TODO (Year Two): Design vision

**Narrative:** Four bears, four seasons — each heading home to feed their cubs. The environment is the opposition, not enemies. Weather hindrances replace roaming hazards. No hiding spots. Emphasis on movement, exploration, and the scrolling screen.

**Design pillars:** Movement & exploration > hiding & avoiding enemies.

### Characters & Objectives

| Season | Player | Objective | Narrative |
|--------|--------|-----------|-----------|
| Winter | Polar Bear | Gather fish for cubs | Navigating blizzards to reach the den |
| Spring | Brown Bear | Collect honey for cubs | Foraging through spring rains |
| Summer | Panda | Find bamboo for cubs | Pushing through summer heat |
| Fall | Black Bear | Gather berries for cubs | Stocking up before first frost |

No roaming hazard sprites. No hiding spots. Weather *is* the hazard.

### Weather hindrances (one per season, intensifies over 3 months)

| Season | Mechanic | Visual | Intensification |
|--------|----------|--------|-----------------|
| Spring | Flooded paths — some paths temporarily blocked, must route around | Rain cloud sprites | More paths flood, longer flood duration |
| Summer | Heat exhaustion — bear must stop at water sources to cool off | Hot sun sprites | More frequent stops needed, water sources scarcer |
| Fall | Wind gusts — push the bear off course | Grey cloud sprites | Stronger/more frequent gusts, longer push distance |
| Winter | Snowdrifts — tiles cost extra moves, reduced visibility | Snowfall/blizzard | Heavier snow, more drift tiles, shorter visibility |

---

## Idea: Difficulty scaling

- Maze size grows from 8×8 (Jan) to 14×14 (Dec)
- Keys/gates count increases from 1 → 3 over the year
- Best time per month tracked on a "Year Record" screen

---

## Idea: Year map scene

`YearMapScene` — 12-month calendar grid showing completion status and best times.

---

## Idea: Objective animations

- Animate bloom/water/plant effects more elaborately (particle burst matching season palette)
- Brief "objective unlocked" banner text when last objective collected

---

## Idea: Winter objective variant

Winter currently has 2 snowflakes. Could try 5 drifting sparkle items for variety.

---

## Idea: localStorage persistence

- Track `tutorialComplete` to auto-skip tutorial on return visits
- Save progress (current month, lives) so player can resume

---

## Code quality

### ✅ Deduplicate DIRS constant
DIRS/MOVE_DIRS defined identically in 4 files (maze.ts, mazeUtils.ts, hazard.ts, TutorialScene.ts). Single source of truth needed.

### ✅ Extract fog-of-war system
~150 lines of fog logic in GameScene (tile creation, reveal, decay timer, respawn reveal). Clean boundary, easy to extract into its own class.

### ✅ Extract skill system
Season-specific skill logic (HOP, STING, GLOW, DASH) scattered across GameScene methods. Strategy pattern would isolate each skill cleanly.

### ✅ Pre-compute color hex strings in seasons.ts
Stop doing bit-shifting at runtime to convert integer colors to hex strings. Season themes should include ready-to-use hex strings.

### GameScene god object (down from 2,200 to 1,075 lines)
Extracted: sprites.ts, scenery.ts, sidePanel.ts, entityPlacement.ts, gameplay.ts (constants). Remaining candidates: puzzle placement, maze rendering.

### Sprite construction is verbose
All sprite factories consolidated in `sprites.ts` (player + enemy + objective). Still ~460 lines of `add.circle(...magic numbers...)`. Data-driven definitions would be cleaner but low priority.

### String-based cell keys
`"col,row"` strings used as map keys everywhere. Works but is not type-safe and easy to typo.

### ✅ Depth management system
Replaced magic numbers with named `DEPTH` constants from `gameplay.ts`. Layer order documented in one place.

### Test hop-aware BFS
`hopAwareBfs` is a private method on GameScene — pure grid logic (walls + scenery) that validates winter levels are solvable when blocking rocks require HOP. Extract to `mazeUtils.ts` and add tests that generate levels with blocking rocks on the solution path and verify solvability via hop.

### No ESLint / Prettier
No automated code style enforcement configured.

---

## Map Toolkit improvements

### ✅ Undo/redo
Snapshot-based undo (Z) and redo (Y) with 50-deep stack.

### ✅ Save/load maps
localStorage persistence with up to 10 saved maps, load from setup screen.

### ✅ Generate random maze
"Generate" button runs Kruskal's to pre-fill the grid as a starting point for editing.

### ✅ Entity count display
Tool panel shows counts next to each entity type (e.g. "Enemy 2/4", "Key 3").

### Drag to paint walls
Hold+drag to toggle multiple wall edges in one gesture instead of clicking each edge individually.

### Custom purple-yellow color scheme
Original stretch goal: a custom toolkit-only palette (purple/yellow from the tutorial) as a 5th season option.

### Share maps
Export/import maps as a compact string (base64-encoded JSON) for sharing with others.

### Map rename
Let users name their saved maps instead of auto-generated names.

### Confirmation on Clear
Prompt before wiping the entire map to prevent accidental loss.

---

## ✅ Bug: Stone next to gate breaks HOP (fixed)

Fixed by adding `gateProtected` filtering to `placeBlockingRocks()` — rocks can no longer be placed on cells adjacent to gate edges, matching the existing protection in `placeBushes()`.

---

## Bug: Maze walls too thin

Walls in the maze levels are hard to see when playing. Consider increasing the wall stroke width (currently 4px in GameScene `create()`) or adding a subtle shadow/glow to improve visibility.

---

## Idea: Season-specific music

Different ambient music or soundtrack per season to enhance the atmosphere. Would need royalty-free tracks or procedural audio for each of the four seasons.

---

## ✅ Bug: GameY2Scene hazard stun check missing (fixed)

Added `h.stunned` check to `checkHazardCollision()`.

---

## ✅ Bug: GameY2Scene input inconsistency (fixed)

Changed movement from `isDown` to `JustDown` to match Year One feel.

---

## Code quality (continued)

### ✅ onCaught callback duplication
Extracted to shared `onCaught()` method on GameScene.

### GameY2Scene reimplements sidePanel
GameY2Scene builds header and side panel locally (~90 lines) instead of importing `buildHeader`/`buildSidePanel` from `sidePanel.ts`.

### TutorialScene reimplements fog
TutorialScene has its own fog system (~200 lines) instead of using the extracted `FogOfWar` class.

### ✅ TutorialScene builds creature sprites locally
Extracted 5 enemy sprite factories (frog, snake, fox, owl, wolf) into shared `createEnemySprite()` in `sprites.ts`. Both Hazard class and TutorialScene now use the shared factories. Tutorial enemies also gained full-detail tweens (tongue flicker, eye glow, etc.) that were missing from the simplified copies.

### ✅ Export shuffle from maze.ts
Exported from `maze.ts`, removed duplicate from `terrain.ts`.

### Gate interface inconsistency
GameScene uses `fromCol/fromRow/toCol/toRow`, ToolkitScene uses `{from: {col,row}, to: {col,row}}`. Should unify.

### ✅ SeasonName type duplication
Defined once in `seasons.ts`, re-exported from `skills.ts`.

### ✅ TutorialScene local SeasonThemeT
Renamed to `TutorialTheme` with documentation explaining why it's intentionally separate from `SeasonTheme` (carries extra tutorial-specific fields).

### ✅ Scene lifecycle cleanup
Added `shutdown()` to GameScene and GameY2Scene — destroys hazards, kills tweens, removes timed events.

### ✅ Gameplay parameter constants
Consolidated into `gameplay.ts`: hunt distance, stun duration, cooldown, move speed, fog decay, dash distance, glow radius, swim duration.

### Non-deterministic tests
`pickOffPath()` uses `Math.random()` with no seed. Test failures are irreproducible. Tests also skip trials where gate count doesn't match, inflating pass rates.
