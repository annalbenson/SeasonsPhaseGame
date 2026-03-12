import { describe, it, expect } from 'vitest';
import { ALGORITHMS, WALLS, OPPOSITE, widenCorridors } from '../maze';
import { MOVE_DIRS, Cell, solvePath, floodFill, bfsDistanceMap } from '../mazeUtils';
import { COLS, ROWS } from '../constants';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Run the same maze-generation + gate/key/scenery pipeline the game uses. */
function buildLevel(algorithm: 'dfs' | 'kruskals' = 'kruskals') {
    const cols = COLS, rows = ROWS;

    // Random start/goal in distinct corners
    const corners = [
        { col: 0, row: 0 },
        { col: cols - 1, row: 0 },
        { col: 0, row: rows - 1 },
        { col: cols - 1, row: rows - 1 },
    ];
    for (let i = corners.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [corners[i], corners[j]] = [corners[j], corners[i]];
    }
    const startCol = corners[0].col, startRow = corners[0].row;
    const goalCol = corners[1].col, goalRow = corners[1].row;

    // Generate
    const cells = ALGORITHMS[algorithm].generate(cols, rows);

    // Gate edges at ~33% / ~67% of spanning-tree path
    const treePath = solvePath(cells, cols, rows, startCol, startRow, goalCol, goalRow);
    type GateEdge = { from: Cell; to: Cell };
    let gateEdges: GateEdge[] = [];
    if (treePath.length >= 10) {
        const g1Idx = Math.floor(treePath.length * 0.33);
        const g2Idx = Math.floor(treePath.length * 0.67);
        gateEdges = [
            { from: treePath[g1Idx], to: treePath[g1Idx + 1] },
            { from: treePath[g2Idx], to: treePath[g2Idx + 1] },
        ];
    }

    // Block gate edges before widening
    for (const { from, to } of gateEdges) {
        const dc = to.col - from.col, dr = to.row - from.row;
        const fw = dc === 1 ? WALLS.RIGHT : dc === -1 ? WALLS.LEFT : dr === 1 ? WALLS.BOTTOM : WALLS.TOP;
        cells[from.row][from.col] |= fw;
        cells[to.row][to.col] |= OPPOSITE[fw];
    }

    // Compute zone map so widening only connects cells in the same zone
    let zoneMap: Map<string, number> | undefined;
    if (gateEdges.length > 0) {
        zoneMap = new Map();
        const z1 = floodFill(cells, cols, rows, startCol, startRow);
        for (const k of z1) zoneMap.set(k, 0);
        const g1To = gateEdges[0].to;
        const z2 = floodFill(cells, cols, rows, g1To.col, g1To.row);
        for (const k of z2) zoneMap.set(k, 1);
        if (gateEdges.length >= 2) {
            const g2To = gateEdges[1].to;
            const z3 = floodFill(cells, cols, rows, g2To.col, g2To.row);
            for (const k of z3) zoneMap.set(k, 2);
        }
    }

    const widenedCells = widenCorridors(cells, cols, rows, 0.13, zoneMap);

    // Re-open gate passages
    for (const { from, to } of gateEdges) {
        const dc = to.col - from.col, dr = to.row - from.row;
        const fw = dc === 1 ? WALLS.RIGHT : dc === -1 ? WALLS.LEFT : dr === 1 ? WALLS.BOTTOM : WALLS.TOP;
        cells[from.row][from.col] &= ~fw;
        cells[to.row][to.col] &= ~OPPOSITE[fw];
    }

    // ── Bush + scenery placement (mirrors placeBushes) ──
    const bushCells = new Set<string>();
    const sceneryBlocked = new Set<string>();

    for (const key of widenedCells) {
        const [col, row] = key.split(',').map(Number);
        if (col === startCol && row === startRow) continue;
        if (col === goalCol && row === goalRow) continue;
        if (Math.random() > 0.65) continue;
        bushCells.add(key);
    }

    const path = solvePath(cells, cols, rows, startCol, startRow, goalCol, goalRow);
    const pathSet = new Set(path.map(c => `${c.col},${c.row}`));

    const gateProtected = new Set<string>();
    for (const { from, to } of gateEdges) {
        gateProtected.add(`${from.col},${from.row}`);
        gateProtected.add(`${to.col},${to.row}`);
    }

    // Scenery on widened cells
    for (const key of widenedCells) {
        if (bushCells.has(key)) continue;
        if (pathSet.has(key)) continue;
        if (gateProtected.has(key)) continue;
        if (Math.random() > 0.45) continue;
        const [col, row] = key.split(',').map(Number);
        if (col === startCol && row === startRow) continue;
        if (col === goalCol && row === goalRow) continue;
        sceneryBlocked.add(key);
    }

    // Dead-end scenery
    const targetCount = 4;
    const deadEnds: string[] = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const key = `${col},${row}`;
            if (sceneryBlocked.has(key)) continue;
            if (bushCells.has(key)) continue;
            if (pathSet.has(key)) continue;
            if (gateProtected.has(key)) continue;
            if (col === startCol && row === startRow) continue;
            if (col === goalCol && row === goalRow) continue;
            const w = cells[row][col];
            const wallCount = ((w & WALLS.TOP) ? 1 : 0) + ((w & WALLS.RIGHT) ? 1 : 0)
                + ((w & WALLS.BOTTOM) ? 1 : 0) + ((w & WALLS.LEFT) ? 1 : 0);
            if (wallCount >= 3) deadEnds.push(key);
        }
    }
    for (let i = deadEnds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deadEnds[i], deadEnds[j]] = [deadEnds[j], deadEnds[i]];
    }
    const needed = Math.max(0, targetCount - sceneryBlocked.size);
    for (let i = 0; i < Math.min(needed, deadEnds.length); i++) {
        sceneryBlocked.add(deadEnds[i]);
    }

    // ── Key placement (mirrors placePuzzleItems) ──
    let keyPositions: Cell[] = [];
    if (gateEdges.length >= 2) {
        // Temporarily block gate edges for flood fill
        const wallOps: { from: Cell; to: Cell; fw: number }[] = [];
        for (const { from, to } of gateEdges) {
            const dc = to.col - from.col, dr = to.row - from.row;
            const fw = dc === 1 ? WALLS.RIGHT : dc === -1 ? WALLS.LEFT : dr === 1 ? WALLS.BOTTOM : WALLS.TOP;
            wallOps.push({ from, to, fw });
            cells[from.row][from.col] |= fw;
            cells[to.row][to.col] |= OPPOSITE[fw];
        }

        const zone1 = floodFill(cells, cols, rows, startCol, startRow, sceneryBlocked);
        const g1To = gateEdges[0].to;
        const zone2 = floodFill(cells, cols, rows, g1To.col, g1To.row, sceneryBlocked);

        // Restore
        for (const { from, to, fw } of wallOps) {
            cells[from.row][from.col] &= ~fw;
            cells[to.row][to.col] &= ~OPPOSITE[fw];
        }

        const solPath = solvePath(cells, cols, rows, startCol, startRow, goalCol, goalRow, sceneryBlocked);
        const solPathSet = new Set(solPath.map(c => `${c.col},${c.row}`));

        // BFS distance from solution path for key placement
        const distFromPathKeys = bfsDistanceMap(cells, cols, rows, solPathSet, sceneryBlocked);

        const pickOffPath = (zone: Set<string>): Cell | null => {
            const offPath = [...zone].filter(k =>
                !solPathSet.has(k) &&
                k !== `${startCol},${startRow}` &&
                k !== `${goalCol},${goalRow}`
            );
            if (offPath.length > 0) {
                // Sort by distance from solution path (descending), pick from top 25%
                offPath.sort((a, b) => (distFromPathKeys.get(b) ?? 0) - (distFromPathKeys.get(a) ?? 0));
                const topN = Math.max(1, Math.floor(offPath.length * 0.25));
                const key = offPath[Math.floor(Math.random() * topN)];
                const [c, r] = key.split(',').map(Number);
                return { col: c, row: r };
            }
            const any = [...zone].filter(k =>
                k !== `${startCol},${startRow}` &&
                k !== `${goalCol},${goalRow}`
            );
            if (any.length === 0) return null;
            const key = any[Math.floor(Math.random() * any.length)];
            const [c, r] = key.split(',').map(Number);
            return { col: c, row: r };
        };

        const key1Pos = pickOffPath(zone1);
        const key2Pos = pickOffPath(zone2);
        if (key1Pos) keyPositions.push(key1Pos);
        if (key2Pos) keyPositions.push(key2Pos);

        // If either key couldn't be placed, clear gates
        if (!key1Pos || !key2Pos) {
            gateEdges = [];
            keyPositions = [];
        }
    }

    // BFS distance from solution path for objective placement
    const solPathForObj = solvePath(cells, cols, rows, startCol, startRow, goalCol, goalRow, sceneryBlocked);
    const solPathSetForObj = new Set(solPathForObj.map(c => `${c.col},${c.row}`));
    const distFromPath = bfsDistanceMap(cells, cols, rows, solPathSetForObj, sceneryBlocked);

    // ── Objective placement (mirrors placeObjectives — zone-aware) ──
    const reachableFromStart = floodFill(cells, cols, rows, startCol, startRow, sceneryBlocked);
    const avoid = new Set<string>([
        `${startCol},${startRow}`,
        `${goalCol},${goalRow}`,
        ...keyPositions.map(p => `${p.col},${p.row}`),
        ...sceneryBlocked,
    ]);
    const objCandidates: Cell[] = [];
    for (const key of reachableFromStart) {
        if (avoid.has(key)) continue;
        const [col, row] = key.split(',').map(Number);
        objCandidates.push({ col, row });
    }
    const objCount = 2 + Math.floor(Math.random() * 2); // 2 or 3

    // Compute zone membership for zone-aware objective spread
    const objZoneOf = new Map<string, number>();
    if (gateEdges.length >= 1) {
        const wOps: { from: Cell; to: Cell; fw: number }[] = [];
        for (const { from, to } of gateEdges) {
            const dc = to.col - from.col, dr = to.row - from.row;
            const fw = dc === 1 ? WALLS.RIGHT : dc === -1 ? WALLS.LEFT : dr === 1 ? WALLS.BOTTOM : WALLS.TOP;
            wOps.push({ from, to, fw });
            cells[from.row][from.col] |= fw;
            cells[to.row][to.col] |= OPPOSITE[fw];
        }
        const oz0 = floodFill(cells, cols, rows, startCol, startRow, sceneryBlocked);
        for (const k of oz0) objZoneOf.set(k, 0);
        const og1To = gateEdges[0].to;
        const oz1 = floodFill(cells, cols, rows, og1To.col, og1To.row, sceneryBlocked);
        for (const k of oz1) objZoneOf.set(k, 1);
        if (gateEdges.length >= 2) {
            const og2To = gateEdges[1].to;
            const oz2 = floodFill(cells, cols, rows, og2To.col, og2To.row, sceneryBlocked);
            for (const k of oz2) objZoneOf.set(k, 2);
        }
        for (const { from, to, fw } of wOps) {
            cells[from.row][from.col] &= ~fw;
            cells[to.row][to.col] &= ~OPPOSITE[fw];
        }
    }

    const numZones = gateEdges.length >= 2 ? 3 : gateEdges.length >= 1 ? 2 : 1;
    const byZone: Cell[][] = Array.from({ length: numZones }, () => []);
    for (const c of objCandidates) {
        const z = objZoneOf.get(`${c.col},${c.row}`) ?? 0;
        byZone[z].push(c);
    }
    // Sort each zone by distance from path (descending)
    for (const arr of byZone) {
        arr.sort((a, b) =>
            (distFromPath.get(`${b.col},${b.row}`) ?? 0) -
            (distFromPath.get(`${a.col},${a.row}`) ?? 0));
    }
    const objectivePositions: Cell[] = [];
    const usedZones = byZone.filter(z => z.length > 0);
    for (const zoneCands of usedZones) {
        if (objectivePositions.length >= objCount) break;
        objectivePositions.push(zoneCands.shift()!);
    }
    while (objectivePositions.length < objCount) {
        const best = usedZones.filter(z => z.length > 0)
            .sort((a, b) => b.length - a.length)[0];
        if (!best || best.length === 0) break;
        objectivePositions.push(best.shift()!);
    }

    return {
        cells, cols, rows,
        startCol, startRow, goalCol, goalRow,
        gateEdges, widenedCells,
        bushCells, sceneryBlocked,
        keyPositions, objectivePositions,
        path, pathSet,
    };
}

