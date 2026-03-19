import Phaser from 'phaser';
import { TILE, MAX_COLS, MAX_ROWS, HEADER, PANEL } from '../constants';
import { DEPTH } from '../gameplay';
import { MONTHS_Y2, SeasonTheme } from '../seasons';
import { generateMountainMap, drawTerrain, Terrain, isWalkable, isCliff, bfsReachable, TerrainMap } from '../terrain';
import { FogOfWar } from '../fog';
import { statsEvents, STAT } from '../statsEmitter';
import { addWeather } from '../weather';
import { WALLS } from '../maze';
import { createY2PlayerSprite, buildY2ObjectiveSprite, ensureSparkleTexture } from '../sprites';
import { log } from '../logger';
import { WeatherHazard, createWeatherHazard, getIntensity } from '../weatherHazard';

function spaced(t: string): string { return t.toUpperCase().split('').join(' '); }

/** Time-of-day phases for Phase 9: Night Falls. */
const enum TimeOfDay { DAWN, MIDDAY, DUSK, NIGHT }

const CANVAS_W = MAX_COLS * TILE + PANEL;
const CANVAS_H = MAX_ROWS * TILE + HEADER;

/** Season-specific display info for Year Two. */
const Y2_INFO: Record<string, { subtitle: string; bear: string; bearColor: number; objLabel: string; objColor: number }> = {
    WinterY2: { subtitle: 'Arctic Winter',   bear: 'polar bear',  bearColor: 0xf0f4f8, objLabel: 'FISH',    objColor: 0xff8844 },
    SpringY2: { subtitle: 'Mountain Spring',  bear: 'brown bear',  bearColor: 0x8b5e3c, objLabel: 'HONEY',   objColor: 0xffcc22 },
    SummerY2: { subtitle: 'Bamboo Summer',    bear: 'panda',       bearColor: 0xf0f0f0, objLabel: 'BAMBOO',  objColor: 0x66bb44 },
    FallY2:   { subtitle: 'Forest Autumn',    bear: 'black bear',  bearColor: 0x2a2a30, objLabel: 'BERRIES', objColor: 0xcc2244 },
};

export default class GameY2Scene extends Phaser.Scene {
    private monthIndex = 0;
    private fromScene  = 'TitleScene';
    private cols = 10;
    private totalRows = 34;

    private gridX = 0;
    private gridY = 0;

    private mazeLayer!: Phaser.GameObjects.Container;
    private player!: Phaser.GameObjects.Container;
    private emitter!: Phaser.GameObjects.Particles.ParticleEmitter;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
    private moving = false;

    private terrain!: TerrainMap;
    private cells!: number[][];

    private energy = 100;
    private energyMax = 100;
    private energyBar!: Phaser.GameObjects.Rectangle;
    private energyBarBg!: Phaser.GameObjects.Rectangle;
    private energyText!: Phaser.GameObjects.Text;

    private objCollected = 0;
    private objTotal     = 0;
    private objText: Phaser.GameObjects.Text | null = null;
    private objDone = false;
    private goalLock: Phaser.GameObjects.Arc | null = null;
    private objSprites: Phaser.GameObjects.Container[] = [];
    private objPositions: { col: number; row: number }[] = [];

    // Bonus objectives (don't count toward goal unlock)
    private bonusCollected = 0;
    private bonusTotal     = 0;
    private bonusSprites: Phaser.GameObjects.Container[] = [];
    private bonusPositions: { col: number; row: number }[] = [];

    // Exploration tracking (for star rating)
    private visitedCells = new Set<string>();
    private totalReachable = 0;

    // Night Falls (Phase 9) — step-based day/night cycle
    private stepCount = 0;
    private nightThreshold = 80;  // steps before night falls (recalculated per level)
    private timeOfDay: TimeOfDay = TimeOfDay.DAWN;
    private baseFogRadius = 2;
    private tintOverlay: Phaser.GameObjects.Rectangle | null = null;
    private dayBar: Phaser.GameObjects.Rectangle | null = null;
    private dayBarBg: Phaser.GameObjects.Rectangle | null = null;
    private dayIcon: Phaser.GameObjects.Text | null = null;

    private fog!: FogOfWar;

    private startCol = 0;
    private startRow = 0;
    private goalCol  = 0;
    private goalRow  = 0;

    private sceneryBlocked = new Set<string>();
    private weatherHazard: WeatherHazard | null = null;
    private weatherText: Phaser.GameObjects.Text | null = null;

    // Snow caves (Winter) — ROCK tiles that give double rest recovery
    private snowCaves = new Set<string>();

    /** Horizontal offset — left-align the map so the camera can scroll. */
    private get offsetX() { return 0; }
    /** World X for a column. */
    private worldX(col: number) { return col * TILE + TILE / 2; }
    /** World Y for a row. No vertical centering — camera scrolls instead. */
    private worldY(row: number) { return row * TILE + TILE / 2 + HEADER; }

    constructor() { super('GameY2Scene'); }

    init(data: { monthIndex?: number; from?: string }) {
        this.monthIndex = data.monthIndex ?? 0;
        this.fromScene  = data.from ?? 'TitleScene';

        const cfg  = MONTHS_Y2[this.monthIndex];
        this.cols  = cfg.cols;

        this.objCollected   = 0;
        this.objTotal       = 0;
        this.objDone        = false;
        this.goalLock       = null;
        this.objText        = null;
        this.objSprites     = [];
        this.objPositions   = [];
        this.bonusCollected = 0;
        this.bonusTotal     = 0;
        this.bonusSprites   = [];
        this.bonusPositions = [];
        this.visitedCells   = new Set();
        this.totalReachable = 0;
        this.energy         = 100;
        this.moving         = false;
        this.sceneryBlocked = new Set();
        this.snowCaves      = new Set();
        this.stepCount      = 0;
        this.timeOfDay      = TimeOfDay.DAWN;
        this.tintOverlay    = null;
        this.dayBar         = null;
        this.dayBarBg       = null;
        this.dayIcon        = null;
    }

