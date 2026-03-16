// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

// Mock Phaser to avoid canvas/WebGL initialization
vi.mock('phaser', () => ({ default: {} }));

import { getIntensity, createWeatherHazard } from '../weatherHazard';

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

    it('wind: getWindPush returns null or push based on step count', () => {
        const h = createWeatherHazard('FallY2', 1)!;
        // intensity 1 → pushInterval = 4, so first 3 calls return null
        expect(h.getWindPush(0, 0)).toBeNull();
        expect(h.getWindPush(0, 0)).toBeNull();
        expect(h.getWindPush(0, 0)).toBeNull();
        // 4th call should push
        const push = h.getWindPush(0, 0);
        expect(push).not.toBeNull();
        expect(typeof push!.dx).toBe('number');
        expect(typeof push!.dy).toBe('number');
    });

    it('heat: getMoveCost accumulates heat', () => {
        const h = createWeatherHazard('SummerY2', 3)!;
        // Without a grid, heat builds each call
        let totalCost = 0;
        for (let i = 0; i < 20; i++) {
            totalCost += h.getMoveCost(0, 0);
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
});
