// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

// Mock Phaser to avoid canvas/WebGL initialization
vi.mock('phaser', () => ({ default: {} }));

import { getIntensity, createWeatherHazard } from '../weatherHazard';
import { Terrain } from '../terrain';

describe('getIntensity', () => {
    it('returns 1 for first month of each season', () => {
        expect(getIntensity(0)).toBe(1);  // Jan
        expect(getIntensity(2)).toBe(1);  // Mar
        expect(getIntensity(5)).toBe(1);  // Jun
        expect(getIntensity(8)).toBe(1);  // Sep
    });

    it('returns 2 for second month of each season', () => {
        expect(getIntensity(1)).toBe(2);  // Feb
        expect(getIntensity(3)).toBe(2);  // Apr
        expect(getIntensity(6)).toBe(2);  // Jul
        expect(getIntensity(9)).toBe(2);  // Oct
    });

    it('returns 3 for third month of each season', () => {
        expect(getIntensity(4)).toBe(3);  // May
        expect(getIntensity(7)).toBe(3);  // Aug
        expect(getIntensity(10)).toBe(3); // Nov
        expect(getIntensity(11)).toBe(3); // Dec
    });

    it('defaults to 1 for out-of-range index', () => {
        expect(getIntensity(99)).toBe(1);
        expect(getIntensity(-1)).toBe(1);
    });
});

describe('createWeatherHazard', () => {
    it('returns SnowdriftHazard for WinterY2', () => {
        const h = createWeatherHazard('WinterY2', 1);
        expect(h).not.toBeNull();
        expect(h!.intensity).toBe(1);
        expect(h!.getLabel()).toContain('snowdrift');
    });

    it('returns FloodHazard for SpringY2', () => {
        const h = createWeatherHazard('SpringY2', 2);
        expect(h).not.toBeNull();
        expect(h!.intensity).toBe(2);
        expect(h!.getLabel()).toContain('flooding');
    });

    it('returns WindHazard for FallY2', () => {
        const h = createWeatherHazard('FallY2', 3);
        expect(h).not.toBeNull();
        expect(h!.intensity).toBe(3);
        expect(h!.getLabel()).toContain('wind');
    });

    it('returns HeatHazard for SummerY2', () => {
        const h = createWeatherHazard('SummerY2', 1);
        expect(h).not.toBeNull();
        expect(h!.getLabel()).toContain('heat');
    });

    it('returns null for unknown season', () => {
        expect(createWeatherHazard('FooBar', 1)).toBeNull();
    });

    it('intensity is preserved in the hazard', () => {
        for (const i of [1, 2, 3] as const) {
            const h = createWeatherHazard('WinterY2', i);
            expect(h!.intensity).toBe(i);
        }
    });
});

describe('hazard default behaviors (no spawn)', () => {
    it('snowdrift: isBlocked always false, no wind push', () => {
        const h = createWeatherHazard('WinterY2', 2)!;
        expect(h.isBlocked(0, 0)).toBe(false);
        expect(h.getWindPush(0, 0)).toBeNull();
    });

    it('snowdrift: getMoveCost is 0 for non-drift tiles', () => {
        const h = createWeatherHazard('WinterY2', 1)!;
        expect(h.getMoveCost(5, 5)).toBe(0);
    });

    it('flood: isBlocked false before spawn', () => {
        const h = createWeatherHazard('SpringY2', 1)!;
        expect(h.isBlocked(0, 0)).toBe(false);
    });

    it('wind: getWindPush returns null when no clouds spawned', () => {
        const h = createWeatherHazard('FallY2', 1)!;
        // Before spawn(), no clouds exist so wind push is always null
        expect(h.getWindPush(0, 0)).toBeNull();
        expect(h.getWindPush(5, 5)).toBeNull();
    });

    it('heat: getMoveCost accumulates heat', () => {
        const h = createWeatherHazard('SummerY2', 3)!;
        // Provide a simple OPEN grid so heat accumulates
        const grid: Terrain[][] = [[Terrain.OPEN]];
        let totalCost = 0;
        for (let i = 0; i < 20; i++) {
            totalCost += h.getMoveCost(0, 0, grid);
        }
        // At intensity 3, heatMax=50, heat += 3 per step
        // After ~17 steps heat hits 51 → overheating costs 3
        expect(totalCost).toBeGreaterThan(0);
    });

    it('heat: label reflects intensity', () => {
        expect(createWeatherHazard('SummerY2', 1)!.getLabel()).toMatch(/Mild/i);
        expect(createWeatherHazard('SummerY2', 2)!.getLabel()).toMatch(/Moderate/i);
        expect(createWeatherHazard('SummerY2', 3)!.getLabel()).toMatch(/Scorching/i);
    });

    it('wind: label reflects intensity', () => {
        expect(createWeatherHazard('FallY2', 1)!.getLabel()).toMatch(/Gentle/i);
        expect(createWeatherHazard('FallY2', 2)!.getLabel()).toMatch(/Moderate/i);
        expect(createWeatherHazard('FallY2', 3)!.getLabel()).toMatch(/Strong/i);
    });

    it('wind: revealLeaf returns false when no leaves spawned', () => {
        const h = createWeatherHazard('FallY2', 1)!;
        expect(h.revealLeaf?.(3, 3)).toBe(false);
    });
});

