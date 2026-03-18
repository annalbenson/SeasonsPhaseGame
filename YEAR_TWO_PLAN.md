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

## Phase 6: Year Two Tutorial — DONE

A dedicated tutorial for Year Two, separate from Year One's maze tutorial. Y1 teaches keys, gates, bushes, enemies, and skills. Y2 needs to teach terrain navigation, energy management, weather, and resting — completely different mechanics.

### Why separate
- Y1 is a maze game (walls, keys, gates, hiding from enemies). Y2 is a terrain exploration game (zones, weather, energy, scrolling maps).
- Reusing Y1's tutorial would confuse players since none of those mechanics carry over.
- New scene: `TutorialY2Scene.ts` (similar pattern to `TutorialScene.ts` but with Y2 mechanics).

### Tutorial structure (4-5 guided levels)

**Level 1: "Moving & Terrain"**
- Small map with forest + mountain tiles
- Teach: arrow keys to move, mountains are impassable, trees are blocked
- Prompt: "Navigate to the goal tile"
- No weather, no energy drain (or very slow drain)

**Level 2: "Water & Cliffs"**
- Map with a water zone and a narrows zone
- Teach: water is swimmable but costs more energy, cliffs reset you to zone entry
- Prompt: "Cross the water" then "Careful on the cliffs!"

**Level 3: "Energy & Resting"**
- Longer map with normal energy drain
- Teach: energy bar drains per step, SPACE to rest (recovers 30), forced rest at 0
- Prompt: "Press SPACE to take a nap when energy is low"

**Level 4: "Collecting Food"**
- Map with 2-3 food objectives scattered across zones
- Teach: collect all food to unlock the goal
- Prompt: "Gather all the fish to unlock the goal"

**Level 5: "Weather" (optional, one example)**
- Introduce one weather type (snowdrifts — simplest)
- Teach: some tiles have weather effects, check the legend
- Prompt: "Snowdrifts cost extra energy — plan your route"

### Season intro tutorials
Each season has unique weather and terrain mechanics. The first time a player enters a new season, they play a short 1-2 level tutorial for that season's unique features before starting the first real month.

**Winter intro: "Snowdrifts & Blizzard"**
- Level 1: Map with snowdrift tiles on the path. Teach: white tiles cost extra energy, plan your route.
- Level 2 (after Phase 7): Blizzard fog — reduced visibility, find a snow cave to rest with bonus recovery.

**Spring intro: "Flooding"**
- Level 1: Map with water zone and flood tiles that cycle on/off. Teach: blue pulsing tiles block your path temporarily — wait or reroute.
- Level 2 (after Phase 7): Rising water — water zone expands over time. Teach: collect honey uphill before the flood reaches you.

**Summer intro: "Heat & Shade"**
- Level 1: Map with heat meter active. Water tiles on one side, goal on the other. Teach: heat builds each step, water cools you off, overheating costs energy.
- Level 2 (after Phase 7): Shade tiles near bamboo. Teach: shaded tiles slow heat buildup — use bamboo groves as rest points.

**Fall intro: "Wind Clouds & Leaves"**
- Level 1: Map with 1-2 wind clouds drifting around. Teach: clouds push you away, you're immune for 3 steps after a push — time your approach.
- Level 2 (after Phase 7): Leaf-covered tiles. Teach: leaf piles hide paths and berries — explore them!

### Implementation notes
- Core tutorial (levels 1-5) plays once on first "How to Play" or first Y2 start
- Season intros play automatically before the first month of each new season (Jan, Mar, Jun, Sep)
- Season intros are skippable for returning players (small "skip" link)
- Each level is a hand-crafted small grid (6-8 cols, 10-15 rows) — not randomly generated
- Tooltip/prompt text appears at top or as floating text near the relevant mechanic
- Player cannot advance to next tutorial level until completing the current one
- Accessible from title screen: "Year Two" section shows "How to Play" link
- On completion of core tutorial, transitions to January Y2 (first real level)
- Season intro levels are added to TutorialY2Scene as the corresponding Phase 7 features are built

## Phase 7: Season-unique terrain features — DONE

Each season gets a unique terrain mechanic that changes how the player interacts with the map, beyond weather.

### 7a. Winter — Blizzard Fog — DONE
- ~~Fog radius shrinks with weather intensity (intensity 1 = 4 tiles, 2 = 3, 3 = 2)~~
- ~~Fog parameterized via `revealRadius` in `fog.ts`~~
- ~~Legend entry: "blizzard — low visibility"~~
- Snow caves (future): scenic ROCK tiles become shelters with double energy recovery

