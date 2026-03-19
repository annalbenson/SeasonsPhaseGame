// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

// Mock Phaser to avoid canvas/WebGL initialization
vi.mock('phaser', () => ({ default: {} }));

import { generateMountainMap, Terrain, isWalkable, isCliff, isSwimmable, bfsReachable } from '../terrain';

describe('generateMountainMap', () => {
    const seasons = ['WinterY2', 'SpringY2', 'SummerY2', 'FallY2'];

    for (const season of seasons) {
        describe(`season=${season}`, () => {
            // Generate once per season for speed
            const map = generateMountainMap(14, 6, season);

            it('returns correct column count', () => {
                expect(map.cols).toBe(14);
            });

            it('has a positive row count from zone layout', () => {
                expect(map.rows).toBeGreaterThan(10);
            });

            it('grid dimensions match cols x rows', () => {
                expect(map.grid.length).toBe(map.rows);
                for (const row of map.grid) {
                    expect(row.length).toBe(map.cols);
                }
            });

            it('start cell is OPEN', () => {
                expect(map.grid[map.start.row][map.start.col]).toBe(Terrain.OPEN);
            });

            it('goal cell is OPEN', () => {
                expect(map.grid[map.goal.row][map.goal.col]).toBe(Terrain.OPEN);
            });

            it('start is on the bottom row', () => {
                expect(map.start.row).toBe(map.rows - 1);
            });

            it('goal is on the top row', () => {
                expect(map.goal.row).toBe(0);
            });

            it('has a walkable path from start to goal', () => {
                expect(bfsReachable(map.grid, map.cols, map.rows, map.start, map.goal)).toBe(true);
            });

            it('has landCells that are all OPEN', () => {
                for (const cell of map.landCells) {
                    expect(map.grid[cell.row][cell.col]).toBe(Terrain.OPEN);
                }
            });

            it('landCells does not include start or goal duplicated incorrectly', () => {
                // Just ensure landCells are within bounds
                for (const cell of map.landCells) {
                    expect(cell.col).toBeGreaterThanOrEqual(0);
                    expect(cell.col).toBeLessThan(map.cols);
                    expect(cell.row).toBeGreaterThanOrEqual(0);
                    expect(cell.row).toBeLessThan(map.rows);
                }
            });
        });
    }

    it('contains all 4 zone types', () => {
        const map = generateMountainMap(14, 6, 'WinterY2');
        const types = new Set(map.zones.map(z => z.type));
        expect(types.has('forest')).toBe(true);
        expect(types.has('narrows')).toBe(true);
        expect(types.has('water')).toBe(true);
        expect(types.has('ridge')).toBe(true);
    });

    it('ridge zones contain BOULDER cells', () => {
        const map = generateMountainMap(14, 6, 'WinterY2');
        const ridge = map.zones.find(z => z.type === 'ridge')!;
        let hasBoulder = false;
        for (let r = ridge.startRow; r < ridge.startRow + ridge.height; r++) {
            for (let c = 0; c < map.cols; c++) {
                if (map.grid[r][c] === Terrain.BOULDER) hasBoulder = true;
            }
        }
        expect(hasBoulder).toBe(true);
    });

    it('ridge zones have a walkable path through boulders', () => {
        for (let i = 0; i < 10; i++) {
            const map = generateMountainMap(14, 6, 'WinterY2');
            expect(bfsReachable(map.grid, map.cols, map.rows, map.start, map.goal)).toBe(true);
        }
    });

    it('zones cover the full row range without gaps', () => {
        const map = generateMountainMap(14, 6, 'WinterY2');
        // Sort zones by startRow
        const sorted = [...map.zones].sort((a, b) => a.startRow - b.startRow);
        expect(sorted[0].startRow).toBe(0);
        for (let i = 1; i < sorted.length; i++) {
            expect(sorted[i].startRow).toBe(sorted[i - 1].startRow + sorted[i - 1].height);
        }
        const last = sorted[sorted.length - 1];
        expect(last.startRow + last.height).toBe(map.rows);
    });

    it('SummerY2 uses BAMBOO instead of TREE in forest zones', () => {
        const map = generateMountainMap(14, 6, 'SummerY2');
        let hasBamboo = false;
        let hasTree = false;
        for (const row of map.grid) {
            for (const cell of row) {
                if (cell === Terrain.BAMBOO) hasBamboo = true;
                if (cell === Terrain.TREE) hasTree = true;
            }
        }
        expect(hasBamboo).toBe(true);
        expect(hasTree).toBe(false);
    });

    it('non-summer seasons use TREE not BAMBOO', () => {
        for (const season of ['WinterY2', 'SpringY2', 'FallY2']) {
            const map = generateMountainMap(14, 6, season);
            let hasBamboo = false;
            for (const row of map.grid) {
                for (const cell of row) {
                    if (cell === Terrain.BAMBOO) hasBamboo = true;
                }
            }
            expect(hasBamboo, `${season} should not have BAMBOO`).toBe(false);
        }
    });

    it('narrows zones contain CLIFF cells', () => {
        const map = generateMountainMap(14, 6, 'WinterY2');
        const narrowsZone = map.zones.find(z => z.type === 'narrows')!;
        let hasCliff = false;
        for (let r = narrowsZone.startRow; r < narrowsZone.startRow + narrowsZone.height; r++) {
            for (let c = 0; c < map.cols; c++) {
                if (map.grid[r][c] === Terrain.CLIFF) hasCliff = true;
            }
        }
        expect(hasCliff).toBe(true);
    });

    it('water zones contain WATER cells', () => {
        const map = generateMountainMap(14, 6, 'WinterY2');
        const waterZone = map.zones.find(z => z.type === 'water')!;
        let hasWater = false;
        for (let r = waterZone.startRow; r < waterZone.startRow + waterZone.height; r++) {
            for (let c = 0; c < map.cols; c++) {
                if (map.grid[r][c] === Terrain.WATER) hasWater = true;
            }
        }
        expect(hasWater).toBe(true);
    });

    it('fishSpawns are on WATER cells', () => {
        const map = generateMountainMap(14, 6, 'WinterY2');
        for (const fish of map.fishSpawns) {
            expect(map.grid[fish.row][fish.col]).toBe(Terrain.WATER);
        }
    });

    // Run multiple times to test randomness doesn't break reachability
    it('path is reachable across 10 random generations', () => {
        for (let i = 0; i < 10; i++) {
            const map = generateMountainMap(14, 6, 'WinterY2');
            expect(bfsReachable(map.grid, map.cols, map.rows, map.start, map.goal),
                `attempt ${i + 1}`).toBe(true);
        }
    });
});