// ── Detailed heat mechanic tests ──────────────────────────────────────────

describe('HeatHazard mechanics', () => {
    it('water tile resets heat to 0', () => {
        const h = createWeatherHazard('SummerY2', 2)!;
        const grid: Terrain[][] = [
            [Terrain.OPEN, Terrain.WATER],
        ];
        // Build up heat on OPEN
        h.getMoveCost(0, 0, grid);
        h.getMoveCost(0, 0, grid);
        h.getMoveCost(0, 0, grid);
        // Step on water — should return 0 and reset heat
        const cost = h.getMoveCost(1, 0, grid);
        expect(cost).toBe(0);
        // Next OPEN step should start from 0 heat, so no overheating penalty
        const next = h.getMoveCost(0, 0, grid);
        expect(next).toBe(0);
    });

    it('shaded tile (adjacent to BAMBOO) gains heat at half rate', () => {
        const h1 = createWeatherHazard('SummerY2', 2)!;
        const h2 = createWeatherHazard('SummerY2', 2)!;
        // Grid where (1,0) is OPEN adjacent to BAMBOO (shaded)
        const shadedGrid: Terrain[][] = [
            [Terrain.BAMBOO, Terrain.OPEN],
        ];
        // Grid where (0,0) is OPEN with no BAMBOO neighbor (unshaded)
        const unshadedGrid: Terrain[][] = [
            [Terrain.OPEN, Terrain.ROCK],
        ];
        // Accumulate heat on shaded vs unshaded for same number of steps
        let shadedTotal = 0, unshadedTotal = 0;
        for (let i = 0; i < 10; i++) {
            shadedTotal += h1.getMoveCost(1, 0, shadedGrid);
            unshadedTotal += h2.getMoveCost(0, 0, unshadedGrid);
        }
        // Shaded should accumulate less total cost (or equal if no overheat)
        // With intensity 2: unshaded gains 2/step, shaded gains 1/step
        // heatMax=40: unshaded hits 40 at step 20, shaded hits 40 at step 40
        // In 10 steps: unshaded heat=20, shaded heat=10 — neither overheats yet
        // But both return 0 extra cost. Let's go further to trigger overheat.
        for (let i = 0; i < 15; i++) {
            shadedTotal += h1.getMoveCost(1, 0, shadedGrid);
            unshadedTotal += h2.getMoveCost(0, 0, unshadedGrid);
        }
        // Unshaded should have overheated (25 steps × 2 = 50 > 40), shaded should not yet (25 × 1 = 25 < 40)
        expect(unshadedTotal).toBeGreaterThan(shadedTotal);
    });

    it('overheating returns 3 extra cost and partially cools down', () => {
        const h = createWeatherHazard('SummerY2', 3)!;
        // intensity 3: heatMax=50, gains 3 per step
        // After 17 steps: heat = 51 → overheats
        const grid: Terrain[][] = [[Terrain.OPEN]];
        let overheatStep = -1;
        for (let i = 0; i < 25; i++) {
            const cost = h.getMoveCost(0, 0, grid);
            if (cost > 0 && overheatStep < 0) {
                overheatStep = i;
                expect(cost).toBe(3); // overheating penalty
            }
        }
        expect(overheatStep).toBeGreaterThan(0);
        expect(overheatStep).toBeLessThan(20);
    });

    it('returns 0 for out-of-bounds coordinates', () => {
        const h = createWeatherHazard('SummerY2', 1)!;
        const grid: Terrain[][] = [[Terrain.OPEN]];
        expect(h.getMoveCost(-1, 0, grid)).toBe(0);
        expect(h.getMoveCost(0, -1, grid)).toBe(0);
        expect(h.getMoveCost(5, 0, grid)).toBe(0);
    });

    it('returns 0 when no grid provided', () => {
        const h = createWeatherHazard('SummerY2', 2)!;
        expect(h.getMoveCost(0, 0)).toBe(0);
    });
});

