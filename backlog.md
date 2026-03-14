# PhaseGame Backlog

## Current features (shipped)
- 12-month maze journey through all four seasons with distinct palettes and weather
- 4 season-specific characters, hazards, hiding spots, and objectives
- Kruskal's maze generation with keys/gates on bridge edges
- Fog of war with visibility decay (revealed cells fade back to hidden over time)
- Hard mode with faster fog decay (10s start / 8s duration vs 30s / 15s)
- 9-step hardcoded tutorial teaching movement, keys/gates, enemies, objectives, fog, and all 4 seasonal skills
- Seasonal skills with 15s cooldown: HOP (Winter), BUZZ (Spring), GLOW (Summer), DASH (Fall)
- Scenic obstacles (3 variants per season) shown in legend
- Side panel with objectives, lives, keys, and colour-coded legend
- Quote cards between levels; season title cards at season boundaries
- End screen after completing December
- Enemy collision check on both player move and enemy move (no fast-click evasion; dash still allows evasion)
- Title screen with New Game, New Hard Game, and How to Play
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

## Idea: Raise explore percentage

Players currently only visit ~42% of reachable cells. Place keys farther from the solution path (top 25% most BFS-distant candidates) and spread objectives across all zones so the player must explore laterally.

---

## Idea: Seasons & Weather — active hindrances

Weather currently visual-only. Could add active hindrances per month:

| Month | Weather event | Hindrance mechanic |
|-------|---------------|--------------------|
| Jan   | Blizzard      | Periodic whiteout (reduced visibility) |
| Feb   | Ice storm     | Ice cells cause directional drift |
| Mar   | Rain showers  | Puddles block cells temporarily |
| Apr   | Heavy rain    | Paths flood and close for N seconds |
| May   | Mild / clear  | No hindrance — breather month |
| Jun   | Heat haze     | Shimmer warps far tiles |
| Jul   | Heat wave     | Move cooldown increases |
| Aug   | Thunderstorm  | Lightning blocks random cells |
| Sep   | Wind gusts    | Gusts push player one cell |
| Oct   | Cold wind     | Gust phase every ~8 steps |
| Nov   | First frost   | Key icons partially hidden under frost |
| Dec   | Snowstorm     | Snowdrift tiles cost 2 moves |

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

### GameScene god object (down from 2,200 to 1,078 lines)
Extracted: sprites.ts, scenery.ts, sidePanel.ts, entityPlacement.ts. Remaining candidates: onCaught callback, puzzle placement, maze rendering.

### Sprite construction is verbose
~800 lines of `add.circle(...magic numbers...)` across GameScene and hazard.ts for procedural sprites. Data-driven definitions would be cleaner.

### String-based cell keys
`"col,row"` strings used as map keys everywhere. Works but is not type-safe and easy to typo.

### Missing depth management system
Manual `setDepth()` calls with magic numbers (1.4, 1.5, 2, 100) scattered throughout. No documentation of layer order.

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

## Bug: GameY2Scene hazard stun check missing

`checkHazardCollision()` in GameY2Scene only checks `h.dead`, not `h.stunned`. Stunned enemies still cause collisions in Y2 mode — unlike GameScene which checks both.

---

## Bug: GameY2Scene input inconsistency

Uses `isDown` (continuous hold) for movement instead of `JustDown` (single press) like GameScene. Causes different movement feel between Year 1 and Year 2.

---

## Code quality (continued)

### onCaught callback duplication
`spawnHazard` and `spawnCustomHazards` in GameScene have ~80 lines of nearly identical death/reset logic. Extract to shared method.

### GameY2Scene reimplements sidePanel
GameY2Scene builds header and side panel locally (~90 lines) instead of importing `buildHeader`/`buildSidePanel` from `sidePanel.ts`.

### TutorialScene reimplements fog
TutorialScene has its own fog system (~200 lines) instead of using the extracted `FogOfWar` class.

### TutorialScene builds creature sprites locally
8 creature sprite builders in TutorialScene (~450 lines) instead of using `sprites.ts`. Also duplicates goal lock overlay and objective gem rendering in 3 places.

### Export shuffle from maze.ts
`shuffle()` exists in `maze.ts` but isn't exported. Re-implemented inline in `entityPlacement.ts` twice.

### Gate interface inconsistency
GameScene uses `fromCol/fromRow/toCol/toRow`, ToolkitScene uses `{from: {col,row}, to: {col,row}}`. Should unify.

### SeasonName type duplication
`SeasonName` defined in `skills.ts` separately from season names in `seasons.ts`. Can diverge.

### TutorialScene defines local SeasonThemeT
Should import `SeasonTheme` from `seasons.ts` instead of defining its own interface.

### No scene lifecycle cleanup
No `shutdown()` handlers in GameScene or GameY2Scene. Event listeners, tweens, and timed callbacks may accumulate on scene restart.

### Gameplay parameter constants
Hunt distance, stun duration, cooldown, move speed, fog decay — all scattered as magic numbers. Should consolidate into a gameplay params object.

### Non-deterministic tests
`pickOffPath()` uses `Math.random()` with no seed. Test failures are irreproducible. Tests also skip trials where gate count doesn't match, inflating pass rates.