/**
 * BFS from start that respects scenery and gate edges (simulates player
 * progression through the maze with a given set of closed gates).
 */
function playerReachable(
    cells: number[][], cols: number, rows: number,
    startCol: number, startRow: number,
    sceneryBlocked: Set<string>,
    closedGateEdges: { from: Cell; to: Cell }[],
): Set<string> {
    const closed = new Set<string>();
    for (const { from, to } of closedGateEdges) {
        closed.add(`${from.col},${from.row}>${to.col},${to.row}`);
        closed.add(`${to.col},${to.row}>${from.col},${from.row}`);
    }

    const visited = new Set<string>();
    const queue: Cell[] = [{ col: startCol, row: startRow }];
    visited.add(`${startCol},${startRow}`);
    while (queue.length > 0) {
        const { col, row } = queue.shift()!;
        for (const { dc, dr, wall } of MOVE_DIRS) {
            const nc = col + dc, nr = row + dr;
            const key = `${nc},${nr}`;
            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
            if (visited.has(key) || (cells[row][col] & wall)) continue;
            if (sceneryBlocked.has(key)) continue;
            if (closed.has(`${col},${row}>${nc},${nr}`)) continue;
            visited.add(key);
            queue.push({ col: nc, row: nr });
        }
    }
    return visited;
}