### 7b. Spring — Rising Water — DONE
- ~~Water zones permanently expand over time — OPEN tiles adjacent to WATER convert to WATER~~
- ~~Timer-based: interval scales with intensity (15s/20s/25s)~~
- ~~BFS safety check: never flood a tile that would disconnect start from goal~~
- ~~Visual: water overlay fades in over 1.5s~~
- ~~Legend entry: "rising water — hurry!"~~
- ~~Runs alongside existing flood cycle~~

### 7c. Summer — Shade Tiles — DONE
- ~~OPEN tiles adjacent to BAMBOO count as "shaded"~~
- ~~Shaded tiles reduce heat gain by half~~
- ~~Visual: dappled shadow overlay (dark ellipses at 12% opacity)~~
- ~~Legend entry: "shade — less heat"~~

### 7d. Fall — Leaf Cover — DONE
- ~~OPEN tiles in forest zones spawn with leaf pile overlays (3 + intensity*2 piles)~~
- ~~Leaf piles look like brown/orange obstacles until stepped on~~
- ~~Stepping on a leaf pile plays crunch animation (scale + fade)~~
- ~~Legend entry: "leaf pile — explore it!"~~
- Bonus berries hidden under leaves (Phase 8)

## Phase 8: Exploration incentives — DONE

### 8a. Bonus Food (all seasons) — DONE
- ~~Extra optional objectives placed off-trail (1-3 per level, scaling with month)~~
- ~~Bonus sprites rendered at 75% scale + 85% alpha to distinguish from required~~
- ~~Don't count toward goal unlock~~
- ~~Side panel shows "3/3 +2 bonus" format~~
- ~~Collecting bonus triggers smaller bounce animation~~

### 8b. Star Rating — DONE
- ~~BFS-based reachable cell count at level start~~
- ~~Visited cells tracked per step~~
- ~~Star calculation: 1★ = complete, 2★ = all bonus, 3★ = all bonus + 80% explored~~
- ~~Brief star result overlay shown on goal (1.8s before transition)~~
- ~~End screen shows stars, explore %, and bonus count~~
- ~~Data passed via scene transition: stars, explorePct, bonusCollected, bonusTotal~~

## Phase 9: Night Falls (time pressure) — DONE

A soft timer that creates tension between exploring for bonus items and reaching the goal before dark.

### Mechanic
- ~~Each level starts at "dawn" — a step counter tracks daylight remaining~~
- ~~**Sun/moon indicator** in the side panel shows time of day (daylight bar)~~
- ~~After a generous threshold, **dusk** begins: screen tint shifts warmer/darker, fog starts closing in~~
- ~~After a second threshold, **night falls**: fog tightens dramatically, energy drain doubles, screen very dark~~
- ~~The level does NOT end — the bear can still finish, but it's much harder~~

### Scaling
- ~~Threshold = `reachable * 0.6 + objCount * 8 - intensity * 8` — generous for straight completion, tight for 3★~~
- ~~Exploring for bonus food / 3 stars means racing against nightfall~~
- ~~Intensity (month within season) makes night fall sooner~~

### Visual Progression
1. ~~**Dawn** (start → 40%): normal lighting, full visibility, yellow sun icon~~
2. ~~**Midday** (40% → 80%): sun at peak, no tint change~~
3. ~~**Dusk** (80% → 100%): warm orange tint (0x331800, 15%), fog radius shrinks by 1, orange sun icon~~
4. ~~**Night** (100%+): deep blue tint (0x000822, 35%), fog radius = 1, energy drain ×2, moon icon~~

### UI elements
- ~~DAYLIGHT label + progress bar in side panel (shrinks as night approaches)~~
- ~~Bar color shifts yellow → orange → blue~~
- ~~Sun/moon icon: ☀ (dawn/midday/dusk) → ☽ (night)~~
- ~~Legend row: "daylight — reach goal before dark"~~
- ~~Tint overlay rectangle (scrollFactor 0) with tweened alpha transitions~~
- ~~Fog `setRevealRadius()` method added to `fog.ts` for dynamic adjustment~~

## Phase 10: Polish

- Weather particle effects (rain, snow, heat shimmer, wind leaves)
- Winter fog tightening animation (smooth radius change)
- Night transition animations (smooth tint shift)
- Sound cues for weather events and nightfall (optional)
- Leaf crunch, water splash, wind whoosh micro-animations

## Key Architectural Decisions

- Weather checks inject into `tryStep` — loosely coupled
- Night falls hooks into `tryStep` step counter — same pattern as weather
- Scrolling camera with horizontal + vertical scroll
- Terrain features hook into existing systems: fog radius (winter/night), terrain grid mutation (spring), getMoveCost overlay (summer), tile reveal on step (fall)
- Exploration tracking: count unique cells visited per level for star rating
- Reuse: fog.ts, maze shuffle, constants, gameplay depths, sidePanel pattern, stats
- Extend: seasons.ts, sprites.ts, terrain.ts, gameplay.ts, weatherHazard.ts
