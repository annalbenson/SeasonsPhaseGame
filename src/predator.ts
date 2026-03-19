import Phaser from 'phaser';
import { TILE } from './constants';
import {
    PREDATOR_HUNT_DISTANCE, PREDATOR_PATROL_DELAY, PREDATOR_HUNT_DELAY,
    PREDATOR_PATROL_ANIM, PREDATOR_HUNT_ANIM, PREDATOR_MIN_SPAWN_DIST,
    DEPTH,
} from './gameplay';
import { Terrain, TerrainMap } from './terrain';
import { createPredatorSprite } from './sprites';
import { getIntensity } from './weatherHazard';

const DIRS = [
    { dx: 0, dy: -1 },
    { dx: 1, dy:  0 },
    { dx: 0, dy:  1 },
    { dx: -1, dy: 0 },
] as const;

export function isPassable(grid: Terrain[][], col: number, row: number, cols: number, rows: number): boolean {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return false;
    return grid[row][col] === Terrain.OPEN;
}

// ── Predator class ──────────────────────────────────────────────────────────

export class Predator {
    gridX: number;
    gridY: number;

    private sprite: Phaser.GameObjects.Container;
    private scene:  Phaser.Scene;
    private grid:   Terrain[][];
    private cols:   number;
    private rows:   number;
    private state:  'patrolling' | 'hunting' = 'patrolling';
    private moving  = false;
    private dead    = false;
    private timer!: Phaser.Time.TimerEvent;
    private onCatch: (pred: Predator) => void;
    catchCooldown = false;
    private siblings: Predator[] = [];
    private targetCol = 0;
    private targetRow = 0;

    constructor(
        scene:      Phaser.Scene,
        terrain:    TerrainMap,
        startCol:   number,
        startRow:   number,
        seasonName: string,
        onCatch:    (pred: Predator) => void,
        mazeLayer:  Phaser.GameObjects.Container,
    ) {
        this.scene   = scene;
        this.grid    = terrain.grid;
        this.cols    = terrain.cols;
        this.rows    = terrain.rows;
        this.gridX   = startCol;
        this.gridY   = startRow;
        this.onCatch = onCatch;

        const px = startCol * TILE + TILE / 2;
        const py = startRow * TILE + TILE / 2;
        this.sprite = createPredatorSprite(scene, px, py, seasonName, DEPTH.HAZARD);
        mazeLayer.add(this.sprite);

        this.scheduleMove();
    }

    /** Called each frame — update hunt/patrol state based on player position. */
    setTarget(playerCol: number, playerRow: number) {
        if (this.dead) return;
        this.targetCol = playerCol;
        this.targetRow = playerRow;
        const dist = Math.abs(playerCol - this.gridX) + Math.abs(playerRow - this.gridY);
        this.state = dist <= PREDATOR_HUNT_DISTANCE ? 'hunting' : 'patrolling';
    }

    /** Check if this predator occupies the given cell. */
    isAt(col: number, row: number): boolean {
        return !this.dead && this.gridX === col && this.gridY === row;
    }

    setSiblings(others: Predator[]) {
        this.siblings = others.filter(p => p !== this);
    }

    startCatchCooldown(ms: number) {
        this.catchCooldown = true;
        this.scene.time.delayedCall(ms, () => { this.catchCooldown = false; });
    }

    destroy() {
        this.dead = true;
        this.timer?.remove();
        this.sprite?.destroy();
    }

    // ── Movement ────────────────────────────────────────────────────────────

    private scheduleMove() {
        if (this.dead) return;
        const delay = this.state === 'hunting'
            ? PREDATOR_HUNT_DELAY
            : PREDATOR_PATROL_DELAY + Math.random() * 800;
        this.timer = this.scene.time.delayedCall(delay, () => this.move());
    }