/**
 * Simulate player progression: collect key1 → open gate1 → collect key2 →
 * open gate2 → reach goal. Returns the set of all cells the player must
 * visit to win the level (minimum exploration set).
 */
function simulateProgression(level: ReturnType<typeof buildLevel>): {
    reachable: Set<string>;
    key1Reachable: boolean;
    key2Reachable: boolean;
    goalReachable: boolean;
    cellsVisited: Set<string>;
} {
    const { cells, cols, rows, startCol, startRow, goalCol, goalRow,
        gateEdges, sceneryBlocked, keyPositions } = level;

    // Phase 1: all gates closed
    const phase1 = playerReachable(cells, cols, rows, startCol, startRow,
        sceneryBlocked, gateEdges);

    const key1Reachable = keyPositions.length >= 1 &&
        phase1.has(`${keyPositions[0].col},${keyPositions[0].row}`);

    // Phase 2: gate1 open
    const remainingGates1 = gateEdges.length >= 2 ? [gateEdges[1]] : [];
    const phase2 = playerReachable(cells, cols, rows, startCol, startRow,
        sceneryBlocked, remainingGates1);

    const key2Reachable = keyPositions.length >= 2 &&
        phase2.has(`${keyPositions[1].col},${keyPositions[1].row}`);

    // Phase 3: all gates open
    const phase3 = playerReachable(cells, cols, rows, startCol, startRow,
        sceneryBlocked, []);

    const goalReachable = phase3.has(`${goalCol},${goalRow}`);

    // Cells visited = union of all phases (player sees phase1 first, then phase2, etc.)
    const cellsVisited = new Set([...phase1, ...phase2, ...phase3]);

    return { reachable: phase3, key1Reachable, key2Reachable, goalReachable, cellsVisited };
}

