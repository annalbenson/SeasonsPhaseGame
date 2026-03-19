// ── Weather hazard system for Year Two ──────────────────────────────────────
//
// Each season has roaming weather clouds that produce unique effects.
// Clouds drift across the map; their proximity determines where effects apply.
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
    /** Reveal a leaf pile at (col, row). Returns true if a leaf was there. */
    revealLeaf?(col: number, row: number): boolean;
    /** Check if a revealed leaf pile hid a berry (Fall only). Consumes the berry. */
    hasHiddenBerry?(col: number, row: number): boolean;
    /** Number of berries hidden under leaf piles (Fall only). */
    getHiddenBerryCount?(): number;
    getLabel(): string;
    destroy(): void;
}

// ── Common cloud types & helpers ────────────────────────────────────────────

interface WeatherCloud {
    col: number;
    row: number;
    dirIndex: number;
    gfx: Phaser.GameObjects.Container;
}

const CLOUD_DIRS: { dx: number; dy: number; label: string }[] = [
    { dx: 0, dy: -1, label: '↑' },
    { dx: 1, dy: 0,  label: '→' },
    { dx: 0, dy: 1,  label: '↓' },
    { dx: -1, dy: 0, label: '←' },
];

/** Drift all clouds one step; bounce off impassable terrain. */
function moveWeatherClouds(
    clouds: WeatherCloud[], terrain: TerrainMap, scene: Phaser.Scene,
    onMoved?: () => void,
) {
    for (const cloud of clouds) {
        const dir = CLOUD_DIRS[cloud.dirIndex];
        const nc = cloud.col + dir.dx;
        const nr = cloud.row + dir.dy;

        if (nc < 0 || nc >= terrain.cols || nr < 0 || nr >= terrain.rows ||
            terrain.grid[nr][nc] === Terrain.ROCK ||
            terrain.grid[nr][nc] === Terrain.CLIFF ||
            terrain.grid[nr][nc] === Terrain.TREE ||
            terrain.grid[nr][nc] === Terrain.BAMBOO) {
            cloud.dirIndex = Math.floor(Math.random() * 4);
            continue; // let other clouds still move
        }

        cloud.col = nc;
        cloud.row = nr;
        scene.tweens.add({
            targets: cloud.gfx,
            x: nc * TILE + TILE / 2, y: nr * TILE + TILE / 2,
            duration: 800, ease: 'Sine.easeInOut',
        });
    }
    onMoved?.();
}

/** Find OPEN cells for cloud placement, avoiding start/goal. */
function findCloudCandidates(terrain: TerrainMap): { col: number; row: number }[] {
    const cells: { col: number; row: number }[] = [];
    for (let r = 0; r < terrain.rows; r++) {
        for (let c = 0; c < terrain.cols; c++) {
            if (terrain.grid[r][c] === Terrain.OPEN &&
                !(c === terrain.start.col && r === terrain.start.row) &&
                !(c === terrain.goal.col && r === terrain.goal.row)) {
                cells.push({ col: c, row: r });
            }
        }
    }
    return cells;
}

