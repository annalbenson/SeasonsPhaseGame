import Phaser from 'phaser';
import { TILE, MAX_COLS, MAX_ROWS, HEADER, PANEL } from '../constants';
import { DEPTH } from '../gameplay';
import { Terrain, isWalkable, isCliff } from '../terrain';
import { log } from '../logger';

const W = MAX_COLS * TILE + PANEL;
const H = MAX_ROWS * TILE + HEADER;

// ── Tutorial theme (warm amber, matches cozy Y2 feel) ────────────────────────
const T = {
    floor:      0xc8a868,
    floorDark:  0xa88848,
    wall:       0x281808,
    goal:       0xffcc44,
    bg:         0x100804,
    accent:     '#f0a860',
    dim:        '#987050',
    text:       '#e8d0b0',
};

// ── Hand-crafted tutorial levels ─────────────────────────────────────────────

interface TutLevel {
    title: string;
    prompt: string;
    cols: number;
    grid: Terrain[][];
    start: { col: number; row: number };
    goal: { col: number; row: number };
    objectives?: { col: number; row: number }[];
    teachEnergy?: boolean;
}

function makeGrid(rows: string[]): Terrain[][] {
    // Legend: . = OPEN, # = ROCK, ^ = CLIFF, ~ = WATER, T = TREE
    const map: Record<string, Terrain> = {
        '.': Terrain.OPEN, '#': Terrain.ROCK, '^': Terrain.CLIFF,
        '~': Terrain.WATER, 'T': Terrain.TREE,
    };
    return rows.map(row => [...row].map(ch => map[ch] ?? Terrain.ROCK));
}

const LEVELS: TutLevel[] = [
    {
        title: 'Moving & Terrain',
        prompt: 'Use arrow keys to reach the gold tile.\nTrees and mountains block your path.',
        cols: 7,
        grid: makeGrid([
            '##.####',
            '#..T.##',
            '#.##..#',
            '#...#.#',
            '##.T..#',
            '#...###',
        ]),
        start: { col: 2, row: 5 },
        goal:  { col: 2, row: 0 },
    },
    {
        title: 'Water & Cliffs',
        prompt: 'Water is swimmable but costs more energy.\nCliffs reset you — be careful!',
        cols: 7,
        grid: makeGrid([
            '#..####',
            '#.~.###',
            '#.~~.##',
            '#..~~.#',
            '##.^^.#',
            '##...##',
        ]),
        start: { col: 3, row: 5 },
        goal:  { col: 1, row: 0 },
    },
    {
        title: 'Energy & Resting',
        prompt: 'Energy drains each step. Press SPACE to rest.\nResting recovers 30 energy.',
        cols: 7,
        teachEnergy: true,
        grid: makeGrid([
            '#..####',
            '#.#..##',
            '#...T.#',
            '##.#..#',
            '#..T..#',
            '#...#.#',
            '##..#.#',
            '#...###',
        ]),
        start: { col: 1, row: 7 },
        goal:  { col: 1, row: 0 },
    },
    {
        title: 'Collecting Food',
        prompt: 'Collect all food to unlock the goal!',
        cols: 7,
        grid: makeGrid([
            '###.###',
            '#....##',
            '#.T#..#',
            '#..#..#',
            '#.....#',
            '###.###',
        ]),
        start: { col: 3, row: 5 },
        goal:  { col: 3, row: 0 },
        objectives: [{ col: 1, row: 1 }, { col: 5, row: 2 }],
    },
];

// ── Scene ────────────────────────────────────────────────────────────────────

export default class TutorialY2Scene extends Phaser.Scene {
    private levelIndex = 0;
    private fromScene = 'TitleScene';
    private gridX = 0;
    private gridY = 0;
    private cols = 0;
    private rows = 0;
    private grid: Terrain[][] = [];
    private moving = false;
    private energy = 100;
    private energyMax = 100;
    private player!: Phaser.GameObjects.Container;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
    private mazeLayer!: Phaser.GameObjects.Container;
    private energyBar!: Phaser.GameObjects.Rectangle;
    private energyBarBg!: Phaser.GameObjects.Rectangle;
    private promptText!: Phaser.GameObjects.Text;
    private goalLock: Phaser.GameObjects.Arc | null = null;
    private objSprites: Phaser.GameObjects.Arc[] = [];
    private objPositions: { col: number; row: number }[] = [];
    private objCollected = 0;
    private objTotal = 0;

