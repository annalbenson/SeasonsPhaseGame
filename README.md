# PhaseGame — Seasons

A 12-month atmospheric maze game built with [Phaser 3](https://phaser.io/) + Vite + TypeScript.

## How to play

```
npm install
npm run dev
```

Navigate to `http://localhost:5173`. Guide your character through a procedurally generated maze each month. Collect objectives, unlock gates, avoid the hazard, and reach the goal to advance. Complete all 12 months to finish the year.

**Controls:** Arrow keys or WASD — tap to step, hold to slide
**R** — new maze (same month) · **M** — return to title · **E** — skip to end screen

## Seasons

The game cycles through all 12 months, each with a distinct season palette, weather effects, character sprites, and a roaming hazard. Each month opens with a quote card; season boundaries get an additional season title card.

| Season | Player | Hazard | Hiding spot | Objective | Weather |
|--------|--------|--------|-------------|-----------|---------|
| Winter (Jan–Feb, Dec) | Bunny | Owl | Snow pile | Collect 2 snowflakes | Snow |
| Spring (Mar–May) | Bee | Frog | Tall grass | Pollinate 3 flowers | Rain |
| Summer (Jun–Aug) | Fairy | Snake | Bush | Water 2 plants | Heat shimmer |
| Fall (Sep–Nov) | Squirrel | Fox | Leaf pile | Plant 2 acorns | Falling leaves |

## Hazard & lives

A roaming predator patrols the maze. Getting within 5 cells triggers hunting mode (red aura). Getting caught costs a life — 3 per month. Lose all 3 and the season restarts from its first month.

**Hiding:** step into a bush to become invisible. Bushes are guaranteed near the hazard spawn, along the solution path, and at the midpoint between you and the enemy.

## Keys & gates

Season-coloured diamonds (◆) are keys; coloured bars are locked gates. Each gate is placed on a bridge edge (no alternate route), so gates are never bypassable. Keys always appear before their gate on the solution path.

## Side panel

A persistent panel shows current objectives, lives, key inventory, and a colour-coded legend for all game elements.

## Maze generation

All mazes use Kruskal's algorithm — uniform feel, no directional bias. Start and goal are randomised to opposite corners each level.

## End screen

Completing December advances to a closing screen with a final quote before returning to the title.

## Credits

**Background music:** "The Glowing Seed" by Whats Smooth
Source: [Pixabay](https://pixabay.com/music/modern-classical-the-glowing-seed-432624/)
License: [Pixabay Content License](https://pixabay.com/service/license-summary/) (free for use, no attribution required — credited here anyway)
