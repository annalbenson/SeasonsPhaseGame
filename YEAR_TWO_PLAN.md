# Year Two Implementation Plan

## Design Vision

Four bears, four seasons — each heading home to feed their cubs. Weather is the opposition, not enemies. No roaming hazards, no hiding spots. Movement & exploration focus with scrolling screen. Each season should feel distinct in how the player interacts with the map.

### Characters & Objectives

| Season | Player | Objective | Food |
|--------|--------|-----------|------|
| Winter | Polar Bear | Gather fish | Fish |
| Spring | Brown Bear | Collect honey | Honeycombs |
| Summer | Panda | Find bamboo | Bamboo shoots |
| Fall | Black Bear | Gather berries | Berries |

### Weather Hindrances (one per season, intensifies months 1→3)

| Season | Mechanic | Visual | Intensification |
|--------|----------|--------|-----------------|
| Winter | Snowdrifts — tiles cost extra moves, reduced visibility | Snowfall/blizzard overlays | More drift tiles, shorter visibility |
| Spring | Flooded paths — temporarily blocked, must route around | Animated water overlays | More paths flood, longer duration |
| Summer | Heat exhaustion — must stop at water/shade to cool off | Heat bar in side panel | More frequent stops, scarcer water |
| Fall | Wind gusts — roaming clouds push bear off course | Grey cloud sprites | More clouds, stronger/more frequent gusts |

### Season-Unique Terrain Features

| Season | Unique Feature | Gameplay Effect |
|--------|---------------|-----------------|
| Winter | **Blizzard fog** — vision radius shrinks with intensity | Navigation is harder; must explore carefully. Snow caves offer shelter + bonus energy recovery. |
| Spring | **Rising water** — water zones expand over time | Playable area shrinks as the level progresses, creating urgency. Honey is uphill near trees, away from rising water. |
| Summer | **Shade tiles** — bamboo groves slow heat buildup | Bamboo isn't just an obstacle border — groves are strategic rest points. Route through shade to manage heat. |
| Fall | **Leaf cover** — fallen leaves hide some trail tiles | OPEN tiles in forest zones appear as leaf piles until stepped on. Adds exploration uncertainty. Berries may hide under leaves. |

---

## Phase 1: Bare playable loop (no weather) — DONE

1. ~~Expand `seasons.ts` with SpringY2, SummerY2, FallY2 themes + full 12-month `MONTHS_Y2`~~
2. ~~Add 3 bear sprite factories to `sprites.ts` (brown bear, panda, black bear — polar exists)~~
3. ~~Add 3 Y2 objective sprites to `sprites.ts` (honey, bamboo, berries — fish exists)~~
4. ~~Strip `GameY2Scene.ts` of wolves, hiding spots, and skills~~
5. ~~Wire up season-based bear + objective selection~~

**Result:** Playable 12-month Y2 with 4 bears collecting food on scrolling terrain, no hazards.

## Phase 2: Season terrain variants — DONE

- ~~Extend `terrain.ts` to generate per-season maps (season trees, water colors, cliff visuals)~~
- ~~Parameterize the zone layout builder (zones processed bottom-to-top, threaded cursor)~~
- ~~Dead-end spurs for optional exploration~~
- ~~Horizontal + vertical scrolling with wider maps (14-15 cols)~~

## Phase 3: Weather hazard system — DONE

File: `src/weatherHazard.ts`

1. ~~**Winter snowdrifts** — extra move cost on forest OPEN tiles~~
2. ~~**Spring flooding** — cyclical flood/unflood with BFS safety check~~
3. ~~**Fall wind clouds** — roaming cloud sprites that push bear away, 3-step cooldown~~
4. ~~**Summer heat** — heat meter, water resets, overheat costs 3 energy, heat bar UI~~

## Phase 4: Intensity scaling — DONE

~~Each weather reads intensity 1/2/3 via `getIntensity(monthIndex)`. Month 1 mild, month 3 brutal.~~

## Phase 5: Energy & rest system — DONE

- ~~Energy bar (0-100) replaces lives — drains per step, weather adds cost~~
- ~~SPACE = voluntary rest (nap): +30 energy, 2s pause~~
- ~~Forced rest at 0 energy: full recovery, 5s pause~~
- ~~Cliff fall: reset to zone entry (valid OPEN cell), drains 35 energy~~
- ~~Side panel: energy bar, heat bar (summer), weather status, controls hint~~

## Phase 6: Season-unique terrain features — NEXT

Each season gets a unique terrain mechanic that changes how the player interacts with the map, beyond weather. Build in order:

### 6a. Winter — Blizzard Fog
- Fog radius shrinks with weather intensity (intensity 1 = 4 tiles, 2 = 3, 3 = 2)
- Fog already exists (`fog.ts`) — parameterize the reveal radius
- **Snow caves**: scenic ROCK tiles in forest zones become shelters; resting adjacent to a cave restores double energy
- Strategic: explore carefully with limited vision, use caves to recover

### 6b. Spring — Rising Water
- Water zones grow by 1 row every N seconds (N scales with intensity)
- OPEN tiles at water zone edges become WATER over time
- BFS safety check: never flood a tile that would disconnect start from goal
- Creates urgency — the longer you take, the less map is available
- Strategic: collect honey near trees (uphill) before the water reaches you

### 6c. Summer — Shade Tiles
- New terrain type or overlay: OPEN tiles adjacent to BAMBOO count as "shaded"
- Shaded tiles reduce heat gain (half rate or zero) instead of full heat per step
- Visual: subtle dappled shadow overlay on shaded tiles
- Strategic: route through bamboo grove edges to manage heat, not just beeline to water

### 6d. Fall — Leaf Cover
- Some OPEN tiles in forest zones spawn with a leaf pile overlay
- Leaf tiles look like obstacles (brown/orange pile) until the bear steps on them, revealing the OPEN path underneath
- Some leaf piles hide berries (objectives) — rewards exploration
- Stepping on a leaf pile has a small crunch animation
- Strategic: explore leaf piles to find hidden paths and bonus berries

## Phase 7: Polish

- Weather particle effects (rain, snow, heat shimmer, wind leaves)
- Winter fog tightening animation (smooth radius change)
- Sound cues for weather events (optional)
- Leaf crunch, water splash, wind whoosh micro-animations

## Key Architectural Decisions

- Weather checks inject into `tryStep` — loosely coupled
- Scrolling camera with horizontal + vertical scroll
- Terrain features hook into existing systems: fog radius (winter), terrain grid mutation (spring), getMoveCost overlay (summer), tile reveal on step (fall)
- Reuse: fog.ts, maze shuffle, constants, gameplay depths, sidePanel pattern, stats
- Extend: seasons.ts, sprites.ts, terrain.ts, gameplay.ts, weatherHazard.ts
