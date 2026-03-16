// ── Weather hazard system for Year Two ──────────────────────────────────────
//
// One weather per season, intensity 1-3 based on month within season.
// Weather is a gentle obstacle, not punishing — this is a cozy game.

import Phaser from 'phaser';
import { TILE } from './constants';
import { Terrain, TerrainMap, bfsReachable } from './terrain';
import { DEPTH } from './gameplay';
import { log } from './logger';

// ── Interface ───────────────────────────────────────────────────────────────

export interface WeatherHazard {
    intensity: 1 | 2 | 3;
    spawn(scene: Phaser.Scene, terrain: TerrainMap, mazeLayer: Phaser.GameObjects.Container): void;
    update(now: number, playerCol: number, playerRow: number): void;
    isBlocked(col: number, row: number): boolean;
    getMoveCost(col: number, row: number, grid?: Terrain[][]): number;
    getWindPush(col: number, row: number): { dx: number; dy: number } | null;
    getLabel(): string;
    destroy(): void;
}

// ── Intensity helper ────────────────────────────────────────────────────────

const INTENSITY_MAP: Record<number, 1 | 2 | 3> = {
    0: 1, 1: 2,          // Jan, Feb (winter start)
    2: 1, 3: 2, 4: 3,    // Mar, Apr, May (spring)
    5: 1, 6: 2, 7: 3,    // Jun, Jul, Aug (summer)
    8: 1, 9: 2, 10: 3,   // Sep, Oct, Nov (fall)
    11: 3,                // Dec (winter end)
};

export function getIntensity(monthIndex: number): 1 | 2 | 3 {
    return INTENSITY_MAP[monthIndex] ?? 1;
}

// ── Factory ─────────────────────────────────────────────────────────────────

export function createWeatherHazard(seasonName: string, intensity: 1 | 2 | 3): WeatherHazard | null {
    switch (seasonName) {
        case 'WinterY2':  return new SnowdriftHazard(intensity);
        case 'SpringY2':  return new FloodHazard(intensity);
        case 'FallY2':    return new WindHazard(intensity);
        case 'SummerY2':  return new HeatHazard(intensity);
        default:          return null;
    }
}

// ── 1. Winter Snowdrifts ────────────────────────────────────────────────────
// Certain OPEN tiles are covered in snow, costing extra energy to cross.

class SnowdriftHazard implements WeatherHazard {
    intensity: 1 | 2 | 3;
    private drifts = new Set<string>();
    private overlays: Phaser.GameObjects.Rectangle[] = [];

    constructor(intensity: 1 | 2 | 3) { this.intensity = intensity; }

    spawn(scene: Phaser.Scene, terrain: TerrainMap, mazeLayer: Phaser.GameObjects.Container) {
        // Pick random OPEN cells in forest zones
        const candidates: { col: number; row: number }[] = [];
        for (const zone of terrain.zones) {
            if (zone.type !== 'forest') continue;
            for (let r = zone.startRow; r < zone.startRow + zone.height; r++) {
                for (let c = 0; c < terrain.cols; c++) {
                    if (terrain.grid[r][c] === Terrain.OPEN &&
                        !(c === terrain.start.col && r === terrain.start.row) &&
                        !(c === terrain.goal.col && r === terrain.goal.row)) {
                        candidates.push({ col: c, row: r });
                    }
                }
            }
        }

        const count = Math.min(this.intensity * 5, candidates.length);
        const shuffled = candidates.sort(() => Math.random() - 0.5);
        for (let i = 0; i < count; i++) {
            const { col, row } = shuffled[i];
            this.drifts.add(`${col},${row}`);
            const cx = col * TILE + TILE / 2;
            const cy = row * TILE + TILE / 2;
            const overlay = scene.add.rectangle(cx, cy, TILE, TILE, 0xe8eef4, 0.25);
            mazeLayer.add(overlay);
            this.overlays.push(overlay);
        }
        log.info('weather', `snowdrifts spawned: ${count} tiles, intensity=${this.intensity}`);
    }

    update() { /* static drifts */ }
    isBlocked() { return false; }

    getMoveCost(col: number, row: number): number {
        if (!this.drifts.has(`${col},${row}`)) return 0;
        return this.intensity <= 2 ? 1 : 2;
    }

    getWindPush() { return null; }

    getLabel(): string {
        const words = ['Light', 'Moderate', 'Heavy'];
        return `${words[this.intensity - 1]} snowdrifts`;
    }

    destroy() {
        for (const o of this.overlays) o.destroy();
        this.overlays = [];
    }
}

// ── 2. Spring Flooding ──────────────────────────────────────────────────────
// OPEN tiles near water temporarily flood, blocking passage.

