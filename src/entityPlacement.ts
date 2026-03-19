import Phaser from 'phaser';
import { TILE } from './constants';
import { WALLS, OPPOSITE } from './maze';
import { SeasonTheme } from './seasons';
import { CustomMapData } from './toolkit';
import { Cell, solvePath, floodFill, bfsDistanceMap } from './mazeUtils';
import { drawBushAt, drawScenery } from './scenery';
import { buildObjectiveSprite } from './sprites';

// ── Placement context — shared state passed to all placement functions ────────

export interface PlacementCtx {
    scene:          Phaser.Scene;
    mazeLayer:      Phaser.GameObjects.Container;
    cells:          number[][];
    cols:           number;
    rows:           number;
    startCol:       number;
    startRow:       number;
    goalCol:        number;
    goalRow:        number;
    bushCells:      Set<string>;
    sceneryBlocked: Set<string>;
    gateEdges:      { from: Cell; to: Cell }[];
    keyItems:       Map<string, Phaser.GameObjects.Rectangle>;
    objectives:     Map<string, Phaser.GameObjects.Container>;
    gates:          { fromCol: number; fromRow: number; toCol: number; toRow: number; graphic: Phaser.GameObjects.Rectangle; open: boolean }[];
    gate1Cell:      { col: number; row: number } | null;
    worldX(col: number): number;
    worldY(row: number): number;
}

// ── Scenery decoration placement (blocking obstacles) ────────────────────────

export function placeScenery(
    ctx: PlacementCtx,
    widenedCells: Set<string>,
    seasonName: string,
): void {
    const path = solvePath(ctx.cells, ctx.cols, ctx.rows, ctx.startCol, ctx.startRow, ctx.goalCol, ctx.goalRow);
    const pathSet = new Set(path.map(c => `${c.col},${c.row}`));
    const gateProtected = new Set<string>();
    for (const { from, to } of ctx.gateEdges) {
        gateProtected.add(`${from.col},${from.row}`);
        gateProtected.add(`${to.col},${to.row}`);
    }

    // Widened cells that aren't on the solution path or gate-adjacent become scenery
    for (const key of widenedCells) {
        if (pathSet.has(key)) continue;
        if (gateProtected.has(key)) continue;
        if (Math.random() > 0.45) continue;
        const [col, row] = key.split(',').map(Number);
        if (col === ctx.startCol && row === ctx.startRow) continue;
        if (col === ctx.goalCol  && row === ctx.goalRow)  continue;
        ctx.sceneryBlocked.add(key);
        drawScenery(ctx.scene, ctx.mazeLayer, col, row, seasonName);
    }

    // Dead-end scenery — scale target: 8→3, 10→5, 12→7
    const targetCount = Math.floor(ctx.cols * ctx.rows / 20);
    const deadEnds: string[] = [];
    for (let row = 0; row < ctx.rows; row++) {
        for (let col = 0; col < ctx.cols; col++) {
            const key = `${col},${row}`;
            if (ctx.sceneryBlocked.has(key)) continue;
            if (pathSet.has(key)) continue;
            if (gateProtected.has(key)) continue;
            if (col === ctx.startCol && row === ctx.startRow) continue;
            if (col === ctx.goalCol  && row === ctx.goalRow)  continue;
            const w = ctx.cells[row][col];
            const wallCount = ((w & WALLS.TOP) ? 1 : 0) + ((w & WALLS.RIGHT) ? 1 : 0)
                + ((w & WALLS.BOTTOM) ? 1 : 0) + ((w & WALLS.LEFT) ? 1 : 0);
            if (wallCount >= 3) deadEnds.push(key);
        }
    }
    for (let i = deadEnds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deadEnds[i], deadEnds[j]] = [deadEnds[j], deadEnds[i]];
    }
    const needed = Math.max(0, targetCount - ctx.sceneryBlocked.size);
    for (let i = 0; i < Math.min(needed, deadEnds.length); i++) {
        const key = deadEnds[i];
        const [col, row] = key.split(',').map(Number);
        ctx.sceneryBlocked.add(key);
        drawScenery(ctx.scene, ctx.mazeLayer, col, row, seasonName);
    }
}