/** Add a gentle bob tween to a cloud container. */
function addCloudBob(scene: Phaser.Scene, container: Phaser.GameObjects.Container, baseY: number) {
    scene.tweens.add({
        targets: container, y: baseY - 4,
        yoyo: true, repeat: -1, duration: 1500 + Math.random() * 500,
        ease: 'Sine.easeInOut',
    });
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
// Blizzard clouds roam over forest zones. Tiles near clouds become snowdrifts
// that cost extra energy to cross. Drifts move with the clouds.

class SnowdriftHazard implements WeatherHazard {
    intensity: 1 | 2 | 3;
    private clouds: WeatherCloud[] = [];
    private drifts = new Set<string>();
    private overlays = new Map<string, Phaser.GameObjects.Rectangle>();
    private scene!: Phaser.Scene;
    private terrain!: TerrainMap;
    private mazeLayer!: Phaser.GameObjects.Container;
    private moveTimer: Phaser.Time.TimerEvent | null = null;

    constructor(intensity: 1 | 2 | 3) { this.intensity = intensity; }

    spawn(scene: Phaser.Scene, terrain: TerrainMap, mazeLayer: Phaser.GameObjects.Container) {
        this.scene = scene;
        this.terrain = terrain;
        this.mazeLayer = mazeLayer;

        const candidates = findCloudCandidates(terrain);
        const count = Math.min(this.intensity + 1, candidates.length);
        const shuffled = candidates.sort(() => Math.random() - 0.5);
        for (let i = 0; i < count; i++) {
            const { col, row } = shuffled[i];
            const dirIndex = Math.floor(Math.random() * 4);
            const gfx = this.buildCloud(scene, col, row);
            mazeLayer.add(gfx);
            this.clouds.push({ col, row, dirIndex, gfx });
        }

        // Initial drift calculation
        this.recalcDrifts();

        const interval = Math.max(3500, 6000 - this.intensity * 800);
        this.moveTimer = scene.time.addEvent({
            delay: interval,
            callback: () => moveWeatherClouds(this.clouds, this.terrain, this.scene, () => this.recalcDrifts()),
            loop: true,
        });

        log.info('weather', `blizzard clouds: ${count}, interval=${interval}ms`);
    }

    private buildCloud(scene: Phaser.Scene, col: number, row: number): Phaser.GameObjects.Container {
        const cx = col * TILE + TILE / 2;
        const cy = row * TILE + TILE / 2;
        const c = scene.add.container(cx, cy);

        // White-grey blizzard cloud
        c.add(scene.add.ellipse(0, 0, TILE * 0.8, TILE * 0.5, 0xc8d8e8, 0.65));
        c.add(scene.add.ellipse(-10, -6, TILE * 0.5, TILE * 0.4, 0xd8e4f0, 0.55));
        c.add(scene.add.ellipse(12, -4, TILE * 0.45, TILE * 0.35, 0xd0dce8, 0.55));

        // Snowflake dots falling below
        const g = scene.add.graphics();
        g.fillStyle(0xffffff, 0.5);
        g.fillCircle(-6, TILE * 0.2, 2);
        g.fillCircle(4, TILE * 0.3, 1.5);
        g.fillCircle(-2, TILE * 0.35, 1.5);
        g.fillCircle(8, TILE * 0.22, 2);
        c.add(g);

        c.setDepth(DEPTH.HAZARD);
        addCloudBob(scene, c, cy);
        return c;
    }

    /** Recalculate which tiles are drifted based on cloud positions. */
    private recalcDrifts() {
        const newDrifts = new Set<string>();
        for (const cloud of this.clouds) {
            for (let dr = -2; dr <= 2; dr++) {
                for (let dc = -2; dc <= 2; dc++) {
                    const c = cloud.col + dc, r = cloud.row + dr;
                    if (c < 0 || c >= this.terrain.cols || r < 0 || r >= this.terrain.rows) continue;
                    if (this.terrain.grid[r][c] !== Terrain.OPEN) continue;
                    newDrifts.add(`${c},${r}`);
                }
            }
        }

        // Remove old overlays for tiles no longer drifted
        for (const key of this.drifts) {
            if (!newDrifts.has(key)) {
                const overlay = this.overlays.get(key);
                if (overlay) {
                    this.scene.tweens.add({
                        targets: overlay, alpha: 0, duration: 400,
                        onComplete: () => { overlay.destroy(); this.overlays.delete(key); },
                    });
                }
            }
        }

        // Add overlays for new drift tiles
        for (const key of newDrifts) {
            if (!this.overlays.has(key)) {
                const [c, r] = key.split(',').map(Number);
                const cx = c * TILE + TILE / 2;
                const cy = r * TILE + TILE / 2;
                const overlay = this.scene.add.rectangle(cx, cy, TILE, TILE, 0xe8eef4, 0);
                this.mazeLayer.add(overlay);
                this.scene.tweens.add({ targets: overlay, alpha: 0.25, duration: 400 });
                this.overlays.set(key, overlay);
            }
        }

        this.drifts = newDrifts;
    }

    update() { /* timer-driven */ }
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
        if (this.moveTimer) this.moveTimer.destroy();
        for (const cloud of this.clouds) cloud.gfx.destroy();
        this.clouds = [];
        for (const o of this.overlays.values()) o.destroy();
        this.overlays.clear();
    }
}

