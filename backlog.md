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

### GameScene god object (2,200+ lines)
Beyond fog and skills, the side panel, puzzle placement, and maze rendering could be extracted into focused classes.

### Sprite construction is verbose
~800 lines of `add.circle(...magic numbers...)` across GameScene and hazard.ts for procedural sprites. Data-driven definitions would be cleaner.

### String-based cell keys
`"col,row"` strings used as map keys everywhere. Works but is not type-safe and easy to typo.

### Missing depth management system
Manual `setDepth()` calls with magic numbers (1.4, 1.5, 2, 100) scattered throughout. No documentation of layer order.

### No ESLint / Prettier
No automated code style enforcement configured.
