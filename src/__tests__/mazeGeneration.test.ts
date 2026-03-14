import { describe, it, expect } from 'vitest';
import { ALGORITHMS, WALLS, OPPOSITE, shuffle, widenCorridors } from '../maze';
import { floodFill } from '../mazeUtils';

const ALGO_KEYS = Object.keys(ALGORITHMS) as (keyof typeof ALGORITHMS)[];
const TRIALS = 20;

describe('Maze generation algorithms', () => {
    for (const key of ALGO_KEYS) {
        describe(ALGORITHMS[key].name, () => {
            it(`produces a fully connected maze (${TRIALS} trials)`, () => {
                for (let i = 0; i < TRIALS; i++) {
                    const cells = ALGORITHMS[key].generate(8, 8);
                    const reachable = floodFill(cells, 8, 8, 0, 0);
                    expect(reachable.size, `${key} trial ${i}: not all cells reachable`).toBe(64);
                }
            });

            it('has symmetric walls — if A→B open, then B→A open', () => {
                const cells = ALGORITHMS[key].generate(6, 6);
                for (let r = 0; r < 6; r++) {
                    for (let c = 0; c < 6; c++) {
                        if (c < 5) {
                            const aOpen = !(cells[r][c] & WALLS.RIGHT);
                            const bOpen = !(cells[r][c + 1] & WALLS.LEFT);
                            expect(aOpen, `(${c},${r}) RIGHT vs (${c+1},${r}) LEFT`).toBe(bOpen);
                        }
                        if (r < 5) {
                            const aOpen = !(cells[r][c] & WALLS.BOTTOM);
                            const bOpen = !(cells[r + 1][c] & WALLS.TOP);
                            expect(aOpen, `(${c},${r}) BOTTOM vs (${c},${r+1}) TOP`).toBe(bOpen);
                        }
                    }
                }
            });

            it('preserves outer boundary walls', () => {
                const cells = ALGORITHMS[key].generate(5, 5);
                for (let c = 0; c < 5; c++) {
                    expect(cells[0][c] & WALLS.TOP, `top wall at col ${c}`).toBeTruthy();
                    expect(cells[4][c] & WALLS.BOTTOM, `bottom wall at col ${c}`).toBeTruthy();
                }
                for (let r = 0; r < 5; r++) {
                    expect(cells[r][0] & WALLS.LEFT, `left wall at row ${r}`).toBeTruthy();
                    expect(cells[r][4] & WALLS.RIGHT, `right wall at row ${r}`).toBeTruthy();
                }
            });
        });
    }
});

describe('shuffle', () => {
    it('returns a permutation with same elements and length', () => {
        const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const result = shuffle(input);
        expect(result.length).toBe(input.length);
        expect(result.sort((a, b) => a - b)).toEqual(input);
    });

    it('does not mutate the original array', () => {
        const input = [1, 2, 3];
        const copy = [...input];
        shuffle(input);
        expect(input).toEqual(copy);
    });

    it('returns empty array for empty input', () => {
        expect(shuffle([])).toEqual([]);
    });
});

describe('widenCorridors', () => {
    it('only removes walls, never adds them', () => {
        for (let i = 0; i < TRIALS; i++) {
            const cells = ALGORITHMS.kruskals.generate(8, 8);
            // Snapshot wall state before widening
            const before = cells.map(row => [...row]);
            widenCorridors(cells, 8, 8, 0.5);
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    // Every wall that exists after widening must have existed before
                    // i.e., widening can only clear bits, not set them
                    expect(cells[r][c] & before[r][c], `(${c},${r}): wall added`).toBe(cells[r][c]);
                }
            }
        }
    });

    it('respects zone boundaries when zoneMap provided', () => {
        const cells = ALGORITHMS.kruskals.generate(6, 6);
        // Create two zones: top 3 rows = zone 0, bottom 3 rows = zone 1
        const zoneMap = new Map<string, number>();
        for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) zoneMap.set(`${c},${r}`, 0);
        for (let r = 3; r < 6; r++) for (let c = 0; c < 6; c++) zoneMap.set(`${c},${r}`, 1);

        // Snapshot the row 2→3 boundary walls
        const boundaryBefore: number[] = [];
        for (let c = 0; c < 6; c++) {
            boundaryBefore.push(cells[2][c] & WALLS.BOTTOM);
        }

        widenCorridors(cells, 6, 6, 1.0, zoneMap); // 100% chance to maximize effect

        // Cross-zone walls at row 2↔3 should not have been removed by widening
        // (they may already be open from maze generation, but widening shouldn't open new ones)
        for (let c = 0; c < 6; c++) {
            if (boundaryBefore[c]) {
                // Wall existed before — it should still exist (not removed by widener)
                expect(cells[2][c] & WALLS.BOTTOM, `cross-zone wall at col ${c} removed`).toBeTruthy();
            }
        }
    });
});