// ── 2. Spring Flooding ──────────────────────────────────────────────────────
// Rain clouds roam the map. OPEN tiles near rain clouds and adjacent to water
// become flooded (blocked). Water zones also permanently rise over time.

class FloodHazard implements WeatherHazard {
    intensity: 1 | 2 | 3;
    private clouds: WeatherCloud[] = [];
    private flooded = new Set<string>();
    private floodCandidates: { col: number; row: number }[] = [];
    private overlays = new Map<string, Phaser.GameObjects.Rectangle>();
    private scene!: Phaser.Scene;
    private terrain!: TerrainMap;
    private mazeLayer!: Phaser.GameObjects.Container;
    private moveTimer: Phaser.Time.TimerEvent | null = null;
    private riseTimer: Phaser.Time.TimerEvent | null = null;
    private maxFlooded = 0;
    private risenTiles: Phaser.GameObjects.Rectangle[] = [];

    constructor(intensity: 1 | 2 | 3) { this.intensity = intensity; }

    spawn(scene: Phaser.Scene, terrain: TerrainMap, mazeLayer: Phaser.GameObjects.Container) {
        this.scene = scene;
        this.terrain = terrain;
        this.mazeLayer = mazeLayer;
        this.maxFlooded = this.intensity * 2 + 1; // 3, 5, 7

        // Collect all OPEN cells adjacent to WATER (potential flood tiles)
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
                    if (adjWater) this.floodCandidates.push({ col: c, row: r });
                }
            }
        }

        // Spawn rain clouds
        const candidates = findCloudCandidates(terrain);
        const count = Math.min(this.intensity + 1, candidates.length);
        const shuffled = candidates.sort(() => Math.random() - 0.5);
        for (let i = 0; i < count; i++) {
            const { col, row } = shuffled[i];
            const dirIndex = Math.floor(Math.random() * 4);
            const gfx = this.buildCloud(scene, col, row);
            mazeLayer.add(gfx);
            this.clouds.push({ col, row, dirIndex, gfx });
        }

        // Initial flood near clouds
        this.recalcFloods();

        // Cloud movement
        const moveInterval = Math.max(3000, 5500 - this.intensity * 800);
        this.moveTimer = scene.time.addEvent({
            delay: moveInterval,
            callback: () => moveWeatherClouds(this.clouds, this.terrain, this.scene, () => this.recalcFloods()),
            loop: true,
        });

        // Rising water (permanent terrain conversion)
        const riseInterval = Math.max(12000, 25000 - this.intensity * 5000);
        this.riseTimer = scene.time.addEvent({
            delay: riseInterval,
            callback: () => this.riseWater(),
            loop: true,
        });

        log.info('weather', `rain clouds: ${count}, maxFlood=${this.maxFlooded}, move=${moveInterval}ms, rise=${riseInterval}ms`);
    }

    private buildCloud(scene: Phaser.Scene, col: number, row: number): Phaser.GameObjects.Container {
        const cx = col * TILE + TILE / 2;
        const cy = row * TILE + TILE / 2;
        const c = scene.add.container(cx, cy);

        // Dark blue-grey rain cloud
        c.add(scene.add.ellipse(0, -4, TILE * 0.8, TILE * 0.45, 0x405878, 0.65));
        c.add(scene.add.ellipse(-8, -8, TILE * 0.45, TILE * 0.35, 0x4a6080, 0.55));
        c.add(scene.add.ellipse(10, -6, TILE * 0.4, TILE * 0.3, 0x485e78, 0.55));

        // Rain streaks
        const g = scene.add.graphics();
        g.lineStyle(1.5, 0x6090c0, 0.45);
        g.moveTo(-8, 8); g.lineTo(-10, 22);
        g.moveTo(0, 10); g.lineTo(-2, 24);
        g.moveTo(8, 8); g.lineTo(6, 22);
        g.moveTo(-3, 6); g.lineTo(-5, 18);
        g.strokePath();
        c.add(g);

        c.setDepth(DEPTH.HAZARD);
        addCloudBob(scene, c, cy);
        return c;
    }

    /** Recalculate flooded tiles based on rain cloud proximity. */
    private recalcFloods() {
        // Find flood candidates near any rain cloud
        const nearCloud = new Set<string>();
        for (const cloud of this.clouds) {
            for (const cand of this.floodCandidates) {
                if (Math.abs(cand.col - cloud.col) + Math.abs(cand.row - cloud.row) <= 3) {
                    nearCloud.add(`${cand.col},${cand.row}`);
                }
            }
        }

        // Unflood tiles no longer near a cloud
        for (const key of [...this.flooded]) {
            if (!nearCloud.has(key)) {
                this.flooded.delete(key);
                const overlay = this.overlays.get(key);
                if (overlay) {
                    const waves = (overlay as any)._floodWaves as Phaser.GameObjects.Graphics | undefined;
                    if (waves) {
                        this.scene.tweens.add({ targets: waves, alpha: 0, duration: 600,
                            onComplete: () => waves.destroy() });
                    }
                    this.scene.tweens.add({
                        targets: overlay, alpha: 0, duration: 600,
                        onComplete: () => { overlay.destroy(); this.overlays.delete(key); },
                    });
                }
            }
        }

        // Try to flood new tiles near clouds (up to maxFlooded)
        const candidates = [...nearCloud].filter(k => !this.flooded.has(k)).sort(() => Math.random() - 0.5);
        for (const key of candidates) {
            if (this.flooded.size >= this.maxFlooded) break;
            const [c, r] = key.split(',').map(Number);
            // BFS safety: check that flooding this tile doesn't disconnect start→goal
            const testGrid = this.terrain.grid.map(row => [...row]);
            testGrid[r][c] = Terrain.ROCK;
            for (const fk of this.flooded) {
                const [fc, fr] = fk.split(',').map(Number);
                testGrid[fr][fc] = Terrain.ROCK;
            }
            if (bfsReachable(testGrid, this.terrain.cols, this.terrain.rows,
                this.terrain.start, this.terrain.goal)) {
                this.flooded.add(key);
                if (!this.overlays.has(key)) {
                    const cx = c * TILE + TILE / 2;
                    const cy = r * TILE + TILE / 2;
                    // Container with solid water fill + wave lines for clear visibility
                    const overlay = this.scene.add.rectangle(cx, cy, TILE, TILE, 0x1858a0, 0.55);
                    this.mazeLayer.add(overlay);
                    // Animated wave lines on top
                    const waves = this.scene.add.graphics();
                    waves.lineStyle(2, 0x60b8e8, 0.7);
                    waves.strokeLineShape(new Phaser.Geom.Line(cx - 18, cy - 6, cx + 18, cy - 6));
                    waves.strokeLineShape(new Phaser.Geom.Line(cx - 12, cy + 6, cx + 12, cy + 6));
                    waves.lineStyle(1.5, 0x80d0f0, 0.5);
                    waves.strokeLineShape(new Phaser.Geom.Line(cx - 14, cy, cx + 14, cy));
                    this.mazeLayer.add(waves);
                    this.scene.tweens.add({
                        targets: waves, y: { from: 0, to: 3 }, yoyo: true,
                        repeat: -1, duration: 1400, ease: 'Sine.easeInOut',
                    });
                    this.scene.tweens.add({
                        targets: overlay, alpha: { from: 0.45, to: 0.65 },
                        yoyo: true, repeat: -1, duration: 1200, ease: 'Sine.easeInOut',
                    });
                    // Store overlay for cleanup; tag waves onto it
                    (overlay as any)._floodWaves = waves;
                    this.overlays.set(key, overlay);
                }
            }
        }
    }

    /** Permanently convert one OPEN edge tile adjacent to water into WATER. */
    private riseWater() {
        const grid = this.terrain.grid;
        const { cols, rows, start, goal } = this.terrain;
        const riseCandidates: { col: number; row: number }[] = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r][c] !== Terrain.OPEN) continue;
                if (c === start.col && r === start.row) continue;
                if (c === goal.col && r === goal.row) continue;
                const adjWater = [[0,-1],[0,1],[-1,0],[1,0]].some(([dc, dr]) => {
                    const nc = c + dc, nr = r + dr;
                    return nr >= 0 && nr < rows && nc >= 0 && nc < cols
                        && grid[nr][nc] === Terrain.WATER;
                });
                if (adjWater) riseCandidates.push({ col: c, row: r });
            }
        }
        for (const cand of riseCandidates.sort(() => Math.random() - 0.5)) {
            const testGrid = grid.map(r => [...r]);
            testGrid[cand.row][cand.col] = Terrain.WATER;
            for (const fk of this.flooded) {
                const [fc, fr] = fk.split(',').map(Number);
                testGrid[fr][fc] = Terrain.ROCK;
            }
            if (bfsReachable(testGrid, cols, rows, start, goal)) {
                grid[cand.row][cand.col] = Terrain.WATER;
                const cx = cand.col * TILE + TILE / 2;
                const cy = cand.row * TILE + TILE / 2;
                const waterOverlay = this.scene.add.rectangle(cx, cy, TILE, TILE, 0x1868a8, 0);
                this.mazeLayer.add(waterOverlay);
                this.risenTiles.push(waterOverlay);
                this.scene.tweens.add({
                    targets: waterOverlay, alpha: 0.85,
                    duration: 1500, ease: 'Sine.easeIn',
                });
                return;
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
        if (this.moveTimer) this.moveTimer.destroy();
        if (this.riseTimer) this.riseTimer.destroy();
        for (const cloud of this.clouds) cloud.gfx.destroy();
        this.clouds = [];
        for (const o of this.overlays.values()) {
            const waves = (o as any)._floodWaves as Phaser.GameObjects.Graphics | undefined;
            if (waves) waves.destroy();
            o.destroy();
        }
        this.overlays.clear();
        for (const o of this.risenTiles) o.destroy();
        this.risenTiles = [];
    }
}

