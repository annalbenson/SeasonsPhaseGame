import { describe, it, expect } from 'vitest';
import { ALGORITHMS, WALLS, OPPOSITE, widenCorridors } from '../maze';
import { MOVE_DIRS, Cell, solvePath, floodFill, bfsDistanceMap } from '../mazeUtils';
// ── Helpers ──────────────────────────────────────────────────────────────────

/** Run the same maze-generation + gate/key/scenery pipeline the game uses. */
function buildLevel(algorithm: 'dfs' | 'kruskals' = 'kruskals', size: number = 10) {
    const cols = size, rows = size;

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

    // Gate edges — count scales with grid: 8→1, 10→2, 12→3
    const numGates = Math.max(1, Math.floor(cols / 4) - 1);
    const treePath = solvePath(cells, cols, rows, startCol, startRow, goalCol, goalRow);
    type GateEdge = { from: Cell; to: Cell };
    let gateEdges: GateEdge[] = [];
    if (treePath.length >= 10) {
        for (let i = 0; i < numGates; i++) {
            const frac = (i + 1) / (numGates + 1);
            const idx = Math.floor(treePath.length * frac);
            if (idx + 1 < treePath.length) {
                gateEdges.push({ from: treePath[idx], to: treePath[idx + 1] });
            }
        }
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
        // Zone 0 = start zone
        const z0 = floodFill(cells, cols, rows, startCol, startRow);
        for (const k of z0) zoneMap.set(k, 0);
        // Each gate opens a new zone
        for (let gi = 0; gi < gateEdges.length; gi++) {
            const gTo = gateEdges[gi].to;
            const z = floodFill(cells, cols, rows, gTo.col, gTo.row);
            for (const k of z) zoneMap.set(k, gi + 1);
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
    const targetCount = Math.floor(cols * rows / 20);
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

    // ── Key placement (mirrors placePuzzleItems) — one key per zone ──
    let keyPositions: Cell[] = [];
    if (gateEdges.length >= 1) {
        // Temporarily block gate edges for flood fill
        const wallOps: { from: Cell; to: Cell; fw: number }[] = [];
        for (const { from, to } of gateEdges) {
            const dc = to.col - from.col, dr = to.row - from.row;
            const fw = dc === 1 ? WALLS.RIGHT : dc === -1 ? WALLS.LEFT : dr === 1 ? WALLS.BOTTOM : WALLS.TOP;
            wallOps.push({ from, to, fw });
            cells[from.row][from.col] |= fw;
            cells[to.row][to.col] |= OPPOSITE[fw];
        }

        // Flood-fill each zone
        const zones: Set<string>[] = [];
        zones.push(floodFill(cells, cols, rows, startCol, startRow, sceneryBlocked));
        for (let gi = 0; gi < gateEdges.length; gi++) {
            const gTo = gateEdges[gi].to;
            zones.push(floodFill(cells, cols, rows, gTo.col, gTo.row, sceneryBlocked));
        }

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

        let allPlaced = true;
        for (const zone of zones) {
            const pos = pickOffPath(zone);
            if (pos) {
                keyPositions.push(pos);
            } else {
                allPlaced = false;
                break;
            }
        }

        if (!allPlaced) {
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
    const objCount = Math.floor(cols / 4); // 8→2, 10→2, 12→3

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
        for (let gi = 0; gi < gateEdges.length; gi++) {
            const gTo = gateEdges[gi].to;
            const oz = floodFill(cells, cols, rows, gTo.col, gTo.row, sceneryBlocked);
            for (const k of oz) objZoneOf.set(k, gi + 1);
        }
        for (const { from, to, fw } of wOps) {
            cells[from.row][from.col] &= ~fw;
            cells[to.row][to.col] &= ~OPPOSITE[fw];
        }
    }

    const numZones = gateEdges.length + 1;
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
 * Simulate player progression: collect keys → open gates in order → reach goal.
 * Returns reachability info for each phase.
 */
function simulateProgression(level: ReturnType<typeof buildLevel>): {
    reachable: Set<string>;
    keysReachable: boolean[];
    goalReachable: boolean;
    cellsVisited: Set<string>;
} {
    const { cells, cols, rows, startCol, startRow, goalCol, goalRow,
        gateEdges, sceneryBlocked, keyPositions } = level;

    const cellsVisited = new Set<string>();
    const keysReachable: boolean[] = [];

    // For each phase, one more gate is open
    for (let phase = 0; phase <= gateEdges.length; phase++) {
        const closedGates = gateEdges.slice(phase);
        const reachable = playerReachable(cells, cols, rows, startCol, startRow,
            sceneryBlocked, closedGates);
        for (const k of reachable) cellsVisited.add(k);

        // In this phase, the player needs key[phase] (if it exists)
        if (phase < keyPositions.length) {
            const kp = keyPositions[phase];
            keysReachable.push(reachable.has(`${kp.col},${kp.row}`));
        }
    }

    // Final phase: all gates open
    const finalReachable = playerReachable(cells, cols, rows, startCol, startRow,
        sceneryBlocked, []);
    for (const k of finalReachable) cellsVisited.add(k);

    const goalReachable = finalReachable.has(`${goalCol},${goalRow}`);

    return { reachable: finalReachable, keysReachable, goalReachable, cellsVisited };
}

// ── Constants ────────────────────────────────────────────────────────────────

const NUM_TRIALS = 150; // random mazes per test per grid size
const GRID_SIZES = [8, 10, 12];

// ── Tests ────────────────────────────────────────────────────────────────────

for (const size of GRID_SIZES) {
    const tag = `${size}x${size}`;

describe(`[${tag}] Key reachability`, () => {
    it(`all keys are reachable in correct phase order (${NUM_TRIALS} trials)`, () => {
        for (let i = 0; i < NUM_TRIALS; i++) {
            const level = buildLevel('kruskals', size);
            if (level.gateEdges.length === 0) continue;

            const { keysReachable } = simulateProgression(level);
            for (let k = 0; k < keysReachable.length; k++) {
                expect(keysReachable[k], `Trial ${i}: key${k} unreachable`).toBe(true);
            }
        }
    });

    it(`goal is always reachable after opening all gates (${NUM_TRIALS} trials)`, () => {
        for (let i = 0; i < NUM_TRIALS; i++) {
            const level = buildLevel('kruskals', size);
            const { goalReachable } = simulateProgression(level);
            expect(goalReachable, `Trial ${i}: goal unreachable`).toBe(true);
        }
    });
});

describe(`[${tag}] Gate placement`, () => {
    it(`gates are evenly spaced along the path (${NUM_TRIALS} trials)`, () => {
        const numGates = Math.max(1, Math.floor(size / 4) - 1);
        const ratios: number[][] = Array.from({ length: numGates }, () => []);

        for (let i = 0; i < NUM_TRIALS; i++) {
            const level = buildLevel('kruskals', size);
            if (level.gateEdges.length < numGates) continue;

            const { path, gateEdges } = level;
            for (let g = 0; g < numGates; g++) {
                const gFrom = gateEdges[g].from;
                const idx = path.findIndex(c => c.col === gFrom.col && c.row === gFrom.row);
                if (idx >= 0) ratios[g].push(idx / path.length);
            }
        }

        for (let g = 0; g < numGates; g++) {
            if (ratios[g].length === 0) continue;
            const avg = ratios[g].reduce((a, b) => a + b, 0) / ratios[g].length;
            const expectedFrac = (g + 1) / (numGates + 1);
            expect(avg).toBeGreaterThan(expectedFrac - 0.15);
            expect(avg).toBeLessThan(expectedFrac + 0.15);
        }
    });

    it(`expected gate count is placed 95%+ of the time (${NUM_TRIALS} trials)`, () => {
        const numGates = Math.max(1, Math.floor(size / 4) - 1);
        let gateCount = 0;
        for (let i = 0; i < NUM_TRIALS; i++) {
            const level = buildLevel('kruskals', size);
            if (level.gateEdges.length === numGates) gateCount++;
        }
        expect(gateCount / NUM_TRIALS).toBeGreaterThan(0.95);
    });
});

describe(`[${tag}] Scenery never blocks connectivity`, () => {
    it(`scenery does not land on the solution path (${NUM_TRIALS} trials)`, () => {
        for (let i = 0; i < NUM_TRIALS; i++) {
            const level = buildLevel('kruskals', size);
            for (const key of level.sceneryBlocked) {
                expect(level.pathSet.has(key),
                    `Trial ${i}: scenery at ${key} is on solution path`).toBe(false);
            }
        }
    });

    it(`scenery does not block start or goal (${NUM_TRIALS} trials)`, () => {
        for (let i = 0; i < NUM_TRIALS; i++) {
            const level = buildLevel('kruskals', size);
            expect(level.sceneryBlocked.has(`${level.startCol},${level.startRow}`),
                `Trial ${i}: scenery blocks start`).toBe(false);
            expect(level.sceneryBlocked.has(`${level.goalCol},${level.goalRow}`),
                `Trial ${i}: scenery blocks goal`).toBe(false);
        }
    });

    it(`scenery does not partition reachable cells from goal (${NUM_TRIALS} trials)`, () => {
        for (let i = 0; i < NUM_TRIALS; i++) {
            const level = buildLevel('kruskals', size);
            const reachable = floodFill(level.cells, level.cols, level.rows,
                level.startCol, level.startRow, level.sceneryBlocked);
            expect(reachable.has(`${level.goalCol},${level.goalRow}`),
                `Trial ${i}: goal unreachable due to scenery`).toBe(true);
        }
    });
});

describe(`[${tag}] Objective reachability`, () => {
    it(`all objectives are reachable from start (${NUM_TRIALS} trials)`, () => {
        for (let i = 0; i < NUM_TRIALS; i++) {
            const level = buildLevel('kruskals', size);
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
            const level = buildLevel('kruskals', size);
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

describe(`[${tag}] Full end-to-end solvability`, () => {
    it(`every level is completable: keys → gates → objectives → goal (${NUM_TRIALS} trials)`, () => {
        for (let i = 0; i < NUM_TRIALS; i++) {
            const level = buildLevel('kruskals', size);
            const { cells, cols, rows, startCol, startRow, goalCol, goalRow,
                gateEdges, sceneryBlocked, keyPositions, objectivePositions } = level;

            // Each phase: open one more gate, verify next key reachable
            for (let phase = 0; phase < gateEdges.length; phase++) {
                const closedGates = gateEdges.slice(phase);
                if (phase < keyPositions.length) {
                    const reach = playerReachable(cells, cols, rows, startCol, startRow,
                        sceneryBlocked, closedGates);
                    expect(reach.has(`${keyPositions[phase].col},${keyPositions[phase].row}`),
                        `Trial ${i}: key${phase} unreachable`).toBe(true);
                }
            }

            // All gates open — all objectives + goal must be reachable
            const finalReach = playerReachable(cells, cols, rows, startCol, startRow,
                sceneryBlocked, []);
            for (const obj of objectivePositions) {
                expect(finalReach.has(`${obj.col},${obj.row}`),
                    `Trial ${i}: objective at ${obj.col},${obj.row} unreachable`).toBe(true);
            }
            expect(finalReach.has(`${goalCol},${goalRow}`),
                `Trial ${i}: goal unreachable`).toBe(true);

            // Verify BFS path exists from start to every target
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

describe(`[${tag}] Explore percentage`, () => {
    it(`player must explore a significant portion of the map (${NUM_TRIALS} trials)`, () => {
        const ratios: number[] = [];

        for (let i = 0; i < NUM_TRIALS; i++) {
            const level = buildLevel('kruskals', size);
            const { cells, cols, rows, startCol, startRow, goalCol, goalRow,
                gateEdges, sceneryBlocked, keyPositions, objectivePositions } = level;

            const allReachable = floodFill(cells, cols, rows, startCol, startRow, sceneryBlocked);
            const totalReachable = allReachable.size;

            // Collect all mandatory targets in order: key→gate pairs, then objectives, then goal
            const targets: Cell[] = [];
            for (let g = 0; g < gateEdges.length; g++) {
                if (g < keyPositions.length) targets.push(keyPositions[g]);
                targets.push(gateEdges[g].from);
            }
            for (const obj of objectivePositions) targets.push(obj);
            targets.push({ col: goalCol, row: goalRow });

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

            ratios.push(visited.size / totalReachable);
        }

        const avgExplore = ratios.reduce((a, b) => a + b, 0) / ratios.length;
        const minExplore = Math.min(...ratios);

        expect(avgExplore).toBeGreaterThan(0.40);
        expect(minExplore).toBeGreaterThan(0.10);
    });

    it(`keys are placed off the main solution path (${NUM_TRIALS} trials)`, () => {
        let offPathCount = 0;
        let totalKeys = 0;

        for (let i = 0; i < NUM_TRIALS; i++) {
            const level = buildLevel('kruskals', size);
            const { pathSet, keyPositions } = level;
            for (const key of keyPositions) {
                totalKeys++;
                if (!pathSet.has(`${key.col},${key.row}`)) offPathCount++;
            }
        }

        if (totalKeys > 0) {
            expect(offPathCount / totalKeys).toBeGreaterThan(0.7);
        }
    });

    it(`objectives are spread across multiple zones (${NUM_TRIALS} trials)`, () => {
        let spreadCount = 0;
        let totalWithGates = 0;

        for (let i = 0; i < NUM_TRIALS; i++) {
            const level = buildLevel('kruskals', size);
            if (level.gateEdges.length < 2) continue;
            totalWithGates++;

            const { cells, cols, rows, startCol, startRow, gateEdges,
                sceneryBlocked, objectivePositions } = level;

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

            let inZone1 = 0;
            for (const obj of objectivePositions) {
                if (zone1.has(`${obj.col},${obj.row}`)) inZone1++;
            }

            if (objectivePositions.length > 1 && inZone1 < objectivePositions.length) {
                spreadCount++;
            }
        }

        if (totalWithGates > 0) {
            expect(spreadCount / totalWithGates).toBeGreaterThan(0.80);
        }
    });
});

} // end for-each grid size
