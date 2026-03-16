// ── Terrain system for Year 2 — tall scrolling maps with zones ──────────────
//
// The map is much taller than the viewport. Camera scrolls as the bear moves north.
// Zones: forest (trees, winding trail), cliff narrows (lethal edges),
//        water (swim or go around).

import Phaser from 'phaser';
import { TILE } from './constants';
import { SeasonTheme } from './seasons';
import { shuffle } from './maze';
import { log } from './logger';

export enum Terrain {
    OPEN   = 0,
    ROCK   = 1,
    CLIFF  = 2,   // lethal edge in narrows zones — stepping here = fall
    WATER  = 3,
    TREE   = 4,
    BAMBOO = 5,   // summer variant — panda bamboo forest
}

export interface ZoneInfo {
    type: 'forest' | 'water' | 'narrows';
    startRow: number;
    height:   number;
}

export interface TerrainMap {
    cols:       number;
    rows:       number;
    grid:       Terrain[][];
    start:      { col: number; row: number };
    goal:       { col: number; row: number };
    fishSpawns: { col: number; row: number }[];
    zones:      ZoneInfo[];
    landCells:  { col: number; row: number }[];
}

// ── Zone layout builder ─────────────────────────────────────────────────────

function buildZoneLayout(): { zones: ZoneInfo[]; totalRows: number } {
    const zones: ZoneInfo[] = [];
    let r = 0;

    // Top → bottom (row 0 = top of map, bear walks from bottom to top)
    zones.push({ type: 'forest',  startRow: r, height: 3 });  r += 3;   // goal area
    zones.push({ type: 'narrows', startRow: r, height: 3 });  r += 3;
    zones.push({ type: 'forest',  startRow: r, height: 6 });  r += 6;
    zones.push({ type: 'water',   startRow: r, height: 5 });  r += 5;
    zones.push({ type: 'forest',  startRow: r, height: 8 });  r += 8;   // main foraging area
    zones.push({ type: 'narrows', startRow: r, height: 3 });  r += 3;
    zones.push({ type: 'forest',  startRow: r, height: 6 });  r += 6;
    zones.push({ type: 'water',   startRow: r, height: 5 });  r += 5;
    zones.push({ type: 'narrows', startRow: r, height: 3 });  r += 3;
    zones.push({ type: 'forest',  startRow: r, height: 3 });  r += 3;   // start area

    return { zones, totalRows: r };
}

// ── Map generation ──────────────────────────────────────────────────────────