// ── 3. Fall Wind Gusts ──────────────────────────────────────────────────────
// Grey wind clouds drift across the map. When the bear steps near a cloud,
// wind pushes the bear one tile away. Leaf piles hide OPEN tiles.

class WindHazard implements WeatherHazard {
    intensity: 1 | 2 | 3;
    private clouds: WeatherCloud[] = [];
    private terrain!: TerrainMap;
    private scene!: Phaser.Scene;
    private mazeLayer!: Phaser.GameObjects.Container;
    private moveTimer: Phaser.Time.TimerEvent | null = null;
    private windRange: number;
    private pushCooldown = 0;
    private leafPiles = new Map<string, Phaser.GameObjects.Container>();
    private hiddenBerries = new Set<string>();

    constructor(intensity: 1 | 2 | 3) {
        this.intensity = intensity;
        this.windRange = 1 + Math.floor(intensity / 3);
    }

    spawn(scene: Phaser.Scene, terrain: TerrainMap, mazeLayer: Phaser.GameObjects.Container) {
        this.scene = scene;
        this.terrain = terrain;
        this.mazeLayer = mazeLayer;

        const candidates = findCloudCandidates(terrain);
        const count = Math.min(this.intensity + 1, candidates.length);
        const shuffled = candidates.sort(() => Math.random() - 0.5);
        for (let i = 0; i < count; i++) {
            const { col, row } = shuffled[i];
            const dirIndex = Math.floor(Math.random() * 4);
            const gfx = this.buildCloud(scene, col, row, dirIndex);
            mazeLayer.add(gfx);
            this.clouds.push({ col, row, dirIndex, gfx });
        }

        const interval = Math.max(2500, 5000 - this.intensity * 800);
        this.moveTimer = scene.time.addEvent({
            delay: interval,
            callback: () => this.moveClouds(),
            loop: true,
        });

        log.info('weather', `wind clouds: ${count}, range=${this.windRange}, interval=${interval}ms`);

        // ── Leaf cover ──
        const leafCandidates: { col: number; row: number }[] = [];
        for (const zone of terrain.zones) {
            if (zone.type !== 'forest') continue;
            for (let r = zone.startRow + 1; r < zone.startRow + zone.height - 1; r++) {
                for (let c = 0; c < terrain.cols; c++) {
                    if (terrain.grid[r][c] !== Terrain.OPEN) continue;
                    if (c === terrain.start.col && r === terrain.start.row) continue;
                    if (c === terrain.goal.col && r === terrain.goal.row) continue;
                    leafCandidates.push({ col: c, row: r });
                }
            }
        }
        const leafCount = Math.min(3 + this.intensity * 2, leafCandidates.length);
        const leafShuffled = leafCandidates.sort(() => Math.random() - 0.5);
        for (let i = 0; i < leafCount; i++) {
            const { col: lc, row: lr } = leafShuffled[i];
            const key = `${lc},${lr}`;
            const cx = lc * TILE + TILE / 2;
            const cy = lr * TILE + TILE / 2;
            const leafContainer = scene.add.container(cx, cy);
            const g = scene.add.graphics();
            g.fillStyle(0x8b5e3c, 0.85);
            g.fillEllipse(0, 2, TILE * 0.7, TILE * 0.35);
            g.fillStyle(0xcc6622, 0.7);
            g.fillEllipse(-6, -2, TILE * 0.4, TILE * 0.25);
            g.fillEllipse(8, 4, TILE * 0.35, TILE * 0.22);
            g.fillStyle(0xdd8833, 0.5);
            g.fillEllipse(2, -4, TILE * 0.3, TILE * 0.2);
            leafContainer.add(g);
            leafContainer.setDepth(DEPTH.HAZARD - 1);
            mazeLayer.add(leafContainer);
            this.leafPiles.set(key, leafContainer);
        }
        // Hide berries under some leaf piles
        const berryCount = Math.min(1 + this.intensity, leafCount);
        const leafKeys = [...this.leafPiles.keys()].sort(() => Math.random() - 0.5);
        for (let i = 0; i < berryCount; i++) {
            this.hiddenBerries.add(leafKeys[i]);
        }
        log.info('weather', `leaf piles: ${leafCount}, hidden berries: ${berryCount}`);
    }

