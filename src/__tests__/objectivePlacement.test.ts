// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));

import { findObjectiveCandidates, pickObjectivePositions, pickBonusPositions } from '../objectivePlacement';
import { Terrain, generateMountainMap } from '../terrain';

describe('findObjectiveCandidates', () => {
    it('WinterY2 returns WATER cells in water zones', () => {
        const terrain = generateMountainMap(14, 6, 'WinterY2');
        const candidates = findObjectiveCandidates(terrain, 'WinterY2', terrain.start.col, terrain.start.row, terrain.goal.col, terrain.goal.row);
        expect(candidates.length).toBeGreaterThan(0);
        for (const c of candidates) {
            expect(terrain.grid[c.row][c.col]).toBe(Terrain.WATER);
        }
    });

    it('SpringY2 returns OPEN cells adjacent to TREE', () => {
        const terrain = generateMountainMap(14, 6, 'SpringY2');
        const candidates = findObjectiveCandidates(terrain, 'SpringY2', terrain.start.col, terrain.start.row, terrain.goal.col, terrain.goal.row);
        expect(candidates.length).toBeGreaterThan(0);
        for (const c of candidates) {
            expect(terrain.grid[c.row][c.col]).toBe(Terrain.OPEN);
        }
    });

    it('SummerY2 returns OPEN cells adjacent to BAMBOO', () => {
        const terrain = generateMountainMap(14, 6, 'SummerY2');
        const candidates = findObjectiveCandidates(terrain, 'SummerY2', terrain.start.col, terrain.start.row, terrain.goal.col, terrain.goal.row);
        expect(candidates.length).toBeGreaterThan(0);
        for (const c of candidates) {
            expect(terrain.grid[c.row][c.col]).toBe(Terrain.OPEN);
        }
    });

    it('FallY2 returns OPEN cells in forest zones', () => {
        const terrain = generateMountainMap(14, 6, 'FallY2');
        const candidates = findObjectiveCandidates(terrain, 'FallY2', terrain.start.col, terrain.start.row, terrain.goal.col, terrain.goal.row);
        expect(candidates.length).toBeGreaterThan(0);
        for (const c of candidates) {
            expect(terrain.grid[c.row][c.col]).toBe(Terrain.OPEN);
            const inForest = terrain.zones.some(z =>
                z.type === 'forest' && c.row >= z.startRow && c.row < z.startRow + z.height);
            expect(inForest).toBe(true);
        }
    });

    it('excludes start and goal positions', () => {
        const terrain = generateMountainMap(14, 6, 'FallY2');
        const candidates = findObjectiveCandidates(terrain, 'FallY2', terrain.start.col, terrain.start.row, terrain.goal.col, terrain.goal.row);
        const hasStart = candidates.some(c => c.col === terrain.start.col && c.row === terrain.start.row);
        const hasGoal = candidates.some(c => c.col === terrain.goal.col && c.row === terrain.goal.row);
        expect(hasStart).toBe(false);
        expect(hasGoal).toBe(false);
    });
});

describe('pickObjectivePositions', () => {
    it('picks up to the requested count', () => {
        const candidates = [];
        for (let r = 0; r < 30; r++) {
            for (let c = 0; c < 10; c++) {
                candidates.push({ col: c, row: r });
            }
        }
        const zones = [
            { startRow: 0, height: 10 },
            { startRow: 10, height: 10 },
            { startRow: 20, height: 10 },
        ];
        const picked = pickObjectivePositions(candidates, zones, 3);
        expect(picked.length).toBe(3);
    });

    it('spreads across zones', () => {
        const zones = [
            { startRow: 0, height: 5 },
            { startRow: 5, height: 5 },
            { startRow: 10, height: 5 },
        ];
        const candidates = [];
        for (const z of zones) {
            for (let r = z.startRow; r < z.startRow + z.height; r++) {
                candidates.push({ col: 0, row: r });
            }
        }
        const picked = pickObjectivePositions(candidates, zones, 3);
        // Each pick should be in a different zone
        const zoneIndices = picked.map(p => zones.findIndex(z => p.row >= z.startRow && p.row < z.startRow + z.height));
        const uniqueZones = new Set(zoneIndices);
        expect(uniqueZones.size).toBe(3);
    });

    it('returns fewer if not enough candidates', () => {
        const candidates = [{ col: 0, row: 0 }];
        const zones = [{ startRow: 0, height: 5 }];
        const picked = pickObjectivePositions(candidates, zones, 5);
        expect(picked.length).toBe(1);
    });
});

describe('pickBonusPositions', () => {
    it('excludes used positions, start, and goal', () => {
        const candidates = [
            { col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 },
            { col: 3, row: 0 }, { col: 4, row: 0 }, { col: 5, row: 0 },
        ];
        const used = [{ col: 0, row: 0 }, { col: 1, row: 0 }];
        const bonus = pickBonusPositions(candidates, used, 2, 0, 3, 0, 3);
        for (const b of bonus) {
            // Should not be used, start (2,0), or goal (3,0)
            expect(used.some(u => u.col === b.col && u.row === b.row)).toBe(false);
            expect(b.col === 2 && b.row === 0).toBe(false);
            expect(b.col === 3 && b.row === 0).toBe(false);
        }
    });

    it('returns up to count', () => {
        const candidates = [];
        for (let c = 0; c < 20; c++) candidates.push({ col: c, row: 0 });
        const bonus = pickBonusPositions(candidates, [], 0, 0, 99, 99, 3);
        expect(bonus.length).toBeLessThanOrEqual(3);
    });

    it('returns empty if no candidates remain', () => {
        const candidates = [{ col: 0, row: 0 }];
        const bonus = pickBonusPositions(candidates, [{ col: 0, row: 0 }], 99, 99, 99, 99, 3);
        expect(bonus.length).toBe(0);
    });
});

describe('integration: objectives on real terrain', () => {
    for (const season of ['WinterY2', 'SpringY2', 'SummerY2', 'FallY2']) {
        it(`${season}: finds candidates and picks objectives (10 trials)`, () => {
            for (let i = 0; i < 10; i++) {
                const terrain = generateMountainMap(14, 6, season);
                const candidates = findObjectiveCandidates(
                    terrain, season,
                    terrain.start.col, terrain.start.row,
                    terrain.goal.col, terrain.goal.row,
                );
                expect(candidates.length).toBeGreaterThan(0);

                const picked = pickObjectivePositions(candidates, terrain.zones, 3);
                expect(picked.length).toBeGreaterThanOrEqual(1);
                expect(picked.length).toBeLessThanOrEqual(3);
            }
        });
    }
});
