# PhaseGame Backlog

## Current features
- 4 maze generation algorithms (DFS, Prim's, Binary Tree, Kruskal's) selectable from menu
- Keys and gates: collect gold keys to unlock red gates blocking the solution path
- Inventory HUD (top-right)
- R = new maze, M = back to menu

---

## Idea: Seasons & Weather — 12-Month Maze Journey

### Concept
A 12-maze game with a continuous time-of-year theme. Each maze represents one month.
The player progresses through the full calendar year, with visual palette and weather events
matching the real season. Weather acts as **active hindrances** — not just decoration.

### Month → Season mapping
| Month | Season | Weather event | Hindrance mechanic |
|-------|--------|---------------|--------------------|
| Jan   | Deep winter  | Blizzard        | Periodic whiteout (canvas dims, reduced visibility) |
| Feb   | Winter       | Ice storm       | Random cell floors become "ice" — directional drift on step |
| Mar   | Early spring | Rain showers    | Puddles block cells temporarily |
| Apr   | Spring       | Heavy rain      | Paths occasionally flood and close for N seconds |
| May   | Late spring  | Mild / clear    | No hindrance — "breather" month |
| Jun   | Early summer | Heat haze       | Shimmer effect warps the minimap / makes far tiles hard to read |
| Jul   | High summer  | Heat wave       | Move cooldown increases (sluggish movement) |
| Aug   | Late summer  | Thunderstorm    | Lightning strikes random cells, blocking them briefly |
| Sep   | Early autumn | Wind gusts      | Gusts push the player one cell in gust direction after each step |
| Oct   | Autumn       | Cold wind       | Every ~8 steps, a gust phase: player must "fight" for 2 moves |
| Nov   | Late autumn  | First frost     | Key icons become partially hidden under frost overlay |
| Dec   | Winter       | Snowstorm       | Snowdrift tiles accumulate — stepping on one costs 2 moves |

### Visual palette per season
- **Winter (Dec–Feb)**: icy blues and whites (`#a8d8ea`, `#cce5ff`)
- **Spring (Mar–May)**: sage greens, soft yellows (`#6b9e8a`, `#d4edaf`)
- **Summer (Jun–Aug)**: warm amber and gold (`#f5c842`, `#e07b39`)
- **Autumn (Sep–Nov)**: terracotta, rust, deep orange (`#c07850`, `#8b3a1e`)

### Progression
- Completing month N unlocks month N+1
- Difficulty scales: maze size grows from 8×8 (Jan) to 14×14 (Dec)
- Keys/gates count increases from 1 each → 3 each over the year
- Best time per month tracked on a "Year Record" screen

### New scenes needed
- `YearMapScene` — 12-month calendar grid showing completion status
- `SeasonScene` extends `GameScene` — adds weather overlay and hindrance update loop
- `WeatherSystem` — pluggable class; each month gets its own `WeatherSystem` implementation

---

## ✅ Season-specific level objectives (shipped)

Each season requires a short task before the exit opens.

| Season | Player | Hazard | Hiding | Objective |
|--------|--------|--------|--------|-----------|
| Spring | Bee    | Frog   | Tall grass  | Pollinate 3 flowers (visit dim buds; they bloom on contact) |
| Summer | Fairy  | Snake  | Bush        | Water 2 potted plants |
| Fall   | Squirrel | Fox  | Leaf pile   | Plant 2 acorns |
| Winter | Bunny  | Owl    | Snow pile   | None — exit open immediately |

HUD: `◆◇◇  POLLINATE` style counter (top-right). Goal tile has a dim overlay that fades when unlocked.

### Ideas for next iteration
- Animate the bloom/water effect more elaborately (particle burst matching season palette)
- Add a brief "objective unlocked" banner text when the last one is collected
- Winter objective: collect snowflakes (5 drifting sparkle items)?

### Weather system interface (sketch)
```ts
interface WeatherSystem {
    month: number;
    name: string;
    update(delta: number, player: {col: number, row: number}): void;
    onPlayerStep?(from: {col, row}, to: {col, row}): { blocked: boolean; drift?: {dc, dr} };
    onRender?(scene: Phaser.Scene): void;
    destroy(): void;
}
```