    private buildCloud(scene: Phaser.Scene, col: number, row: number, dirIndex: number): Phaser.GameObjects.Container {
        const cx = col * TILE + TILE / 2;
        const cy = row * TILE + TILE / 2;
        const container = scene.add.container(cx, cy);

        // Grey wind cloud
        const cc = 0x8899aa;
        container.add(scene.add.ellipse(0, 0, TILE * 0.7, TILE * 0.4, cc, 0.6));
        container.add(scene.add.ellipse(-TILE * 0.15, -TILE * 0.08, TILE * 0.45, TILE * 0.35, cc, 0.5));
        container.add(scene.add.ellipse(TILE * 0.15, -TILE * 0.06, TILE * 0.4, TILE * 0.3, cc, 0.5));

        // Wind direction arrow
        const dir = CLOUD_DIRS[dirIndex];
        const arrow = scene.add.text(dir.dx * TILE * 0.3, dir.dy * TILE * 0.3, dir.label, {
            fontSize: '16px', color: '#334455', fontStyle: 'bold',
        }).setOrigin(0.5);
        container.add(arrow);

        container.setDepth(DEPTH.HAZARD);
        addCloudBob(scene, container, cy);
        return container;
    }

    /** Wind clouds use custom movement to update direction arrows. */
    private moveClouds() {
        for (const cloud of this.clouds) {
            const dir = CLOUD_DIRS[cloud.dirIndex];
            const nc = cloud.col + dir.dx;
            const nr = cloud.row + dir.dy;

            if (nc < 0 || nc >= this.terrain.cols || nr < 0 || nr >= this.terrain.rows ||
                this.terrain.grid[nr][nc] === Terrain.ROCK ||
                this.terrain.grid[nr][nc] === Terrain.CLIFF ||
                this.terrain.grid[nr][nc] === Terrain.TREE ||
                this.terrain.grid[nr][nc] === Terrain.BAMBOO) {
                cloud.dirIndex = Math.floor(Math.random() * 4);
                const arrow = cloud.gfx.list[cloud.gfx.list.length - 1] as Phaser.GameObjects.Text;
                const newDir = CLOUD_DIRS[cloud.dirIndex];
                arrow.setText(newDir.label);
                arrow.setPosition(newDir.dx * TILE * 0.3, newDir.dy * TILE * 0.3);
                continue;
            }

            cloud.col = nc;
            cloud.row = nr;
            this.scene.tweens.add({
                targets: cloud.gfx,
                x: nc * TILE + TILE / 2, y: nr * TILE + TILE / 2,
                duration: 800, ease: 'Sine.easeInOut',
            });
        }
    }