    create() {
        const cfg    = MONTHS_Y2[this.monthIndex];
        const season = cfg.season;
        log.info('scene', `create GameY2Scene month=${cfg.month} (${cfg.name}) season=${season.name} cols=${this.cols}`);

        this.cameras.main.setBackgroundColor(season.bgColor);

        // ── Generate terrain ────────────────────────────────────────────────────
        this.terrain   = generateMountainMap(this.cols, cfg.rows, season.name);
        this.totalRows = this.terrain.rows;
        this.startCol  = this.terrain.start.col;
        this.startRow  = this.terrain.start.row;
        this.goalCol   = this.terrain.goal.col;
        this.goalRow   = this.terrain.goal.row;

        // Wall bitmask grid — outer walls only (boundary enforcement)
        this.cells = [];
        for (let r = 0; r < this.totalRows; r++) {
            this.cells[r] = [];
            for (let c = 0; c < this.cols; c++) {
                let w = 0;
                if (r === 0)                w |= WALLS.TOP;
                if (r === this.totalRows - 1) w |= WALLS.BOTTOM;
                if (c === 0)                w |= WALLS.LEFT;
                if (c === this.cols - 1)    w |= WALLS.RIGHT;
                this.cells[r][c] = w;
            }
        }

        // ── Terrain layer ───────────────────────────────────────────────────────
        this.mazeLayer = this.add.container(this.offsetX, HEADER);
        drawTerrain(this, this.terrain, season, this.mazeLayer);

        // Goal tile
        this.mazeLayer.add(
            this.add.rectangle(
                this.goalCol * TILE + TILE / 2, this.goalRow * TILE + TILE / 2,
                TILE, TILE, season.goalColor, 0.5,
            )
        );

        // Goal lock
        this.goalLock = this.add.circle(
            this.worldX(this.goalCol), this.worldY(this.goalRow),
            TILE / 2 - 2, 0x000000, 0.45,
        ).setDepth(DEPTH.GOAL_LOCK);

        // Spawn objectives on land cells
        this.spawnObjectives(season);

        // Weather particles + hazard
        addWeather(this, season.name);
        this.weatherHazard = createWeatherHazard(season.name, getIntensity(this.monthIndex));
        this.weatherHazard?.spawn(this, this.terrain, this.mazeLayer);

        // Fall: hidden berries under leaf piles count toward bonus total
        const hiddenBerryCount = this.weatherHazard?.getHiddenBerryCount?.() ?? 0;
        if (hiddenBerryCount > 0) {
            this.bonusTotal += hiddenBerryCount;
            this.updateObjText();
        }

        // Winter: snow caves — pick reachable ROCK tiles adjacent to OPEN
        if (season.name === 'WinterY2') this.spawnSnowCaves();

        // Sparkle texture
        ensureSparkleTexture(this);

        // ── Player ──────────────────────────────────────────────────────────────
        this.gridX = this.startCol;
        this.gridY = this.startRow;
        this.player = createY2PlayerSprite(this, this.worldX(this.startCol), this.worldY(this.startRow), season.name);
        this.player.setDepth(DEPTH.PLAYER);

        // Trail
        this.emitter = this.add.particles(this.player.x, this.player.y, 'sparkle', {
            scale: { start: 0.5, end: 0 }, alpha: { start: 0.6, end: 0 },
            speed: { min: 4, max: 20 }, angle: { min: 0, max: 360 },
            lifespan: 400, frequency: 65, quantity: 1,
            tint: [0xffffff, 0xddeeff, 0xaaccff],
            blendMode: Phaser.BlendModes.ADD,
        }).setDepth(DEPTH.TRAIL);

        // ── Camera scrolling (both axes) ──────────────────────────────────────
        const mapW  = this.cols * TILE;
        const worldW = Math.max(CANVAS_W, mapW + PANEL);
        const worldH = this.totalRows * TILE + HEADER;
        this.cameras.main.setBounds(0, 0, worldW, worldH);
        this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
        this.cameras.main.setDeadzone(TILE * 3, TILE * 4);

        // ── Fog of war ──────────────────────────────────────────────────────────
        // Winter blizzard fog: visibility shrinks with intensity
        const fogRadius = season.name === 'WinterY2'
            ? 5 - getIntensity(this.monthIndex) // intensity 1→4, 2→3, 3→2
            : 2;
        this.fog = new FogOfWar(
            this, this.cols, this.totalRows, true, season,
            (c) => this.worldX(c), (r) => this.worldY(r),
            fogRadius,
        );
        this.fog.revealAround(this.startCol, this.startRow, this.time.now);

        // ── Exploration tracking ──────────────────────────────────────────────────
        this.totalReachable = this.countReachable();
        this.visitedCells.add(`${this.startCol},${this.startRow}`);

        // ── Night Falls — step threshold ──────────────────────────────────────────
        // Generous enough to complete normally, but exploring for bonus/3★ risks nightfall
        const objCount = Math.min(2 + Math.floor(this.monthIndex / 3), 5);
        const baseSteps = this.totalReachable * 0.6 + objCount * 8;
        const intensityPenalty = getIntensity(this.monthIndex) * 8;
        this.nightThreshold = Math.round(baseSteps - intensityPenalty);
        this.baseFogRadius = fogRadius;

        // Tint overlay — covers entire screen, fades in with day progression
        this.tintOverlay = this.add.rectangle(
            CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 2, CANVAS_H * 2, 0x000000, 0,
        ).setDepth(DEPTH.FOG - 0.1).setScrollFactor(0);

        // ── UI (fixed on screen via scrollFactor 0) ─────────────────────────────
        this.buildHeader(season, cfg);
        this.buildSidePanel(season);

        // ── Input ───────────────────────────────────────────────────────────────
        this.cursors = this.input.keyboard!.createCursorKeys();
        this.wasd = {
            up:    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            down:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            left:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        };
        this.input.keyboard!.addKey('R').on('down', () => {
            this.destroyAll();
            this.cameras.main.fadeOut(350, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart());
        });
        this.input.keyboard!.addKey('M').on('down', () => {
            this.destroyAll();
            this.cameras.main.fadeOut(500, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(this.fromScene));
        });

        // Stats
        statsEvents.emit(STAT.MAZE_START, {
            month: cfg.month, gridSize: `${this.cols}x${this.totalRows}`, hard: true, custom: false,
        });

        // Clean up on shutdown (scene.start on same scene triggers this)
        this.events.once('shutdown', () => {
            this.destroyAll();
            this.tweens.killAll();
            this.time.removeAllEvents();
        });

        this.cameras.main.fadeIn(900, 0, 0, 0);
    }

    // ── Update ─────────────────────────────────────────────────────────────────
    update() {
        if (this.moving) return;
        this.fog.updateDecay(this.time.now);
        this.weatherHazard?.update(this.time.now, this.gridX, this.gridY);
        this.updateWeatherText();

        // SPACE = voluntary rest (recover partial energy, costs a turn)
        if (Phaser.Input.Keyboard.JustDown(this.cursors.space)) {
            if (this.energy < this.energyMax) this.onVoluntaryRest();
            return;
        }

        let dx = 0, dy = 0;
        if (Phaser.Input.Keyboard.JustDown(this.cursors.left)  || Phaser.Input.Keyboard.JustDown(this.wasd.left))  dx = -1;
        if (Phaser.Input.Keyboard.JustDown(this.cursors.right) || Phaser.Input.Keyboard.JustDown(this.wasd.right)) dx =  1;
        if (Phaser.Input.Keyboard.JustDown(this.cursors.up)    || Phaser.Input.Keyboard.JustDown(this.wasd.up))    dy = -1;
        if (Phaser.Input.Keyboard.JustDown(this.cursors.down)  || Phaser.Input.Keyboard.JustDown(this.wasd.down))  dy =  1;
        if (dx === 0 && dy === 0) return;
        if (dx !== 0 && dy !== 0) dy = 0;

        this.tryStep(dx, dy);
    }

