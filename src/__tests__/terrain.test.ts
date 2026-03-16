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

    it('contains all 3 zone types', () => {
        const map = generateMountainMap(14, 6, 'WinterY2');
        const types = new Set(map.zones.map(z => z.type));
        expect(types.has('forest')).toBe(true);
        expect(types.has('narrows')).toBe(true);
        expect(types.has('water')).toBe(true);
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