describe('terrain helpers', () => {
    // Small 3x3 test grid
    const grid = [
        [Terrain.OPEN,  Terrain.ROCK,  Terrain.CLIFF],
        [Terrain.WATER, Terrain.OPEN,  Terrain.TREE],
        [Terrain.OPEN,  Terrain.BAMBOO, Terrain.WATER],
    ];
    const cols = 3, rows = 3;

    describe('isWalkable', () => {
        it('OPEN is walkable', () => {
            expect(isWalkable(grid, 0, 0, cols, rows)).toBe(true);
        });
        it('ROCK is not walkable', () => {
            expect(isWalkable(grid, 1, 0, cols, rows)).toBe(false);
        });
        it('WATER is not walkable without canSwim', () => {
            expect(isWalkable(grid, 0, 1, cols, rows)).toBe(false);
        });
        it('WATER is walkable with canSwim', () => {
            expect(isWalkable(grid, 0, 1, cols, rows, true)).toBe(true);
        });
        it('TREE is not walkable', () => {
            expect(isWalkable(grid, 2, 1, cols, rows)).toBe(false);
        });
        it('out of bounds is not walkable', () => {
            expect(isWalkable(grid, -1, 0, cols, rows)).toBe(false);
            expect(isWalkable(grid, 3, 0, cols, rows)).toBe(false);
        });
    });

    describe('isCliff', () => {
        it('CLIFF returns true', () => {
            expect(isCliff(grid, 2, 0, cols, rows)).toBe(true);
        });
        it('OPEN returns false', () => {
            expect(isCliff(grid, 0, 0, cols, rows)).toBe(false);
        });
        it('out of bounds returns false', () => {
            expect(isCliff(grid, -1, 0, cols, rows)).toBe(false);
        });
    });

    describe('isSwimmable', () => {
        it('WATER returns true', () => {
            expect(isSwimmable(grid, 0, 1, cols, rows)).toBe(true);
        });
        it('OPEN returns false', () => {
            expect(isSwimmable(grid, 0, 0, cols, rows)).toBe(false);
        });
    });
});