    constructor() { super('TutorialY2Scene'); }

    init(data: { from?: string; levelIndex?: number }) {
        this.fromScene = data.from ?? 'TitleScene';
        this.levelIndex = data.levelIndex ?? 0;
    }

    create() {
        const level = LEVELS[this.levelIndex];
        this.cols = level.cols;
        this.rows = level.grid.length;
        this.grid = level.grid;
        this.gridX = level.start.col;
        this.gridY = level.start.row;
        this.energy = 100;
        this.moving = false;
        this.objCollected = 0;
        this.objSprites = [];
        this.objPositions = [];

        // Background
        this.cameras.main.setBackgroundColor(T.bg);

        // Header
        const mapW = this.cols * TILE;
        const offsetX = Math.floor((W - PANEL - mapW) / 2);
        this.add.text(W / 2 - PANEL / 2, 20, 'Y E A R   T W O   T U T O R I A L', {
            fontSize: '12px', color: `${T.accent}77`,
        }).setOrigin(0.5).setDepth(DEPTH.PANEL);
        this.add.text(W / 2 - PANEL / 2, 46, level.title.toUpperCase().split('').join(' '), {
            fontSize: '22px', fontStyle: 'bold', color: T.accent,
        }).setOrigin(0.5).setDepth(DEPTH.PANEL);

        // Prompt text
        this.promptText = this.add.text(W / 2 - PANEL / 2, 80, level.prompt, {
            fontSize: '14px', color: T.text, align: 'center',
        }).setOrigin(0.5, 0).setDepth(DEPTH.PANEL);

        // ── Maze layer ───────────────────────────────────────────────────────
        this.mazeLayer = this.add.container(offsetX, HEADER);

        // Draw terrain
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const cx = c * TILE + TILE / 2;
                const cy = r * TILE + TILE / 2;
                const terrain = this.grid[r][c];
                let color = (r + c) % 2 === 0 ? T.floor : T.floorDark;

                switch (terrain) {
                    case Terrain.ROCK:
                        color = T.wall;
                        this.mazeLayer.add(this.add.rectangle(cx, cy, TILE, TILE, color));
                        // Mountain triangle
                        const g = this.add.graphics();
                        g.fillStyle(0x282e34, 0.85);
                        g.fillTriangle(cx - TILE * 0.35, cy + TILE * 0.35, cx, cy - TILE * 0.3, cx + TILE * 0.35, cy + TILE * 0.35);
                        this.mazeLayer.add(g);
                        continue;
                    case Terrain.CLIFF:
                        this.mazeLayer.add(this.add.rectangle(cx, cy, TILE, TILE, 0x1a1018));
                        this.mazeLayer.add(this.add.rectangle(cx, cy, TILE - 8, TILE - 8, 0xff2200, 0.3));
                        continue;
                    case Terrain.WATER:
                        this.mazeLayer.add(this.add.rectangle(cx, cy, TILE, TILE, 0x1858a0));
                        continue;
                    case Terrain.TREE: {
                        this.mazeLayer.add(this.add.rectangle(cx, cy, TILE, TILE, color));
                        const tg = this.add.graphics();
                        tg.fillStyle(0x6b3a1f, 1);
                        tg.fillRect(cx - 2, cy, 4, TILE * 0.3);
                        tg.fillStyle(0x228b34, 1);
                        tg.fillCircle(cx, cy - TILE * 0.1, TILE * 0.25);
                        this.mazeLayer.add(tg);
                        continue;
                    }
                    default:
                        this.mazeLayer.add(this.add.rectangle(cx, cy, TILE, TILE, color));
                }
            }
        }

        // Goal tile
        const goalCx = level.goal.col * TILE + TILE / 2;
        const goalCy = level.goal.row * TILE + TILE / 2;
        this.mazeLayer.add(this.add.rectangle(goalCx, goalCy, TILE, TILE, T.goal, 0.5));

        // Goal lock (if objectives)
        if (level.objectives && level.objectives.length > 0) {
            this.goalLock = this.add.circle(
                offsetX + goalCx, HEADER + goalCy, TILE / 2 - 2, 0x000000, 0.45,
            ).setDepth(DEPTH.GOAL_LOCK);
            this.objTotal = level.objectives.length;
            this.objPositions = [...level.objectives];

            for (const pos of level.objectives) {
                const ox = pos.col * TILE + TILE / 2;
                const oy = pos.row * TILE + TILE / 2;
                const sprite = this.add.circle(ox, oy, TILE * 0.2, 0xff8844).setDepth(DEPTH.SPRITE);
                this.mazeLayer.add(sprite);
                this.objSprites.push(sprite);
            }
        } else {
            this.goalLock = null;
            this.objTotal = 0;
        }

        // Player
        const px = this.gridX * TILE + TILE / 2;
        const py = this.gridY * TILE + TILE / 2;
        const body = this.add.circle(0, 0, TILE * 0.3, 0xf0f0f0);
        const ears = this.add.graphics();
        ears.fillStyle(0xf0f0f0, 1);
        ears.fillCircle(-8, -12, 5);
        ears.fillCircle(8, -12, 5);
        this.player = this.add.container(offsetX + px, HEADER + py, [body, ears]).setDepth(DEPTH.PLAYER);

        // Energy bar (right side panel area)
        const panelX = W - PANEL;
        const barCx = panelX + PANEL / 2;
        let panelY = HEADER + 30;
        this.add.text(barCx, panelY, 'ENERGY', {
            fontSize: '14px', color: T.dim, letterSpacing: 4,
        }).setOrigin(0.5).setDepth(DEPTH.PANEL);
        panelY += 20;
        const barW = PANEL - 48;
        this.energyBarBg = this.add.rectangle(barCx, panelY, barW, 12, 0x222222, 0.6).setDepth(DEPTH.PANEL);
        this.energyBar = this.add.rectangle(barCx, panelY, barW, 12, 0x44cc66).setDepth(DEPTH.PANEL);

        // Obj counter
        if (this.objTotal > 0) {
            panelY += 30;
            this.add.text(barCx, panelY, `FOOD: 0 / ${this.objTotal}`, {
                fontSize: '14px', color: T.dim,
            }).setOrigin(0.5).setDepth(DEPTH.PANEL);
        }

        // Controls hint
        panelY += 40;
        for (const line of ['↑↓←→  move', 'SPACE  rest', 'M  menu']) {
            this.add.text(barCx, panelY, line, {
                fontSize: '14px', color: '#ffffff55',
            }).setOrigin(0.5, 0).setDepth(DEPTH.PANEL);
            panelY += 17;
        }

        // Level indicator
        panelY += 20;
        this.add.text(barCx, panelY, `${this.levelIndex + 1} / ${LEVELS.length}`, {
            fontSize: '13px', color: T.dim,
        }).setOrigin(0.5).setDepth(DEPTH.PANEL);

        // Input
        this.cursors = this.input.keyboard!.createCursorKeys();
        this.wasd = {
            up:    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            down:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            left:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        };
        this.input.keyboard!.addKey('M').on('down', () => {
            this.cameras.main.fadeOut(500, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () =>
                this.scene.start(this.fromScene));
        });

        this.events.once('shutdown', () => {
            this.tweens.killAll();
            this.time.removeAllEvents();
        });

        this.cameras.main.fadeIn(600, 0, 0, 0);
        log.info('tutorial-y2', `level ${this.levelIndex + 1}: ${level.title}`);
    }

    update() {
        if (this.moving) return;

        // SPACE to rest
        if (Phaser.Input.Keyboard.JustDown(this.cursors.space)) {
            if (this.energy < this.energyMax) this.onRest();
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
        if (nx < 0 || nx >= this.cols || ny < 0 || ny >= this.rows) return;

        if (isCliff(this.grid, nx, ny, this.cols, this.rows)) {
            this.onCliffFall();
            return;
        }

        if (!isWalkable(this.grid, nx, ny, this.cols, this.rows, true)) return;

        const onWater = this.grid[ny][nx] === Terrain.WATER;
        const level = LEVELS[this.levelIndex];
        const drain = level.teachEnergy ? (onWater ? 4 : 2) : (onWater ? 1 : 0);

        this.gridX = nx;
        this.gridY = ny;
        this.moving = true;

        const mapW = this.cols * TILE;
        const offsetX = Math.floor((W - PANEL - mapW) / 2);

        this.tweens.add({
            targets: this.player,
            x: offsetX + nx * TILE + TILE / 2,
            y: HEADER + ny * TILE + TILE / 2,
            duration: onWater ? 300 : 170, ease: 'Sine.easeOut',
            onComplete: () => {
                if (drain > 0) this.drainEnergy(drain);
                this.moving = false;
                this.tryCollect();
                this.checkGoal();
            },
        });
    }

    private onCliffFall() {
        this.moving = true;
        this.drainEnergy(25);
        // Reset to start of level
        const level = LEVELS[this.levelIndex];
        this.gridX = level.start.col;
        this.gridY = level.start.row;
        const mapW = this.cols * TILE;
        const offsetX = Math.floor((W - PANEL - mapW) / 2);
        this.player.setPosition(
            offsetX + this.gridX * TILE + TILE / 2,
            HEADER + this.gridY * TILE + TILE / 2,
        );
        if (this.energy > 0) this.moving = false;
    }

    private drainEnergy(amount: number) {
        this.energy = Math.max(0, this.energy - amount);
        this.updateEnergyBar();
        if (this.energy <= 0) this.onForcedRest();
    }

    private onRest() {
        this.moving = true;
        const zzz = this.add.text(this.player.x + 15, this.player.y - 25, 'zz', {
            fontSize: '14px', fontStyle: 'italic', color: '#aaccff',
        }).setOrigin(0.5).setDepth(DEPTH.PLAYER + 1);
        this.tweens.add({ targets: zzz, y: zzz.y - 15, alpha: { from: 1, to: 0.3 },
            duration: 1400, ease: 'Sine.easeOut' });
        this.tweens.add({ targets: this.player, scaleY: 0.9, yoyo: true,
            duration: 800, ease: 'Sine.easeInOut' });
        this.time.delayedCall(2000, () => {
            zzz.destroy();
            this.energy = Math.min(this.energyMax, this.energy + 30);
            this.updateEnergyBar();
            this.moving = false;
        });
    }

    private onForcedRest() {
        this.moving = true;
        const zzz = this.add.text(this.player.x + 15, this.player.y - 25, 'zzz', {
            fontSize: '18px', fontStyle: 'italic', color: '#aaccff',
        }).setOrigin(0.5).setDepth(DEPTH.PLAYER + 1);
        this.tweens.add({ targets: zzz, y: zzz.y - 25, alpha: { from: 1, to: 0.3 },
            duration: 3500, ease: 'Sine.easeOut' });
        this.tweens.add({ targets: this.player, scaleY: 0.85, yoyo: true,
            duration: 1500, ease: 'Sine.easeInOut', repeat: 1 });
        this.time.delayedCall(5000, () => {
            zzz.destroy();
            this.energy = this.energyMax;
            this.updateEnergyBar();
            this.moving = false;
        });
    }

    private updateEnergyBar() {
        const frac = this.energy / this.energyMax;
        this.energyBar.width = this.energyBarBg.width * frac;
        const color = frac > 0.5 ? 0x44cc66 : frac > 0.25 ? 0xcccc44 : 0xcc4444;
        this.energyBar.setFillStyle(color);
    }

    private tryCollect() {
        for (let i = this.objPositions.length - 1; i >= 0; i--) {
            const pos = this.objPositions[i];
            if (pos.col === this.gridX && pos.row === this.gridY) {
                this.objSprites[i].destroy();
                this.objSprites.splice(i, 1);
                this.objPositions.splice(i, 1);
                this.objCollected++;
                if (this.objCollected >= this.objTotal && this.goalLock) {
                    this.tweens.add({
                        targets: this.goalLock, alpha: 0, duration: 400,
                        onComplete: () => { this.goalLock?.destroy(); this.goalLock = null; },
                    });
                }
            }
        }
    }

    private checkGoal() {
        const level = LEVELS[this.levelIndex];
        if (this.gridX !== level.goal.col || this.gridY !== level.goal.row) return;
        if (this.objCollected < this.objTotal) return;

        this.moving = true;
        this.cameras.main.fadeOut(800, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            if (this.levelIndex + 1 < LEVELS.length) {
                // Next tutorial level
                this.scene.start('TutorialY2Scene', {
                    from: this.fromScene,
                    levelIndex: this.levelIndex + 1,
                });
            } else {
                // Tutorial complete — start Year Two January
                this.scene.start('GameY2Scene', { monthIndex: 0, from: 'TitleScene' });
            }
        });
    }
}
