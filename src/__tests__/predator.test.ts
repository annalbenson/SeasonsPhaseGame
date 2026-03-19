// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

// Mock Phaser to avoid canvas/WebGL initialization
vi.mock('phaser', () => ({ default: {} }));

import { isPassable, findPredatorCandidates, pickSpawnPositions } from '../predator';
import { Terrain, TerrainMap, ZoneInfo, generateMountainMap } from '../terrain';
import { PREDATOR_MIN_SPAWN_DIST } from '../gameplay';
import { getIntensity } from '../weatherHazard';

// ── isPassable ──────────────────────────────────────────────────────────────

describe('isPassable', () => {
    const grid: Terrain[][] = [
        [Terrain.OPEN, Terrain.ROCK, Terrain.WATER],
        [Terrain.TREE, Terrain.OPEN, Terrain.CLIFF],
        [Terrain.BOULDER, Terrain.BAMBOO, Terrain.OPEN],
    ];
    const cols = 3, rows = 3;

    it('returns true for OPEN tiles', () => {
        expect(isPassable(grid, 0, 0, cols, rows)).toBe(true);
        expect(isPassable(grid, 1, 1, cols, rows)).toBe(true);
        expect(isPassable(grid, 2, 2, cols, rows)).toBe(true);
    });

    it('returns false for non-OPEN tiles', () => {
        expect(isPassable(grid, 1, 0, cols, rows)).toBe(false); // ROCK
        expect(isPassable(grid, 2, 0, cols, rows)).toBe(false); // WATER
        expect(isPassable(grid, 0, 1, cols, rows)).toBe(false); // TREE
        expect(isPassable(grid, 2, 1, cols, rows)).toBe(false); // CLIFF
        expect(isPassable(grid, 0, 2, cols, rows)).toBe(false); // BOULDER
        expect(isPassable(grid, 1, 2, cols, rows)).toBe(false); // BAMBOO
    });

    it('returns false for out-of-bounds coordinates', () => {
        expect(isPassable(grid, -1, 0, cols, rows)).toBe(false);
        expect(isPassable(grid, 0, -1, cols, rows)).toBe(false);
        expect(isPassable(grid, 3, 0, cols, rows)).toBe(false);
        expect(isPassable(grid, 0, 3, cols, rows)).toBe(false);
    });
});

// ── findPredatorCandidates ──────────────────────────────────────────────────

describe('findPredatorCandidates', () => {
    function makeTerrain(zones: ZoneInfo[], cols: number, startRow: number): TerrainMap {
        const totalRows = zones.reduce((max, z) => Math.max(max, z.startRow + z.height), 0);
        // Fill grid: ROCK everywhere, then OPEN in forest/ridge zones
        const grid: Terrain[][] = [];
        for (let r = 0; r < totalRows; r++) {
            grid.push(new Array(cols).fill(Terrain.ROCK));
        }
        for (const z of zones) {
            if (z.type === 'forest' || z.type === 'ridge') {
                for (let r = z.startRow; r < z.startRow + z.height; r++) {
                    for (let c = 0; c < cols; c++) {
                        grid[r][c] = Terrain.OPEN;
                    }
                }
            }
        }
        return {
            cols, rows: totalRows, grid,
            start: { col: 0, row: startRow },
            goal: { col: 0, row: 0 },
            fishSpawns: [],
            zones,
            landCells: [],
        };
    }

    it('only selects cells from forest and ridge zones', () => {
        const zones: ZoneInfo[] = [
            { type: 'forest', startRow: 0, height: 5 },
            { type: 'water', startRow: 5, height: 5 },
            { type: 'narrows', startRow: 10, height: 3 },
            { type: 'ridge', startRow: 13, height: 5 },
            { type: 'forest', startRow: 18, height: 5 },
        ];
        // Start at row 22 (bottom forest), so rows 0-12 are far enough
        const terrain = makeTerrain(zones, 4, 22);
        const candidates = findPredatorCandidates(terrain);

        // All candidates should be in forest (rows 0-4) or ridge (rows 13-17)
        for (const c of candidates) {
            const zone = zones.find(z => c.row >= z.startRow && c.row < z.startRow + z.height);
            expect(zone).toBeDefined();
            expect(['forest', 'ridge']).toContain(zone!.type);
        }
    });

    it('excludes cells too close to start', () => {
        const zones: ZoneInfo[] = [
            { type: 'forest', startRow: 0, height: 30 },
        ];
        const startRow = 20;
        const terrain = makeTerrain(zones, 4, startRow);
        const candidates = findPredatorCandidates(terrain);

        for (const c of candidates) {
            expect(Math.abs(c.row - startRow)).toBeGreaterThanOrEqual(PREDATOR_MIN_SPAWN_DIST);
        }
    });

    it('only selects OPEN cells', () => {
        const zones: ZoneInfo[] = [
            { type: 'forest', startRow: 0, height: 5 },
            { type: 'forest', startRow: 25, height: 5 },
        ];
        const terrain = makeTerrain(zones, 6, 29);
        // Add some non-OPEN tiles in the top forest
        terrain.grid[1][2] = Terrain.ROCK;
        terrain.grid[2][3] = Terrain.TREE;
        const candidates = findPredatorCandidates(terrain);

        for (const c of candidates) {
            expect(terrain.grid[c.row][c.col]).toBe(Terrain.OPEN);
        }
        // Verify the blocked cells are excluded
        expect(candidates.some(c => c.col === 2 && c.row === 1)).toBe(false);
        expect(candidates.some(c => c.col === 3 && c.row === 2)).toBe(false);
    });

    it('returns empty array when no valid zones exist far from start', () => {
        const zones: ZoneInfo[] = [
            { type: 'forest', startRow: 0, height: 5 },
        ];
        // Start at row 4 — everything is within MIN_SPAWN_DIST
        const terrain = makeTerrain(zones, 4, 4);
        const candidates = findPredatorCandidates(terrain);
        expect(candidates.length).toBe(0);
    });
});