// ── Bush (hiding spot) placement — runs after all blocking entities are placed ─

export function placeBushes(ctx: PlacementCtx, seasonName: string): void {
    const path = solvePath(ctx.cells, ctx.cols, ctx.rows,
        ctx.startCol, ctx.startRow, ctx.goalCol, ctx.goalRow, ctx.sceneryBlocked);
    const pathSet = new Set(path.map(c => `${c.col},${c.row}`));

    // Occupied cells: scenery, keys, objectives, start, goal
    const occupied = new Set<string>([
        `${ctx.startCol},${ctx.startRow}`,
        `${ctx.goalCol},${ctx.goalRow}`,
        ...ctx.sceneryBlocked,
        ...ctx.keyItems.keys(),
        ...ctx.objectives.keys(),
    ]);

    // Candidates: all reachable non-occupied, non-path cells
    const candidates: string[] = [];
    for (let row = 0; row < ctx.rows; row++) {
        for (let col = 0; col < ctx.cols; col++) {
            const key = `${col},${row}`;
            if (occupied.has(key)) continue;
            if (pathSet.has(key)) continue;
            candidates.push(key);
        }
    }

    // Shuffle and place bushes — target ~1 bush per 8 cells
    const target = Math.max(4, Math.floor(ctx.cols * ctx.rows / 8));
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (let i = 0; i < Math.min(target, candidates.length); i++) {
        const key = candidates[i];
        const [col, row] = key.split(',').map(Number);
        ctx.bushCells.add(key);
        drawBushAt(ctx.scene, ctx.mazeLayer, col, row, seasonName);
    }

    // Guarantee a bush every 3 steps along the solution path
    for (let i = 3; i < path.length - 3; i += 3) {
        guaranteeBushNear(ctx, path[i].col, path[i].row, seasonName);
    }
}

// ── Guarantee a hiding spot near a given cell ────────────────────────────────

export function guaranteeBushNear(
    ctx: PlacementCtx,
    hCol: number,
    hRow: number,
    seasonName: string,
): void {
    for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
            if (Math.abs(dc) + Math.abs(dr) > 2) continue;
            if (ctx.bushCells.has(`${hCol + dc},${hRow + dr}`)) return;
        }
    }
    const dirs = [{ dc: 0, dr: -1 }, { dc: 1, dr: 0 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 }];
    const valid = dirs
        .map(({ dc, dr }) => ({ col: hCol + dc, row: hRow + dr }))
        .filter(({ col, row }) =>
            col >= 0 && col < ctx.cols && row >= 0 && row < ctx.rows &&
            !(col === ctx.startCol && row === ctx.startRow) &&
            !(col === ctx.goalCol  && row === ctx.goalRow) &&
            !ctx.sceneryBlocked.has(`${col},${row}`)
        );
    if (valid.length === 0) return;
    const { col, row } = valid[Math.floor(Math.random() * valid.length)];
    ctx.bushCells.add(`${col},${row}`);
    drawBushAt(ctx.scene, ctx.mazeLayer, col, row, seasonName);
}

// ── Season objectives ────────────────────────────────────────────────────────

