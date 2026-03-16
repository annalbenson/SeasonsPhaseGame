# Year Two Implementation Plan

## Design Vision

Four bears, four seasons — each heading home to feed their cubs. Weather is the opposition, not enemies. No roaming hazards, no hiding spots. Movement & exploration focus with scrolling screen.

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
| Spring | Flooded paths — temporarily blocked, must route around | Rain cloud sprites | More paths flood, longer duration |
| Summer | Heat exhaustion — must stop at water sources to cool off | Hot sun sprites | More frequent stops, scarcer water |
| Fall | Wind gusts — push bear off course | Grey cloud sprites | Stronger/more frequent gusts |
| Winter | Snowdrifts — tiles cost extra moves, reduced visibility | Snowfall/blizzard | More drift tiles, shorter visibility |

---

## Phase 1: Bare playable loop (no weather) ← START HERE

1. Expand `seasons.ts` with SpringY2, SummerY2, FallY2 themes + full 12-month `MONTHS_Y2`
2. Add 3 bear sprite factories to `sprites.ts` (brown bear, panda, black bear — polar exists)
3. Add 3 Y2 objective sprites to `sprites.ts` (honey, bamboo, berries — fish exists)
4. Strip `GameY2Scene.ts` of wolves, hiding spots, and skills
5. Wire up season-based bear + objective selection

**Result:** Playable 12-month Y2 with 4 bears collecting food on scrolling terrain, no hazards.

## Phase 2: Season terrain variants

- Extend `terrain.ts` to generate per-season maps (spring meadows, summer savanna, fall forest, winter mountains)
- Parameterize the zone layout builder rather than 4 separate generators

## Phase 3: Weather hazard system

New file `src/weatherHazard.ts`. Build in order of complexity:

1. **Winter snowdrifts** — extra move cost on certain tiles (`getMoveCost()` adds delay)
2. **Spring flooding** — temporary blocked paths (`isBlocked()` checked in `tryStep`)
3. **Fall wind** — forced push after step (`getWindPush()` as post-step hook)
4. **Summer heat** — meter drains as you move, water tiles reset (new heat meter UI)

Weather interface:
```typescript
interface WeatherHazard {
    intensity: 1 | 2 | 3;
    spawn(scene, terrain, cols, rows, offsetX): void;
    update(now, playerCol, playerRow): void;
    isBlocked(col, row): boolean;
    getMoveCost(col, row): number;
    getWindPush(col, row): {dx: number, dy: number} | null;
    destroy(): void;
}
```

## Phase 4: Intensity scaling

Each weather reads intensity 1/2/3 based on month-within-season. Month 1 mild, month 3 brutal.

## Phase 5: Polish

- Weather-aware particle effects (enhance existing `weather.ts`)
- Side panel: weather status, heat meter
- Winter fog radius tightens with intensity
- Optional: SPACE as season-specific weather mitigation (umbrella, shade, brace, dig)
- Lives reframed as "energy" — weather drains it

## Key Architectural Decisions

- Weather checks inject into `tryStep` — loosely coupled
- Scrolling camera already works in GameY2Scene
- Reuse: fog.ts, maze shuffle, constants, gameplay depths, sidePanel pattern, stats
- Extend: seasons.ts, sprites.ts, terrain.ts, gameplay.ts
- New: weatherHazard.ts
