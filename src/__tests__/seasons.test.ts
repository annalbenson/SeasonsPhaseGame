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
    it('has at least 1 month', () => {
        expect(MONTHS_Y2.length).toBeGreaterThan(0);
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
