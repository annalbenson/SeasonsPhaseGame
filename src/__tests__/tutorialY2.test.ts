// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

// Mock Phaser to avoid canvas/WebGL initialization
vi.mock('phaser', () => ({ default: {} }));

import { Terrain, isWalkable } from '../terrain';

// Re-create makeGrid locally (same logic as TutorialY2Scene)
function makeGrid(rows: string[]): Terrain[][] {
    const map: Record<string, Terrain> = {
        '.': Terrain.OPEN, '#': Terrain.ROCK, '^': Terrain.CLIFF,
        '~': Terrain.WATER, 'T': Terrain.TREE, 'B': Terrain.BAMBOO,
    };
    return rows.map(row => [...row].map(ch => map[ch] ?? Terrain.ROCK));
}

// BFS from start to goal on walkable tiles (OPEN + WATER)
function bfsPathExists(
    grid: Terrain[][], cols: number, rows: number,
    start: { col: number; row: number }, goal: { col: number; row: number },
): boolean {
    const visited = new Set<string>();
    const queue: { col: number; row: number }[] = [start];
    visited.add(`${start.col},${start.row}`);
    while (queue.length > 0) {
        const { col, row } = queue.shift()!;
        if (col === goal.col && row === goal.row) return true;
        for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const nc = col + dc, nr = row + dr;
            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
            const key = `${nc},${nr}`;
            if (visited.has(key)) continue;
            if (isWalkable(grid, nc, nr, cols, rows, true)) {
                visited.add(key);
                queue.push({ col: nc, row: nr });
            }
        }
    }
    return false;
}

// ── Core tutorial levels ─────────────────────────────────────────────────────

interface TestLevel {
    name: string;
    cols: number;
    grid: Terrain[][];
    start: { col: number; row: number };
    goal: { col: number; row: number };
    objectives?: { col: number; row: number }[];
    drifts?: { col: number; row: number }[];
    snowCaves?: { col: number; row: number }[];
    floods?: { col: number; row: number }[];
    leafPiles?: { col: number; row: number }[];
    windClouds?: { col: number; row: number }[];
}

const CORE_LEVELS: TestLevel[] = [
    {
        name: 'Moving & Terrain',
        cols: 7,
        grid: makeGrid(['##.####', '#..T.##', '#.##..#', '#...#.#', '##.T..#', '#...###']),
        start: { col: 2, row: 5 }, goal: { col: 2, row: 0 },
    },
    {
        name: 'Water & Cliffs',
        cols: 7,
        grid: makeGrid(['#..####', '#.~.###', '#.~~.##', '#..~~.#', '##.^^.#', '##...##']),
        start: { col: 3, row: 5 }, goal: { col: 1, row: 0 },
    },
    {
        name: 'Energy & Resting',
        cols: 7,
        grid: makeGrid(['#..####', '#.#..##', '#...T.#', '##.#..#', '#..T..#', '#...#.#', '##..#.#', '#...###']),
        start: { col: 1, row: 7 }, goal: { col: 1, row: 0 },
    },
    {
        name: 'Collecting Food',
        cols: 7,
        grid: makeGrid(['###.###', '#....##', '#.T#..#', '#..#..#', '#.....#', '###.###']),
        start: { col: 3, row: 5 }, goal: { col: 3, row: 0 },
        objectives: [{ col: 1, row: 1 }, { col: 5, row: 2 }],
    },
];

const WINTER_INTROS: TestLevel[] = [
    {
        name: 'Snowdrifts',
        cols: 7,
        grid: makeGrid(['#..####', '#.T..##', '#...T.#', '#..#..#', '##....#', '#...###']),
        start: { col: 1, row: 5 }, goal: { col: 1, row: 0 },
        drifts: [{ col: 1, row: 2 }, { col: 3, row: 2 }, { col: 2, row: 3 }, { col: 4, row: 4 }, { col: 3, row: 4 }],
    },
    {
        name: 'Blizzard & Snow Cave',
        cols: 7,
        grid: makeGrid(['#...###', '#.#..##', '#...T.#', '##.#..#', '#..T..#', '#..####']),
        start: { col: 1, row: 5 }, goal: { col: 1, row: 0 },
        snowCaves: [{ col: 3, row: 3 }],
    },
];

