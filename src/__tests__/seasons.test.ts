import { describe, it, expect } from 'vitest';
import { MONTHS, MONTHS_Y2, SEASONS, SeasonTheme } from '../seasons';

describe('MONTHS config validation', () => {
    it('has exactly 12 months', () => {
        expect(MONTHS.length).toBe(12);
    });

    it('months are numbered 1–12 in order', () => {
        for (let i = 0; i < 12; i++) {
            expect(MONTHS[i].month).toBe(i + 1);
        }
    });

    it('all months have valid grid sizes (8–14)', () => {
        for (const m of MONTHS) {
            expect(m.cols, `${m.name} cols`).toBeGreaterThanOrEqual(8);
            expect(m.cols, `${m.name} cols`).toBeLessThanOrEqual(14);
            expect(m.rows, `${m.name} rows`).toBeGreaterThanOrEqual(8);
            expect(m.rows, `${m.name} rows`).toBeLessThanOrEqual(14);
        }
    });

    it('all months have a name, shortName, quote, and author', () => {
        for (const m of MONTHS) {
            expect(m.name.length, `month ${m.month} name`).toBeGreaterThan(0);
            expect(m.shortName.length, `month ${m.month} shortName`).toBeGreaterThan(0);
            expect(m.quote.length, `month ${m.month} quote`).toBeGreaterThan(0);
            expect(m.author.length, `month ${m.month} author`).toBeGreaterThan(0);
        }
    });

    it('each month references a valid season', () => {
        const validNames: SeasonTheme['name'][] = ['Winter', 'Spring', 'Summer', 'Fall', 'Tutorial', 'WinterY2'];
        for (const m of MONTHS) {
            expect(validNames, `${m.name} season name "${m.season.name}"`).toContain(m.season.name);
        }
    });
});

describe('SeasonTheme pre-computed hex strings', () => {
    function hex(c: number): string { return `#${c.toString(16).padStart(6, '0')}`; }

    for (const [name, season] of Object.entries(SEASONS)) {
        it(`${name} accentHex matches uiAccent`, () => {
            expect(season.accentHex).toBe(hex(season.uiAccent));
        });
    }
});

describe('MONTHS_Y2 config validation', () => {
    it('has exactly 12 months', () => {
        expect(MONTHS_Y2).toHaveLength(12);
    });

    it('all months have year 2', () => {
        for (const m of MONTHS_Y2) {
            expect(m.year).toBe(2);
        }
    });

    it('month numbers go 1-12 in order', () => {
        for (let i = 0; i < 12; i++) {
            expect(MONTHS_Y2[i].month).toBe(i + 1);
        }
    });

    it('winter months are Jan, Feb, Dec', () => {
        const winterMonths = MONTHS_Y2.filter(m => m.season.name === 'WinterY2');
        const nums = winterMonths.map(m => m.month).sort((a, b) => a - b);
        expect(nums).toEqual([1, 2, 12]);
    });

    it('spring months are Mar, Apr, May', () => {
        const springMonths = MONTHS_Y2.filter(m => m.season.name === 'SpringY2');
        const nums = springMonths.map(m => m.month).sort((a, b) => a - b);
        expect(nums).toEqual([3, 4, 5]);
    });

    it('summer months are Jun, Jul, Aug', () => {
        const summerMonths = MONTHS_Y2.filter(m => m.season.name === 'SummerY2');
        const nums = summerMonths.map(m => m.month).sort((a, b) => a - b);
        expect(nums).toEqual([6, 7, 8]);
    });

    it('fall months are Sep, Oct, Nov', () => {
        const fallMonths = MONTHS_Y2.filter(m => m.season.name === 'FallY2');
        const nums = fallMonths.map(m => m.month).sort((a, b) => a - b);
        expect(nums).toEqual([9, 10, 11]);
    });

    it('every month has a non-empty quote and author', () => {
        for (const m of MONTHS_Y2) {
            expect(m.quote.length).toBeGreaterThan(0);
            expect(m.author.length).toBeGreaterThan(0);
        }
    });

    it('cols are 14 or 15 for all months', () => {
        for (const m of MONTHS_Y2) {
            expect([14, 15]).toContain(m.cols);
        }
    });

    it('rows are 6 or 7 for all months', () => {
        for (const m of MONTHS_Y2) {
            expect([6, 7]).toContain(m.rows);
        }
    });

    it('all Y2 months have valid grid sizes', () => {
        for (const m of MONTHS_Y2) {
            expect(m.cols, `${m.name} cols`).toBeGreaterThanOrEqual(4);
            expect(m.cols, `${m.name} cols`).toBeLessThanOrEqual(20);
            expect(m.rows, `${m.name} rows`).toBeGreaterThanOrEqual(4);
            expect(m.rows, `${m.name} rows`).toBeLessThanOrEqual(50);
        }
    });
});