export function placeObjectives(ctx: PlacementCtx, season: SeasonTheme): number {
    const count = Math.max(3, Math.floor(ctx.cols / 2) - 1); // 8→3, 10→4, 12→5

    const reachable = floodFill(ctx.cells, ctx.cols, ctx.rows,
        ctx.startCol, ctx.startRow, ctx.sceneryBlocked);

    const avoid = new Set<string>([`${ctx.startCol},${ctx.startRow}`, `${ctx.goalCol},${ctx.goalRow}`]);
    for (const k of ctx.keyItems.keys()) avoid.add(k);
    for (const k of ctx.sceneryBlocked) avoid.add(k);

    const candidateSet = new Set<string>();
    for (const key of reachable) {
        if (avoid.has(key)) continue;
        candidateSet.add(key);
    }

    const solPath = solvePath(ctx.cells, ctx.cols, ctx.rows,
        ctx.startCol, ctx.startRow, ctx.goalCol, ctx.goalRow, ctx.sceneryBlocked);
    const pathSet = new Set(solPath.map(c => `${c.col},${c.row}`));
    const distFromPath = bfsDistanceMap(ctx.cells, ctx.cols, ctx.rows, pathSet, ctx.sceneryBlocked);

    const placed: Cell[] = [];
    const usedKeys = new Set<string>();
    const minSpacing = Math.max(3, Math.floor(ctx.cols / 2));    // 8→4, 10→5, 12→6
    const minOffPath = Math.max(1, Math.floor(ctx.cols / 5));    // 8→1, 10→2, 12→2

    // ── Zone-aware placement: 1 objective per zone first ──────────────────
    if (ctx.gateEdges.length > 0) {
        // Temporarily block gates to compute zones
        const wallOps: { from: Cell; to: Cell; fw: number }[] = [];
        for (const { from, to } of ctx.gateEdges) {
            const dc = to.col - from.col, dr = to.row - from.row;
            const fw = dc === 1 ? WALLS.RIGHT : dc === -1 ? WALLS.LEFT : dr === 1 ? WALLS.BOTTOM : WALLS.TOP;
            wallOps.push({ from, to, fw });
            ctx.cells[from.row][from.col] |= fw;
            ctx.cells[to.row][to.col] |= OPPOSITE[fw];
        }

        const zones: Set<string>[] = [];
        zones.push(floodFill(ctx.cells, ctx.cols, ctx.rows, ctx.startCol, ctx.startRow, ctx.sceneryBlocked));
        for (const { to } of ctx.gateEdges) {
            zones.push(floodFill(ctx.cells, ctx.cols, ctx.rows, to.col, to.row, ctx.sceneryBlocked));
        }

        // Restore passages
        for (const { from, to, fw } of wallOps) {
            ctx.cells[from.row][from.col] &= ~fw;
            ctx.cells[to.row][to.col] &= ~OPPOSITE[fw];
        }

        // Place 1 objective in each zone (farthest from path)
        for (const zone of zones) {
            if (placed.length >= count) break;
            const zoneCands: { cell: Cell; offPath: number }[] = [];
            for (const key of zone) {
                if (!candidateSet.has(key) || usedKeys.has(key) || pathSet.has(key)) continue;
                const [col, row] = key.split(',').map(Number);
                if (placed.some(p => Math.abs(p.col - col) + Math.abs(p.row - row) < minSpacing)) continue;
                zoneCands.push({ cell: { col, row }, offPath: distFromPath.get(key) ?? 0 });
            }
            zoneCands.sort((a, b) => b.offPath - a.offPath);
            // Prefer candidates above minOffPath threshold, fall back if needed
            const good = zoneCands.filter(c => c.offPath >= minOffPath);
            const pick = (good.length > 0 ? good[0] : zoneCands[0])?.cell;
            if (pick) {
                placed.push(pick);
                usedKeys.add(`${pick.col},${pick.row}`);
            }
        }
    }

    // ── Fill remaining slots with path-percentage anchoring ───────────────
    const remaining = count - placed.length;
    const searchRadius = Math.max(5, ctx.cols - 1);  // 8→7, 10→9, 12→11

    for (let i = 0; i < remaining; i++) {
        const frac = (i + 1) / (remaining + 1);
        const anchorIdx = Math.min(Math.floor(solPath.length * frac), solPath.length - 1);
        const anchor = solPath[anchorIdx];

        const nearby: { cell: Cell; dist: number; offPath: number }[] = [];
        for (const key of candidateSet) {
            if (usedKeys.has(key) || pathSet.has(key)) continue;
            const [col, row] = key.split(',').map(Number);
            if (placed.some(p => Math.abs(p.col - col) + Math.abs(p.row - row) < minSpacing)) continue;
            const manhattan = Math.abs(col - anchor.col) + Math.abs(row - anchor.row);
            if (manhattan > searchRadius) continue;
            nearby.push({ cell: { col, row }, dist: manhattan, offPath: distFromPath.get(key) ?? 0 });
        }
        nearby.sort((a, b) => b.offPath - a.offPath || a.dist - b.dist);

        // Prefer candidates above minOffPath threshold
        const good = nearby.filter(c => c.offPath >= minOffPath);
        const pick = (good.length > 0 ? good[0] : nearby[0])?.cell;
        if (pick) {
            placed.push(pick);
            usedKeys.add(`${pick.col},${pick.row}`);
        }
    }

    for (const { col, row } of placed) {
        const cx = ctx.worldX(col);
        const cy = ctx.worldY(row);
        const container = buildObjectiveSprite(ctx.scene, cx, cy, season.name);
        ctx.objectives.set(`${col},${row}`, container);
    }

    return count;
}

