// ── Season themes ─────────────────────────────────────────────────────────────

/** Convert a 0xRRGGBB integer to '#rrggbb' hex string. */
function hex(c: number): string { return `#${c.toString(16).padStart(6, '0')}`; }

/** Dim each RGB channel of a 0xRRGGBB integer by a factor (0–1). */
function dimHex(c: number, factor: number): string {
    const r = Math.floor(((c >> 16) & 0xff) * factor);
    const g = Math.floor(((c >>  8) & 0xff) * factor);
    const b = Math.floor(( c        & 0xff) * factor);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Dim with a per-channel minimum (for side panel legibility on dark backgrounds). */
function panelDim(c: number, factor: number, min: number): string {
    const r = Math.max(Math.floor(((c >> 16) & 0xff) * factor), min);
    const g = Math.max(Math.floor(((c >>  8) & 0xff) * factor), min);
    const b = Math.max(Math.floor(( c        & 0xff) * factor), min);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export interface SeasonTheme {
    name: 'Winter' | 'Spring' | 'Summer' | 'Fall' | 'Tutorial' | 'WinterY2';
    floorLight: number;   // light checkerboard tile
    floorDark:  number;   // dark checkerboard tile
    wallColor:  number;   // maze wall lines
    goalColor:  number;   // goal tile
    bgColor:    number;   // scene background
    uiAccent:   number;   // HUD text + fairy glow tint
    textColor:  number;   // text on top of season-colored tiles (calendar)
    keyColor:   number;   // collectible key diamond
    gateColor:  number;   // blocking gate bar
    // Pre-computed hex strings — avoid bit-shifting at runtime
    accentHex:    string;   // uiAccent as '#rrggbb'
    dimHex:       string;   // uiAccent dimmed to 65% as '#rrggbb'
    panelDimHex:  string;   // uiAccent dimmed with min-0x88 floor (side panel labels)
    textHex:      string;   // textColor as '#rrggbb'
}

export interface MonthConfig {
    month:     number;    // 1–12
    name:      string;    // 'January' …
    shortName: string;    // 'Jan' …
    season:    SeasonTheme;
    quote:     string;    // historical quote for this month
    author:    string;    // short attribution
    cols:      number;    // grid width for this month
    rows:      number;    // grid height for this month
    year?:     number;    // default 1
}

// ── Four season palettes ──────────────────────────────────────────────────────

const WINTER: SeasonTheme = {
    name:       'Winter',
    floorLight: 0xb0ccdf,   // pale ice blue
    floorDark:  0x7a9db8,   // steel blue
    wallColor:  0x0e1c28,   // deep navy
    goalColor:  0x7ec8e8,   // bright ice
    bgColor:    0x080e18,
    uiAccent:   0xc8e4f4,
    textColor:  0x0e1c28,
    keyColor:   0xffee88,   // warm gold — pops against icy blue tiles
    gateColor:  0xff8833,   // amber-orange — warm vs cool contrast
    accentHex:   hex(0xc8e4f4),
    dimHex:      dimHex(0xc8e4f4, 0.65),
    panelDimHex: panelDim(0xc8e4f4, 0.55, 0x88),
    textHex:     hex(0x0e1c28),
};

const SPRING: SeasonTheme = {
    name:       'Spring',
    floorLight: 0xf5b8cc,   // blush pink
    floorDark:  0xe088a8,   // deeper rose
    wallColor:  0x5a1828,   // dark cranberry
    goalColor:  0xff80c0,   // hot pink
    bgColor:    0x1a0810,
    uiAccent:   0xffccdd,
    textColor:  0x5a1828,
    keyColor:   0xffee22,   // bright yellow — pops against blush pink
    gateColor:  0x6633cc,   // violet-purple — complements pink
    accentHex:   hex(0xffccdd),
    dimHex:      dimHex(0xffccdd, 0.65),
    panelDimHex: panelDim(0xffccdd, 0.55, 0x88),
    textHex:     hex(0x5a1828),
};

const SUMMER: SeasonTheme = {
    name:       'Summer',
    floorLight: 0xc8c8a0,   // sun-bleached straw / pale khaki
    floorDark:  0xa0a078,   // dusty sage-grey
    wallColor:  0x2a2818,   // dark olive-brown
    goalColor:  0xf5e040,   // sunshine yellow
    bgColor:    0x080808,
    uiAccent:   0xe8e8aa,   // pale straw yellow
    textColor:  0x2a2818,
    keyColor:   0xffffff,   // white/silver
    gateColor:  0xcc2200,   // deep red
    accentHex:   hex(0xe8e8aa),
    dimHex:      dimHex(0xe8e8aa, 0.65),
    panelDimHex: panelDim(0xe8e8aa, 0.55, 0x88),
    textHex:     hex(0x2a2818),
};

const FALL: SeasonTheme = {
    name:       'Fall',
    floorLight: 0xf09838,   // warm amber
    floorDark:  0xc06818,   // burnt orange
    wallColor:  0x200a02,   // dark espresso
    goalColor:  0xffd020,   // harvest gold
    bgColor:    0x120602,
    uiAccent:   0xffcc88,
    textColor:  0x200a02,
    keyColor:   0x66ddff,   // cool cyan — complementary to orange
    gateColor:  0x2255bb,   // deep blue — classic complement to amber
    accentHex:   hex(0xffcc88),
    dimHex:      dimHex(0xffcc88, 0.65),
    panelDimHex: panelDim(0xffcc88, 0.55, 0x88),
    textHex:     hex(0x200a02),
};

const TUTORIAL: SeasonTheme = {
    name:       'Tutorial',
    floorLight: 0xc8b0e8,   // lavender
    floorDark:  0x9a78c8,   // deeper purple
    wallColor:  0x2a1048,   // dark plum
    goalColor:  0xffe060,   // bright yellow
    bgColor:    0x0e0618,
    uiAccent:   0xffe060,
    textColor:  0x2a1048,
    keyColor:   0xffe060,
    gateColor:  0xff6644,
    accentHex:   hex(0xffe060),
    dimHex:      dimHex(0xffe060, 0.65),
    panelDimHex: panelDim(0xffe060, 0.55, 0x88),
    textHex:     hex(0x2a1048),
};

const WINTER_Y2: SeasonTheme = {
    name:       'WinterY2',
    floorLight: 0xc8dce8,   // pale snow
    floorDark:  0xa0b8c8,   // packed snow
    wallColor:  0x1a2838,   // dark slate
    goalColor:  0x40c8ff,   // bright aurora blue
    bgColor:    0x060e18,
    uiAccent:   0x88ccff,
    textColor:  0x1a2838,
    keyColor:   0xffee88,
    gateColor:  0xff6644,
    accentHex:   hex(0x88ccff),
    dimHex:      dimHex(0x88ccff, 0.65),
    panelDimHex: panelDim(0x88ccff, 0.55, 0x88),
    textHex:     hex(0x1a2838),
};

// ── Season lookup by name ────────────────────────────────────────────────────
export const SEASONS: Record<string, SeasonTheme> = {
    Winter: WINTER, Spring: SPRING, Summer: SUMMER, Fall: FALL,
    Tutorial: TUTORIAL, WinterY2: WINTER_Y2,
};

// ── 12 months ────────────────────────────────────────────────────────────────

// Grid sizes: 8→10→12 within each season (1st, 2nd, 3rd month)
// Winter is split: Jan=8 (1st), Feb=10 (2nd), Dec=12 (3rd)
export const MONTHS: MonthConfig[] = [
    { month:  1, name: 'January',   shortName: 'Jan', season: WINTER, cols:  8, rows:  8, quote: 'The frost performs its secret ministry.',            author: 'Samuel Taylor Coleridge' },
    { month:  2, name: 'February',  shortName: 'Feb', season: WINTER, cols: 10, rows: 10, quote: 'Now fades the last long streak of snow.',            author: 'Alfred, Lord Tennyson'   },
    { month:  3, name: 'March',     shortName: 'Mar', season: SPRING, cols:  8, rows:  8, quote: 'The winds of March were wild and chill.',            author: 'Bayard Taylor'           },
    { month:  4, name: 'April',     shortName: 'Apr', season: SPRING, cols: 10, rows: 10, quote: 'April hath put a spirit of youth in everything.',    author: 'William Shakespeare'     },
    { month:  5, name: 'May',       shortName: 'May', season: SPRING, cols: 12, rows: 12, quote: 'A little Madness in the Spring is wholesome.',       author: 'Emily Dickinson'         },
    { month:  6, name: 'June',      shortName: 'Jun', season: SUMMER, cols:  8, rows:  8, quote: 'And what is so rare as a day in June?',              author: 'James Russell Lowell'    },
    { month:  7, name: 'July',      shortName: 'Jul', season: SUMMER, cols: 10, rows: 10, quote: 'The livelong day with open windowed eye.',           author: 'Walt Whitman'            },
    { month:  8, name: 'August',    shortName: 'Aug', season: SUMMER, cols: 12, rows: 12, quote: 'Season of mists and mellow fruitfulness.',           author: 'John Keats'              },
    { month:  9, name: 'September', shortName: 'Sep', season: FALL,   cols:  8, rows:  8, quote: 'The morns are meeker than they were.',               author: 'Emily Dickinson'         },
    { month: 10, name: 'October',   shortName: 'Oct', season: FALL,   cols: 10, rows: 10, quote: 'The mellow year is hasting to its close.',           author: 'William Cullen Bryant'   },
    { month: 11, name: 'November',  shortName: 'Nov', season: FALL,   cols: 12, rows: 12, quote: 'No warmth, no cheerfulness, no healthful ease,',     author: 'Thomas Hood'             },
    { month: 12, name: 'December',  shortName: 'Dec', season: WINTER, cols: 12, rows: 12, quote: 'In the bleak midwinter, frosty wind made moan.',     author: 'Christina Rossetti'      },
];

// ── Year 2: Winter months ────────────────────────────────────────────────────
// Open terrain maps — winding mountain path, no internal walls.
export const MONTHS_Y2: MonthConfig[] = [
    { month: 1, name: 'January',  shortName: 'Jan', season: WINTER_Y2, cols: 10, rows: 10, year: 2, quote: 'The polar bear crosses in quiet cold.',       author: 'Jack London'         },
    { month: 2, name: 'February', shortName: 'Feb', season: WINTER_Y2, cols: 12, rows: 12, year: 2, quote: 'The land lay white beneath the starlight.',   author: 'Robert Service'      },
    { month: 3, name: 'December', shortName: 'Dec', season: WINTER_Y2, cols: 12, rows: 12, year: 2, quote: 'Deep in the winter, an invincible summer.',   author: 'Albert Camus'        },
];