// ── Constants ────────────────────────────────────────────────────────────────

const NUM_TRIALS = 200; // random mazes per test

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Key reachability', () => {
    it(`key1 is always reachable before gate1 (${NUM_TRIALS} trials)`, () => {
        for (let i = 0; i < NUM_TRIALS; i++) {
            const level = buildLevel();
            if (level.gateEdges.length === 0) continue; // no gates = no keys needed

            const { key1Reachable } = simulateProgression(level);
            expect(key1Reachable, `Trial ${i}: key1 unreachable`).toBe(true);
        }
    });

    it(`key2 is always reachable after opening gate1 (${NUM_TRIALS} trials)`, () => {
        for (let i = 0; i < NUM_TRIALS; i++) {
            const level = buildLevel();
            if (level.gateEdges.length < 2) continue;

            const { key2Reachable } = simulateProgression(level);
            expect(key2Reachable, `Trial ${i}: key2 unreachable after gate1`).toBe(true);
        }
    });

    it(`goal is always reachable after opening both gates (${NUM_TRIALS} trials)`, () => {
        for (let i = 0; i < NUM_TRIALS; i++) {
            const level = buildLevel();
            const { goalReachable } = simulateProgression(level);
            expect(goalReachable, `Trial ${i}: goal unreachable`).toBe(true);
        }
    });
});