// ── Custom map entity placement ──────────────────────────────────────────────

export function placeCustomEntities(ctx: PlacementCtx, season: SeasonTheme, customMap: CustomMapData): number {
    // Bushes
    for (const { col, row } of customMap.bushes) {
        ctx.bushCells.add(`${col},${row}`);
        drawBushAt(ctx.scene, ctx.mazeLayer, col, row, season.name);
    }

    // Scenic obstacles
    for (const { col, row } of customMap.scenery) {
        ctx.sceneryBlocked.add(`${col},${row}`);
        drawScenery(ctx.scene, ctx.mazeLayer, col, row, season.name);
    }

    // Keys
    for (const pos of customMap.keys) {
        const rect = ctx.scene.add
            .rectangle(pos.col * TILE + TILE / 2, pos.row * TILE + TILE / 2, 18, 18, season.keyColor)
            .setRotation(Math.PI / 4);
        ctx.mazeLayer.add(rect);
        ctx.keyItems.set(`${pos.col},${pos.row}`, rect);
    }

    // Gates
    for (const { from, to } of customMap.gates) {
        const dc = to.col - from.col;
        const dr = to.row - from.row;
        let gx: number, gy: number, gw: number, gh: number;
        if      (dc ===  1) { gx = from.col * TILE + TILE;     gy = from.row * TILE + TILE / 2; gw = 10; gh = TILE - 10; }
        else if (dc === -1) { gx = from.col * TILE;             gy = from.row * TILE + TILE / 2; gw = 10; gh = TILE - 10; }
        else if (dr ===  1) { gx = from.col * TILE + TILE / 2; gy = from.row * TILE + TILE;     gw = TILE - 10; gh = 10; }
        else                { gx = from.col * TILE + TILE / 2; gy = from.row * TILE;            gw = TILE - 10; gh = 10; }
        const graphic = ctx.scene.add.rectangle(gx, gy, gw, gh, season.gateColor);
        ctx.mazeLayer.add(graphic);
        ctx.gates.push({ fromCol: from.col, fromRow: from.row, toCol: to.col, toRow: to.row, graphic, open: false });
    }
    if (ctx.gates.length > 0) {
        ctx.gate1Cell = { col: customMap.gates[0].from.col, row: customMap.gates[0].from.row };
    }

    // Objectives
    const objTotal = customMap.objectives.length;
    for (const { col, row } of customMap.objectives) {
        const cx = ctx.worldX(col);
        const cy = ctx.worldY(row);
        const container = buildObjectiveSprite(ctx.scene, cx, cy, season.name);
        ctx.objectives.set(`${col},${row}`, container);
    }

    return objTotal;
}
