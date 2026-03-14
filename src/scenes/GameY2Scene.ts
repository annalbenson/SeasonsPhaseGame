import Phaser from 'phaser';
import { TILE, MAX_COLS, MAX_ROWS, HEADER, PANEL } from '../constants';
import { MONTHS_Y2, SeasonTheme } from '../seasons';
import { generateMountainMap, drawTerrain, Terrain, isWalkable, TerrainMap } from '../terrain';
import { Hazard } from '../hazard';
import { Fish } from '../fish';
import { FogOfWar } from '../fog';
import { SkillManager, SkillContext } from '../skills';
import { statsEvents, STAT } from '../statsEmitter';
import { addWeather } from '../weather';
import { WALLS } from '../maze';

function spaced(t: string): string { return t.toUpperCase().split('').join(' '); }

const CANVAS_W = MAX_COLS * TILE + PANEL;
const CANVAS_H = MAX_ROWS * TILE + HEADER;

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

    private hazards: Hazard[] = [];
    private fishes:  Fish[]   = [];
    private isHiding = false;
    private swimming = false;

    private lives = 3;
    private livesText!: Phaser.GameObjects.Text;

    private fishCollected = 0;
    private fishTotal     = 0;
    private objText: Phaser.GameObjects.Text | null = null;
    private objDone = false;
    private goalLock: Phaser.GameObjects.Arc | null = null;

    private fog!: FogOfWar;
    private skill!: SkillManager;
    private skillKey!: Phaser.Input.Keyboard.Key;

    private startCol = 0;
    private startRow = 0;
    private goalCol  = 0;
    private goalRow  = 0;

    private hidingSpots = new Set<string>();
    private sceneryBlocked = new Set<string>();

    /** Horizontal offset to center map in canvas. */
    private get offsetX() { return Math.floor((MAX_COLS * TILE - this.cols * TILE) / 2); }
    /** World X for a column. */
    private worldX(col: number) { return col * TILE + TILE / 2 + this.offsetX; }
    /** World Y for a row. No vertical centering — camera scrolls instead. */
    private worldY(row: number) { return row * TILE + TILE / 2 + HEADER; }

    constructor() { super('GameY2Scene'); }

    init(data: { monthIndex?: number; from?: string }) {
        this.monthIndex = data.monthIndex ?? 0;
        this.fromScene  = data.from ?? 'TitleScene';

        const cfg  = MONTHS_Y2[this.monthIndex];
        this.cols  = cfg.cols;
        this.skill = new SkillManager(cfg.season.name as 'WinterY2');

        this.hazards       = [];
        this.fishes        = [];
        this.fishCollected = 0;
        this.fishTotal     = 0;
        this.objDone       = false;
        this.goalLock      = null;
        this.objText       = null;
        this.lives         = 3;
        this.isHiding      = false;
        this.swimming      = false;
        this.moving        = false;
        this.hidingSpots   = new Set();
        this.sceneryBlocked = new Set();
    }

    create() {
        const cfg    = MONTHS_Y2[this.monthIndex];
        const season = cfg.season;

        this.cameras.main.setBackgroundColor(season.bgColor);

        // ── Generate terrain ────────────────────────────────────────────────────
        this.terrain   = generateMountainMap(this.cols, cfg.rows);
        this.totalRows = this.terrain.rows;
        this.startCol  = this.terrain.start.col;
        this.startRow  = this.terrain.start.row;
        this.goalCol   = this.terrain.goal.col;
        this.goalRow   = this.terrain.goal.row;

        // Wall bitmask grid — outer walls only (for Hazard compatibility)
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
        ).setDepth(1.6);

        // Snow caves on land cells in forest zones
        this.placeSnowCaves();

        // Spawn fish in water zones
        this.spawnFish();

        // Weather
        addWeather(this, season.name);

        // Sparkle texture
        if (!this.textures.exists('sparkle')) {
            const g = this.make.graphics({ add: false });
            g.fillStyle(0xffffff, 1); g.fillCircle(4, 4, 4);
            g.generateTexture('sparkle', 8, 8); g.destroy();
        }

        // ── Player ──────────────────────────────────────────────────────────────
        this.gridX = this.startCol;
        this.gridY = this.startRow;
        this.player = this.createPolarBear(this.worldX(this.startCol), this.worldY(this.startRow));
        this.player.setDepth(2);

        // Wolves — one per forest zone (except start/goal zones)
        this.spawnWolves(season);

        // Trail
        this.emitter = this.add.particles(this.player.x, this.player.y, 'sparkle', {
            scale: { start: 0.5, end: 0 }, alpha: { start: 0.6, end: 0 },
            speed: { min: 4, max: 20 }, angle: { min: 0, max: 360 },
            lifespan: 400, frequency: 65, quantity: 1,
            tint: [0xffffff, 0xddeeff, 0xaaccff],
            blendMode: Phaser.BlendModes.ADD,
        }).setDepth(1.9);

        // ── Camera scrolling ────────────────────────────────────────────────────
        const worldH = this.totalRows * TILE + HEADER;
        this.cameras.main.setBounds(0, 0, CANVAS_W, worldH);
        this.cameras.main.startFollow(this.player, true, 0, 0.08);
        this.cameras.main.setDeadzone(CANVAS_W, TILE * 4);

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
        this.skillKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

        // Stats
        statsEvents.emit(STAT.MAZE_START, {
            month: cfg.month, gridSize: `${this.cols}x${this.totalRows}`, hard: true, custom: false,
        });

        this.cameras.main.fadeIn(900, 0, 0, 0);
    }

    // ── Update ─────────────────────────────────────────────────────────────────
    update() {
        if (this.moving) return;
        const now = this.time.now;

        for (const h of this.hazards) h.setTarget(this.gridX, this.gridY, this.isHiding);
        for (const f of this.fishes)  f.setTarget(this.gridX, this.gridY);
        this.fog.updateDecay(now);
        this.skill.tick(now);

        if (Phaser.Input.Keyboard.JustDown(this.skillKey)) {
            this.skill.activate(this.buildSkillContext(), now);
        }

        let dx = 0, dy = 0;
        if (this.cursors.left.isDown  || this.wasd.left.isDown)  dx = -1;
        if (this.cursors.right.isDown || this.wasd.right.isDown) dx =  1;
        if (this.cursors.up.isDown    || this.wasd.up.isDown)    dy = -1;
        if (this.cursors.down.isDown  || this.wasd.down.isDown)  dy =  1;
        if (dx === 0 && dy === 0) return;
        if (dx !== 0 && dy !== 0) dy = 0;

        if ((this.skill as SkillManager & { armed: boolean }).armed) {
            const ctx = this.buildSkillContext();
            if (this.skill.tryDirectional(dx, dy, ctx, now)) return;
            this.skill.cancelArm(now);
        }

        this.tryStep(dx, dy);
    }

    private tryStep(dx: number, dy: number) {
        const nx = this.gridX + dx, ny = this.gridY + dy;
        if (nx < 0 || nx >= this.cols || ny < 0 || ny >= this.totalRows) return;
        if (!isWalkable(this.terrain.grid, nx, ny, this.cols, this.totalRows, this.swimming)) return;

        this.gridX = nx;
        this.gridY = ny;
        this.moving = true;

        this.tweens.add({
            targets: this.player,
            x: this.worldX(nx), y: this.worldY(ny),
            duration: 180, ease: 'Sine.easeOut',
            onComplete: () => {
                this.moving = false;
                this.emitter.setPosition(this.player.x, this.player.y);
                this.fog.revealAround(this.gridX, this.gridY, this.time.now);
                this.isHiding = this.hidingSpots.has(`${this.gridX},${this.gridY}`);
                this.tryCollectFish();
                this.checkGoal();
                this.checkHazardCollision();
            },
        });
    }

    // ── Fish ───────────────────────────────────────────────────────────────────
    private spawnFish() {
        this.fishTotal = this.terrain.fishSpawns.length;
        for (const sp of this.terrain.fishSpawns) {
            this.fishes.push(new Fish(
                this, this.terrain.grid,
                this.cols, this.totalRows,
                sp.col, sp.row,
                this.offsetX, 0,
            ));
        }
        this.updateObjText();
    }

    private tryCollectFish() {
        for (let i = this.fishes.length - 1; i >= 0; i--) {
            const f = this.fishes[i];
            if (f.dead) continue;
            if (f.gridX === this.gridX && f.gridY === this.gridY) {
                f.destroy();
                this.fishes.splice(i, 1);
                this.fishCollected++;
                statsEvents.emit(STAT.OBJ_COMPLETED);
                this.updateObjText();
                if (this.fishCollected >= this.fishTotal) {
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

        const last = this.monthIndex >= MONTHS_Y2.length - 1;
        this.time.delayedCall(500, () => {
            this.destroyAll();
            this.cameras.main.fadeOut(800, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                if (last) {
                    this.scene.start('EndScene');
                } else {
                    this.scene.start('GameY2Scene', { monthIndex: this.monthIndex + 1, from: this.fromScene });
                }
            });
        });
    }

    // ── Hazard collision ───────────────────────────────────────────────────────
    private checkHazardCollision() {
        if (this.isHiding) return;
        for (const h of this.hazards) {
            if (h.dead) continue;
            if (h.gridX === this.gridX && h.gridY === this.gridY) {
                this.onCaught(); return;
            }
        }
    }

    private onCaught() {
        this.lives--;
        statsEvents.emit(STAT.CAUGHT);
        this.updateLives();

        if (this.lives <= 0) {
            statsEvents.emit(STAT.DEATH);
            this.destroyAll();
            this.cameras.main.fadeOut(600, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart());
            return;
        }

        this.gridX = this.startCol;
        this.gridY = this.startRow;
        this.player.setPosition(this.worldX(this.startCol), this.worldY(this.startRow));
        this.emitter.setPosition(this.player.x, this.player.y);
        this.fog.revealAround(this.startCol, this.startRow, this.time.now);
        for (const h of this.hazards) h.scatter();
        this.cameras.main.flash(400, 200, 50, 50);
    }

    private destroyAll() {
        for (const h of this.hazards) h.destroy();
        for (const f of this.fishes)  f.destroy();
    }

    // ── Snow caves ─────────────────────────────────────────────────────────────
    private placeSnowCaves() {
        const forestLand = this.terrain.landCells.filter(c => {
            const zone = this.terrain.zones.find(z =>
                z.type === 'forest' && c.row >= z.startRow && c.row < z.startRow + z.height);
            return zone &&
                !(c.col === this.startCol && c.row === this.startRow) &&
                !(c.col === this.goalCol  && c.row === this.goalRow);
        });
        const numCaves = Math.min(3 + Math.floor(Math.random() * 2), forestLand.length);
        const step = Math.max(1, Math.floor(forestLand.length / (numCaves + 1)));

        for (let i = 0; i < numCaves; i++) {
            const c = forestLand[Math.min((i + 1) * step, forestLand.length - 1)];
            this.hidingSpots.add(`${c.col},${c.row}`);

            const cx = c.col * TILE + TILE / 2;
            const cy = c.row * TILE + TILE / 2;
            const cave = this.add.graphics();
            cave.fillStyle(0x556688, 0.7);
            cave.fillRoundedRect(cx - 18, cy - 14, 36, 28, 10);
            cave.fillStyle(0x223344, 0.9);
            cave.fillEllipse(cx, cy + 2, 22, 16);
            cave.setDepth(1.2);
            this.mazeLayer.add(cave);
        }
    }

    // ── Wolves — one per interior forest zone ──────────────────────────────────
    private spawnWolves(season: SeasonTheme) {
        const forestZones = this.terrain.zones.filter(z => z.type === 'forest');
        // Skip first (goal area) and last (start area)
        const interior = forestZones.slice(1, -1);

        for (const zone of interior) {
            const candidates = this.terrain.landCells.filter(c =>
                c.row >= zone.startRow + 1 && c.row < zone.startRow + zone.height - 1 &&
                this.terrain.grid[c.row][c.col] === Terrain.OPEN
            );
            if (candidates.length === 0) continue;

            const wc = candidates[Math.floor(candidates.length / 2)];
            const h = new Hazard(
                this, this.cells,
                wc.col, wc.row,
                'WinterY2',
                () => this.onCaught(),
                this.sceneryBlocked,
                this.offsetX, 0,
            );
            this.hazards.push(h);
        }
        for (const h of this.hazards) h.setSiblings(this.hazards);
    }

    // ── Polar bear ─────────────────────────────────────────────────────────────
    private createPolarBear(x: number, y: number): Phaser.GameObjects.Container {
        const white = 0xf0f4f8, cream = 0xd8dce0;
        const glow  = this.add.circle(0, 0, 24, 0xaaccff, 0.15);
        const earL  = this.add.circle(-12, -18, 6, cream);
        const earR  = this.add.circle( 12, -18, 6, cream);
        const earLi = this.add.circle(-12, -18, 3, 0x888888, 0.5);
        const earRi = this.add.circle( 12, -18, 3, 0x888888, 0.5);
        const body  = this.add.ellipse(0, 5, 26, 22, white);
        const head  = this.add.circle(0, -8, 12, white);
        const snout = this.add.ellipse(0, -3, 10, 7, cream);
        const nose  = this.add.circle(0, -5, 3, 0x222222);
        const eyeL  = this.add.circle(-5, -11, 2.5, 0x222244);
        const eyeR  = this.add.circle( 5, -11, 2.5, 0x222244);
        const pawL  = this.add.circle(-10, 14, 5, cream);
        const pawR  = this.add.circle( 10, 14, 5, cream);
        const visual = this.add.container(0, 0, [glow, earL, earR, earLi, earRi, body, head, snout, nose, eyeL, eyeR, pawL, pawR]);
        const outer  = this.add.container(x, y, [visual]);
        this.tweens.add({ targets: visual, y: 3, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: glow, alpha: { from: 0.08, to: 0.25 }, yoyo: true, repeat: -1, duration: 1500 });
        return outer;
    }

    // ── Header (fixed on screen) ───────────────────────────────────────────────
    private buildHeader(season: SeasonTheme, cfg: typeof MONTHS_Y2[0]) {
        const hx = this.offsetX + this.cols * TILE / 2;
        const W  = this.cols * TILE;

        const bar = this.add.rectangle(hx, HEADER - 1, W, 1, season.uiAccent, 0.25).setDepth(3);
        const bg  = this.add.rectangle(hx, HEADER / 2, CANVAS_W, HEADER, season.bgColor).setDepth(2.9);

        const a = season.accentHex;
        const t1 = this.add.text(hx, 20, 'Y E A R   T W O', { fontSize: '12px', color: `${a}77` }).setOrigin(0.5).setDepth(3);
        const t2 = this.add.text(hx, 42, spaced(cfg.name), { fontSize: '26px', fontStyle: 'bold', color: a }).setOrigin(0.5).setDepth(3);
        const t3 = this.add.text(hx, 72, 'Arctic Winter', { fontSize: '15px', color: `${a}99` }).setOrigin(0.5).setDepth(3);
        const t4 = this.add.text(hx, 98, `"${cfg.quote}" — ${cfg.author}`, { fontSize: '14px', fontStyle: 'italic', color: `${a}66` }).setOrigin(0.5).setDepth(3);

        for (const o of [bar, bg, t1, t2, t3, t4]) o.setScrollFactor(0);
    }

    // ── Side panel (fixed on screen) ───────────────────────────────────────────
    private buildSidePanel(season: SeasonTheme) {
        const px    = this.offsetX + this.cols * TILE;
        const pw    = PANEL;
        const cx    = px + pw / 2;
        const depth = 3;
        const a     = season.accentHex;
        const dim   = season.panelDimHex;

        const sf0 = (obj: Phaser.GameObjects.GameObject) =>
            (obj as Phaser.GameObjects.Components.ScrollFactor & typeof obj).setScrollFactor(0);

        const panelBg = (season.bgColor & 0xfefefe) + 0x0a0a0a;
        sf0(this.add.rectangle(px + pw / 2, CANVAS_H / 2, pw, CANVAS_H, panelBg).setDepth(depth - 1));
        sf0(this.add.rectangle(px + 1, CANVAS_H / 2, 1, CANVAS_H, season.uiAccent, 0.2).setDepth(depth));

        let y = HEADER + 22;

        sf0(this.add.text(cx, y, 'FISH', { fontSize: '14px', color: dim, letterSpacing: 4 }).setOrigin(0.5).setDepth(depth));
        y += 26;
        this.objText = this.add.text(cx, y, '', { fontSize: '18px', color: a, align: 'center' }).setOrigin(0.5, 0).setDepth(depth);
        this.objText.setScrollFactor(0);
        this.updateObjText();

        y += 44;
        sf0(this.add.text(cx, y, 'LIVES', { fontSize: '14px', color: dim, letterSpacing: 4 }).setOrigin(0.5).setDepth(depth));
        y += 24;
        this.livesText = this.add.text(cx, y, '', { fontSize: '20px', color: '#ff5577' }).setOrigin(0.5, 0).setDepth(depth);
        this.livesText.setScrollFactor(0);
        this.updateLives();

        y += 40;
        sf0(this.add.text(cx, y, 'SKILL', { fontSize: '14px', color: dim, letterSpacing: 4 }).setOrigin(0.5).setDepth(depth));
        y += 24;
        this.skill.text = this.add.text(cx, y, '', { fontSize: '16px', color: a, align: 'center' }).setOrigin(0.5, 0).setDepth(depth);
        this.skill.text.setScrollFactor(0);
        this.skill.updateText(this.time.now);

        // Legend
        y += 44;
        sf0(this.add.rectangle(cx, y, pw - 32, 1, season.uiAccent, 0.2).setDepth(depth));
        y += 20;
        sf0(this.add.text(cx, y, 'LEGEND', { fontSize: '14px', color: dim, letterSpacing: 4 }).setOrigin(0.5).setDepth(depth));
        y += 22;

        const lx = px + 20;
        const tx = px + 40;
        const items = [
            { label: 'polar bear (you)', draw: (g: Phaser.GameObjects.Graphics, ly: number) => { g.fillStyle(0xf0f4f8, 0.9); g.fillCircle(lx + 7, ly, 6); } },
            { label: 'wolf — avoid!',    draw: (g: Phaser.GameObjects.Graphics, ly: number) => { g.fillStyle(0x808898, 0.9); g.fillCircle(lx + 7, ly, 6); } },
            { label: 'snow cave — hide', draw: (g: Phaser.GameObjects.Graphics, ly: number) => { g.fillStyle(0x556688, 0.7); g.fillRoundedRect(lx, ly - 5, 14, 10, 3); } },
            { label: 'fish — catch!',    draw: (g: Phaser.GameObjects.Graphics, ly: number) => { g.fillStyle(0xff8844, 0.9); g.fillEllipse(lx + 7, ly, 12, 8); } },
            { label: 'water — swim!',    draw: (g: Phaser.GameObjects.Graphics, ly: number) => { g.fillStyle(0x1858a0, 0.9); g.fillRect(lx, ly - 5, 14, 10); } },
            { label: 'tree — blocked',   draw: (g: Phaser.GameObjects.Graphics, ly: number) => { g.fillStyle(0x6b3a1f, 1); g.fillRect(lx + 5, ly, 4, 8); g.fillStyle(0x228b34, 1); g.fillCircle(lx + 7, ly - 3, 7); } },
            { label: 'swim — enter water!', draw: (g: Phaser.GameObjects.Graphics, ly: number) => { g.fillStyle(0x4090d0, 0.7); g.fillCircle(lx + 7, ly, 6); } },
        ];

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
        for (const line of ['SPACE  swim', 'R  new map', 'M  menu', '↑↓←→  move']) {
            sf0(this.add.text(cx, y, line, { fontSize: '14px', color: '#ffffff55' }).setOrigin(0.5, 0).setDepth(depth));
            y += 17;
        }
    }

    // ── UI helpers ─────────────────────────────────────────────────────────────
    private updateObjText() {
        if (this.objText) this.objText.setText(`${this.fishCollected} / ${this.fishTotal}`);
    }
    private updateLives() {
        if (this.livesText) this.livesText.setText('♥'.repeat(this.lives));
    }

    // ── Skill context ──────────────────────────────────────────────────────────
    private buildSkillContext(): SkillContext {
        return {
            scene: this, gridX: this.gridX, gridY: this.gridY,
            cols: this.cols, rows: this.totalRows,
            cells: this.cells, sceneryBlocked: this.sceneryBlocked,
            hazards: this.hazards, fog: this.fog,
            player: this.player,
            worldX: (c) => this.worldX(c), worldY: (r) => this.worldY(r),
            findGate: () => null, keyCount: 0,
            updateInventory: () => {}, collectKey: () => {},
            checkObjective: () => this.tryCollectFish(),
            checkGoal: () => this.checkGoal(),
            checkHazardCollision: () => this.checkHazardCollision(),
            setGrid: (x, y) => { this.gridX = x; this.gridY = y; },
            setMoving: (m) => { this.moving = m; },
            setSwimming: (active) => { this.swimming = active; },
        };
    }
}