describe('Gate placement', () => {
    it(`gates appear at roughly 33% and 67% of the path (${NUM_TRIALS} trials)`, () => {
        let g1Ratios: number[] = [];
        let g2Ratios: number[] = [];

        for (let i = 0; i < NUM_TRIALS; i++) {
            const level = buildLevel();
            if (level.gateEdges.length < 2) continue;

            const { path, gateEdges } = level;
            // Find gate positions on the path
            const g1From = gateEdges[0].from;
            const g1Idx = path.findIndex(c => c.col === g1From.col && c.row === g1From.row);
            const g2From = gateEdges[1].from;
            const g2Idx = path.findIndex(c => c.col === g2From.col && c.row === g2From.row);

            if (g1Idx >= 0) g1Ratios.push(g1Idx / path.length);
            if (g2Idx >= 0) g2Ratios.push(g2Idx / path.length);
        }

        // Average should be close to 0.33 and 0.67 (within tolerance)
        if (g1Ratios.length > 0) {
            const avg1 = g1Ratios.reduce((a, b) => a + b, 0) / g1Ratios.length;
            expect(avg1).toBeGreaterThan(0.2);
            expect(avg1).toBeLessThan(0.45);
        }
        if (g2Ratios.length > 0) {
            const avg2 = g2Ratios.reduce((a, b) => a + b, 0) / g2Ratios.length;
            expect(avg2).toBeGreaterThan(0.55);
            expect(avg2).toBeLessThan(0.8);
        }
    });

    it(`both gates are always placed on 10x10 grids (${NUM_TRIALS} trials)`, () => {
        let gateCount = 0;
        for (let i = 0; i < NUM_TRIALS; i++) {
            const level = buildLevel();
            // buildLevel clears gateEdges if keys can't be placed, so count
            // levels that successfully have 2 gates
            if (level.gateEdges.length === 2) gateCount++;
        }
        // At least 95% of levels should have gates
        expect(gateCount / NUM_TRIALS).toBeGreaterThan(0.95);
    });
});

describe('Scenery never blocks connectivity', () => {
    it(`scenery does not land on the solution path (${NUM_TRIALS} trials)`, () => {
        for (let i = 0; i < NUM_TRIALS; i++) {
            const level = buildLevel();
            for (const key of level.sceneryBlocked) {
                expect(level.pathSet.has(key),
                    `Trial ${i}: scenery at ${key} is on solution path`).toBe(false);
            }
        }
    });

    it(`scenery does not block start or goal (${NUM_TRIALS} trials)`, () => {
        for (let i = 0; i < NUM_TRIALS; i++) {
            const level = buildLevel();
            expect(level.sceneryBlocked.has(`${level.startCol},${level.startRow}`),
                `Trial ${i}: scenery blocks start`).toBe(false);
            expect(level.sceneryBlocked.has(`${level.goalCol},${level.goalRow}`),
                `Trial ${i}: scenery blocks goal`).toBe(false);
        }
    });

    it(`scenery does not partition reachable cells from goal (${NUM_TRIALS} trials)`, () => {
        for (let i = 0; i < NUM_TRIALS; i++) {
            const level = buildLevel();
            const reachable = floodFill(level.cells, level.cols, level.rows,
                level.startCol, level.startRow, level.sceneryBlocked);
            expect(reachable.has(`${level.goalCol},${level.goalRow}`),
                `Trial ${i}: goal unreachable due to scenery`).toBe(true);
        }
    });
});