    private tryStep(dx: number, dy: number) {
        const nx = this.gridX + dx, ny = this.gridY + dy;
        if (nx < 0 || nx >= this.cols || ny < 0 || ny >= this.totalRows) return;

        // Cliff fall — stepping onto cliff edge costs a life
        if (isCliff(this.terrain.grid, nx, ny, this.cols, this.totalRows)) {
            this.onCliffFall();
            return;
        }

        // Allow walking on OPEN and WATER (swimming)
        if (!isWalkable(this.terrain.grid, nx, ny, this.cols, this.totalRows, true)) return;

        // Spring flooding — blocked tile
        if (this.weatherHazard?.isBlocked(nx, ny)) return;

        const onWater = this.terrain.grid[ny][nx] === Terrain.WATER;
        const duration = onWater ? 320 : 180;

        this.gridX = nx;
        this.gridY = ny;
        this.moving = true;
        this.visitedCells.add(`${nx},${ny}`);

        this.tweens.add({
            targets: this.player,
            x: this.worldX(nx), y: this.worldY(ny),
            duration, ease: 'Sine.easeOut',
            onComplete: () => {
                this.emitter.setPosition(this.player.x, this.player.y);
                this.fog.revealAround(this.gridX, this.gridY, this.time.now);
                this.advanceDayClock();
                this.drainEnergy(onWater ? 2 : 1);

                // Weather: extra move cost (snowdrifts, heat)
                const extraCost = this.weatherHazard?.getMoveCost(nx, ny, this.terrain.grid) ?? 0;
                if (extraCost > 0) this.drainEnergy(extraCost);

                // Reveal leaf piles (Fall) — may hide berries
                const hadLeaf = this.weatherHazard?.revealLeaf?.(nx, ny);
                if (hadLeaf && this.weatherHazard?.hasHiddenBerry?.(nx, ny)) {
                    this.collectHiddenBerry(nx, ny);
                }

                // If energy hit 0, forced rest is in progress — don't unlock movement
                // but still check for objectives/goal at this tile
                if (this.energy <= 0) {
                    this.tryCollectObjective();
                    return;
                }

                // Weather: wind push
                const push = this.weatherHazard?.getWindPush(nx, ny);
                if (push) {
                    this.applyWindPush(push.dx, push.dy);
                    return; // applyWindPush handles moving=false
                }

                this.moving = false;
                this.tryCollectObjective();
                this.checkGoal();
            },
        });
    }

    // ── Cliff fall ──────────────────────────────────────────────────────────────
    private onCliffFall() {
        statsEvents.emit(STAT.CAUGHT);
        this.moving = true;

        // Find the narrows zone the player is in/near and reset to its entry row
        const zone = this.terrain.zones.find(z =>
            z.type === 'narrows' &&
            this.gridY >= z.startRow && this.gridY < z.startRow + z.height);
        const resetRow = zone ? zone.startRow + zone.height - 1 : this.startRow;

        // Find an OPEN cell in the reset row (scan from center outward)
        let resetCol = Math.floor(this.cols / 2);
        const grid = this.terrain.grid;
        if (grid[resetRow][resetCol] !== Terrain.OPEN) {
            for (let d = 1; d < this.cols; d++) {
                if (resetCol - d >= 0 && grid[resetRow][resetCol - d] === Terrain.OPEN) {
                    resetCol = resetCol - d; break;
                }
                if (resetCol + d < this.cols && grid[resetRow][resetCol + d] === Terrain.OPEN) {
                    resetCol = resetCol + d; break;
                }
            }
        }

        this.gridX = resetCol;
        this.gridY = resetRow;
        this.player.setPosition(this.worldX(resetCol), this.worldY(resetRow));
        this.emitter.setPosition(this.player.x, this.player.y);
        this.fog.revealAround(resetCol, resetRow, this.time.now);

        // Drain energy after repositioning — may trigger forced rest
        this.drainEnergy(35);
        if (this.energy > 0) this.moving = false;
    }

    // ── Energy system ─────────────────────────────────────────────────────────
    private drainEnergy(amount: number) {
        const drain = this.timeOfDay === TimeOfDay.NIGHT ? amount * 2 : amount;
        this.energy = Math.max(0, this.energy - drain);
        this.updateEnergyBar();
        if (this.energy <= 0) {
            this.onRest();
        }
    }