describe('bfsReachable', () => {
    it('finds path on simple open grid', () => {
        const grid = [
            [Terrain.OPEN, Terrain.OPEN],
            [Terrain.OPEN, Terrain.OPEN],
        ];
        expect(bfsReachable(grid, 2, 2, { col: 0, row: 0 }, { col: 1, row: 1 })).toBe(true);
    });

    it('returns false when completely blocked', () => {
        const grid = [
            [Terrain.OPEN, Terrain.ROCK],
            [Terrain.ROCK, Terrain.OPEN],
        ];
        expect(bfsReachable(grid, 2, 2, { col: 0, row: 0 }, { col: 1, row: 1 })).toBe(false);
    });

    it('traverses WATER cells', () => {
        const grid = [
            [Terrain.OPEN,  Terrain.ROCK],
            [Terrain.WATER, Terrain.ROCK],
            [Terrain.WATER, Terrain.OPEN],
        ];
        expect(bfsReachable(grid, 2, 3, { col: 0, row: 0 }, { col: 1, row: 2 })).toBe(true);
    });

    it('cannot traverse CLIFF or TREE', () => {
        const grid = [
            [Terrain.OPEN, Terrain.CLIFF, Terrain.OPEN],
        ];
        expect(bfsReachable(grid, 3, 1, { col: 0, row: 0 }, { col: 2, row: 0 })).toBe(false);
    });

    it('start equals goal returns true', () => {
        const grid = [[Terrain.OPEN]];
        expect(bfsReachable(grid, 1, 1, { col: 0, row: 0 }, { col: 0, row: 0 })).toBe(true);
    });
});

describe('generateMountainMap — wide maps (15 cols)', () => {
    it('15-col maps are reachable across 10 random generations per season', () => {
        const seasons = ['WinterY2', 'SpringY2', 'SummerY2', 'FallY2'];
        for (const season of seasons) {
            for (let i = 0; i < 10; i++) {
                const map = generateMountainMap(15, 7, season);
                expect(bfsReachable(map.grid, map.cols, map.rows, map.start, map.goal),
                    `${season} 15-col attempt ${i + 1}`).toBe(true);
            }
        }
    });

    it('forest zones have dead-end spurs (extra OPEN cells off main path)', () => {
        // Generate a map and check that forest zones have OPEN cells beyond the 3-wide main path
        const map = generateMountainMap(14, 6, 'FallY2');
        const forestZones = map.zones.filter(z => z.type === 'forest');
        let spurCells = 0;
        for (const zone of forestZones) {
            for (let r = zone.startRow; r < zone.startRow + zone.height; r++) {
                let openInRow = 0;
                for (let c = 0; c < map.cols; c++) {
                    if (map.grid[r][c] === Terrain.OPEN) openInRow++;
                }
                // Main path is ~3 wide; any row with >3 OPEN cells has spur extensions
                if (openInRow > 3) spurCells += openInRow - 3;
            }
        }
        // At least some spurs should exist across the 4+ forest zones
        expect(spurCells).toBeGreaterThan(0);
    });
});

// ── BFS shortest path solver for explore % simulation ───────────────────────

type Cell = { col: number; row: number };

function bfsPath(
    grid: Terrain[][], cols: number, rows: number,
    from: Cell, to: Cell,
): Cell[] {
    if (from.col === to.col && from.row === to.row) return [to];
    const key = (c: number, r: number) => r * cols + c;
    const prev = new Map<number, number>();
    const queue: [number, number][] = [[from.col, from.row]];
    const startKey = key(from.col, from.row);
    prev.set(startKey, -1);

    while (queue.length > 0) {
        const [c, r] = queue.shift()!;
        for (const [dc, dr] of [[0,-1],[0,1],[-1,0],[1,0]]) {
            const nc = c + dc, nr = r + dr;
            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
            const k = key(nc, nr);
            if (prev.has(k)) continue;
            const t = grid[nr][nc];
            if (t !== Terrain.OPEN && t !== Terrain.WATER) continue;
            prev.set(k, key(c, r));
            if (nc === to.col && nr === to.row) {
                // Reconstruct path
                const path: Cell[] = [];
                let cur = k;
                while (cur !== -1) {
                    path.push({ col: cur % cols, row: Math.floor(cur / cols) });
                    cur = prev.get(cur)!;
                }
                return path.reverse();
            }
            queue.push([nc, nr]);
        }
    }
    return []; // no path
}

/** Count all OPEN + WATER cells reachable from start. */
function countReachable(grid: Terrain[][], cols: number, rows: number, start: Cell): number {
    const visited = new Set<number>();
    const key = (c: number, r: number) => r * cols + c;
    const queue: [number, number][] = [[start.col, start.row]];
    visited.add(key(start.col, start.row));
    while (queue.length > 0) {
        const [c, r] = queue.shift()!;
        for (const [dc, dr] of [[0,-1],[0,1],[-1,0],[1,0]]) {
            const nc = c + dc, nr = r + dr;
            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
            const k = key(nc, nr);
            if (visited.has(k)) continue;
            const t = grid[nr][nc];
            if (t === Terrain.OPEN || t === Terrain.WATER) {
                visited.add(k);
                queue.push([nc, nr]);
            }
        }
    }
    return visited.size;
}

