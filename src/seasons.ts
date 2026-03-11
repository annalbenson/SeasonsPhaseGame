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
    quote:     string;    // historical quote for this month
    author:    string;    // short attribution
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
    { month:  1, name: 'January',   shortName: 'Jan', season: WINTER, quote: 'The frost performs its secret ministry.',                               author: 'Coleridge'  },
    { month:  2, name: 'February',  shortName: 'Feb', season: WINTER, quote: 'If Winter comes, can Spring be far behind?',                            author: 'Shelley'    },
    { month:  3, name: 'March',     shortName: 'Mar', season: SPRING, quote: 'Rough winds do shake the darling buds of May.',                         author: 'Shakespeare' },
    { month:  4, name: 'April',     shortName: 'Apr', season: SPRING, quote: 'April hath put a spirit of youth in everything.',                       author: 'Shakespeare' },
    { month:  5, name: 'May',       shortName: 'May', season: SPRING, quote: 'A little Madness in the Spring is wholesome.',                          author: 'Dickinson'  },
    { month:  6, name: 'June',      shortName: 'Jun', season: SUMMER, quote: 'And what is so rare as a day in June?',                                 author: 'J. R. Lowell' },
    { month:  7, name: 'July',      shortName: 'Jul', season: SUMMER, quote: 'The sun shines hot, and the wind blows still.',                         author: 'Blake'      },
    { month:  8, name: 'August',    shortName: 'Aug', season: SUMMER, quote: 'Season of mists and mellow fruitfulness.',                              author: 'Keats'      },
    { month:  9, name: 'September', shortName: 'Sep', season: FALL,   quote: 'The morns are meeker than they were.',                                  author: 'Dickinson'  },
    { month: 10, name: 'October',   shortName: 'Oct', season: FALL,   quote: 'O suns and skies and clouds of June, and flowers of June together.',    author: 'Browning'   },
    { month: 11, name: 'November',  shortName: 'Nov', season: FALL,   quote: 'No warmth, no cheerfulness, no healthful ease.',                        author: 'Clare'      },
    { month: 12, name: 'December',  shortName: 'Dec', season: WINTER, quote: 'In the bleak midwinter, frosty wind made moan.',                        author: 'Rossetti'   },
];
