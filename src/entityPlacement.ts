import Phaser from 'phaser';
import { TILE } from './constants';
import { WALLS, OPPOSITE } from './maze';
import { SeasonTheme } from './seasons';
import { CustomMapData } from './toolkit';
import { Cell, MOVE_DIRS, solvePath, floodFill, bfsDistanceMap } from './mazeUtils';
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

// ── Bush + scenery decoration placement ──────────────────────────────────────

export function placeBushes(
    ctx: PlacementCtx,
    widenedCells: Set<string>,
    seasonName: string,
): void {
    for (const key of widenedCells) {
        const [col, row] = key.split(',').map(Number);
        if (col === ctx.startCol && row === ctx.startRow) continue;
        if (col === ctx.goalCol  && row === ctx.goalRow)  continue;
        if (Math.random() > 0.65)                         continue;
        ctx.bushCells.add(key);
        drawBushAt(ctx.scene, ctx.mazeLayer, col, row, seasonName);
    }

    const path = solvePath(ctx.cells, ctx.cols, ctx.rows, ctx.startCol, ctx.startRow, ctx.goalCol, ctx.goalRow);

    const pathSet = new Set(path.map(c => `${c.col},${c.row}`));
    const gateProtected = new Set<string>();
    for (const { from, to } of ctx.gateEdges) {
        gateProtected.add(`${from.col},${from.row}`);
        gateProtected.add(`${to.col},${to.row}`);
    }
    for (const key of widenedCells) {
        if (ctx.bushCells.has(key)) continue;
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
            if (ctx.bushCells.has(key)) continue;
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

    // Guarantee bush near every ~step cells along solution path
    const step = Math.floor(ctx.cols / 2);
    for (let i = step; i < path.length - step; i += step) {
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

// ── Winter blocking rocks — require HOP to pass ─────────────────────────────

export function placeBlockingRocks(ctx: PlacementCtx, seasonName: string): void {
    const MIN_ROCKS = 2;
    const count = Math.max(MIN_ROCKS, Math.floor(ctx.cols / 4));

    const solPath = solvePath(ctx.cells, ctx.cols, ctx.rows,
        ctx.startCol, ctx.startRow, ctx.goalCol, ctx.goalRow, ctx.sceneryBlocked);
    const solPathSet = new Set(solPath.map(c => `${c.col},${c.row}`));

    const gateProtected = new Set<string>();
    for (const { from, to } of ctx.gateEdges) {
        gateProtected.add(`${from.col},${from.row}`);
        gateProtected.add(`${to.col},${to.row}`);
    }

    const onPath: Cell[] = [];
    const offPath: Cell[] = [];
    for (let row = 0; row < ctx.rows; row++) {
        for (let col = 0; col < ctx.cols; col++) {
            const key = `${col},${row}`;
            if (ctx.sceneryBlocked.has(key)) continue;
            if (ctx.bushCells.has(key)) continue;
            if (gateProtected.has(key)) continue;
            if (col === ctx.startCol && row === ctx.startRow) continue;
            if (col === ctx.goalCol && row === ctx.goalRow) continue;
            const distStart = Math.abs(col - ctx.startCol) + Math.abs(row - ctx.startRow);
            const distGoal = Math.abs(col - ctx.goalCol) + Math.abs(row - ctx.goalRow);
            if (distStart <= 2 || distGoal <= 2) continue;

            const w = ctx.cells[row][col];
            const hoppableH = !(w & WALLS.LEFT) && !(w & WALLS.RIGHT);
            const hoppableV = !(w & WALLS.TOP) && !(w & WALLS.BOTTOM);
            if (!hoppableH && !hoppableV) continue;

            if (solPathSet.has(key)) {
                onPath.push({ col, row });
            } else {
                offPath.push({ col, row });
            }
        }
    }

    const shuffle = (arr: Cell[]) => {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    };
    shuffle(onPath);
    shuffle(offPath);

    const candidates = [...onPath, ...offPath];

    let placed = 0;
    for (const c of candidates) {
        if (placed >= count) break;
        const key = `${c.col},${c.row}`;
        ctx.sceneryBlocked.add(key);

        if (hopAwareBfs(ctx)) {
            drawScenery(ctx.scene, ctx.mazeLayer, c.col, c.row, seasonName);
            placed++;
        } else {
            ctx.sceneryBlocked.delete(key);
        }
    }
}

// ── BFS from start to goal that treats hop-over-scenery as a valid move ─────

export function hopAwareBfs(ctx: PlacementCtx): boolean {
    const visited = new Set<string>();
    const queue: Cell[] = [{ col: ctx.startCol, row: ctx.startRow }];
    visited.add(`${ctx.startCol},${ctx.startRow}`);

    while (queue.length > 0) {
        const { col, row } = queue.shift()!;
        if (col === ctx.goalCol && row === ctx.goalRow) return true;

        for (const { dc, dr, wall } of MOVE_DIRS) {
            if (ctx.cells[row][col] & wall) continue;
            const nc = col + dc, nr = row + dr;
            if (nc < 0 || nc >= ctx.cols || nr < 0 || nr >= ctx.rows) continue;
            const nk = `${nc},${nr}`;

            if (ctx.sceneryBlocked.has(nk)) {
                const lc = col + dc * 2, lr = row + dr * 2;
                if (lc < 0 || lc >= ctx.cols || lr < 0 || lr >= ctx.rows) continue;
                const lk = `${lc},${lr}`;
                if (visited.has(lk)) continue;
                if (ctx.sceneryBlocked.has(lk)) continue;
                const adjWalls = ctx.cells[nr][nc];
                if (dc === 1 && (adjWalls & WALLS.RIGHT)) continue;
                if (dc === -1 && (adjWalls & WALLS.LEFT)) continue;
                if (dr === 1 && (adjWalls & WALLS.BOTTOM)) continue;
                if (dr === -1 && (adjWalls & WALLS.TOP)) continue;
                visited.add(lk);
                queue.push({ col: lc, row: lr });
            } else {
                if (visited.has(nk)) continue;
                visited.add(nk);
                queue.push({ col: nc, row: nr });
            }
        }
    }
    return false;
}

// ── Season objectives ────────────────────────────────────────────────────────

export function placeObjectives(ctx: PlacementCtx, season: SeasonTheme): number {
    const count = Math.floor(ctx.cols / 4);

    const reachable = floodFill(ctx.cells, ctx.cols, ctx.rows,
        ctx.startCol, ctx.startRow, ctx.sceneryBlocked);

    const avoid = new Set<string>([`${ctx.startCol},${ctx.startRow}`, `${ctx.goalCol},${ctx.goalRow}`]);
    for (const k of ctx.keyItems.keys()) avoid.add(k);
    for (const k of ctx.sceneryBlocked) avoid.add(k);

    const candidates: Cell[] = [];
    for (const key of reachable) {
        if (avoid.has(key)) continue;
        const [col, row] = key.split(',').map(Number);
        candidates.push({ col, row });
    }

    // Compute zone membership (flood fill with gate walls blocked)
    const zoneOf = new Map<string, number>();
    if (ctx.gateEdges.length >= 1) {
        const wallOps: { from: Cell; to: Cell; fw: number }[] = [];
        for (const { from, to } of ctx.gateEdges) {
            const dc = to.col - from.col, dr = to.row - from.row;
            const fw = dc === 1 ? WALLS.RIGHT : dc === -1 ? WALLS.LEFT : dr === 1 ? WALLS.BOTTOM : WALLS.TOP;
            wallOps.push({ from, to, fw });
            ctx.cells[from.row][from.col] |= fw;
            ctx.cells[to.row][to.col] |= OPPOSITE[fw];
        }
        const z0 = floodFill(ctx.cells, ctx.cols, ctx.rows, ctx.startCol, ctx.startRow, ctx.sceneryBlocked);
        for (const k of z0) zoneOf.set(k, 0);
        for (let i = 0; i < ctx.gateEdges.length; i++) {
            const gTo = ctx.gateEdges[i].to;
            const zi = floodFill(ctx.cells, ctx.cols, ctx.rows, gTo.col, gTo.row, ctx.sceneryBlocked);
            for (const k of zi) zoneOf.set(k, i + 1);
        }
        for (const { from, to, fw } of wallOps) {
            ctx.cells[from.row][from.col] &= ~fw;
            ctx.cells[to.row][to.col] &= ~OPPOSITE[fw];
        }
    }

    const solPath = solvePath(ctx.cells, ctx.cols, ctx.rows,
        ctx.startCol, ctx.startRow, ctx.goalCol, ctx.goalRow,
        ctx.sceneryBlocked);
    const pathSet = new Set(solPath.map(c => `${c.col},${c.row}`));
    const distFromPath = bfsDistanceMap(ctx.cells, ctx.cols, ctx.rows, pathSet, ctx.sceneryBlocked);

    const numZones = ctx.gateEdges.length + 1;
    const byZone: Cell[][] = Array.from({ length: numZones }, () => []);
    for (const c of candidates) {
        const z = zoneOf.get(`${c.col},${c.row}`) ?? 0;
        byZone[z].push(c);
    }
    for (const arr of byZone) {
        arr.sort((a, b) =>
            (distFromPath.get(`${b.col},${b.row}`) ?? 0) -
            (distFromPath.get(`${a.col},${a.row}`) ?? 0));
    }

    const placed: Cell[] = [];
    const usedZones = byZone.filter(z => z.length > 0);
    for (const zoneCands of usedZones) {
        if (placed.length >= count) break;
        placed.push(zoneCands.shift()!);
    }
    while (placed.length < count) {
        const best = usedZones.filter(z => z.length > 0)
            .sort((a, b) => b.length - a.length)[0];
        if (!best || best.length === 0) break;
        placed.push(best.shift()!);
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
