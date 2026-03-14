// ── Terrain system for Year 2 — tall scrolling maps with zones ──────────────
//
// The map is much taller than the viewport. Camera scrolls as the bear moves north.
// Zones alternate: forest (land + trees + wolf) ↔ water (fish to catch).
// Narrow pinch points (5 cells wide) connect zones.

import Phaser from 'phaser';
import { TILE } from './constants';
import { SeasonTheme } from './seasons';
import { shuffle } from './maze';

export enum Terrain {
    OPEN  = 0,
    ROCK  = 1,
    ICE   = 2,   // reserved, not currently generated
    WATER = 3,
    TREE  = 4,
}

export interface ZoneInfo {
    type: 'forest' | 'water' | 'narrows';
    startRow: number;
    height:   number;
}

export interface TerrainMap {
    cols:       number;
    rows:       number;            // total height (taller than viewport)
    grid:       Terrain[][];
    start:      { col: number; row: number };
    goal:       { col: number; row: number };
    fishSpawns: { col: number; row: number }[];
    zones:      ZoneInfo[];
    landCells:  { col: number; row: number }[];   // all OPEN cells, bottom→top
}

// ── Zone layout builder ─────────────────────────────────────────────────────

function buildZoneLayout(): { zones: ZoneInfo[]; totalRows: number } {
    const zones: ZoneInfo[] = [];
    let r = 0;

    // Top → bottom (row 0 = top of map, bear walks from bottom to top)
    zones.push({ type: 'forest',  startRow: r, height: 3 }); r += 3;   // goal area
    zones.push({ type: 'water',   startRow: r, height: 6 }); r += 6;
    zones.push({ type: 'narrows', startRow: r, height: 2 }); r += 2;
    zones.push({ type: 'forest',  startRow: r, height: 7 }); r += 7;
    zones.push({ type: 'narrows', startRow: r, height: 2 }); r += 2;
    zones.push({ type: 'water',   startRow: r, height: 6 }); r += 6;
    zones.push({ type: 'narrows', startRow: r, height: 2 }); r += 2;
    zones.push({ type: 'forest',  startRow: r, height: 6 }); r += 6;   // start area

    return { zones, totalRows: r };
}

// ── Map generation ──────────────────────────────────────────────────────────