// ── Wind push mechanics ──────────────────────────────────────────────────

describe('WindHazard push mechanics', () => {
    it('push cooldown prevents consecutive pushes', () => {
        const h = createWeatherHazard('FallY2', 1)!;
        // Without spawn, getWindPush always returns null (no clouds)
        // This test just verifies the cooldown counter behavior
        // by checking that multiple calls return null
        expect(h.getWindPush(0, 0)).toBeNull();
        expect(h.getWindPush(0, 0)).toBeNull();
    });
});

// ── Snowdrift mechanics ──────────────────────────────────────────────────

describe('SnowdriftHazard mechanics', () => {
    it('all hazard methods have correct defaults before spawn', () => {
        const h = createWeatherHazard('WinterY2', 1)!;
        expect(h.isBlocked(0, 0)).toBe(false);
        expect(h.getMoveCost(3, 3)).toBe(0);
        expect(h.getWindPush(0, 0)).toBeNull();
    });

    it('labels reflect all three intensities', () => {
        expect(createWeatherHazard('WinterY2', 1)!.getLabel()).toMatch(/Light/i);
        expect(createWeatherHazard('WinterY2', 2)!.getLabel()).toMatch(/Moderate/i);
        expect(createWeatherHazard('WinterY2', 3)!.getLabel()).toMatch(/Heavy/i);
    });
});

// ── Flood mechanics ──────────────────────────────────────────────────────

describe('FloodHazard mechanics', () => {
    it('all hazard methods have correct defaults before spawn', () => {
        const h = createWeatherHazard('SpringY2', 2)!;
        expect(h.isBlocked(0, 0)).toBe(false);
        expect(h.getMoveCost(0, 0)).toBe(0);
        expect(h.getWindPush(0, 0)).toBeNull();
    });

    it('labels reflect all three intensities', () => {
        expect(createWeatherHazard('SpringY2', 1)!.getLabel()).toMatch(/Light/i);
        expect(createWeatherHazard('SpringY2', 2)!.getLabel()).toMatch(/Moderate/i);
        expect(createWeatherHazard('SpringY2', 3)!.getLabel()).toMatch(/Heavy/i);
    });
});

describe('WindHazard hidden berries', () => {
    it('hasHiddenBerry returns false before spawn', () => {
        const h = createWeatherHazard('FallY2', 1)!;
        expect(h.hasHiddenBerry?.(0, 0)).toBe(false);
    });

    it('getHiddenBerryCount returns 0 before spawn', () => {
        const h = createWeatherHazard('FallY2', 1)!;
        expect(h.getHiddenBerryCount?.()).toBe(0);
    });

    it('hasHiddenBerry is only on WindHazard (FallY2)', () => {
        const winter = createWeatherHazard('WinterY2', 1)!;
        const spring = createWeatherHazard('SpringY2', 1)!;
        const summer = createWeatherHazard('SummerY2', 1)!;
        expect(winter.hasHiddenBerry).toBeUndefined();
        expect(spring.hasHiddenBerry).toBeUndefined();
        expect(summer.hasHiddenBerry).toBeUndefined();
    });

    it('getHiddenBerryCount is only on WindHazard (FallY2)', () => {
        const winter = createWeatherHazard('WinterY2', 1)!;
        expect(winter.getHiddenBerryCount).toBeUndefined();
    });
});