const SPRING_INTROS: TestLevel[] = [
    {
        name: 'Flooding',
        cols: 7,
        grid: makeGrid(['#..####', '#.~..##', '#..~..#', '#...~.#', '#T....#', '##..###']),
        start: { col: 2, row: 5 }, goal: { col: 1, row: 0 },
        floods: [{ col: 2, row: 2 }, { col: 3, row: 3 }, { col: 4, row: 2 }],
    },
    {
        name: 'Rising Water',
        cols: 7,
        grid: makeGrid(['#..####', '#.T..##', '#...T.#', '#.....#', '#~~...#', '#~~~###']),
        start: { col: 3, row: 3 }, goal: { col: 1, row: 0 },
        objectives: [{ col: 3, row: 1 }, { col: 3, row: 2 }],
    },
];

const SUMMER_INTROS: TestLevel[] = [
    {
        name: 'Heat',
        cols: 7,
        grid: makeGrid(['#..####', '#.B..##', '#..B..#', '#.....#', '#~~...#', '#~~.###']),
        start: { col: 3, row: 5 }, goal: { col: 1, row: 0 },
    },
    {
        name: 'Shade',
        cols: 7,
        grid: makeGrid(['#..####', '#.B..##', '#..B..#', '#....B#', '#..B..#', '#...###']),
        start: { col: 1, row: 5 }, goal: { col: 1, row: 0 },
        objectives: [{ col: 3, row: 3 }],
    },
];

const FALL_INTROS: TestLevel[] = [
    {
        name: 'Wind Clouds',
        cols: 7,
        grid: makeGrid(['#..####', '#.T..##', '#...T.#', '#.....#', '#..T..#', '#...###']),
        start: { col: 1, row: 5 }, goal: { col: 1, row: 0 },
        windClouds: [{ col: 3, row: 2 }],
    },
    {
        name: 'Leaf Piles',
        cols: 7,
        grid: makeGrid(['#..####', '#.T..##', '#...T.#', '#.....#', '#.T...#', '#...###']),
        start: { col: 1, row: 5 }, goal: { col: 1, row: 0 },
        leafPiles: [{ col: 2, row: 2 }, { col: 4, row: 3 }, { col: 3, row: 4 }],
    },
];

const ALL_LEVELS: { group: string; levels: TestLevel[] }[] = [
    { group: 'Core tutorial',    levels: CORE_LEVELS },
    { group: 'Winter intro',     levels: WINTER_INTROS },
    { group: 'Spring intro',     levels: SPRING_INTROS },
    { group: 'Summer intro',     levels: SUMMER_INTROS },
    { group: 'Fall intro',       levels: FALL_INTROS },
];