export function generateMountainMap(cols: number, _rows: number): TerrainMap {
    const { zones, totalRows } = buildZoneLayout();

    // Fill with ROCK
    const grid: Terrain[][] = [];
    for (let r = 0; r < totalRows; r++) {
        grid[r] = Array(cols).fill(Terrain.ROCK);
    }

    const center = Math.floor(cols / 2);
    const narrowHalf = 2;   // narrows: 5 cells (center-2 … center+2)

    for (const zone of zones) {
        const top = zone.startRow;
        const bot = top + zone.height;

        switch (zone.type) {
            case 'narrows': {
                for (let r = top; r < bot; r++) {
                    for (let c = center - narrowHalf; c <= center + narrowHalf; c++) {
                        if (c >= 0 && c < cols) grid[r][c] = Terrain.OPEN;
                    }
                }
                break;
            }

            case 'forest': {
                // Wide open area
                const half = Math.floor((cols - 2) / 2);
                for (let r = top; r < bot; r++) {
                    for (let c = center - half; c <= center + half; c++) {
                        if (c >= 0 && c < cols) grid[r][c] = Terrain.OPEN;
                    }
                }

                // Tree clusters (2–3 trees each), avoid edges
                let treeCandidates: { col: number; row: number }[] = [];
                for (let r = top + 1; r < bot - 1; r++) {
                    for (let c = center - half + 1; c < center + half; c++) {
                        if (grid[r][c] === Terrain.OPEN) {
                            treeCandidates.push({ col: c, row: r });
                        }
                    }
                }
                treeCandidates = shuffle(treeCandidates);
                const treeSet = new Set<string>();
                const numClusters = 2 + Math.floor(Math.random() * 2);
                let placed = 0;
                for (let i = 0; i < treeCandidates.length && placed < numClusters; i++) {
                    const seed = treeCandidates[i];
                    const key = `${seed.col},${seed.row}`;
                    if (treeSet.has(key)) continue;

                    const size = 2 + Math.floor(Math.random() * 2);
                    const cluster = [seed];
                    treeSet.add(key);

                    for (let g = 1; g < size; g++) {
                        const prev = cluster[cluster.length - 1];
                        const nbrs = [[0,-1],[0,1],[-1,0],[1,0]]
                            .map(([dc,dr]) => ({ col: prev.col+dc, row: prev.row+dr }))
                            .filter(n =>
                                n.row >= top+1 && n.row < bot-1 &&
                                n.col >= 1 && n.col < cols-1 &&
                                grid[n.row][n.col] === Terrain.OPEN &&
                                !treeSet.has(`${n.col},${n.row}`)
                            );
                        if (nbrs.length === 0) break;
                        const pick = nbrs[Math.floor(Math.random() * nbrs.length)];
                        treeSet.add(`${pick.col},${pick.row}`);
                        cluster.push(pick);
                    }
                    if (cluster.length >= 2) {
                        for (const t of cluster) grid[t.row][t.col] = Terrain.TREE;
                        placed++;
                    }
                }
                break;
            }

            case 'water': {
                // Fill zone interior with WATER
                const half = Math.floor((cols - 2) / 2);
                for (let r = top; r < bot; r++) {
                    for (let c = center - half; c <= center + half; c++) {
                        if (c >= 0 && c < cols) grid[r][c] = Terrain.WATER;
                    }
                }

                // Carve a winding 2-cell-wide land bridge from bottom to top
                let bc = center;
                for (let r = bot - 1; r >= top; r--) {
                    grid[r][bc] = Terrain.OPEN;
                    if (bc + 1 < cols) grid[r][bc + 1] = Terrain.OPEN;

                    // Drift towards center as we approach top row of zone
                    const progress = (bot - 1 - r) / (zone.height - 1);
                    if (progress > 0.7) {
                        // Bias toward center
                        if (bc < center) bc++;
                        else if (bc > center) bc--;
                    } else {
                        // Random drift
                        const drift = Math.random();
                        if (drift < 0.35 && bc > center - half + 2) bc--;
                        else if (drift > 0.65 && bc + 1 < center + half - 1) bc++;
                    }
                }
                break;
            }
        }
    }

    // Start = bottom-center, goal = top-center
    const start = { col: center, row: totalRows - 1 };
    const goal  = { col: center, row: 0 };
    // Ensure start and goal are OPEN
    grid[start.row][start.col] = Terrain.OPEN;
    grid[goal.row][goal.col]   = Terrain.OPEN;

    // Collect all OPEN cells (bottom → top) for cave placement etc.
    const landCells: { col: number; row: number }[] = [];
    for (let r = totalRows - 1; r >= 0; r--) {
        for (let c = 0; c < cols; c++) {
            if (grid[r][c] === Terrain.OPEN) landCells.push({ col: c, row: r });
        }
    }

    // Fish spawns — 2–3 per water zone, spread out
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
        const n = Math.min(2 + Math.floor(Math.random() * 2), waterCells.length);
        for (let i = 0; i < n; i++) fishSpawns.push(waterCells[i]);
    }

    return { cols, rows: totalRows, grid, start, goal, fishSpawns, zones, landCells };
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
                    g.fillStyle(0x505860, 0.6);
                    g.fillTriangle(cx - 12, cy + 8, cx, cy - 10, cx + 14, cy + 6);
                    container.add(g);
                    break;
                }
                case Terrain.TREE: {
                    const tl = (row + col) % 2 === 0;
                    container.add(scene.add.rectangle(cx, cy, TILE, TILE,
                        tl ? season.floorLight : season.floorDark));
                    container.add(scene.add.rectangle(cx, cy + 12, 10, 24, 0x6b3a1f));
                    const g = scene.add.graphics();
                    g.fillStyle(0x1a6b2a, 1);  g.fillCircle(cx, cy - 8, 22);
                    g.fillStyle(0x228b34, 1);  g.fillCircle(cx - 6, cy - 4, 16);
                    g.fillCircle(cx + 7, cy - 10, 15);
                    g.fillStyle(0x2ca847, 0.8); g.fillCircle(cx + 2, cy - 14, 12);
                    container.add(g);
                    break;
                }
                case Terrain.WATER: {
                    const ws = 0x1858a0 + ((row * 3 + col * 7) % 3) * 0x081018;
                    container.add(scene.add.rectangle(cx, cy, TILE, TILE, ws));
                    const wave = scene.add.graphics();
                    wave.lineStyle(1.5, 0x4090d0, 0.4);
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

export function isSwimmable(grid: Terrain[][], col: number, row: number, cols: number, rows: number): boolean {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return false;
    return grid[row][col] === Terrain.WATER;
}
