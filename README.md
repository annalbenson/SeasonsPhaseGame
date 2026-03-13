# PhaseGame — Seasons

A 12-month atmospheric maze game built with [Phaser 3](https://phaser.io/) + Vite + TypeScript.

## How to play

```
npm install
npm run dev
```

Navigate to `http://localhost:5173`. Guide your character through a procedurally generated maze each month. Collect objectives, unlock gates, avoid the hazard, and reach the goal to advance. Complete all 12 months to finish the year.

**Controls:**
- **Arrow keys / WASD** — tap to step, hold to slide
- **SPACE** — use seasonal skill (15s cooldown)
- **R** — new maze (same month) · **M** — return to title · **E** — skip to end screen

## Game modes

- **New Game** — standard fog decay (30s reveal, 15s fade)
- **New Hard Game** — faster fog decay (10s reveal, 8s fade) for more time pressure

## Tutorial

A 9-step guided tutorial accessible from the title screen ("How to Play"). Each step uses a small, handcrafted map to teach one mechanic:

1. Movement — reach the goal
2. Keys & gates — collect a key to unlock a gate
3. Enemies & hiding — avoid the hazard using hiding spots
4. Objectives — collect treasures with backtracking before the goal unlocks
5. Fog of war — navigate with limited visibility
6. Winter skill (HOP) — leap over obstacles
7. Spring skill (BUZZ) — stun nearby enemies
8. Summer skill (GLOW) — reveal the area through fog
9. Fall skill (DASH) — sprint 3 cells in one move

## Seasons

The game cycles through all 12 months, each with a distinct season palette, weather effects, character sprites, and a roaming hazard. Each month opens with a quote card; season boundaries get an additional season title card.

| Season | Player | Hazard | Hiding spot | Objective | Skill |
|--------|--------|--------|-------------|-----------|-------|
| Winter (Jan–Feb, Dec) | Bunny | Owl | Snow pile | Collect 2 snowflakes | HOP — leap over an obstacle |
| Spring (Mar–May) | Bee | Frog | Tall grass | Pollinate 3 flowers | BUZZ — stun nearby enemies |
| Summer (Jun–Aug) | Fairy | Snake | Bush | Water 2 plants | GLOW — reveal surrounding fog |
| Fall (Sep–Nov) | Squirrel | Fox | Leaf pile | Plant 2 acorns | DASH — sprint 3 cells forward |

Skills recharge on a 15-second cooldown.

## Hazard & lives

A roaming predator patrols the maze. Getting within 5 cells triggers hunting mode (red aura). Getting caught costs a life — 3 per month. Lose all 3 and the season restarts from its first month.

**Hiding:** step into a bush to become invisible. Bushes are guaranteed near the hazard spawn, along the solution path, and at the midpoint between you and the enemy.

**Collision:** the game checks for player–enemy contact on both player moves and enemy moves, so fast clicking won't let you sneak past. The Fall DASH skill is the intended way to evade enemies.

## Keys & gates

Season-coloured diamonds (◆) are keys; coloured bars are locked gates. Each gate is placed on a bridge edge (no alternate route), so gates are never bypassable. Keys always appear before their gate on the solution path.

## Scenic obstacles

Each season has 3 decorative obstacle variants displayed in the legend. These are non-blocking scenery placed throughout the maze for atmosphere and landmarks.

## Side panel

A persistent panel shows current objectives, lives, key inventory, skill cooldown, and a colour-coded legend for all game elements including scenic obstacle variants.

## Fog of war

The maze starts hidden. Moving reveals nearby cells. Previously revealed cells fade back toward hidden over time — faster in Hard mode — so you must keep moving and use landmarks to stay oriented.

## Maze generation

All mazes use Kruskal's algorithm — uniform feel, no directional bias. Start and goal are randomised to opposite corners each level.

## End screen

Completing December advances to a closing screen with a final quote before returning to the title.

## Credits

**Background music:** "The Glowing Seed" by Whats Smooth
Source: [Pixabay](https://pixabay.com/music/modern-classical-the-glowing-seed-432624/)
License: [Pixabay Content License](https://pixabay.com/service/license-summary/) (free for use, no attribution required — credited here anyway)