    update() { /* timer-driven */ }
    isBlocked() { return false; }
    getMoveCost() { return 0; }

    revealLeaf(col: number, row: number): boolean {
        const key = `${col},${row}`;
        const pile = this.leafPiles.get(key);
        if (!pile) return false;
        this.scene.tweens.add({
            targets: pile, scaleX: 0.2, scaleY: 0.1, alpha: 0,
            duration: 300, ease: 'Power2',
            onComplete: () => pile.destroy(),
        });
        this.leafPiles.delete(key);
        return true;
    }

    hasHiddenBerry(col: number, row: number): boolean {
        const key = `${col},${row}`;
        if (this.hiddenBerries.has(key)) {
            this.hiddenBerries.delete(key);
            return true;
        }
        return false;
    }

    getHiddenBerryCount(): number {
        return this.hiddenBerries.size;
    }

    getWindPush(col: number, row: number): { dx: number; dy: number } | null {
        if (this.pushCooldown > 0) {
            this.pushCooldown--;
            return null;
        }

        for (const cloud of this.clouds) {
            const dist = Math.abs(col - cloud.col) + Math.abs(row - cloud.row);
            if (dist <= this.windRange) {
                const dcol = col - cloud.col;
                const drow = row - cloud.row;
                let push: { dx: number; dy: number };
                if (dcol === 0 && drow === 0) {
                    const d = CLOUD_DIRS[cloud.dirIndex];
                    push = { dx: d.dx, dy: d.dy };
                } else if (Math.abs(dcol) >= Math.abs(drow)) {
                    push = { dx: dcol > 0 ? 1 : -1, dy: 0 };
                } else {
                    push = { dx: 0, dy: drow > 0 ? 1 : -1 };
                }
                this.pushCooldown = 3;
                return push;
            }
        }
        return null;
    }

