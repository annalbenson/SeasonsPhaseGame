// ── Season themes ─────────────────────────────────────────────────────────────

export interface SeasonTheme {
    name: 'Winter' | 'Spring' | 'Summer' | 'Fall';
    floorLight: number;   // light checkerboard tile
    floorDark:  number;   // dark checkerboard tile
    wallColor:  number;   // maze wall lines
    goalColor:  number;   // goal tile
    bgColor:    number;   // scene background
    uiAccent:   number;   // HUD text + fairy glow tint
    textColor:  number;   // text on top of season-colored tiles (calendar)
}

export interface MonthConfig {
    month:     number;    // 1–12
    name:      string;    // 'January' …
    shortName: string;    // 'Jan' …
    season:    SeasonTheme;
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
};

const SUMMER: SeasonTheme = {
    name:       'Summer',
    floorLight: 0x68d468,   // bright lime-green
    floorDark:  0x3ea83e,   // vivid green
    wallColor:  0x0a2a0a,   // forest black-green
    goalColor:  0xf5e040,   // sunshine yellow
    bgColor:    0x041408,
    uiAccent:   0xaaffaa,
    textColor:  0x0a2a0a,
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
};

// ── 12 months ────────────────────────────────────────────────────────────────

export const MONTHS: MonthConfig[] = [
    { month:  1, name: 'January',   shortName: 'Jan', season: WINTER },
    { month:  2, name: 'February',  shortName: 'Feb', season: WINTER },
    { month:  3, name: 'March',     shortName: 'Mar', season: SPRING },
    { month:  4, name: 'April',     shortName: 'Apr', season: SPRING },
    { month:  5, name: 'May',       shortName: 'May', season: SPRING },
    { month:  6, name: 'June',      shortName: 'Jun', season: SUMMER },
    { month:  7, name: 'July',      shortName: 'Jul', season: SUMMER },
    { month:  8, name: 'August',    shortName: 'Aug', season: SUMMER },
    { month:  9, name: 'September', shortName: 'Sep', season: FALL   },
    { month: 10, name: 'October',   shortName: 'Oct', season: FALL   },
    { month: 11, name: 'November',  shortName: 'Nov', season: FALL   },
    { month: 12, name: 'December',  shortName: 'Dec', season: WINTER },
];
