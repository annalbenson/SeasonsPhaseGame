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

## Phase 6: Year Two Tutorial — NEXT

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

## Phase 7: Season-unique terrain features

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

## Phase 8: Exploration incentives

### Current State (measured via tests)
Players only visit ~30% of the reachable map to collect all objectives and reach the goal. The path is too linear — BFS shortest path through objectives barely deviates from the main trail.

| Season | Avg Explore | Min | Max |
|--------|-------------|-----|-----|
| Winter | 39% | 32% | 45% |
| Spring | 30% | 24% | 35% |
| Summer | 30% | 22% | 36% |
| Fall | 28% | 22% | 33% |

### 7a. Bonus Food (all seasons)
- Extra optional objectives placed in dead-end spurs and off-trail areas
- Don't count toward the required total to unlock the goal
- Count toward a score/star rating shown on the end screen (e.g. 3/3 required + 2/4 bonus = 5/7)
- Encourages exploring branches the player would otherwise skip
- Side panel shows "3/3 + 2 bonus" or similar

### 7b. Star Rating
- End screen shows 1-3 stars based on exploration and bonus collection
- 1 star: completed level (collected required food, reached goal)
- 2 stars: collected all bonus food
- 3 stars: collected all bonus food + explored 80%+ of reachable cells
- Stats tracks stars per month for completionists

## Phase 9: Night Falls (time pressure)

A soft timer that creates tension between exploring for bonus items and reaching the goal before dark.

### Mechanic
- Each level starts at "dawn" — a step counter or real-time timer tracks daylight remaining
- **Sun/moon indicator** in the side panel shows time of day (sun arc or simple progress bar)
- After a generous threshold, **dusk** begins: screen tint shifts warmer/darker, fog starts closing in
- After a second threshold, **night falls**: fog tightens dramatically, energy drain doubles, screen very dark
- The level does NOT end — the bear can still finish, but it's much harder
- Night is punishing but survivable, matching the cozy-but-challenging tone

### Scaling
- Threshold scales with map size and objective count so completing the level normally always beats dusk
- Exploring for bonus food / 3 stars means racing against nightfall
- Intensity (month within season) makes night fall sooner

### Visual Progression
1. **Dawn** (start): normal lighting, full visibility
2. **Midday** (~40% of threshold): sun at peak in indicator
3. **Dusk** (~80% of threshold): warm orange tint, side panel shows sunset, fog radius shrinks by 1
4. **Night** (100% threshold): deep blue tint, fog radius shrinks to minimum, energy drain ×2

### Legend entries
- **Sun/moon indicator** in side panel: a small arc or progress bar showing time of day
  - Dawn: yellow sun icon on left
  - Midday: sun at peak/center
  - Dusk: orange sun icon on right, bar shifts warm
  - Night: blue moon icon replaces sun
- Legend row: "daylight — reach goal before dark"

### Tutorial level: "Night Falls"
- Added to core tutorial after level 5 (weather), or as a standalone intro
- Small map with a low step threshold so night falls quickly
- Teach: "Each step advances the clock. Reach the goal before nightfall!"
- Player experiences dawn → dusk → night transition in ~15-20 steps
- Shows that night is survivable but harder (fog closes in, energy drains faster)

### Implementation Notes
- Step-based (not real-time) so the player controls pacing — each move advances the clock
- Hook into `tryStep` to increment the day counter
- Reuse fog system for night visibility shrink
- Tint via camera post-processing or overlay rectangle with increasing alpha
- Side panel: sun/moon arc graphic or simple "Day ████░░ Night" bar

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