    private move() {
        if (this.dead || this.moving) { this.scheduleMove(); return; }

        const dir = this.state === 'hunting' ? this.huntDir() : this.patrolDir();
        if (!dir) { this.scheduleMove(); return; }

        this.gridX += dir.dx;
        this.gridY += dir.dy;
        this.moving = true;

        const duration = this.state === 'hunting' ? PREDATOR_HUNT_ANIM : PREDATOR_PATROL_ANIM;
        this.scene.tweens.add({
            targets:  this.sprite,
            x:        this.gridX * TILE + TILE / 2,
            y:        this.gridY * TILE + TILE / 2,
            duration,
            ease:     'Sine.easeInOut',
            onComplete: () => {
                if (this.dead) return;
                this.moving = false;
                // Check if we landed on the player
                this.onCatch(this);
                this.scheduleMove();
            },
        });
    }

    private validDirs(): { dx: number; dy: number }[] {
        return DIRS.filter(d => {
            const nx = this.gridX + d.dx, ny = this.gridY + d.dy;
            if (!isPassable(this.grid, nx, ny, this.cols, this.rows)) return false;
            // Avoid clustering with siblings
            for (const s of this.siblings) {
                if (s.dead) continue;
                if (Math.abs(nx - s.gridX) + Math.abs(ny - s.gridY) <= 2) return false;
            }
            return true;
        });
    }

    private huntDir(): { dx: number; dy: number } | null {
        const valid = this.validDirs();
        if (valid.length === 0) return null;
        return valid.sort((a, b) => {
            const da = Math.abs(this.targetCol - (this.gridX + a.dx))
                     + Math.abs(this.targetRow - (this.gridY + a.dy));
            const db = Math.abs(this.targetCol - (this.gridX + b.dx))
                     + Math.abs(this.targetRow - (this.gridY + b.dy));
            return da - db;
        })[0];
    }

    private patrolDir(): { dx: number; dy: number } | null {
        const valid = this.validDirs();
        return valid.length ? valid[Math.floor(Math.random() * valid.length)] : null;
    }
}

/** Find OPEN cells in forest/ridge zones far from start — pure logic, testable. */
export function findPredatorCandidates(terrain: TerrainMap): { col: number; row: number }[] {
    const startRow = terrain.start.row;
    const candidates: { col: number; row: number }[] = [];
    for (const zone of terrain.zones) {
        if (zone.type !== 'forest' && zone.type !== 'ridge') continue;
        for (let r = zone.startRow; r < zone.startRow + zone.height; r++) {
            if (Math.abs(r - startRow) < PREDATOR_MIN_SPAWN_DIST) continue;
            for (let c = 0; c < terrain.cols; c++) {
                if (terrain.grid[r][c] === Terrain.OPEN) {
                    candidates.push({ col: c, row: r });
                }
            }
        }
    }
    return candidates;
}

/** Pick spread-out positions from candidates — pure logic, testable. */
export function pickSpawnPositions(
    candidates: { col: number; row: number }[],
    count: number,
    minSpacing = 8,
): { col: number; row: number }[] {
    const shuffled = candidates.sort(() => Math.random() - 0.5);
    const picked: { col: number; row: number }[] = [];
    for (const pos of shuffled) {
        if (picked.length >= count) break;
        const tooClose = picked.some(p =>
            Math.abs(p.col - pos.col) + Math.abs(p.row - pos.row) < minSpacing);
        if (tooClose) continue;
        picked.push(pos);
    }
    return picked;
}

// ── Spawn factory ───────────────────────────────────────────────────────────

export function spawnPredators(
    scene:      Phaser.Scene,
    terrain:    TerrainMap,
    seasonName: string,
    monthIndex: number,
    mazeLayer:  Phaser.GameObjects.Container,
    onCatch:    (pred: Predator) => void,
): Predator[] {
    const intensity = getIntensity(monthIndex);
    const count = intensity >= 3 ? 2 : 1;

    const candidates = findPredatorCandidates(terrain);
    const picked = pickSpawnPositions(candidates, count);

    const predators = picked.map(pos =>
        new Predator(scene, terrain, pos.col, pos.row, seasonName, onCatch, mazeLayer));

    // Set siblings for avoidance
    for (const p of predators) p.setSiblings(predators);

    return predators;
}