class FloodHazard implements WeatherHazard {
    intensity: 1 | 2 | 3;
    private flooded = new Set<string>();
    private candidates: { col: number; row: number }[] = [];
    private overlays = new Map<string, Phaser.GameObjects.Rectangle>();
    private scene!: Phaser.Scene;
    private terrain!: TerrainMap;
    private mazeLayer!: Phaser.GameObjects.Container;
    private timer: Phaser.Time.TimerEvent | null = null;
    private maxFlooded = 0;

    constructor(intensity: 1 | 2 | 3) { this.intensity = intensity; }

    spawn(scene: Phaser.Scene, terrain: TerrainMap, mazeLayer: Phaser.GameObjects.Container) {
        this.scene = scene;
        this.terrain = terrain;
        this.mazeLayer = mazeLayer;
        this.maxFlooded = this.intensity + 1;

        // Find OPEN cells adjacent to WATER
        for (const zone of terrain.zones) {
            for (let r = zone.startRow; r < zone.startRow + zone.height; r++) {
                for (let c = 0; c < terrain.cols; c++) {
                    if (terrain.grid[r][c] !== Terrain.OPEN) continue;
                    if (c === terrain.start.col && r === terrain.start.row) continue;
                    if (c === terrain.goal.col && r === terrain.goal.row) continue;
                    const adjWater = [[0,-1],[0,1],[-1,0],[1,0]].some(([dc,dr]) => {
                        const nc = c + dc, nr = r + dr;
                        return nr >= 0 && nr < terrain.rows && nc >= 0 && nc < terrain.cols
                            && terrain.grid[nr][nc] === Terrain.WATER;
                    });
                    if (adjWater) this.candidates.push({ col: c, row: r });
                }
            }
        }

        // Start flood cycle
        const interval = Math.max(5000, 10000 - this.intensity * 2000);
        this.timer = scene.time.addEvent({
            delay: interval,
            callback: () => this.cycle(),
            loop: true,
        });

        log.info('weather', `flooding: ${this.candidates.length} candidates, max=${this.maxFlooded}, interval=${interval}ms`);
    }

    private cycle() {
        // Un-flood one random tile
        if (this.flooded.size > 0) {
            const keys = Array.from(this.flooded);
            const removeKey = keys[Math.floor(Math.random() * keys.length)];
            this.flooded.delete(removeKey);
            const overlay = this.overlays.get(removeKey);
            if (overlay) {
                this.scene.tweens.add({
                    targets: overlay, alpha: 0, duration: 600,
                    onComplete: () => { overlay.destroy(); this.overlays.delete(removeKey); },
                });
            }
        }

        // Flood a new tile if under max
        if (this.flooded.size < this.maxFlooded && this.candidates.length > 0) {
            const shuffled = this.candidates.filter(c => !this.flooded.has(`${c.col},${c.row}`));
            for (const cand of shuffled.sort(() => Math.random() - 0.5)) {
                const key = `${cand.col},${cand.row}`;
                // Safety: would flooding this tile disconnect start from goal?
                const testGrid = this.terrain.grid.map(r => [...r]);
                testGrid[cand.row][cand.col] = Terrain.ROCK; // simulate blocked
                // Also block already-flooded tiles
                for (const fk of this.flooded) {
                    const [fc, fr] = fk.split(',').map(Number);
                    testGrid[fr][fc] = Terrain.ROCK;
                }
                if (bfsReachable(testGrid, this.terrain.cols, this.terrain.rows,
                    this.terrain.start, this.terrain.goal)) {
                    this.flooded.add(key);
                    const cx = cand.col * TILE + TILE / 2;
                    const cy = cand.row * TILE + TILE / 2;
                    const overlay = this.scene.add.rectangle(cx, cy, TILE, TILE, 0x2060c0, 0.4);
                    this.mazeLayer.add(overlay);
                    this.scene.tweens.add({
                        targets: overlay, alpha: { from: 0.2, to: 0.45 },
                        yoyo: true, repeat: -1, duration: 1200, ease: 'Sine.easeInOut',
                    });
                    this.overlays.set(key, overlay);
                    break;
                }
            }
        }
    }

    update() { /* timer-driven */ }

    isBlocked(col: number, row: number): boolean {
        return this.flooded.has(`${col},${row}`);
    }

    getMoveCost() { return 0; }
    getWindPush() { return null; }

    getLabel(): string {
        const words = ['Light', 'Moderate', 'Heavy'];
        return `${words[this.intensity - 1]} flooding`;
    }

    destroy() {
        if (this.timer) this.timer.destroy();
        for (const o of this.overlays.values()) o.destroy();
        this.overlays.clear();
    }
}

// ── 3. Fall Wind Gusts ──────────────────────────────────────────────────────
// After moving, the bear may be pushed one tile by wind.