export function generateMountainMap(cols: number, _rows: number, seasonName?: string): TerrainMap {
    const { zones, totalRows } = buildZoneLayout();
    const isBamboo = seasonName === 'SummerY2';
    const center = Math.floor(cols / 2);

    // Retry loop — regenerate until BFS confirms a walkable path
    for (let attempt = 0; attempt < 20; attempt++) {
    const grid: Terrain[][] = [];
    for (let r = 0; r < totalRows; r++) {
        grid[r] = Array(cols).fill(Terrain.ROCK);
    }

    // Thread a running column so each zone starts where the previous one ended.
    // Process zones bottom-to-top (bear walks bottom→top) so the cursor
    // exits each zone's top row and enters the next zone's bottom row.
    let cursor = center;
    let biasLeft = Math.random() < 0.5; // alternate direction each zone

    const zonesBottomUp = [...zones].reverse();
    for (const zone of zonesBottomUp) {
        const top = zone.startRow;
        const bot = top + zone.height;
        // Drift probabilities: biased toward one side, then flip
        const driftL = biasLeft ? 0.55 : 0.15;
        const driftR = biasLeft ? 0.15 : 0.55;

        switch (zone.type) {
            case 'narrows': {
                for (let r = top; r < bot; r++) {
                    for (let c = 0; c < cols; c++) {
                        grid[r][c] = Terrain.CLIFF;
                    }
                }
                let nc = cursor;
                for (let r = bot - 1; r >= top; r--) {
                    grid[r][nc] = Terrain.OPEN;
                    if (nc + 1 < cols) grid[r][nc + 1] = Terrain.OPEN;
                    const d = Math.random();
                    if (d < driftL && nc > 1) nc--;
                    else if (d > 1 - driftR && nc + 1 < cols - 2) nc++;
                }
                cursor = nc;
                break;
            }

            case 'forest': {
                const treeType = isBamboo ? Terrain.BAMBOO : Terrain.TREE;
                let pathCenter = cursor;
                for (let r = bot - 1; r >= top; r--) {
                    for (let c = pathCenter - 1; c <= pathCenter + 1; c++) {
                        if (c >= 0 && c < cols) grid[r][c] = Terrain.OPEN;
                    }
                    const d = Math.random();
                    if (d < driftL && pathCenter > 1) pathCenter--;
                    else if (d > 1 - driftR && pathCenter < cols - 2) pathCenter++;
                }
                cursor = pathCenter;

                // Dead-end spurs — short 2-3 cell branches off the main trail
                const spurs = Math.floor(zone.height / 3);
                for (let s = 0; s < spurs; s++) {
                    // Pick a random OPEN cell on the trail within this zone
                    const sr = top + 1 + Math.floor(Math.random() * Math.max(1, zone.height - 2));
                    if (sr >= bot) continue;
                    // Find trail cells in this row
                    const trailCols: number[] = [];
                    for (let c = 0; c < cols; c++) {
                        if (grid[sr][c] === Terrain.OPEN) trailCols.push(c);
                    }
                    if (trailCols.length === 0) continue;
                    // Pick an edge cell of the trail (leftmost or rightmost)
                    const goLeft = Math.random() < 0.5;
                    const startC = goLeft ? trailCols[0] : trailCols[trailCols.length - 1];
                    const dir = goLeft ? -1 : 1;
                    // Carve 2-3 cells in that direction
                    const len = 2 + Math.floor(Math.random() * 2);
                    for (let i = 1; i <= len; i++) {
                        const nc2 = startC + dir * i;
                        if (nc2 < 0 || nc2 >= cols) break;
                        if (grid[sr][nc2] === Terrain.OPEN) break; // hit another path
                        grid[sr][nc2] = Terrain.OPEN;
                    }
                }

                // Place trees/bamboo on ROCK cells adjacent to the trail
                for (let r = top + 1; r < bot - 1; r++) {
                    for (let c = 0; c < cols; c++) {
                        if (grid[r][c] !== Terrain.ROCK) continue;
                        const adj = [[0,-1],[0,1],[-1,0],[1,0]].some(([dc,dr]) => {
                            const nc2 = c + dc, nr = r + dr;
                            return nr >= 0 && nr < totalRows && nc2 >= 0 && nc2 < cols
                                && grid[nr][nc2] === Terrain.OPEN;
                        });
                        if (adj && Math.random() < 0.45) {
                            grid[r][c] = treeType;
                        }
                    }
                }
                break;
            }

            case 'water': {
                for (let r = top; r < bot; r++) {
                    for (let c = 0; c < cols; c++) {
                        grid[r][c] = Terrain.WATER;
                    }
                }
                let bc = cursor;
                for (let r = bot - 1; r >= top; r--) {
                    grid[r][bc] = Terrain.OPEN;
                    if (bc + 1 < cols) grid[r][bc + 1] = Terrain.OPEN;
                    const d = Math.random();
                    if (d < driftL && bc > 0) bc--;
                    else if (d > 1 - driftR && bc + 1 < cols - 1) bc++;
                }
                cursor = bc;
                break;
            }
        }
        biasLeft = !biasLeft; // flip for next zone
    }

    // Start = first OPEN cell in bottom row, goal = first OPEN cell in top row
    let startCol = center, goalCol = center;
    for (let c = 0; c < cols; c++) {
        if (grid[totalRows - 1][c] === Terrain.OPEN) { startCol = c; break; }
    }
    for (let c = 0; c < cols; c++) {
        if (grid[0][c] === Terrain.OPEN) { goalCol = c; break; }
    }
    const start = { col: startCol, row: totalRows - 1 };
    const goal  = { col: goalCol,  row: 0 };
    grid[start.row][start.col] = Terrain.OPEN;
    grid[goal.row][goal.col]   = Terrain.OPEN;

    // BFS reachability check — confirm start can reach goal (OPEN or WATER)
    if (bfsReachable(grid, cols, totalRows, start, goal)) {
        // Collect all OPEN cells (bottom → top)
        const landCells: { col: number; row: number }[] = [];
        for (let r = totalRows - 1; r >= 0; r--) {
            for (let c = 0; c < cols; c++) {
                if (grid[r][c] === Terrain.OPEN) landCells.push({ col: c, row: r });
            }
        }

        // Fish spawns — water cells for winter fish objectives
        const fishSpawns: { col: number; row: number }[] = [];
        for (const zone of zones) {
            if (zone.type !== 'water') continue;
            let waterCells: { col: number; row: number }[] = [];
            for (let r = zone.startRow; r < zone.startRow + zone.height; r++) {
                for (let c = 0; c < cols; c++) {
                    if (grid[r][c] === Terrain.WATER) waterCells.push({ col: c, row: r });
                }
            }
            waterCells = shuffle(waterCells);
            const n = Math.min(2, waterCells.length);
            for (let i = 0; i < n; i++) fishSpawns.push(waterCells[i]);
        }

        log.info('terrain', 'map generated', { cols, rows: totalRows, start, goal, attempt: attempt + 1 });
        return { cols, rows: totalRows, grid, start, goal, fishSpawns, zones, landCells };
    }
    } // end retry loop

    // Fallback — return the last attempt even if BFS failed (path likely exists via water)
    log.warn('terrain', 'BFS could not verify path after 20 attempts, using fallback');
    const landCells: { col: number; row: number }[] = [];
    // Use variables from the last loop iteration — regenerate for safety
    const fallbackGrid: Terrain[][] = [];
    for (let r = 0; r < totalRows; r++) fallbackGrid[r] = Array(cols).fill(Terrain.OPEN);
    const start = { col: center, row: totalRows - 1 };
    const goal  = { col: center, row: 0 };
    for (let r = totalRows - 1; r >= 0; r--) {
        for (let c = 0; c < cols; c++) landCells.push({ col: c, row: r });
    }
    return { cols, rows: totalRows, grid: fallbackGrid, start, goal, fishSpawns: [], zones, landCells };
}