describe('Tutorial Y2 level validity', () => {
    for (const { group, levels } of ALL_LEVELS) {
        describe(group, () => {
            for (const level of levels) {
                describe(level.name, () => {
                    const rows = level.grid.length;

                    it('grid dimensions are consistent', () => {
                        expect(level.grid.length).toBeGreaterThan(0);
                        for (const row of level.grid) {
                            expect(row.length).toBe(level.cols);
                        }
                    });

                    it('start tile is walkable', () => {
                        expect(isWalkable(level.grid, level.start.col, level.start.row, level.cols, rows, true)).toBe(true);
                    });

                    it('goal tile is walkable', () => {
                        expect(isWalkable(level.grid, level.goal.col, level.goal.row, level.cols, rows, true)).toBe(true);
                    });

                    it('path exists from start to goal', () => {
                        expect(bfsPathExists(level.grid, level.cols, rows, level.start, level.goal)).toBe(true);
                    });

                    if (level.objectives) {
                        it('all objectives are on walkable tiles', () => {
                            for (const obj of level.objectives!) {
                                expect(isWalkable(level.grid, obj.col, obj.row, level.cols, rows, true)).toBe(true);
                            }
                        });

                        it('all objectives are reachable from start', () => {
                            for (const obj of level.objectives!) {
                                expect(bfsPathExists(level.grid, level.cols, rows, level.start, obj)).toBe(true);
                            }
                        });
                    }

                    if (level.drifts) {
                        it('drift tiles are on OPEN tiles', () => {
                            for (const d of level.drifts!) {
                                expect(level.grid[d.row][d.col]).toBe(Terrain.OPEN);
                            }
                        });
                    }

                    if (level.snowCaves) {
                        it('snow caves are on ROCK tiles', () => {
                            for (const sc of level.snowCaves!) {
                                expect(level.grid[sc.row][sc.col]).toBe(Terrain.ROCK);
                            }
                        });

                        it('snow caves are adjacent to at least one OPEN tile', () => {
                            for (const sc of level.snowCaves!) {
                                const adjOpen = [[0,-1],[0,1],[-1,0],[1,0]].some(([dc, dr]) => {
                                    const nc = sc.col + dc, nr = sc.row + dr;
                                    return nr >= 0 && nr < rows && nc >= 0 && nc < level.cols
                                        && level.grid[nr][nc] === Terrain.OPEN;
                                });
                                expect(adjOpen).toBe(true);
                            }
                        });
                    }

                    if (level.floods) {
                        it('flood tiles are on walkable tiles', () => {
                            for (const f of level.floods!) {
                                expect(isWalkable(level.grid, f.col, f.row, level.cols, rows, true)).toBe(true);
                            }
                        });
                    }

                    if (level.leafPiles) {
                        it('leaf pile tiles are on OPEN tiles', () => {
                            for (const lp of level.leafPiles!) {
                                expect(level.grid[lp.row][lp.col]).toBe(Terrain.OPEN);
                            }
                        });
                    }

                    if (level.windClouds) {
                        it('wind cloud tiles are on OPEN tiles', () => {
                            for (const wc of level.windClouds!) {
                                expect(level.grid[wc.row][wc.col]).toBe(Terrain.OPEN);
                            }
                        });
                    }
                });
            }
        });
    }
});

describe('Snow cave adjacency logic', () => {
    // Replicate isOnSnowCave logic
    function isNearSnowCave(
        gridX: number, gridY: number, caves: Set<string>,
    ): boolean {
        for (const [dc, dr] of [[0,-1],[0,1],[-1,0],[1,0],[0,0]]) {
            if (caves.has(`${gridX + dc},${gridY + dr}`)) return true;
        }
        return false;
    }

    it('returns true when standing adjacent to a cave', () => {
        const caves = new Set(['3,3']);
        expect(isNearSnowCave(3, 2, caves)).toBe(true);  // above
        expect(isNearSnowCave(3, 4, caves)).toBe(true);  // below
        expect(isNearSnowCave(2, 3, caves)).toBe(true);  // left
        expect(isNearSnowCave(4, 3, caves)).toBe(true);  // right
    });

    it('returns true when standing ON a cave tile', () => {
        const caves = new Set(['3,3']);
        expect(isNearSnowCave(3, 3, caves)).toBe(true);
    });

    it('returns false when not adjacent', () => {
        const caves = new Set(['3,3']);
        expect(isNearSnowCave(1, 1, caves)).toBe(false);
        expect(isNearSnowCave(5, 5, caves)).toBe(false);
        expect(isNearSnowCave(4, 4, caves)).toBe(false);  // diagonal
    });

    it('works with multiple caves', () => {
        const caves = new Set(['1,1', '5,5']);
        expect(isNearSnowCave(1, 0, caves)).toBe(true);
        expect(isNearSnowCave(5, 4, caves)).toBe(true);
        expect(isNearSnowCave(3, 3, caves)).toBe(false);
    });
});