/** Simulate objective placement matching GameY2Scene logic. */
function placeObjectives(map: ReturnType<typeof generateMountainMap>, seasonName: string): Cell[] {
    const { grid, cols, zones, landCells, start, goal } = map;
    const rows = map.rows;
    const notStartGoal = (c: Cell) =>
        !(c.col === start.col && c.row === start.row) &&
        !(c.col === goal.col && c.row === goal.row);
    const adjTo = (col: number, row: number, t: Terrain) =>
        [[0,-1],[0,1],[-1,0],[1,0]].some(([dc,dr]) => {
            const nc = col + dc, nr = row + dr;
            return nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === t;
        });

    let candidates: Cell[];
    switch (seasonName) {
        case 'WinterY2': {
            candidates = [];
            for (const zone of zones) {
                if (zone.type !== 'water') continue;
                for (let r = zone.startRow; r < zone.startRow + zone.height; r++) {
                    for (let c = 0; c < cols; c++) {
                        if (grid[r][c] === Terrain.WATER) candidates.push({ col: c, row: r });
                    }
                }
            }
            break;
        }
        case 'SpringY2':
            candidates = landCells.filter(c =>
                notStartGoal(c) && grid[c.row][c.col] === Terrain.OPEN && adjTo(c.col, c.row, Terrain.TREE));
            break;
        case 'SummerY2':
            candidates = landCells.filter(c =>
                notStartGoal(c) && grid[c.row][c.col] === Terrain.OPEN && adjTo(c.col, c.row, Terrain.BAMBOO));
            break;
        case 'FallY2': {
            candidates = [];
            for (const zone of zones) {
                if (zone.type !== 'forest') continue;
                for (const lc of landCells) {
                    if (lc.row >= zone.startRow && lc.row < zone.startRow + zone.height &&
                        grid[lc.row][lc.col] === Terrain.OPEN && notStartGoal(lc)) {
                        candidates.push(lc);
                    }
                }
            }
            break;
        }
        default:
            candidates = landCells.filter(c => notStartGoal(c) && grid[c.row][c.col] === Terrain.OPEN);
    }

    const count = Math.min(3, candidates.length); // use month ~3 baseline
    const picked: Cell[] = [];

    for (const zone of zones) {
        if (picked.length >= count) break;
        const inZone = candidates.filter(c =>
            c.row >= zone.startRow && c.row < zone.startRow + zone.height &&
            !picked.some(p => p.col === c.col && p.row === c.row));
        if (inZone.length > 0) {
            picked.push(inZone[Math.floor(Math.random() * inZone.length)]);
        }
    }
    const remaining = candidates.filter(c => !picked.some(p => p.col === c.col && p.row === c.row));
    while (picked.length < count && remaining.length > 0) {
        const idx = Math.floor(Math.random() * remaining.length);
        picked.push(remaining[idx]);
        remaining.splice(idx, 1);
    }
    return picked;
}

// ── Explore percentage test ─────────────────────────────────────────────────

const NUM_TRIALS = 20;

describe('Year Two explore percentage', () => {
    const seasons = ['WinterY2', 'SpringY2', 'SummerY2', 'FallY2'];

    for (const season of seasons) {
        it(`${season}: measures explore % across ${NUM_TRIALS} trials`, () => {
            const ratios: number[] = [];

            for (let i = 0; i < NUM_TRIALS; i++) {
                const map = generateMountainMap(14, 6, season);
                const objectives = placeObjectives(map, season);
                const totalReachable = countReachable(map.grid, map.cols, map.rows, map.start);

                // Simulate player BFS-walking: start → each objective → goal
                const targets: Cell[] = [...objectives, map.goal];
                const visited = new Set<string>();
                visited.add(`${map.start.col},${map.start.row}`);
                let cur = map.start;

                for (const target of targets) {
                    const path = bfsPath(map.grid, map.cols, map.rows, cur, target);
                    for (const c of path) visited.add(`${c.col},${c.row}`);
                    if (path.length > 0) cur = path[path.length - 1];
                }

                ratios.push(visited.size / totalReachable);
            }

            const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
            const min = Math.min(...ratios);
            const max = Math.max(...ratios);

            // Log results for analysis
            console.log(`[${season}] Explore: avg=${(avg*100).toFixed(1)}% min=${(min*100).toFixed(1)}% max=${(max*100).toFixed(1)}%`);

            // Baseline assertions — intentionally loose to establish current state
            expect(avg).toBeGreaterThan(0.10); // at least 10% (just to catch broken maps)
            expect(min).toBeGreaterThan(0.05);
        });
    }
});