/** BFS flood from start to goal over OPEN and WATER cells. */
export function bfsReachable(
    grid: Terrain[][], cols: number, rows: number,
    start: { col: number; row: number },
    goal: { col: number; row: number },
): boolean {
    const visited = new Set<number>();
    const key = (c: number, r: number) => r * cols + c;
    const queue: [number, number][] = [[start.col, start.row]];
    visited.add(key(start.col, start.row));

    while (queue.length > 0) {
        const [c, r] = queue.shift()!;
        if (c === goal.col && r === goal.row) return true;
        for (const [dc, dr] of [[0,-1],[0,1],[-1,0],[1,0]]) {
            const nc = c + dc, nr = r + dr;
            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
            const k = key(nc, nr);
            if (visited.has(k)) continue;
            const t = grid[nr][nc];
            if (t === Terrain.OPEN || t === Terrain.WATER) {
                visited.add(k);
                queue.push([nc, nr]);
            }
        }
    }
    return false;
}

// ── Terrain rendering ───────────────────────────────────────────────────────

export function drawTerrain(
    scene: Phaser.Scene,
    terrain: TerrainMap,
    season: SeasonTheme,
    container: Phaser.GameObjects.Container,
): void {
    const { cols, rows, grid } = terrain;

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const cx = col * TILE + TILE / 2;
            const cy = row * TILE + TILE / 2;
            const t  = grid[row][col];

            switch (t) {
                case Terrain.OPEN: {
                    const light = (row + col) % 2 === 0;
                    container.add(scene.add.rectangle(cx, cy, TILE, TILE,
                        light ? season.floorLight : season.floorDark));
                    break;
                }
                case Terrain.ROCK: {
                    const shade = 0x384048 + ((row * 7 + col * 13) % 4) * 0x040404;
                    container.add(scene.add.rectangle(cx, cy, TILE, TILE, shade));
                    const g = scene.add.graphics();
                    g.fillStyle(0x282e34, 0.85);
                    g.fillTriangle(cx - 20, cy + 16, cx + 2, cy - 18, cx + 22, cy + 14);
                    g.fillStyle(0x1e2428, 0.5);
                    g.fillTriangle(cx - 10, cy + 16, cx + 2, cy - 18, cx + 22, cy + 14);
                    container.add(g);
                    break;
                }
                case Terrain.CLIFF: {
                    // Dark abyss base
                    container.add(scene.add.rectangle(cx, cy, TILE, TILE, 0x0c0810));
                    const g = scene.add.graphics();
                    // Depth shading — dark void gradient
                    g.fillStyle(0x141018, 0.6);
                    g.fillRect(cx - TILE / 2 + 4, cy - TILE / 2 + 4, TILE - 8, TILE - 8);

                    // Draw cliff edge lips on sides adjacent to the OPEN path
                    const dirs: [number, number, string][] = [[0,-1,'top'],[0,1,'bot'],[-1,0,'left'],[1,0,'right']];
                    let hasAdj = false;
                    for (const [dc, dr, side] of dirs) {
                        const nc = col + dc, nr = row + dr;
                        const isOpen = nr >= 0 && nr < rows && nc >= 0 && nc < cols
                            && grid[nr][nc] === Terrain.OPEN;
                        if (!isOpen) continue;
                        hasAdj = true;
                        const half = TILE / 2;
                        // Rocky ledge lip — jagged brown/tan edge
                        g.fillStyle(0x6b5040, 0.9);
                        if (side === 'top') {
                            g.fillRect(cx - half, cy - half, TILE, 6);
                            g.fillStyle(0x8a6a50, 0.7);
                            g.fillTriangle(cx - 12, cy - half + 6, cx - 6, cy - half, cx, cy - half + 8);
                            g.fillTriangle(cx + 4, cy - half + 5, cx + 10, cy - half, cx + 16, cy - half + 7);
                        } else if (side === 'bot') {
                            g.fillRect(cx - half, cy + half - 6, TILE, 6);
                            g.fillStyle(0x8a6a50, 0.7);
                            g.fillTriangle(cx - 10, cy + half - 7, cx - 4, cy + half, cx + 2, cy + half - 6);
                            g.fillTriangle(cx + 6, cy + half - 8, cx + 12, cy + half, cx + 18, cy + half - 5);
                        } else if (side === 'left') {
                            g.fillRect(cx - half, cy - half, 6, TILE);
                            g.fillStyle(0x8a6a50, 0.7);
                            g.fillTriangle(cx - half + 6, cy - 10, cx - half, cy - 4, cx - half + 8, cy + 2);
                            g.fillTriangle(cx - half + 5, cy + 6, cx - half, cy + 12, cx - half + 7, cy + 18);
                        } else {
                            g.fillRect(cx + half - 6, cy - half, 6, TILE);
                            g.fillStyle(0x8a6a50, 0.7);
                            g.fillTriangle(cx + half - 7, cy - 10, cx + half, cy - 4, cx + half - 5, cy + 2);
                            g.fillTriangle(cx + half - 6, cy + 6, cx + half, cy + 12, cx + half - 8, cy + 18);
                        }
                        // Crumbling rocks / pebbles near the edge
                        g.fillStyle(0x554438, 0.6);
                        const seed = row * 7 + col * 13 + dc * 3 + dr * 5;
                        for (let i = 0; i < 3; i++) {
                            const ox = ((seed + i * 17) % 25) - 12;
                            const oy = ((seed + i * 11) % 25) - 12;
                            g.fillCircle(cx + ox, cy + oy, 2 + (i % 2));
                        }
                    }
                    container.add(g);
                    // Pulsing red warning glow on cliff cells next to path
                    if (hasAdj) {
                        const warn = scene.add.rectangle(cx, cy, TILE, TILE, 0xff2200, 0.08);
                        container.add(warn);
                        scene.tweens.add({ targets: warn, alpha: { from: 0.04, to: 0.14 },
                            yoyo: true, repeat: -1, duration: 1200, ease: 'Sine.easeInOut' });
                    }
                    break;
                }
                case Terrain.TREE: {
                    const tl = (row + col) % 2 === 0;
                    container.add(scene.add.rectangle(cx, cy, TILE, TILE,
                        tl ? season.floorLight : season.floorDark));
                    const g = scene.add.graphics();
                    if (season.name === 'WinterY2') {
                        // Snow-covered evergreen / pine
                        container.add(scene.add.rectangle(cx, cy + 14, 8, 16, 0x5a3a1f));
                        g.fillStyle(0x1a5028, 1);
                        g.fillTriangle(cx - 18, cy + 6, cx, cy - 22, cx + 18, cy + 6);
                        g.fillTriangle(cx - 14, cy - 2, cx, cy - 26, cx + 14, cy - 2);
                        // Snow on branches
                        g.fillStyle(0xe8eef4, 0.85);
                        g.fillTriangle(cx - 10, cy - 2, cx, cy - 18, cx + 10, cy - 2);
                        g.fillEllipse(cx, cy - 22, 12, 6);
                    } else if (season.name === 'SpringY2') {
                        // Deciduous with pink blossoms
                        container.add(scene.add.rectangle(cx, cy + 12, 10, 24, 0x6b3a1f));
                        g.fillStyle(0x228b34, 1);  g.fillCircle(cx, cy - 8, 20);
                        g.fillStyle(0x2ca847, 1);  g.fillCircle(cx - 5, cy - 4, 14);
                        g.fillCircle(cx + 6, cy - 10, 13);
                        // Pink blossoms
                        g.fillStyle(0xff88aa, 0.8); g.fillCircle(cx - 8, cy - 14, 4);
                        g.fillCircle(cx + 10, cy - 6, 3); g.fillCircle(cx + 2, cy - 18, 3);
                        g.fillStyle(0xffaacc, 0.6); g.fillCircle(cx - 4, cy - 4, 3);
                        g.fillCircle(cx + 8, cy - 14, 2);
                    } else if (season.name === 'FallY2') {
                        // Autumn foliage — orange, red, gold
                        container.add(scene.add.rectangle(cx, cy + 12, 10, 24, 0x6b3a1f));
                        g.fillStyle(0xcc6622, 1);  g.fillCircle(cx, cy - 8, 20);
                        g.fillStyle(0xdd4422, 0.9); g.fillCircle(cx - 6, cy - 4, 14);
                        g.fillCircle(cx + 7, cy - 12, 13);
                        g.fillStyle(0xeeaa22, 0.8); g.fillCircle(cx + 2, cy - 16, 10);
                        g.fillStyle(0xbb3318, 0.6); g.fillCircle(cx - 8, cy - 14, 8);
                    } else {
                        // Default green deciduous (Year 1)
                        container.add(scene.add.rectangle(cx, cy + 12, 10, 24, 0x6b3a1f));
                        g.fillStyle(0x1a6b2a, 1);  g.fillCircle(cx, cy - 8, 22);
                        g.fillStyle(0x228b34, 1);  g.fillCircle(cx - 6, cy - 4, 16);
                        g.fillCircle(cx + 7, cy - 10, 15);
                        g.fillStyle(0x2ca847, 0.8); g.fillCircle(cx + 2, cy - 14, 12);
                    }
                    container.add(g);
                    break;
                }
                case Terrain.BAMBOO: {
                    const tl = (row + col) % 2 === 0;
                    container.add(scene.add.rectangle(cx, cy, TILE, TILE,
                        tl ? season.floorLight : season.floorDark));
                    // Two bamboo stalks
                    const g = scene.add.graphics();
                    g.fillStyle(0x44882a, 1);
                    g.fillRect(cx - 8, cy - 24, 6, 48);
                    g.fillRect(cx + 6, cy - 20, 6, 44);
                    // Nodes
                    g.fillStyle(0x2a6618, 0.8);
                    g.fillRect(cx - 9, cy - 8, 8, 3);
                    g.fillRect(cx - 9, cy + 8, 8, 3);
                    g.fillRect(cx + 5, cy - 4, 8, 3);
                    g.fillRect(cx + 5, cy + 12, 8, 3);
                    // Small leaves
                    g.fillStyle(0x66cc44, 0.7);
                    g.fillEllipse(cx - 16, cy - 12, 10, 4);
                    g.fillEllipse(cx + 18, cy - 6, 10, 4);
                    container.add(g);
                    break;
                }
                case Terrain.WATER: {
                    // Season-tinted water
                    let wBase: number, wWave: number;
                    switch (season.name) {
                        case 'WinterY2':  wBase = 0x1a4878; wWave = 0x3878a8; break; // icy steel blue
                        case 'SpringY2':  wBase = 0x1868a8; wWave = 0x48a0d8; break; // bright clear blue
                        case 'SummerY2':  wBase = 0x186848; wWave = 0x30a070; break; // warm green-teal
                        case 'FallY2':    wBase = 0x2a5878; wWave = 0x5090b0; break; // muted slate blue
                        default:          wBase = 0x1858a0; wWave = 0x4090d0; break;
                    }
                    const ws = wBase + ((row * 3 + col * 7) % 3) * 0x060808;
                    container.add(scene.add.rectangle(cx, cy, TILE, TILE, ws));
                    const wave = scene.add.graphics();
                    wave.lineStyle(1.5, wWave, 0.4);
                    wave.strokeLineShape(new Phaser.Geom.Line(cx - 20, cy - 4, cx + 20, cy - 4));
                    wave.strokeLineShape(new Phaser.Geom.Line(cx - 14, cy + 8, cx + 14, cy + 8));
                    container.add(wave);
                    scene.tweens.add({ targets: wave, y: { from: 0, to: 4 }, yoyo: true, repeat: -1,
                        duration: 1800 + Math.random() * 600, ease: 'Sine.easeInOut' });
                    break;
                }
            }
        }
    }

    // Outer border
    const g = scene.add.graphics();
    g.lineStyle(6, season.wallColor, 1);
    g.strokeRect(0, 0, cols * TILE, rows * TILE);
    container.add(g);
}

// ── Movement helpers ────────────────────────────────────────────────────────

export function isWalkable(grid: Terrain[][], col: number, row: number, cols: number, rows: number, canSwim = false): boolean {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return false;
    const t = grid[row][col];
    if (t === Terrain.OPEN) return true;
    if (t === Terrain.WATER && canSwim) return true;
    return false;
}

export function isCliff(grid: Terrain[][], col: number, row: number, cols: number, rows: number): boolean {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return false;
    return grid[row][col] === Terrain.CLIFF;
}

export function isSwimmable(grid: Terrain[][], col: number, row: number, cols: number, rows: number): boolean {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return false;
    return grid[row][col] === Terrain.WATER;
}