// ── pickSpawnPositions ──────────────────────────────────────────────────────

describe('pickSpawnPositions', () => {
    it('picks the requested number of positions', () => {
        const candidates = [];
        for (let r = 0; r < 20; r++) {
            for (let c = 0; c < 10; c++) {
                candidates.push({ col: c, row: r });
            }
        }
        const picked = pickSpawnPositions(candidates, 2);
        expect(picked.length).toBe(2);
    });

    it('ensures minimum spacing between picks', () => {
        const candidates = [];
        for (let r = 0; r < 20; r++) {
            for (let c = 0; c < 10; c++) {
                candidates.push({ col: c, row: r });
            }
        }
        const picked = pickSpawnPositions(candidates, 2, 8);
        if (picked.length === 2) {
            const dist = Math.abs(picked[0].col - picked[1].col)
                       + Math.abs(picked[0].row - picked[1].row);
            expect(dist).toBeGreaterThanOrEqual(8);
        }
    });

    it('returns fewer picks if candidates are too clustered', () => {
        // All candidates within a 2x2 area — can't space them 8 apart
        const candidates = [
            { col: 0, row: 0 }, { col: 1, row: 0 },
            { col: 0, row: 1 }, { col: 1, row: 1 },
        ];
        const picked = pickSpawnPositions(candidates, 2, 8);
        expect(picked.length).toBe(1);
    });

    it('returns empty array for empty candidates', () => {
        const picked = pickSpawnPositions([], 2);
        expect(picked.length).toBe(0);
    });

    it('does not exceed requested count', () => {
        const candidates = [];
        for (let i = 0; i < 100; i++) {
            candidates.push({ col: i, row: 0 });
        }
        const picked = pickSpawnPositions(candidates, 3);
        expect(picked.length).toBeLessThanOrEqual(3);
    });
});

// ── Intensity scaling ───────────────────────────────────────────────────────

describe('predator count scaling', () => {
    it('intensity 1-2 yields 1 predator', () => {
        expect(getIntensity(0)).toBe(1);
        const count1 = getIntensity(0) >= 3 ? 2 : 1;
        expect(count1).toBe(1);

        expect(getIntensity(1)).toBe(2);
        const count2 = getIntensity(1) >= 3 ? 2 : 1;
        expect(count2).toBe(1);
    });

    it('intensity 3 yields 2 predators', () => {
        expect(getIntensity(4)).toBe(3);
        const count = getIntensity(4) >= 3 ? 2 : 1;
        expect(count).toBe(2);
    });
});

// ── Integration: findPredatorCandidates with real terrain ────────────────────

describe('findPredatorCandidates with generateMountainMap', () => {

    it('finds candidates on real terrain for each Y2 season', () => {
        for (const season of ['WinterY2', 'SpringY2', 'SummerY2', 'FallY2']) {
            const terrain = generateMountainMap(14, 6, season);
            const candidates = findPredatorCandidates(terrain);
            expect(candidates.length).toBeGreaterThan(0);

            // All candidates are OPEN
            for (const c of candidates) {
                expect(terrain.grid[c.row][c.col]).toBe(Terrain.OPEN);
            }

            // All candidates are far enough from start
            for (const c of candidates) {
                expect(Math.abs(c.row - terrain.start.row)).toBeGreaterThanOrEqual(PREDATOR_MIN_SPAWN_DIST);
            }
        }
    });

    it('can pick 2 spread-out positions on real terrain (20 trials)', () => {
        let successCount = 0;
        for (let i = 0; i < 20; i++) {
            const terrain = generateMountainMap(14, 6, 'WinterY2');
            const candidates = findPredatorCandidates(terrain);
            const picked = pickSpawnPositions(candidates, 2);
            if (picked.length === 2) successCount++;
        }
        // Should succeed most of the time
        expect(successCount).toBeGreaterThanOrEqual(15);
    });
});