    getLabel(): string {
        const words = ['Gentle', 'Moderate', 'Strong'];
        return `${words[this.intensity - 1]} wind clouds (${this.clouds.length})`;
    }

    destroy() {
        if (this.moveTimer) this.moveTimer.destroy();
        for (const cloud of this.clouds) cloud.gfx.destroy();
        this.clouds = [];
        for (const pile of this.leafPiles.values()) pile.destroy();
        this.leafPiles.clear();
        this.hiddenBerries.clear();
    }
}

// ── 4. Summer Heat ──────────────────────────────────────────────────────────
// Heat haze clouds roam the map. Heat builds each step; stepping near a heat
// cloud doubles heat gain. Water cools you off. Overheating drains energy.

class HeatHazard implements WeatherHazard {
    intensity: 1 | 2 | 3;
    heat = 0;
    heatMax: number;
    private clouds: WeatherCloud[] = [];
    private scene!: Phaser.Scene;
    private terrain!: TerrainMap;
    private mazeLayer!: Phaser.GameObjects.Container;
    private moveTimer: Phaser.Time.TimerEvent | null = null;
    private heatBar: Phaser.GameObjects.Rectangle | null = null;
    private heatBarBg: Phaser.GameObjects.Rectangle | null = null;

    constructor(intensity: 1 | 2 | 3) {
        this.intensity = intensity;
        this.heatMax = 20 + intensity * 10; // 30, 40, 50
    }

