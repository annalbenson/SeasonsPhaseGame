import Phaser from 'phaser';
import { TILE, MAX_COLS, MAX_ROWS, HEADER, PANEL } from '../constants';
import { DEPTH } from '../gameplay';
import { MONTHS_Y2, SeasonTheme } from '../seasons';
import { generateMountainMap, drawTerrain, Terrain, isWalkable, isCliff, TerrainMap } from '../terrain';
import { FogOfWar } from '../fog';
import { statsEvents, STAT } from '../statsEmitter';
import { addWeather } from '../weather';
import { WALLS } from '../maze';
import { createY2PlayerSprite, buildY2ObjectiveSprite, ensureSparkleTexture } from '../sprites';
import { log } from '../logger';
import { WeatherHazard, createWeatherHazard, getIntensity } from '../weatherHazard';

function spaced(t: string): string { return t.toUpperCase().split('').join(' '); }

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

    private fog!: FogOfWar;

    private startCol = 0;
    private startRow = 0;
    private goalCol  = 0;
    private goalRow  = 0;

    private sceneryBlocked = new Set<string>();
    private weatherHazard: WeatherHazard | null = null;
    private weatherText: Phaser.GameObjects.Text | null = null;

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
        this.energy         = 100;
        this.moving         = false;
        this.sceneryBlocked = new Set();
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
        this.fog = new FogOfWar(
            this, this.cols, this.totalRows, true, season,
            (c) => this.worldX(c), (r) => this.worldY(r),
        );
        this.fog.revealAround(this.startCol, this.startRow, this.time.now);

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

        this.tweens.add({
            targets: this.player,
            x: this.worldX(nx), y: this.worldY(ny),
            duration, ease: 'Sine.easeOut',
            onComplete: () => {
                this.emitter.setPosition(this.player.x, this.player.y);
                this.fog.revealAround(this.gridX, this.gridY, this.time.now);
                this.drainEnergy(onWater ? 2 : 1);

                // Weather: extra move cost (snowdrifts, heat)
                const extraCost = this.weatherHazard?.getMoveCost(nx, ny, this.terrain.grid) ?? 0;
                if (extraCost > 0) this.drainEnergy(extraCost);

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
        this.energy = Math.max(0, this.energy - amount);
        this.updateEnergyBar();
        if (this.energy <= 0) {
            this.onRest();
        }
    }

    /** Voluntary rest (SPACE) — quick nap, recovers 30 energy. */
    private onVoluntaryRest() {
        log.info('scene', 'voluntary rest');
        this.moving = true;

        const zx = this.player.x + 20;
        const zy = this.player.y - 30;
        const zzz = this.add.text(zx, zy, 'zz', {
            fontSize: '16px', fontStyle: 'italic', color: '#aaccff',
        }).setOrigin(0.5).setDepth(DEPTH.PLAYER + 1);
        this.tweens.add({ targets: zzz, y: zy - 20, alpha: { from: 1, to: 0.3 },
            duration: 1600, ease: 'Sine.easeOut' });

        this.tweens.add({ targets: this.player, scaleY: 0.9, yoyo: true,
            duration: 1000, ease: 'Sine.easeInOut' });

        this.time.delayedCall(2000, () => {
            zzz.destroy();
            this.energy = Math.min(this.energyMax, this.energy + 30);
            this.updateEnergyBar();
            this.moving = false;
        });
    }

    /** Forced rest (energy = 0) — longer nap, full recovery. */
    private onRest() {
        log.info('scene', 'bear exhausted — forced rest');
        this.moving = true;

        const zx = this.player.x + 20;
        const zy = this.player.y - 30;
        const zzz = this.add.text(zx, zy, 'zzz', {
            fontSize: '20px', fontStyle: 'italic', color: '#aaccff',
        }).setOrigin(0.5).setDepth(DEPTH.PLAYER + 1);
        this.tweens.add({ targets: zzz, y: zy - 30, alpha: { from: 1, to: 0.3 },
            duration: 4000, ease: 'Sine.easeOut' });

        this.tweens.add({ targets: this.player, scaleY: 0.85, yoyo: true,
            duration: 2000, ease: 'Sine.easeInOut', repeat: 1 });

        this.time.delayedCall(5000, () => {
            zzz.destroy();
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
        this.updateObjText();
    }

    private tryCollectObjective() {
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
    }

    // ── Goal ───────────────────────────────────────────────────────────────────
    private checkGoal() {
        if (this.gridX !== this.goalCol || this.gridY !== this.goalRow) return;
        if (!this.objDone) return;
        statsEvents.emit(STAT.MAZE_COMPLETE);
        this.moving = true;

        const last = this.monthIndex >= MONTHS_Y2.length - 1;
        const nextData = last
            ? undefined
            : { monthIndex: this.monthIndex + 1, from: this.fromScene };
        const nextScene = last ? 'EndScene' : 'GameY2Scene';
        log.info('scene', `goal reached, transitioning to ${nextScene}`, { last, monthIndex: this.monthIndex });

        this.time.delayedCall(500, () => {
            this.destroyAll();
            log.debug('scene', 'fade out started');
            this.cameras.main.fadeOut(800, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                log.debug('scene', `fade out complete, starting ${nextScene}`);
                this.cameras.main.resetFX();
                this.scene.start(nextScene, nextData);
            });
        });
    }

    private destroyAll() {
        for (const s of this.objSprites) s.destroy();
        this.weatherHazard?.destroy();
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
        );

        // Season-specific weather legend entries
        switch (season.name) {
            case 'WinterY2':
                items.push({ label: 'snowdrift — extra energy', draw: (g, ly) => { g.fillStyle(0xe8eef4, 0.5); g.fillRect(lx, ly - 5, 14, 10); g.fillStyle(0xc8dce8, 0.4); g.fillCircle(lx + 4, ly, 3); g.fillCircle(lx + 10, ly - 1, 2); } });
                break;
            case 'SpringY2':
                items.push({ label: 'flood — wait or reroute', draw: (g, ly) => { g.fillStyle(0x2060c0, 0.6); g.fillRect(lx, ly - 5, 14, 10); g.lineStyle(1, 0x60a0e0, 0.5); g.strokeLineShape(new Phaser.Geom.Line(lx + 2, ly - 1, lx + 12, ly - 1)); g.strokeLineShape(new Phaser.Geom.Line(lx + 1, ly + 2, lx + 11, ly + 2)); } });
                break;
            case 'SummerY2':
                items.push({ label: 'heat — watch the meter', draw: (g, ly) => { g.fillStyle(0x222222, 0.6); g.fillRect(lx, ly - 3, 14, 6); g.fillStyle(0xff8833, 1); g.fillRect(lx + 1, ly - 2, 9, 4); } });
                break;
            case 'FallY2':
                items.push({ label: 'cloud — blows you away', draw: (g, ly) => { g.fillStyle(0x8899aa, 0.6); g.fillEllipse(lx + 7, ly, 14, 8); g.fillStyle(0x8899aa, 0.4); g.fillEllipse(lx + 4, ly - 2, 8, 6); } });
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
        if (this.objText) this.objText.setText(`${this.objCollected} / ${this.objTotal}`);
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