    // ── Snow caves (Winter) ──────────────────────────────────────────────────────
    private spawnSnowCaves() {
        const grid = this.terrain.grid;
        const candidates: { col: number; row: number }[] = [];
        for (let r = 0; r < this.totalRows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (grid[r][c] !== Terrain.ROCK) continue;
                // Must be adjacent to at least one OPEN tile
                const adjOpen = [[0,-1],[0,1],[-1,0],[1,0]].some(([dc, dr]) => {
                    const nc = c + dc, nr = r + dr;
                    return nr >= 0 && nr < this.totalRows && nc >= 0 && nc < this.cols
                        && grid[nr][nc] === Terrain.OPEN;
                });
                if (adjOpen) candidates.push({ col: c, row: r });
            }
        }
        const count = Math.min(2 + Math.floor(this.monthIndex / 4), 4, candidates.length);
        const shuffled = candidates.sort(() => Math.random() - 0.5);
        for (let i = 0; i < count; i++) {
            const { col, row } = shuffled[i];
            this.snowCaves.add(`${col},${row}`);
            // Draw cave entrance overlay
            const cx = col * TILE + TILE / 2;
            const cy = row * TILE + TILE / 2;
            const g = this.add.graphics();
            // Dark cave mouth
            g.fillStyle(0x0a0808, 0.85);
            g.fillEllipse(cx, cy + TILE * 0.15, TILE * 0.55, TILE * 0.45);
            // Snow cap above
            g.fillStyle(0xe8eef4, 0.8);
            g.fillEllipse(cx, cy - TILE * 0.15, TILE * 0.6, TILE * 0.2);
            g.setDepth(DEPTH.SCENERY);
            this.mazeLayer.add(g);
        }
        log.info('scene', `snow caves: ${count}`);
    }

    /** True if player is adjacent to a snow cave tile. */
    private isOnSnowCave(): boolean {
        for (const [dc, dr] of [[0,-1],[0,1],[-1,0],[1,0],[0,0]]) {
            if (this.snowCaves.has(`${this.gridX + dc},${this.gridY + dr}`)) return true;
        }
        return false;
    }

    // ── Hidden berry (Fall leaf piles) ────────────────────────────────────────
    private collectHiddenBerry(col: number, row: number) {
        this.bonusCollected++;
        this.updateObjText();
        // Brief berry sprite at the reveal position
        const bx = col * TILE + TILE / 2;
        const by = row * TILE + TILE / 2;
        const berry = this.add.circle(bx, by, 8, 0xcc2244, 0.9).setDepth(DEPTH.SPRITE);
        this.mazeLayer.add(berry);
        this.tweens.add({
            targets: berry, scaleX: 1.8, scaleY: 1.8, alpha: 0,
            duration: 500, ease: 'Power2',
            onComplete: () => berry.destroy(),
        });
        this.tweens.add({ targets: this.player, scaleY: 1.15, yoyo: true, duration: 120 });
    }

    // ── Night Falls ─────────────────────────────────────────────────────────────
    private advanceDayClock() {
        this.stepCount++;
        const frac = this.stepCount / this.nightThreshold;

        let newPhase: TimeOfDay;
        if      (frac < 0.4)  newPhase = TimeOfDay.DAWN;
        else if (frac < 0.8)  newPhase = TimeOfDay.MIDDAY;
        else if (frac < 1.0)  newPhase = TimeOfDay.DUSK;
        else                  newPhase = TimeOfDay.NIGHT;

        if (newPhase !== this.timeOfDay) {
            this.timeOfDay = newPhase;
            this.applyTimeOfDay();
        }

        this.updateDayBar();
    }

    private applyTimeOfDay() {
        // Tint overlay
        if (this.tintOverlay) {
            let color: number, alpha: number;
            switch (this.timeOfDay) {
                case TimeOfDay.DAWN:   color = 0x000000; alpha = 0;    break;
                case TimeOfDay.MIDDAY: color = 0x000000; alpha = 0;    break;
                case TimeOfDay.DUSK:   color = 0x331800; alpha = 0.15; break;
                case TimeOfDay.NIGHT:  color = 0x000822; alpha = 0.35; break;
            }
            // Preserve current alpha while changing the fill color —
            // setFillStyle(color) without an alpha arg resets fill alpha to 1,
            // which causes a dark flash before the tween kicks in.
            this.tintOverlay.setFillStyle(color, this.tintOverlay.alpha);
            this.tweens.add({
                targets: this.tintOverlay,
                alpha,
                duration: 1200,
                ease: 'Sine.easeInOut',
            });
        }

        // Fog radius shrinks at dusk/night
        let fogR: number;
        switch (this.timeOfDay) {
            case TimeOfDay.DAWN:   fogR = this.baseFogRadius;     break;
            case TimeOfDay.MIDDAY: fogR = this.baseFogRadius;     break;
            case TimeOfDay.DUSK:   fogR = Math.max(1, this.baseFogRadius - 1); break;
            case TimeOfDay.NIGHT:  fogR = 1;                       break;
        }
        this.fog.setRevealRadius(fogR);

        // Day icon update
        if (this.dayIcon) {
            switch (this.timeOfDay) {
                case TimeOfDay.DAWN:   this.dayIcon.setText('☀').setColor('#ffdd44'); break;
                case TimeOfDay.MIDDAY: this.dayIcon.setText('☀').setColor('#ffcc22'); break;
                case TimeOfDay.DUSK:   this.dayIcon.setText('☀').setColor('#ff8833'); break;
                case TimeOfDay.NIGHT:  this.dayIcon.setText('☽').setColor('#8899cc'); break;
            }
        }
    }

    private updateDayBar() {
        if (!this.dayBar || !this.dayBarBg) return;
        const frac = Math.min(1, this.stepCount / this.nightThreshold);
        const fullW = this.dayBarBg.width;
        this.dayBar.width = fullW * (1 - frac);  // shrinks as night approaches

        // Color shifts: yellow → orange → blue
        if (frac < 0.8) {
            const t = frac / 0.8;  // 0→1 over dawn to dusk
            const r = Math.round(255 - t * 80);
            const g = Math.round(220 - t * 120);
            const b = Math.round(60  + t * 40);
            this.dayBar.setFillStyle(Phaser.Display.Color.GetColor(r, g, b));
        } else {
            const t = (frac - 0.8) / 0.2;
            const r = Math.round(175 - t * 100);
            const g = Math.round(100 - t * 50);
            const b = Math.round(100 + t * 100);
            this.dayBar.setFillStyle(Phaser.Display.Color.GetColor(r, g, b));
        }
    }

    /** Close the bear's eyes (replace eye circles with thin closed-eye lines). */
    private closeEyes(): Phaser.GameObjects.Graphics | null {
        const visual = this.player.list[0] as Phaser.GameObjects.Container;
        if (!visual) return null;
        // Find the two eye circles by scanning for small circles near y=-10/-11
        const eyes: Phaser.GameObjects.Arc[] = [];
        for (const child of visual.list) {
            if (child instanceof Phaser.GameObjects.Arc &&
                child.y <= -9 && child.y >= -12 &&
                child.radius <= 3 && child.radius >= 1) {
                eyes.push(child);
            }
        }
        if (eyes.length < 2) return null;
        // Hide open eyes
        for (const eye of eyes) eye.setVisible(false);
        // Draw closed eyes (small curved lines)
        const g = this.add.graphics();
        for (const eye of eyes) {
            g.lineStyle(2, 0x222222, 0.9);
            g.beginPath();
            g.arc(eye.x, eye.y, 3, 0, Math.PI, false);
            g.strokePath();
        }
        visual.add(g);
        return g;
    }

    /** Reopen the bear's eyes (restore eye circles, remove closed-eye graphics). */
    private openEyes(closedGfx: Phaser.GameObjects.Graphics | null) {
        const visual = this.player.list[0] as Phaser.GameObjects.Container;
        if (!visual) return;
        for (const child of visual.list) {
            if (child instanceof Phaser.GameObjects.Arc &&
                child.y <= -9 && child.y >= -12 &&
                child.radius <= 3 && child.radius >= 1) {
                child.setVisible(true);
            }
        }
        if (closedGfx) {
            closedGfx.destroy();
        }
    }

    /** Voluntary rest (SPACE) — quick nap, recovers 30 energy (60 near snow cave). */
    private onVoluntaryRest() {
        const shelter = this.isOnSnowCave();
        const recovery = shelter ? 60 : 30;
        log.info('scene', `voluntary rest${shelter ? ' (snow cave)' : ''}`);
        this.moving = true;

        const closedEyes = this.closeEyes();

        const zx = this.player.x + 20;
        const zy = this.player.y - 30;
        const zzzText = shelter ? 'zz ❄' : 'zz';
        const zzzColor = shelter ? '#aaeeff' : '#aaccff';
        const zzz = this.add.text(zx, zy, zzzText, {
            fontSize: '16px', fontStyle: 'italic', color: zzzColor,
        }).setOrigin(0.5).setDepth(DEPTH.PLAYER + 1);
        this.tweens.add({ targets: zzz, y: zy - 20, alpha: { from: 1, to: 0.3 },
            duration: 1600, ease: 'Sine.easeOut' });

        this.tweens.add({ targets: this.player, scaleY: 0.9, yoyo: true,
            duration: 1000, ease: 'Sine.easeInOut' });

        this.time.delayedCall(2000, () => {
            zzz.destroy();
            this.openEyes(closedEyes);
            this.energy = Math.min(this.energyMax, this.energy + recovery);
            this.updateEnergyBar();
            this.moving = false;
        });
    }

    /** Forced rest (energy = 0) — longer nap, full recovery (faster near snow cave). */
    private onRest() {
        const shelter = this.isOnSnowCave();
        const duration = shelter ? 3000 : 5000;
        log.info('scene', `bear exhausted — forced rest${shelter ? ' (snow cave)' : ''}`);
        this.moving = true;

        const closedEyes = this.closeEyes();

        const zx = this.player.x + 20;
        const zy = this.player.y - 30;
        const zzzText = shelter ? 'zzz ❄' : 'zzz';
        const zzzColor = shelter ? '#aaeeff' : '#aaccff';
        const zzz = this.add.text(zx, zy, zzzText, {
            fontSize: '20px', fontStyle: 'italic', color: zzzColor,
        }).setOrigin(0.5).setDepth(DEPTH.PLAYER + 1);
        this.tweens.add({ targets: zzz, y: zy - 30, alpha: { from: 1, to: 0.3 },
            duration: duration * 0.8, ease: 'Sine.easeOut' });

        this.tweens.add({ targets: this.player, scaleY: 0.85, yoyo: true,
            duration: shelter ? 1500 : 2000, ease: 'Sine.easeInOut', repeat: 1 });

        this.time.delayedCall(duration, () => {
            zzz.destroy();
            this.openEyes(closedEyes);
            this.energy = this.energyMax;
            this.updateEnergyBar();
            this.moving = false;
        });
    }

    // ── Wind push ────────────────────────────────────────────────────────────
    private applyWindPush(dx: number, dy: number) {
        const nx = this.gridX + dx, ny = this.gridY + dy;
        // Only push if destination is safe
        if (nx < 0 || nx >= this.cols || ny < 0 || ny >= this.totalRows) {
            this.moving = false; this.tryCollectObjective(); this.checkGoal(); return;
        }
        if (!isWalkable(this.terrain.grid, nx, ny, this.cols, this.totalRows, true) ||
            isCliff(this.terrain.grid, nx, ny, this.cols, this.totalRows) ||
            (this.weatherHazard?.isBlocked(nx, ny))) {
            this.moving = false; this.tryCollectObjective(); this.checkGoal(); return;
        }

        this.gridX = nx;
        this.gridY = ny;
        this.tweens.add({
            targets: this.player,
            x: this.worldX(nx), y: this.worldY(ny),
            duration: 150, ease: 'Back.easeOut',
            onComplete: () => {
                this.moving = false;
                this.emitter.setPosition(this.player.x, this.player.y);
                this.fog.revealAround(this.gridX, this.gridY, this.time.now);
                this.tryCollectObjective();
                this.checkGoal();
            },
        });
    }

    private updateWeatherText() {
        if (this.weatherText && this.weatherHazard) {
            this.weatherText.setText(this.weatherHazard.getLabel());
        }
    }

    // ── Objectives ─────────────────────────────────────────────────────────────
    private spawnObjectives(season: SeasonTheme) {
        const grid = this.terrain.grid;
        const { cols } = this.terrain;
        const rows = this.totalRows;
        const notStartGoal = (c: { col: number; row: number }) =>
            !(c.col === this.startCol && c.row === this.startRow) &&
            !(c.col === this.goalCol  && c.row === this.goalRow);

        // Adjacency helper — true if any neighbour is the given terrain type
        const adjTo = (col: number, row: number, t: Terrain) =>
            [[0,-1],[0,1],[-1,0],[1,0]].some(([dc,dr]) => {
                const nc = col + dc, nr = row + dr;
                return nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === t;
            });

        // Build season-appropriate candidates
        let candidates: { col: number; row: number }[];

        switch (season.name) {
            case 'WinterY2': {
                // Fish spawn on WATER cells in water zones
                candidates = [];
                for (const zone of this.terrain.zones) {
                    if (zone.type !== 'water') continue;
                    for (let r = zone.startRow; r < zone.startRow + zone.height; r++) {
                        for (let c = 0; c < cols; c++) {
                            if (grid[r][c] === Terrain.WATER) candidates.push({ col: c, row: r });
                        }
                    }
                }
                break;
            }
            case 'SpringY2': {
                // Honey spawns on OPEN cells adjacent to TREE cells
                candidates = this.terrain.landCells.filter(c =>
                    notStartGoal(c) && grid[c.row][c.col] === Terrain.OPEN && adjTo(c.col, c.row, Terrain.TREE),
                );
                break;
            }
            case 'SummerY2': {
                // Bamboo shoots spawn on OPEN cells adjacent to BAMBOO cells
                candidates = this.terrain.landCells.filter(c =>
                    notStartGoal(c) && grid[c.row][c.col] === Terrain.OPEN && adjTo(c.col, c.row, Terrain.BAMBOO),
                );
                break;
            }
            case 'FallY2': {
                // Berries spawn on OPEN cells in forest zones
                candidates = [];
                for (const zone of this.terrain.zones) {
                    if (zone.type !== 'forest') continue;
                    for (const lc of this.terrain.landCells) {
                        if (lc.row >= zone.startRow && lc.row < zone.startRow + zone.height &&
                            grid[lc.row][lc.col] === Terrain.OPEN && notStartGoal(lc)) {
                            candidates.push(lc);
                        }
                    }
                }
                break;
            }
            default: {
                candidates = this.terrain.landCells.filter(c =>
                    notStartGoal(c) && grid[c.row][c.col] === Terrain.OPEN,
                );
            }
        }

        // Spread across zones
        const count = Math.min(2 + Math.floor(this.monthIndex / 3), 5);
        const picked: { col: number; row: number }[] = [];

        // For each zone that has candidates, pick one
        for (const zone of this.terrain.zones) {
            if (picked.length >= count) break;
            const inZone = candidates.filter(c =>
                c.row >= zone.startRow && c.row < zone.startRow + zone.height &&
                !picked.some(p => p.col === c.col && p.row === c.row),
            );
            if (inZone.length > 0) {
                picked.push(inZone[Math.floor(Math.random() * inZone.length)]);
            }
        }
        // Fill remaining from all candidates
        const remaining = candidates.filter(c => !picked.some(p => p.col === c.col && p.row === c.row));
        while (picked.length < count && remaining.length > 0) {
            const idx = Math.floor(Math.random() * remaining.length);
            picked.push(remaining[idx]);
            remaining.splice(idx, 1);
        }

        this.objTotal = picked.length;
        for (const pos of picked) {
            const cx = pos.col * TILE + TILE / 2;
            const cy = pos.row * TILE + TILE / 2;
            const sprite = buildY2ObjectiveSprite(this, cx, cy, season.name);
            this.mazeLayer.add(sprite);
            this.objSprites.push(sprite);
            this.objPositions.push(pos);
        }

        // ── Bonus objectives — placed in dead-end spurs and off-trail areas ──
        const usedKeys = new Set(picked.map(p => `${p.col},${p.row}`));
        usedKeys.add(`${this.startCol},${this.startRow}`);
        usedKeys.add(`${this.goalCol},${this.goalRow}`);
        const bonusCandidates = candidates.filter(c => !usedKeys.has(`${c.col},${c.row}`));
        // Prefer cells far from the main path (dead-end spurs)
        const bonusCount = Math.min(1 + Math.floor(this.monthIndex / 4), 3, bonusCandidates.length);
        const bonusShuffled = bonusCandidates.sort(() => Math.random() - 0.5);
        for (let i = 0; i < bonusCount; i++) {
            const pos = bonusShuffled[i];
            const cx = pos.col * TILE + TILE / 2;
            const cy = pos.row * TILE + TILE / 2;
            const sprite = buildY2ObjectiveSprite(this, cx, cy, season.name);
            // Make bonus objectives slightly smaller + sparkly tint
            sprite.setScale(0.75);
            sprite.setAlpha(0.85);
            this.mazeLayer.add(sprite);
            this.bonusSprites.push(sprite);
            this.bonusPositions.push(pos);
        }
        this.bonusTotal = bonusCount;
        this.updateObjText();
    }

    private tryCollectObjective() {
        // Check required objectives
        for (let i = this.objSprites.length - 1; i >= 0; i--) {
            const pos = this.objPositions[i];
            if (pos.col === this.gridX && pos.row === this.gridY) {
                this.objSprites[i].destroy();
                this.objSprites.splice(i, 1);
                this.objPositions.splice(i, 1);
                this.objCollected++;
                statsEvents.emit(STAT.OBJ_COMPLETED);
                this.updateObjText();
                if (this.objCollected >= this.objTotal) {
                    this.objDone = true;
                    if (this.goalLock) { this.goalLock.destroy(); this.goalLock = null; }
                }
                this.tweens.add({ targets: this.player, scaleY: 1.2, yoyo: true, duration: 150 });
                return;
            }
        }
        // Check bonus objectives
        for (let i = this.bonusSprites.length - 1; i >= 0; i--) {
            const pos = this.bonusPositions[i];
            if (pos.col === this.gridX && pos.row === this.gridY) {
                this.bonusSprites[i].destroy();
                this.bonusSprites.splice(i, 1);
                this.bonusPositions.splice(i, 1);
                this.bonusCollected++;
                this.updateObjText();
                this.tweens.add({ targets: this.player, scaleY: 1.15, yoyo: true, duration: 120 });
                return;
            }
        }
    }

    // ── Goal ───────────────────────────────────────────────────────────────────
    private checkGoal() {
        if (this.gridX !== this.goalCol || this.gridY !== this.goalRow) return;
        if (!this.objDone) return;
        statsEvents.emit(STAT.MAZE_COMPLETE);
        this.moving = true;

        const stars = this.getStars();
        const explorePct = this.totalReachable > 0
            ? Math.round(this.visitedCells.size / this.totalReachable * 100) : 0;
        const cfg = MONTHS_Y2[this.monthIndex];
        log.info('scene', `goal reached: stars=${stars}, explore=${explorePct}%, bonus=${this.bonusCollected}/${this.bonusTotal}`);

        // Show star result briefly
        const starStr = '★'.repeat(stars) + '☆'.repeat(3 - stars);
        const resultText = this.add.text(
            (CANVAS_W - PANEL) / 2, HEADER + 60,
            `${starStr}\n${this.objCollected}/${this.objTotal} food  +${this.bonusCollected} bonus  ${explorePct}% explored`,
            { fontSize: '20px', color: '#ffe066', align: 'center', lineSpacing: 8 },
        ).setOrigin(0.5).setDepth(DEPTH.PANEL + 10).setScrollFactor(0).setAlpha(0);
        this.tweens.add({ targets: resultText, alpha: 1, duration: 400 });

        const last = this.monthIndex >= MONTHS_Y2.length - 1;
        const nextMonth = this.monthIndex + 1;

        // Season intro tutorials trigger before the first month of each new season
        const SEASON_INTRO_MONTHS: Record<number, string> = {
            2: 'SpringY2', 5: 'SummerY2', 8: 'FallY2',
        };
        const seasonIntro = SEASON_INTRO_MONTHS[nextMonth];

        let nextScene: string;
        let nextData: Record<string, unknown>;
        if (last) {
            nextScene = 'EndScene';
            nextData = { stars, explorePct, bonusCollected: this.bonusCollected, bonusTotal: this.bonusTotal };
        } else if (seasonIntro) {
            nextScene = 'TutorialY2Scene';
            nextData = { seasonIntro, targetMonthIndex: nextMonth, from: this.fromScene };
        } else {
            nextScene = 'GameY2Scene';
            nextData = { monthIndex: nextMonth, from: this.fromScene };
        }

        this.time.delayedCall(1800, () => {
            this.destroyAll();
            this.cameras.main.fadeOut(800, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.cameras.main.resetFX();
                this.scene.start(nextScene, nextData);
            });
        });
    }

    private destroyAll() {
        for (const s of this.objSprites) s.destroy();
        for (const s of this.bonusSprites) s.destroy();
        this.weatherHazard?.destroy();
    }

    /** Count all OPEN + WATER cells reachable from start via BFS. */
    private countReachable(): number {
        const grid = this.terrain.grid;
        const visited = new Set<number>();
        const key = (c: number, r: number) => r * this.cols + c;
        const queue: [number, number][] = [[this.startCol, this.startRow]];
        visited.add(key(this.startCol, this.startRow));
        while (queue.length > 0) {
            const [c, r] = queue.shift()!;
            for (const [dc, dr] of [[0,-1],[0,1],[-1,0],[1,0]]) {
                const nc = c + dc, nr = r + dr;
                if (nc < 0 || nc >= this.cols || nr < 0 || nr >= this.totalRows) continue;
                const k = key(nc, nr);
                if (visited.has(k)) continue;
                const t = grid[nr][nc];
                if (t === Terrain.OPEN || t === Terrain.WATER) {
                    visited.add(k);
                    queue.push([nc, nr]);
                }
            }
        }
        return visited.size;
    }

    /** Calculate star rating: 1=complete, 2=all bonus, 3=all bonus + 80% explored. */
    private getStars(): number {
        if (this.bonusTotal > 0 && this.bonusCollected >= this.bonusTotal) {
            const exploreFrac = this.totalReachable > 0
                ? this.visitedCells.size / this.totalReachable : 0;
            if (exploreFrac >= 0.8) return 3;
            return 2;
        }
        return 1;
    }

    // ── Header (fixed on screen) ───────────────────────────────────────────────
    private buildHeader(season: SeasonTheme, cfg: typeof MONTHS_Y2[0]) {
        const mapScreenW = CANVAS_W - PANEL;
        const hx = mapScreenW / 2;

        const bar = this.add.rectangle(hx, HEADER - 1, mapScreenW, 1, season.uiAccent, 0.25).setDepth(DEPTH.PANEL);
        const bg  = this.add.rectangle(CANVAS_W / 2, HEADER / 2, CANVAS_W, HEADER, season.bgColor).setDepth(DEPTH.PANEL_BG);

        const a = season.accentHex;
        const t1 = this.add.text(hx, 20, 'Y E A R   T W O', { fontSize: '12px', color: `${a}77` }).setOrigin(0.5).setDepth(DEPTH.PANEL);
        const t2 = this.add.text(hx, 42, spaced(cfg.name), { fontSize: '26px', fontStyle: 'bold', color: a }).setOrigin(0.5).setDepth(DEPTH.PANEL);
        const info = Y2_INFO[season.name] ?? Y2_INFO.WinterY2;
        const t3 = this.add.text(hx, 72, info.subtitle, { fontSize: '15px', color: `${a}99` }).setOrigin(0.5).setDepth(DEPTH.PANEL);
        const t4 = this.add.text(hx, 98, `"${cfg.quote}" — ${cfg.author}`, { fontSize: '14px', fontStyle: 'italic', color: `${a}66` }).setOrigin(0.5).setDepth(DEPTH.PANEL);

        for (const o of [bar, bg, t1, t2, t3, t4]) o.setScrollFactor(0);
    }

    // ── Side panel (fixed on screen) ───────────────────────────────────────────
    private buildSidePanel(season: SeasonTheme) {
        const px    = CANVAS_W - PANEL;
        const pw    = PANEL;
        const cx    = px + pw / 2;
        const depth = DEPTH.PANEL;
        const a     = season.accentHex;
        const dim   = season.panelDimHex;
        const info  = Y2_INFO[season.name] ?? Y2_INFO.WinterY2;

        const sf0 = (obj: Phaser.GameObjects.GameObject) =>
            (obj as Phaser.GameObjects.Components.ScrollFactor & typeof obj).setScrollFactor(0);

        const panelBg = (season.bgColor & 0xfefefe) + 0x0a0a0a;
        sf0(this.add.rectangle(px + pw / 2, CANVAS_H / 2, pw, CANVAS_H, panelBg).setDepth(DEPTH.PANEL_BG));
        sf0(this.add.rectangle(px + 1, CANVAS_H / 2, 1, CANVAS_H, season.uiAccent, 0.2).setDepth(depth));

        let y = HEADER + 22;

        sf0(this.add.text(cx, y, info.objLabel, { fontSize: '14px', color: dim, letterSpacing: 4 }).setOrigin(0.5).setDepth(depth));
        y += 26;
        this.objText = this.add.text(cx, y, '', { fontSize: '18px', color: a, align: 'center' }).setOrigin(0.5, 0).setDepth(depth);
        this.objText.setScrollFactor(0);
        this.updateObjText();

        y += 44;
        sf0(this.add.text(cx, y, 'ENERGY', { fontSize: '14px', color: dim, letterSpacing: 4 }).setOrigin(0.5).setDepth(depth));
        y += 20;
        const barW = pw - 48;
        this.energyBarBg = this.add.rectangle(cx, y, barW, 12, 0x222222, 0.6).setDepth(depth);
        this.energyBarBg.setScrollFactor(0);
        this.energyBar = this.add.rectangle(cx, y, barW, 12, 0x44cc66).setDepth(depth);
        this.energyBar.setScrollFactor(0);
        this.updateEnergyBar();

        // Heat bar (summer only)
        if (this.weatherHazard && season.name === 'SummerY2') {
            y += 22;
            sf0(this.add.text(cx, y, 'HEAT', { fontSize: '14px', color: dim, letterSpacing: 4 }).setOrigin(0.5).setDepth(depth));
            y += 18;
            (this.weatherHazard as any).buildHeatBar?.(this, cx, y, barW, depth);
        }

        // Weather status
        if (this.weatherHazard) {
            y += 22;
            this.weatherText = this.add.text(cx, y, this.weatherHazard.getLabel(), {
                fontSize: '13px', fontStyle: 'italic', color: dim,
            }).setOrigin(0.5).setDepth(depth);
            this.weatherText.setScrollFactor(0);
        }

        // Daylight indicator (Night Falls)
        y += 22;
        sf0(this.add.text(cx, y, 'DAYLIGHT', { fontSize: '14px', color: dim, letterSpacing: 4 }).setOrigin(0.5).setDepth(depth));
        y += 20;
        this.dayBarBg = this.add.rectangle(cx, y, barW, 12, 0x222222, 0.6).setDepth(depth);
        this.dayBarBg.setScrollFactor(0);
        this.dayBar = this.add.rectangle(cx, y, barW, 12, 0xffdd44).setDepth(depth);
        this.dayBar.setScrollFactor(0);
        this.dayIcon = this.add.text(px + 18, y - 1, '☀', { fontSize: '14px', color: '#ffdd44' }).setOrigin(0.5).setDepth(depth);
        this.dayIcon.setScrollFactor(0);

        // Legend
        y += 40;
        sf0(this.add.rectangle(cx, y, pw - 32, 1, season.uiAccent, 0.2).setDepth(depth));
        y += 20;
        sf0(this.add.text(cx, y, 'LEGEND', { fontSize: '14px', color: dim, letterSpacing: 4 }).setOrigin(0.5).setDepth(depth));
        y += 22;

        const lx = px + 20;
        const tx = px + 40;

        // Common legend items
        const items: { label: string; draw: (g: Phaser.GameObjects.Graphics, ly: number) => void }[] = [
            { label: `${info.bear} (you)`,        draw: (g, ly) => { g.fillStyle(info.bearColor, 0.9); g.fillCircle(lx + 7, ly, 6); } },
            { label: `${info.objLabel.toLowerCase()} — collect`, draw: (g, ly) => { g.fillStyle(info.objColor, 0.9); g.fillCircle(lx + 7, ly, 6); } },
        ];

        // Season-specific tree/bamboo
        if (season.name === 'SummerY2') {
            items.push({ label: 'bamboo — blocked', draw: (g, ly) => { g.fillStyle(0x44882a, 1); g.fillRect(lx + 4, ly - 5, 3, 12); g.fillRect(lx + 9, ly - 4, 3, 11); } });
        } else {
            items.push({ label: 'tree — blocked', draw: (g, ly) => { g.fillStyle(0x6b3a1f, 1); g.fillRect(lx + 5, ly, 4, 8); g.fillStyle(0x228b34, 1); g.fillCircle(lx + 7, ly - 3, 7); } });
        }

        // Common terrain
        items.push(
            { label: 'mountain — go around',   draw: (g, ly) => { g.fillStyle(0x384048, 1); g.fillRect(lx, ly - 5, 14, 10); g.fillStyle(0x282e34, 0.85); g.fillTriangle(lx + 1, ly + 5, lx + 7, ly - 5, lx + 13, ly + 5); } },
            { label: 'cliff — be careful',     draw: (g, ly) => { g.fillStyle(0x1a1018, 1); g.fillRect(lx, ly - 5, 14, 10); g.fillStyle(0xff2200, 0.4); g.fillRect(lx + 2, ly - 3, 10, 6); } },
        );

        // Season-specific water description
        if (season.name === 'SummerY2') {
            items.push({ label: 'water — cools heat', draw: (g, ly) => { g.fillStyle(0x186848, 1); g.fillRect(lx, ly - 5, 14, 10); g.lineStyle(1, 0x30a070, 0.6); g.strokeLineShape(new Phaser.Geom.Line(lx + 2, ly, lx + 12, ly)); } });
        } else {
            items.push({ label: 'water — slow swim', draw: (g, ly) => { g.fillStyle(0x1858a0, 1); g.fillRect(lx, ly - 5, 14, 10); g.lineStyle(1, 0x4090d0, 0.6); g.strokeLineShape(new Phaser.Geom.Line(lx + 2, ly, lx + 12, ly)); } });
        }

        items.push(
            { label: 'goal — reach it!', draw: (g, ly) => { g.fillStyle(season.goalColor, 0.7); g.fillRect(lx, ly - 5, 14, 10); } },
            { label: 'daylight — reach goal before dark', draw: (g, ly) => { g.fillStyle(0xffdd44, 0.8); g.fillCircle(lx + 7, ly, 5); g.fillStyle(0x333366, 0.6); g.fillCircle(lx + 7, ly, 2.5); } },
        );

        // Season-specific weather legend entries
        switch (season.name) {
            case 'WinterY2':
                items.push({ label: 'blizzard cloud — drifts', draw: (g, ly) => { g.fillStyle(0xc8d8e8, 0.6); g.fillEllipse(lx + 7, ly - 1, 14, 8); g.fillStyle(0xd8e4f0, 0.45); g.fillEllipse(lx + 4, ly - 3, 8, 6); g.fillStyle(0xffffff, 0.4); g.fillCircle(lx + 4, ly + 4, 1.5); g.fillCircle(lx + 9, ly + 5, 1); } });
                items.push({ label: 'snowdrift — extra energy', draw: (g, ly) => { g.fillStyle(0xe8eef4, 0.5); g.fillRect(lx, ly - 5, 14, 10); g.fillStyle(0xc8dce8, 0.4); g.fillCircle(lx + 4, ly, 3); g.fillCircle(lx + 10, ly - 1, 2); } });
                items.push({ label: 'snow cave — shelter + rest', draw: (g, ly) => { g.fillStyle(0x0a0808, 0.85); g.fillEllipse(lx + 7, ly + 1, 12, 8); g.fillStyle(0xe8eef4, 0.8); g.fillEllipse(lx + 7, ly - 3, 12, 4); } });
                items.push({ label: 'blizzard — low visibility', draw: (g, ly) => { g.fillStyle(0xc0d0e0, 0.4); g.fillRect(lx, ly - 5, 14, 10); g.fillStyle(0xe0e8f0, 0.3); g.fillCircle(lx + 3, ly - 2, 2); g.fillCircle(lx + 8, ly + 1, 1.5); g.fillCircle(lx + 11, ly - 1, 1); } });
                break;
            case 'SpringY2':
                items.push({ label: 'rain cloud — floods area', draw: (g, ly) => { g.fillStyle(0x405878, 0.6); g.fillEllipse(lx + 7, ly - 2, 14, 8); g.fillStyle(0x4a6080, 0.45); g.fillEllipse(lx + 4, ly - 4, 8, 6); g.lineStyle(1, 0x6090c0, 0.4); g.strokeLineShape(new Phaser.Geom.Line(lx + 4, ly + 3, lx + 4, ly + 6)); g.strokeLineShape(new Phaser.Geom.Line(lx + 7, ly + 2, lx + 7, ly + 6)); g.strokeLineShape(new Phaser.Geom.Line(lx + 10, ly + 3, lx + 10, ly + 6)); } });
                items.push({ label: 'flood — wait or reroute', draw: (g, ly) => { g.fillStyle(0x2060c0, 0.6); g.fillRect(lx, ly - 5, 14, 10); g.lineStyle(1, 0x60a0e0, 0.5); g.strokeLineShape(new Phaser.Geom.Line(lx + 2, ly - 1, lx + 12, ly - 1)); g.strokeLineShape(new Phaser.Geom.Line(lx + 1, ly + 2, lx + 11, ly + 2)); } });
                items.push({ label: 'rising water — hurry!', draw: (g, ly) => { g.fillStyle(0x1868a8, 0.7); g.fillRect(lx, ly - 5, 14, 10); g.fillStyle(0x48a0d8, 0.4); g.fillTriangle(lx + 2, ly + 3, lx + 7, ly - 3, lx + 12, ly + 3); } });
                break;
            case 'SummerY2':
                items.push({ label: 'heat cloud — more heat', draw: (g, ly) => { g.fillStyle(0xdd8833, 0.35); g.fillEllipse(lx + 7, ly, 14, 8); g.fillStyle(0xffaa44, 0.25); g.fillEllipse(lx + 4, ly - 2, 8, 5); } });
                items.push({ label: 'shade — less heat', draw: (g, ly) => { g.fillStyle(0x489028, 1); g.fillRect(lx, ly - 5, 14, 10); g.fillStyle(0x000000, 0.15); g.fillEllipse(lx + 4, ly - 1, 8, 5); g.fillEllipse(lx + 10, ly + 2, 6, 4); } });
                items.push({ label: 'heat — watch the meter', draw: (g, ly) => { g.fillStyle(0x222222, 0.6); g.fillRect(lx, ly - 3, 14, 6); g.fillStyle(0xff8833, 1); g.fillRect(lx + 1, ly - 2, 9, 4); } });
                break;
            case 'FallY2':
                items.push({ label: 'wind cloud — pushes you', draw: (g, ly) => { g.fillStyle(0x8899aa, 0.6); g.fillEllipse(lx + 7, ly, 14, 8); g.fillStyle(0x8899aa, 0.4); g.fillEllipse(lx + 4, ly - 2, 8, 6); } });
                items.push({ label: 'leaf pile — may hide berries!', draw: (g, ly) => { g.fillStyle(0x8b5e3c, 0.8); g.fillEllipse(lx + 7, ly, 12, 6); g.fillStyle(0xcc6622, 0.6); g.fillEllipse(lx + 4, ly - 1, 7, 4); g.fillEllipse(lx + 10, ly + 1, 6, 4); } });
                break;
        }

        const gfx = this.add.graphics().setDepth(depth);
        gfx.setScrollFactor(0);
        for (const item of items) {
            item.draw(gfx, y + 7);
            sf0(this.add.text(tx, y, item.label, { fontSize: '15px', color: dim }).setOrigin(0, 0).setDepth(depth));
            y += 24;
        }

        y += 6;
        sf0(this.add.rectangle(cx, y, pw - 32, 1, season.uiAccent, 0.2).setDepth(depth));
        y += 18;
        for (const line of ['↑↓←→  move', 'SPACE  rest', 'R  new map', 'M  menu']) {
            sf0(this.add.text(cx, y, line, { fontSize: '14px', color: '#ffffff55' }).setOrigin(0.5, 0).setDepth(depth));
            y += 17;
        }
    }

    // ── UI helpers ─────────────────────────────────────────────────────────────
    private updateObjText() {
        if (!this.objText) return;
        let txt = `${this.objCollected} / ${this.objTotal}`;
        if (this.bonusTotal > 0) {
            txt += `  +${this.bonusCollected} bonus`;
        }
        this.objText.setText(txt);
    }
    private updateEnergyBar() {
        if (!this.energyBar) return;
        const frac = this.energy / this.energyMax;
        const fullW = this.energyBarBg.width;
        this.energyBar.width = fullW * frac;
        // Shift color from green → yellow → red
        const color = frac > 0.5 ? 0x44cc66 : frac > 0.25 ? 0xccaa22 : 0xcc4444;
        this.energyBar.setFillStyle(color);
    }

}
