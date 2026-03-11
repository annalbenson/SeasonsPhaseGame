# PhaseGame — Seasons

A 12-month atmospheric maze game built with [Phaser 3](https://phaser.io/) + Vite + TypeScript.

## How to play

```
npm install
npm run dev
```

Navigate to `http://localhost:5173`. Guide your character through a procedurally generated maze each month. Reach the goal flower in the bottom-right corner to advance to the next month.

**Controls:** Arrow keys or WASD
**R** — new maze (same month)
**M** — return to title

## Seasons

The game cycles through all 12 months, each with a distinct season palette, weather effects, character sprites, and a roaming hazard.

| Season | Player | Hazard | Hiding spot | Objective | Weather |
|--------|--------|--------|-------------|-----------|---------|
| Spring (Mar–May) | Bee | Frog | Tall grass | Pollinate 3 flowers | Rain |
| Summer (Jun–Aug) | Fairy | Snake | Bush | Water 2 plants | Heat shimmer |
| Fall (Sep–Nov) | Squirrel | Fox | Leaf pile | Plant 2 acorns | Falling leaves |
| Winter (Dec–Feb) | Bunny | Owl | Snow pile | — (no objective) | Snow |

Each month header shows a historical quote from a poet who wrote about that time of year.

## Objectives

Before the exit opens, most seasons require you to complete a short task:

- **Spring** — step on all 3 flower buds scattered around the maze (they bloom on contact)
- **Summer** — step on 2 wilted potted plants to water them
- **Fall** — step on 2 acorns to plant them
- **Winter** — no objective; the exit is open immediately

When the last objective is collected, the goal tile unlocks with a light flash.

## Hazard & lives

A roaming predator patrols the maze. When it gets within 5 cells it switches to hunting mode (red aura glows). Getting caught sends you back to start and costs a life — you have 3 per month. Lose all 3 and the month resets.

**Hiding:** step into a bush (darker clusters in wider corridors) to become invisible to the hazard.

## Keys & gates

Gold diamonds (◆) scattered along the solution path are keys. Red bars are locked gates. Collect a key then walk into a gate to open it. Gates are always placed after their key on the path, so the maze is always completable.

## Maze generation

Four algorithms are available (selected randomly per maze):

| Algorithm | Character |
|-----------|-----------|
| Recursive Backtracker (DFS) | Long winding corridors, few dead ends |
| Prim's Algorithm | Bushy — many short dead ends |
| Binary Tree | Fast; notice the top-row bias |
| Kruskal's Algorithm | Uniform feel, no directional bias |

## Credits

**Background music:** "The Glowing Seed" by Whats Smooth
Source: [Pixabay](https://pixabay.com/music/modern-classical-the-glowing-seed-432624/)
License: [Pixabay Content License](https://pixabay.com/service/license-summary/) (free for use, no attribution required — credited here anyway)