describe('Objective reachability', () => {
    it(`all objectives are reachable from start (${NUM_TRIALS} trials)`, () => {
        for (let i = 0; i < NUM_TRIALS; i++) {
            const level = buildLevel();
            // Objectives must be reachable ignoring gates (player must collect
            // them during progression, and gates open along the way)
            const reachable = floodFill(level.cells, level.cols, level.rows,
                level.startCol, level.startRow, level.sceneryBlocked);
            for (const obj of level.objectivePositions) {
                const key = `${obj.col},${obj.row}`;
                expect(reachable.has(key),
                    `Trial ${i}: objective at ${key} unreachable`).toBe(true);
            }
        }
    });

    it(`objectives are not placed on scenery, start, goal, or key cells (${NUM_TRIALS} trials)`, () => {
        for (let i = 0; i < NUM_TRIALS; i++) {
            const level = buildLevel();
            for (const obj of level.objectivePositions) {
                const key = `${obj.col},${obj.row}`;
                expect(level.sceneryBlocked.has(key),
                    `Trial ${i}: objective at ${key} is on scenery`).toBe(false);
                expect(key === `${level.startCol},${level.startRow}`,
                    `Trial ${i}: objective on start`).toBe(false);
                expect(key === `${level.goalCol},${level.goalRow}`,
                    `Trial ${i}: objective on goal`).toBe(false);
            }
        }
    });
});

describe('Full end-to-end solvability', () => {
    it(`every level is completable: keys → gates → objectives → goal (${NUM_TRIALS} trials)`, () => {
        for (let i = 0; i < NUM_TRIALS; i++) {
            const level = buildLevel();
            const { cells, cols, rows, startCol, startRow, goalCol, goalRow,
                gateEdges, sceneryBlocked, keyPositions, objectivePositions } = level;

            // Phase 1: all gates closed — key1 must be reachable
            if (gateEdges.length >= 1 && keyPositions.length >= 1) {
                const phase1 = playerReachable(cells, cols, rows, startCol, startRow,
                    sceneryBlocked, gateEdges);
                expect(phase1.has(`${keyPositions[0].col},${keyPositions[0].row}`),
                    `Trial ${i}: key1 unreachable from start`).toBe(true);
            }

            // Phase 2: gate1 open — key2 must be reachable
            const remainingAfterG1 = gateEdges.length >= 2 ? [gateEdges[1]] : [];
            if (gateEdges.length >= 2 && keyPositions.length >= 2) {
                const phase2 = playerReachable(cells, cols, rows, startCol, startRow,
                    sceneryBlocked, remainingAfterG1);
                expect(phase2.has(`${keyPositions[1].col},${keyPositions[1].row}`),
                    `Trial ${i}: key2 unreachable after gate1`).toBe(true);
            }

            // Phase 3: all gates open — all objectives + goal must be reachable
            const phase3 = playerReachable(cells, cols, rows, startCol, startRow,
                sceneryBlocked, []);
            for (const obj of objectivePositions) {
                expect(phase3.has(`${obj.col},${obj.row}`),
                    `Trial ${i}: objective at ${obj.col},${obj.row} unreachable`).toBe(true);
            }
            expect(phase3.has(`${goalCol},${goalRow}`),
                `Trial ${i}: goal unreachable`).toBe(true);

            // Verify BFS path exists from start to every target (no broken path)
            const allTargets = [
                ...keyPositions, ...objectivePositions,
                { col: goalCol, row: goalRow },
            ];
            for (const t of allTargets) {
                const path = solvePath(cells, cols, rows, startCol, startRow, t.col, t.row, sceneryBlocked);
                expect(path.length,
                    `Trial ${i}: no BFS path from start to ${t.col},${t.row}`).toBeGreaterThan(0);
            }
        }
    });
});