    spawn(scene: Phaser.Scene, terrain: TerrainMap, mazeLayer: Phaser.GameObjects.Container) {
        this.scene = scene;
        this.terrain = terrain;
        this.mazeLayer = mazeLayer;

        const candidates = findCloudCandidates(terrain);
        const count = Math.min(this.intensity, candidates.length);
        const shuffled = candidates.sort(() => Math.random() - 0.5);
        for (let i = 0; i < count; i++) {
            const { col, row } = shuffled[i];
            const dirIndex = Math.floor(Math.random() * 4);
            const gfx = this.buildCloud(scene, col, row);
            mazeLayer.add(gfx);
            this.clouds.push({ col, row, dirIndex, gfx });
        }

        const interval = Math.max(4000, 8000 - this.intensity * 1500);
        this.moveTimer = scene.time.addEvent({
            delay: interval,
            callback: () => moveWeatherClouds(this.clouds, this.terrain, this.scene),
            loop: true,
        });

        log.info('weather', `heat clouds: ${count}, heatMax=${this.heatMax}, interval=${interval}ms`);
    }

    private buildCloud(scene: Phaser.Scene, col: number, row: number): Phaser.GameObjects.Container {
        const cx = col * TILE + TILE / 2;
        const cy = row * TILE + TILE / 2;
        const c = scene.add.container(cx, cy);

        // Orange/amber heat haze
        const e1 = scene.add.ellipse(0, 0, TILE * 0.7, TILE * 0.4, 0xdd8833, 0.35);
        const e2 = scene.add.ellipse(-6, -4, TILE * 0.4, TILE * 0.3, 0xffaa44, 0.25);
        const e3 = scene.add.ellipse(8, 2, TILE * 0.35, TILE * 0.25, 0xee9933, 0.3);
        c.add([e1, e2, e3]);

        // Shimmer tween
        scene.tweens.add({
            targets: [e1, e2, e3],
            alpha: { from: 0.2, to: 0.45 },
            yoyo: true, repeat: -1, duration: 800 + Math.random() * 400,
            ease: 'Sine.easeInOut',
        });

        c.setDepth(DEPTH.HAZARD);
        addCloudBob(scene, c, cy);
        return c;
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
        if (!grid || row < 0 || row >= grid.length || col < 0 || col >= grid[0].length) {
            return 0;
        }

        // Water tile = cool off completely
        if (grid[row][col] === Terrain.WATER) {
            this.heat = 0;
            this.updateHeatBar();
            return 0;
        }

        // Shade: OPEN tiles adjacent to BAMBOO gain heat at half rate
        const shaded = [[0,-1],[0,1],[-1,0],[1,0]].some(([dc, dr]) => {
            const nc = col + dc, nr = row + dr;
            return nr >= 0 && nr < grid.length && nc >= 0 && nc < grid[0].length
                && grid[nr][nc] === Terrain.BAMBOO;
        });
        const baseGain = shaded ? Math.max(1, Math.floor(this.intensity / 2)) : this.intensity;

        // Near a heat cloud: double heat gain
        const nearCloud = this.clouds.some(c =>
            Math.abs(col - c.col) + Math.abs(row - c.row) <= 2);
        const heatGain = nearCloud ? baseGain * 2 : baseGain;
        this.heat += heatGain;

        let extra = 0;
        if (this.heat >= this.heatMax) {
            extra = 3;
            this.heat = Math.floor(this.heatMax * 0.6);
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
        if (this.moveTimer) this.moveTimer.destroy();
        for (const cloud of this.clouds) cloud.gfx.destroy();
        this.clouds = [];
        this.heatBar?.destroy();
        this.heatBarBg?.destroy();
    }
}
