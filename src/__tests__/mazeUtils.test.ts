import { describe, it, expect } from 'vitest';
import { WALLS, OPPOSITE } from '../maze';
import { solvePath, floodFill, bfsDistanceMap } from '../mazeUtils';

// Helper: create a grid with all walls, then selectively open passages
function blankGrid(cols: number, rows: number): number[][] {
    const ALL = WALLS.TOP | WALLS.RIGHT | WALLS.BOTTOM | WALLS.LEFT;
    return Array.from({ length: rows }, () => Array(cols).fill(ALL));
}

function openWall(cells: number[][], col: number, row: number, wall: number) {
    cells[row][col] &= ~wall;
    const dc = wall === WALLS.RIGHT ? 1 : wall === WALLS.LEFT ? -1 : 0;
    const dr = wall === WALLS.BOTTOM ? 1 : wall === WALLS.TOP ? -1 : 0;
    cells[row + dr][col + dc] &= ~OPPOSITE[wall];
}

// Build a simple 3x3 maze:
//   [0,0] - [1,0] - [2,0]
//     |               |
//   [0,1]   [1,1]   [2,1]
//     |               |
//   [0,2] - [1,2] - [2,2]
function make3x3() {
    const cells = blankGrid(3, 3);
    openWall(cells, 0, 0, WALLS.RIGHT);   // (0,0)→(1,0)
    openWall(cells, 1, 0, WALLS.RIGHT);   // (1,0)→(2,0)
    openWall(cells, 0, 0, WALLS.BOTTOM);  // (0,0)→(0,1)
    openWall(cells, 2, 0, WALLS.BOTTOM);  // (2,0)→(2,1)
    openWall(cells, 0, 1, WALLS.BOTTOM);  // (0,1)→(0,2)
    openWall(cells, 2, 1, WALLS.BOTTOM);  // (2,1)→(2,2)
    openWall(cells, 0, 2, WALLS.RIGHT);   // (0,2)→(1,2)
    openWall(cells, 1, 2, WALLS.RIGHT);   // (1,2)→(2,2)
    return cells;
}

describe('solvePath', () => {
    it('finds shortest path on a known 3x3 grid', () => {
        const cells = make3x3();
        const path = solvePath(cells, 3, 3, 0, 0, 2, 2);
        expect(path.length).toBeGreaterThan(0);
        expect(path[0]).toEqual({ col: 0, row: 0 });
        expect(path[path.length - 1]).toEqual({ col: 2, row: 2 });
        // Shortest: (0,0)→(1,0)→(2,0)→(2,1)→(2,2) = 5 cells
        expect(path.length).toBe(5);
    });

    it('returns empty array when goal is unreachable', () => {
        // 2x2 grid with no openings
        const cells = blankGrid(2, 2);
        const path = solvePath(cells, 2, 2, 0, 0, 1, 1);
        expect(path).toEqual([]);
    });

    it('respects blocked cells', () => {
        const cells = make3x3();
        // Block (2,0) — forces path through left side
        const blocked = new Set(['2,0']);
        const path = solvePath(cells, 3, 3, 0, 0, 2, 2, blocked);
        expect(path.length).toBeGreaterThan(0);
        // Path must go through (0,1) since (2,0) is blocked
        expect(path.some(c => c.col === 0 && c.row === 1)).toBe(true);
        // (2,0) must not be in the path
        expect(path.some(c => c.col === 2 && c.row === 0)).toBe(false);
    });

    it('start equals goal returns single-cell path', () => {
        const cells = make3x3();
        const path = solvePath(cells, 3, 3, 0, 0, 0, 0);
        expect(path).toEqual([{ col: 0, row: 0 }]);
    });
});

describe('floodFill', () => {
    it('finds all reachable cells in a connected maze', () => {
        const cells = make3x3();
        const reachable = floodFill(cells, 3, 3, 0, 0);
        // (1,1) is isolated in our maze — not connected to anything
        expect(reachable.size).toBe(8);
        expect(reachable.has('1,1')).toBe(false);
    });

    it('respects walls — isolated cell not reached', () => {
        const cells = blankGrid(2, 2);
        // Only open one wall: (0,0)→(1,0)
        openWall(cells, 0, 0, WALLS.RIGHT);
        const reachable = floodFill(cells, 2, 2, 0, 0);
        expect(reachable.has('0,0')).toBe(true);
        expect(reachable.has('1,0')).toBe(true);
        expect(reachable.has('0,1')).toBe(false);
        expect(reachable.has('1,1')).toBe(false);
    });

    it('respects blocked parameter', () => {
        const cells = make3x3();
        // Block (1,0) and (0,1) — only (0,0) reachable
        const blocked = new Set(['1,0', '0,1']);
        const reachable = floodFill(cells, 3, 3, 0, 0, blocked);
        expect(reachable.size).toBe(1);
        expect(reachable.has('0,0')).toBe(true);
    });
});

describe('bfsDistanceMap', () => {
    it('computes correct distances from a single source', () => {
        const cells = make3x3();
        const dist = bfsDistanceMap(cells, 3, 3, new Set(['0,0']));
        expect(dist.get('0,0')).toBe(0);
        expect(dist.get('1,0')).toBe(1);
        expect(dist.get('2,0')).toBe(2);
        expect(dist.get('0,1')).toBe(1);
        expect(dist.get('2,2')).toBe(4);
        // (1,1) is unreachable
        expect(dist.has('1,1')).toBe(false);
    });

    it('computes multi-source distances correctly', () => {
        const cells = make3x3();
        // Sources at both corners — each cell gets distance to nearest
        const dist = bfsDistanceMap(cells, 3, 3, new Set(['0,0', '2,2']));
        expect(dist.get('0,0')).toBe(0);
        expect(dist.get('2,2')).toBe(0);
        expect(dist.get('1,0')).toBe(1);
        expect(dist.get('1,2')).toBe(1);
        // Mid-points should have distance 2 from nearest source
        expect(dist.get('2,0')).toBe(2);
        expect(dist.get('0,2')).toBe(2);
    });

    it('respects blocked cells', () => {
        const cells = make3x3();
        const blocked = new Set(['1,0', '0,1']);
        const dist = bfsDistanceMap(cells, 3, 3, new Set(['0,0']), blocked);
        // Only (0,0) reachable
        expect(dist.size).toBe(1);
        expect(dist.get('0,0')).toBe(0);
    });
});