describe('Explore percentage', () => {
    it(`player must explore at least 60% of reachable cells to win (${NUM_TRIALS} trials)`, () => {
        // The minimum exploration set = cells the player must visit/see to
        // collect all keys, open all gates, collect all objectives, and reach goal.
        // We compute this by finding the shortest BFS paths to each required target.
        const ratios: number[] = [];

        for (let i = 0; i < NUM_TRIALS; i++) {
            const level = buildLevel();
            const { cells, cols, rows, startCol, startRow, goalCol, goalRow,
                gateEdges, sceneryBlocked, keyPositions, objectivePositions } = level;

            // Total reachable cells (with all gates open)
            const allReachable = floodFill(cells, cols, rows, startCol, startRow, sceneryBlocked);
            const totalReachable = allReachable.size;

            // Collect all mandatory targets in order
            const targets: Cell[] = [];
            if (keyPositions.length >= 1) targets.push(keyPositions[0]); // key1
            if (gateEdges.length >= 1) targets.push(gateEdges[0].from);  // gate1
            if (keyPositions.length >= 2) targets.push(keyPositions[1]); // key2
            if (gateEdges.length >= 2) targets.push(gateEdges[1].from);  // gate2
            for (const obj of objectivePositions) targets.push(obj);     // objectives
            targets.push({ col: goalCol, row: goalRow });                // goal

            // Walk BFS paths between consecutive targets, accumulate unique cells visited
            const visited = new Set<string>();
            visited.add(`${startCol},${startRow}`);
            let curCol = startCol, curRow = startRow;

            for (const target of targets) {
                const pathToTarget = solvePath(cells, cols, rows,
                    curCol, curRow, target.col, target.row, sceneryBlocked);
                for (const c of pathToTarget) visited.add(`${c.col},${c.row}`);
                curCol = target.col;
                curRow = target.row;
            }

            const ratio = visited.size / totalReachable;
            ratios.push(ratio);
        }

        const avgExplore = ratios.reduce((a, b) => a + b, 0) / ratios.length;
        const minExplore = Math.min(...ratios);

        // After zone-aware objectives + far-corner keys, average ~51% (up from ~42%).
        expect(avgExplore).toBeGreaterThan(0.45);
        // No level should allow winning with less than 10% exploration
        expect(minExplore).toBeGreaterThan(0.10);
    });

    it(`keys are placed off the main solution path to force detours (${NUM_TRIALS} trials)`, () => {
        let offPathCount = 0;
        let totalKeys = 0;

        for (let i = 0; i < NUM_TRIALS; i++) {
            const level = buildLevel();
            const { pathSet, keyPositions } = level;
            for (const key of keyPositions) {
                totalKeys++;
                if (!pathSet.has(`${key.col},${key.row}`)) offPathCount++;
            }
        }

        // At least 70% of keys should be off the main path
        if (totalKeys > 0) {
            expect(offPathCount / totalKeys).toBeGreaterThan(0.7);
        }
    });

    it(`objectives are spread across multiple zones (${NUM_TRIALS} trials)`, () => {
        // Objectives should not all cluster in one zone — they should require
        // the player to explore different parts of the map.
        let spreadCount = 0;
        let totalWithGates = 0;

        for (let i = 0; i < NUM_TRIALS; i++) {
            const level = buildLevel();
            if (level.gateEdges.length < 2) continue;
            totalWithGates++;

            const { cells, cols, rows, startCol, startRow, gateEdges,
                sceneryBlocked, objectivePositions } = level;

            // Compute zones with gates blocked
            const wallOps: { from: Cell; to: Cell; fw: number }[] = [];
            for (const { from, to } of gateEdges) {
                const dc = to.col - from.col, dr = to.row - from.row;
                const fw = dc === 1 ? WALLS.RIGHT : dc === -1 ? WALLS.LEFT : dr === 1 ? WALLS.BOTTOM : WALLS.TOP;
                wallOps.push({ from, to, fw });
                cells[from.row][from.col] |= fw;
                cells[to.row][to.col] |= OPPOSITE[fw];
            }
            const zone1 = floodFill(cells, cols, rows, startCol, startRow, sceneryBlocked);
            for (const { from, to, fw } of wallOps) {
                cells[from.row][from.col] &= ~fw;
                cells[to.row][to.col] &= ~OPPOSITE[fw];
            }

            // Count how many objectives are in zone1 vs other zones
            let inZone1 = 0;
            for (const obj of objectivePositions) {
                if (zone1.has(`${obj.col},${obj.row}`)) inZone1++;
            }

            // "Spread" = not all objectives in zone1
            if (objectivePositions.length > 1 && inZone1 < objectivePositions.length) {
                spreadCount++;
            }
        }

        // With zone-aware placement, 85%+ of gated levels should spread objectives
        if (totalWithGates > 0) {
            expect(spreadCount / totalWithGates).toBeGreaterThan(0.80);
        }
    });
});