const WIND_DIRS: { dx: number; dy: number; label: string }[] = [
    { dx: 0, dy: -1, label: '↑' },
    { dx: 1, dy: 0,  label: '→' },
    { dx: 0, dy: 1,  label: '↓' },
    { dx: -1, dy: 0, label: '←' },
];

class WindHazard implements WeatherHazard {
    intensity: 1 | 2 | 3;
    private dirIndex = 0;
    private stepCount = 0;
    private pushInterval: number;
    private timer: Phaser.Time.TimerEvent | null = null;
    windLabel = '';

    constructor(intensity: 1 | 2 | 3) {
        this.intensity = intensity;
        // Push frequency: intensity 1 = every 4th step, 2 = every 3rd, 3 = every 2nd
        this.pushInterval = 5 - intensity;
        this.dirIndex = Math.floor(Math.random() * 4);
        this.updateLabel();
    }

    private updateLabel() {
        this.windLabel = `Wind ${WIND_DIRS[this.dirIndex].label}`;
    }

    spawn(scene: Phaser.Scene) {
        // Rotate wind direction periodically
        const interval = Math.max(6000, 12000 - this.intensity * 2000);
        this.timer = scene.time.addEvent({
            delay: interval,
            callback: () => {
                this.dirIndex = (this.dirIndex + 1) % 4;
                this.updateLabel();
            },
            loop: true,
        });
        log.info('weather', `wind gusts: pushInterval=${this.pushInterval}, rotateInterval=${interval}ms`);
    }

    update() { /* timer-driven direction change */ }
    isBlocked() { return false; }
    getMoveCost() { return 0; }

    getWindPush(): { dx: number; dy: number } | null {
        this.stepCount++;
        if (this.stepCount % this.pushInterval !== 0) return null;
        return { dx: WIND_DIRS[this.dirIndex].dx, dy: WIND_DIRS[this.dirIndex].dy };
    }

    getLabel(): string {
        const words = ['Gentle', 'Moderate', 'Strong'];
        return `${words[this.intensity - 1]} winds ${WIND_DIRS[this.dirIndex].label}`;
    }

    destroy() {
        if (this.timer) this.timer.destroy();
    }
}

// ── 4. Summer Heat ──────────────────────────────────────────────────────────
// Heat builds with each step. Water tiles cool you off. Overheating drains energy.

class HeatHazard implements WeatherHazard {
    intensity: 1 | 2 | 3;
    heat = 0;
    heatMax: number;
    private heatBar: Phaser.GameObjects.Rectangle | null = null;
    private heatBarBg: Phaser.GameObjects.Rectangle | null = null;

    constructor(intensity: 1 | 2 | 3) {
        this.intensity = intensity;
        this.heatMax = 20 + intensity * 10; // 30, 40, 50
    }

    spawn() {
        log.info('weather', `heat: max=${this.heatMax}, intensity=${this.intensity}`);
    }

    /** Call from scene to add heat bar to side panel. */
    buildHeatBar(scene: Phaser.Scene, cx: number, y: number, barW: number, depth: number) {
        this.heatBarBg = scene.add.rectangle(cx, y, barW, 10, 0x222222, 0.6).setDepth(depth);
        this.heatBarBg.setScrollFactor(0);
        this.heatBar = scene.add.rectangle(cx, y, 0, 10, 0xff8833).setDepth(depth);
        this.heatBar.setScrollFactor(0);
    }

    update() { /* heat managed via getMoveCost */ }
    isBlocked() { return false; }

    getMoveCost(col: number, row: number, grid?: Terrain[][]): number {
        // Water tile = cool off
        if (grid && row >= 0 && row < grid.length && col >= 0 && col < grid[0].length
            && grid[row][col] === Terrain.WATER) {
            this.heat = 0;
            this.updateHeatBar();
            return 0;
        }

        this.heat += this.intensity;
        let extra = 0;
        if (this.heat >= this.heatMax) {
            extra = 3; // overheating penalty — gentle
            this.heat = Math.floor(this.heatMax * 0.6); // cool down partially
        }
        this.updateHeatBar();
        return extra;
    }

    private updateHeatBar() {
        if (!this.heatBar || !this.heatBarBg) return;
        const frac = this.heat / this.heatMax;
        this.heatBar.width = this.heatBarBg.width * frac;
        const color = frac > 0.7 ? 0xdd3322 : frac > 0.4 ? 0xff8833 : 0xffcc44;
        this.heatBar.setFillStyle(color);
    }

    getWindPush() { return null; }

    getLabel(): string {
        const words = ['Mild', 'Moderate', 'Scorching'];
        return `${words[this.intensity - 1]} heat`;
    }

    destroy() {
        this.heatBar?.destroy();
        this.heatBarBg?.destroy();
    }
}
