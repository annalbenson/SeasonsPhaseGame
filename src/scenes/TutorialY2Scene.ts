import Phaser from 'phaser';
import { TILE, MAX_COLS, MAX_ROWS, HEADER, PANEL } from '../constants';
import { DEPTH } from '../gameplay';
import { Terrain, isWalkable, isCliff } from '../terrain';
import { FogOfWar } from '../fog';
import { SEASONS } from '../seasons';
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
    /** Teach snowdrift extra energy cost on OPEN tiles marked as drifts. */
    drifts?: { col: number; row: number }[];
    /** Enable fog with given reveal radius. */
    fogRadius?: number;
    /** Snow cave positions (ROCK tiles that boost rest). */
    snowCaves?: { col: number; row: number }[];
    /** Teach flooding: tiles that cycle blocked/unblocked. */
    floods?: { col: number; row: number }[];
    /** Teach heat: enable heat meter with this gain per step. */
    heatPerStep?: number;
    /** Teach shade: tiles adjacent to bamboo reduce heat. */
    teachShade?: boolean;
    /** Wind cloud positions and direction. */
    windClouds?: { col: number; row: number; dir: number }[];
    /** Leaf pile positions. */
    leafPiles?: { col: number; row: number }[];
}

function makeGrid(rows: string[]): Terrain[][] {
    // Legend: . = OPEN, # = ROCK, ^ = CLIFF, ~ = WATER, T = TREE, B = BAMBOO
    const map: Record<string, Terrain> = {
        '.': Terrain.OPEN, '#': Terrain.ROCK, '^': Terrain.CLIFF,
        '~': Terrain.WATER, 'T': Terrain.TREE, 'B': Terrain.BAMBOO,
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

// ── Season intro levels ─────────────────────────────────────────────────────

const WINTER_INTROS: TutLevel[] = [
    {
        title: 'Snowdrifts',
        prompt: 'White tiles are snowdrifts — they cost extra energy.\nPlan your route carefully!',
        cols: 7,
        teachEnergy: true,
        grid: makeGrid([
            '#..####',
            '#.T..##',
            '#...T.#',
            '#..#..#',
            '##....#',
            '#...###',
        ]),
        start: { col: 1, row: 5 },
        goal:  { col: 1, row: 0 },
        drifts: [
            { col: 1, row: 2 }, { col: 3, row: 2 }, { col: 2, row: 3 },
            { col: 4, row: 4 }, { col: 3, row: 4 },
        ],
    },
    {
        title: 'Blizzard & Snow Cave',
        prompt: 'Low visibility! Find the snow cave for better rest.\nResting near a cave recovers double energy.',
        cols: 7,
        teachEnergy: true,
        fogRadius: 3,
        grid: makeGrid([
            '#...###',
            '#.#..##',
            '#...T.#',
            '##.#..#',
            '#..T..#',
            '#..####',
        ]),
        start: { col: 1, row: 5 },
        goal:  { col: 1, row: 0 },
        snowCaves: [{ col: 3, row: 3 }],
    },
];

const SPRING_INTROS: TutLevel[] = [
    {
        title: 'Flooding',
        prompt: 'Blue pulsing tiles flood and unflood.\nWait for them to clear, or find another route!',
        cols: 7,
        teachEnergy: true,
        grid: makeGrid([
            '#..####',
            '#.~..##',
            '#..~..#',
            '#...~.#',
            '#T....#',
            '##..###',
        ]),
        start: { col: 2, row: 5 },
        goal:  { col: 1, row: 0 },
        floods: [
            { col: 2, row: 2 }, { col: 3, row: 3 }, { col: 4, row: 2 },
        ],
    },
    {
        title: 'Rising Water',
        prompt: 'Water is rising! Collect the honey uphill\nbefore the flood reaches you.',
        cols: 7,
        teachEnergy: true,
        grid: makeGrid([
            '#..####',
            '#.T..##',
            '#...T.#',
            '#.....#',
            '#~~...#',
            '#~~~###',
        ]),
        start: { col: 3, row: 3 },
        goal:  { col: 1, row: 0 },
        objectives: [{ col: 3, row: 1 }, { col: 3, row: 2 }],
    },
];

const SUMMER_INTROS: TutLevel[] = [
    {
        title: 'Heat',
        prompt: 'Heat builds each step! Step on water to cool off.\nOverheating costs energy.',
        cols: 7,
        teachEnergy: true,
        heatPerStep: 15,
        grid: makeGrid([
            '#..####',
            '#.B..##',
            '#..B..#',
            '#.....#',
            '#~~...#',
            '#~~.###',
        ]),
        start: { col: 3, row: 5 },
        goal:  { col: 1, row: 0 },
    },
    {
        title: 'Shade',
        prompt: 'Bamboo groves provide shade — less heat gain.\nUse shaded tiles to manage your heat!',
        cols: 7,
        teachEnergy: true,
        heatPerStep: 12,
        teachShade: true,
        grid: makeGrid([
            '#..####',
            '#.B..##',
            '#..B..#',
            '#....B#',
            '#..B..#',
            '#...###',
        ]),
        start: { col: 1, row: 5 },
        goal:  { col: 1, row: 0 },
        objectives: [{ col: 3, row: 3 }],
    },
];

const FALL_INTROS: TutLevel[] = [
    {
        title: 'Wind Clouds',
        prompt: 'Wind clouds push you away! You are immune\nfor 3 steps after a push — time your approach.',
        cols: 7,
        teachEnergy: true,
        grid: makeGrid([
            '#..####',
            '#.T..##',
            '#...T.#',
            '#.....#',
            '#..T..#',
            '#...###',
        ]),
        start: { col: 1, row: 5 },
        goal:  { col: 1, row: 0 },
        windClouds: [{ col: 3, row: 2, dir: 1 }],
    },
    {
        title: 'Leaf Piles',
        prompt: 'Leaf piles hide paths — and sometimes berries!\nStep on them to explore.',
        cols: 7,
        teachEnergy: true,
        grid: makeGrid([
            '#..####',
            '#.T..##',
            '#...T.#',
            '#.....#',
            '#.T...#',
            '#...###',
        ]),
        start: { col: 1, row: 5 },
        goal:  { col: 1, row: 0 },
        leafPiles: [
            { col: 2, row: 2 }, { col: 4, row: 3 }, { col: 3, row: 4 },
        ],
    },
];

const SEASON_INTROS: Record<string, TutLevel[]> = {
    WinterY2: WINTER_INTROS,
    SpringY2: SPRING_INTROS,
    SummerY2: SUMMER_INTROS,
    FallY2:   FALL_INTROS,
};

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

    // Season intro mode
    private seasonIntro: string | null = null;
    private targetMonthIndex = 0;
    private activeLevels: TutLevel[] = LEVELS;

    // Season intro mechanics
    private driftSet = new Set<string>();
    private snowCaveSet = new Set<string>();
    private floodSet = new Set<string>();
    private floodBlocked = new Set<string>();
    private floodTimer: Phaser.Time.TimerEvent | null = null;
    private heat = 0;
    private heatMax = 100;
    private heatBar: Phaser.GameObjects.Rectangle | null = null;
    private heatBarBg: Phaser.GameObjects.Rectangle | null = null;
    private leafPileGfx = new Map<string, Phaser.GameObjects.Container>();
    private windCloudData: { col: number; row: number; dir: number; gfx: Phaser.GameObjects.Container }[] = [];
    private windCooldown = 0;
    private fog: FogOfWar | null = null;

    constructor() { super('TutorialY2Scene'); }

    init(data: { from?: string; levelIndex?: number; seasonIntro?: string; targetMonthIndex?: number }) {
        this.fromScene = data.from ?? 'TitleScene';
        this.levelIndex = data.levelIndex ?? 0;
        this.seasonIntro = data.seasonIntro ?? null;
        this.targetMonthIndex = data.targetMonthIndex ?? 0;
        this.activeLevels = this.seasonIntro
            ? (SEASON_INTROS[this.seasonIntro] ?? LEVELS)
            : LEVELS;
    }

    create() {
        const level = this.activeLevels[this.levelIndex];
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
        this.driftSet = new Set();
        this.snowCaveSet = new Set();
        this.floodSet = new Set();
        this.floodBlocked = new Set();
        this.floodTimer = null;
        this.heat = 0;
        this.heatBar = null;
        this.heatBarBg = null;
        this.leafPileGfx = new Map();
        this.windCloudData = [];
        this.windCooldown = 0;
        this.fog = null;

        // Background
        this.cameras.main.setBackgroundColor(T.bg);

        // Header
        const mapW = this.cols * TILE;
        const offsetX = Math.floor((W - PANEL - mapW) / 2);
        const headerLabel = this.seasonIntro
            ? `${this.seasonIntro.replace('Y2', '').toUpperCase()}   I N T R O`
            : 'Y E A R   T W O   T U T O R I A L';
        this.add.text(W / 2 - PANEL / 2, 20, headerLabel, {
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
                    case Terrain.BAMBOO: {
                        this.mazeLayer.add(this.add.rectangle(cx, cy, TILE, TILE, color));
                        const bg = this.add.graphics();
                        bg.fillStyle(0x44882a, 1);
                        bg.fillRect(cx - 8, cy - TILE * 0.35, 3, TILE * 0.7);
                        bg.fillRect(cx - 2, cy - TILE * 0.3, 3, TILE * 0.65);
                        bg.fillRect(cx + 5, cy - TILE * 0.32, 3, TILE * 0.68);
                        this.mazeLayer.add(bg);
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

        // ── Season mechanic overlays ──────────────────────────────────────────
        this.spawnSeasonMechanics(level, offsetX);

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

        // Heat bar (summer intro)
        if (level.heatPerStep) {
            panelY += 22;
            this.add.text(barCx, panelY, 'HEAT', {
                fontSize: '14px', color: T.dim, letterSpacing: 4,
            }).setOrigin(0.5).setDepth(DEPTH.PANEL);
            panelY += 18;
            this.heatBarBg = this.add.rectangle(barCx, panelY, barW, 12, 0x222222, 0.6).setDepth(DEPTH.PANEL);
            this.heatBar = this.add.rectangle(barCx, panelY, 0, 12, 0xff8833).setDepth(DEPTH.PANEL);
        }

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
        this.add.text(barCx, panelY, `${this.levelIndex + 1} / ${this.activeLevels.length}`, {
            fontSize: '13px', color: T.dim,
        }).setOrigin(0.5).setDepth(DEPTH.PANEL);

        // Skip button (season intros only)
        if (this.seasonIntro) {
            panelY += 30;
            const skip = this.add.text(barCx, panelY, 'skip →', {
                fontSize: '14px', color: '#ffffff44',
            }).setOrigin(0.5).setDepth(DEPTH.PANEL).setInteractive({ useHandCursor: true });
            skip.on('pointerover', () => skip.setColor('#ffffff88'));
            skip.on('pointerout',  () => skip.setColor('#ffffff44'));
            skip.on('pointerdown', () => {
                this.cameras.main.fadeOut(500, 0, 0, 0);
                this.cameras.main.once('camerafadeoutcomplete', () =>
                    this.scene.start('GameY2Scene', { monthIndex: this.targetMonthIndex, from: this.fromScene }));
            });
        }

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
            if (this.floodTimer) this.floodTimer.destroy();
            for (const pile of this.leafPileGfx.values()) pile.destroy();
            for (const wc of this.windCloudData) wc.gfx.destroy();
            this.tweens.killAll();
            this.time.removeAllEvents();
        });

        this.cameras.main.fadeIn(600, 0, 0, 0);
        log.info('tutorial-y2', `level ${this.levelIndex + 1}: ${level.title}`);
    }

    update() {
        if (this.moving) return;
        if (this.fog) this.fog.updateDecay(this.time.now);

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

        // Flood tiles — blocked when active
        if (this.floodBlocked.has(`${nx},${ny}`)) return;

        const onWater = this.grid[ny][nx] === Terrain.WATER;
        const level = this.activeLevels[this.levelIndex];
        let drain = level.teachEnergy ? (onWater ? 4 : 2) : (onWater ? 1 : 0);

        // Snowdrift extra cost
        if (this.driftSet.has(`${nx},${ny}`)) drain += 3;

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

                // Fog reveal
                if (this.fog) this.fog.revealAround(this.gridX, this.gridY, this.time.now);

                // Heat mechanic
                if (level.heatPerStep && !onWater) {
                    const shaded = level.teachShade && this.isShaded(nx, ny);
                    const gain = shaded ? Math.floor(level.heatPerStep / 2) : level.heatPerStep;
                    this.heat = Math.min(this.heatMax, this.heat + gain);
                    if (this.heat >= this.heatMax) {
                        this.heat = 0;
                        this.drainEnergy(15);
                    }
                    this.updateHeatBar();
                } else if (level.heatPerStep && onWater) {
                    this.heat = 0;
                    this.updateHeatBar();
                }

                // Leaf pile reveal
                const leafKey = `${nx},${ny}`;
                const pile = this.leafPileGfx.get(leafKey);
                if (pile) {
                    this.tweens.add({
                        targets: pile, scaleX: 0.2, scaleY: 0.1, alpha: 0,
                        duration: 300, ease: 'Power2',
                        onComplete: () => pile.destroy(),
                    });
                    this.leafPileGfx.delete(leafKey);
                }

                // Wind push
                const push = this.getWindPush(nx, ny);
                if (push) {
                    this.applyWindPush(push.dx, push.dy);
                    return;
                }

                this.moving = false;
                this.tryCollect();
                this.checkGoal();
            },
        });
    }

    private isShaded(col: number, row: number): boolean {
        return [[0,-1],[0,1],[-1,0],[1,0]].some(([dc, dr]) => {
            const nc = col + dc, nr = row + dr;
            return nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols
                && this.grid[nr][nc] === Terrain.BAMBOO;
        });
    }

    private updateHeatBar() {
        if (!this.heatBar || !this.heatBarBg) return;
        const frac = this.heat / this.heatMax;
        this.heatBar.width = this.heatBarBg.width * frac;
    }

    private getWindPush(col: number, row: number): { dx: number; dy: number } | null {
        if (this.windCooldown > 0) { this.windCooldown--; return null; }
        for (const cloud of this.windCloudData) {
            const dist = Math.abs(col - cloud.col) + Math.abs(row - cloud.row);
            if (dist <= 1) {
                const dcol = col - cloud.col;
                const drow = row - cloud.row;
                let push: { dx: number; dy: number };
                if (dcol === 0 && drow === 0) {
                    const dirs = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];
                    push = dirs[cloud.dir];
                } else if (Math.abs(dcol) >= Math.abs(drow)) {
                    push = { dx: dcol > 0 ? 1 : -1, dy: 0 };
                } else {
                    push = { dx: 0, dy: drow > 0 ? 1 : -1 };
                }
                this.windCooldown = 3;
                return push;
            }
        }
        return null;
    }

    private applyWindPush(dx: number, dy: number) {
        const nx = this.gridX + dx, ny = this.gridY + dy;
        if (nx < 0 || nx >= this.cols || ny < 0 || ny >= this.rows ||
            !isWalkable(this.grid, nx, ny, this.cols, this.rows, true) ||
            isCliff(this.grid, nx, ny, this.cols, this.rows)) {
            this.moving = false; this.tryCollect(); this.checkGoal(); return;
        }
        this.gridX = nx;
        this.gridY = ny;
        const mapW = this.cols * TILE;
        const offsetX = Math.floor((W - PANEL - mapW) / 2);
        this.tweens.add({
            targets: this.player,
            x: offsetX + nx * TILE + TILE / 2, y: HEADER + ny * TILE + TILE / 2,
            duration: 150, ease: 'Back.easeOut',
            onComplete: () => {
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
        const level = this.activeLevels[this.levelIndex];
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
        const shelter = this.isNearSnowCave();
        const recovery = shelter ? 60 : 30;
        this.moving = true;
        const zzzText = shelter ? 'zz ❄' : 'zz';
        const zzzColor = shelter ? '#aaeeff' : '#aaccff';
        const zzz = this.add.text(this.player.x + 15, this.player.y - 25, zzzText, {
            fontSize: '14px', fontStyle: 'italic', color: zzzColor,
        }).setOrigin(0.5).setDepth(DEPTH.PLAYER + 1);
        this.tweens.add({ targets: zzz, y: zzz.y - 15, alpha: { from: 1, to: 0.3 },
            duration: 1400, ease: 'Sine.easeOut' });
        this.tweens.add({ targets: this.player, scaleY: 0.9, yoyo: true,
            duration: 800, ease: 'Sine.easeInOut' });
        this.time.delayedCall(2000, () => {
            zzz.destroy();
            this.energy = Math.min(this.energyMax, this.energy + recovery);
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
        const level = this.activeLevels[this.levelIndex];
        if (this.gridX !== level.goal.col || this.gridY !== level.goal.row) return;
        if (this.objCollected < this.objTotal) return;

        this.moving = true;
        this.cameras.main.fadeOut(800, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            if (this.levelIndex + 1 < this.activeLevels.length) {
                // Next tutorial level
                this.scene.start('TutorialY2Scene', {
                    from: this.fromScene,
                    levelIndex: this.levelIndex + 1,
                    seasonIntro: this.seasonIntro,
                    targetMonthIndex: this.targetMonthIndex,
                });
            } else if (this.seasonIntro) {
                // Season intro complete — start the target month
                this.scene.start('GameY2Scene', { monthIndex: this.targetMonthIndex, from: this.fromScene });
            } else {
                // Core tutorial complete — start Year Two January
                this.scene.start('GameY2Scene', { monthIndex: 0, from: 'TitleScene' });
            }
        });
    }

    // ── Season mechanic helpers ──────────────────────────────────────────────

    private spawnSeasonMechanics(level: TutLevel, offsetX: number) {
        // Snowdrifts overlay
        if (level.drifts) {
            for (const d of level.drifts) {
                this.driftSet.add(`${d.col},${d.row}`);
                const cx = d.col * TILE + TILE / 2;
                const cy = d.row * TILE + TILE / 2;
                const g = this.add.graphics();
                g.fillStyle(0xe8eef4, 0.5);
                g.fillRect(cx - TILE / 2, cy - TILE / 2, TILE, TILE);
                g.fillStyle(0xc8dce8, 0.4);
                g.fillCircle(cx - 8, cy, 6);
                g.fillCircle(cx + 10, cy - 4, 4);
                this.mazeLayer.add(g);
            }
        }

        // Snow caves overlay
        if (level.snowCaves) {
            for (const sc of level.snowCaves) {
                this.snowCaveSet.add(`${sc.col},${sc.row}`);
                const cx = sc.col * TILE + TILE / 2;
                const cy = sc.row * TILE + TILE / 2;
                const g = this.add.graphics();
                g.fillStyle(0x0a0808, 0.85);
                g.fillEllipse(cx, cy + TILE * 0.15, TILE * 0.55, TILE * 0.45);
                g.fillStyle(0xe8eef4, 0.8);
                g.fillEllipse(cx, cy - TILE * 0.15, TILE * 0.6, TILE * 0.2);
                g.setDepth(DEPTH.SCENERY);
                this.mazeLayer.add(g);
            }
        }

        // Fog of war
        if (level.fogRadius) {
            const season = SEASONS[this.seasonIntro ?? 'WinterY2'] ?? SEASONS.WinterY2;
            this.fog = new FogOfWar(
                this, this.cols, this.rows, true, season,
                (c) => offsetX + c * TILE + TILE / 2,
                (r) => HEADER + r * TILE + TILE / 2,
                level.fogRadius,
            );
            this.fog.revealAround(this.gridX, this.gridY, this.time.now);
        }

        // Flood tiles
        if (level.floods) {
            for (const f of level.floods) {
                this.floodSet.add(`${f.col},${f.row}`);
            }
            // Cycle flood on/off every 3 seconds
            let floodOn = true;
            const floodOverlays: Phaser.GameObjects.Rectangle[] = [];
            for (const f of level.floods) {
                const cx = f.col * TILE + TILE / 2;
                const cy = f.row * TILE + TILE / 2;
                const overlay = this.add.rectangle(cx, cy, TILE, TILE, 0x2060c0, 0.6).setDepth(DEPTH.BUSH);
                this.mazeLayer.add(overlay);
                floodOverlays.push(overlay);
            }
            this.floodBlocked = new Set(this.floodSet);
            this.floodTimer = this.time.addEvent({
                delay: 3000,
                callback: () => {
                    floodOn = !floodOn;
                    for (const o of floodOverlays) o.setAlpha(floodOn ? 0.6 : 0.1);
                    if (floodOn) {
                        this.floodBlocked = new Set(this.floodSet);
                    } else {
                        this.floodBlocked.clear();
                    }
                },
                loop: true,
            });
        }

        // Leaf piles
        if (level.leafPiles) {
            for (const lp of level.leafPiles) {
                const key = `${lp.col},${lp.row}`;
                const cx = lp.col * TILE + TILE / 2;
                const cy = lp.row * TILE + TILE / 2;
                const container = this.add.container(cx, cy);
                const g = this.add.graphics();
                g.fillStyle(0x8b5e3c, 0.85);
                g.fillEllipse(0, 2, TILE * 0.7, TILE * 0.35);
                g.fillStyle(0xcc6622, 0.7);
                g.fillEllipse(-6, -2, TILE * 0.4, TILE * 0.25);
                g.fillEllipse(8, 4, TILE * 0.35, TILE * 0.22);
                container.add(g);
                container.setDepth(DEPTH.HAZARD - 1);
                this.mazeLayer.add(container);
                this.leafPileGfx.set(key, container);
            }
        }

        // Wind clouds
        if (level.windClouds) {
            for (const wc of level.windClouds) {
                const cx = wc.col * TILE + TILE / 2;
                const cy = wc.row * TILE + TILE / 2;
                const container = this.add.container(cx, cy);
                const cc = 0x8899aa;
                container.add(this.add.ellipse(0, 0, TILE * 0.7, TILE * 0.4, cc, 0.6));
                container.add(this.add.ellipse(-TILE * 0.15, -TILE * 0.08, TILE * 0.45, TILE * 0.35, cc, 0.5));
                container.setDepth(DEPTH.HAZARD);
                this.mazeLayer.add(container);
                this.tweens.add({
                    targets: container, y: cy - 4, yoyo: true, repeat: -1,
                    duration: 1800, ease: 'Sine.easeInOut',
                });
                this.windCloudData.push({ col: wc.col, row: wc.row, dir: wc.dir, gfx: container });
            }
        }

        // Shade overlay (tiles adjacent to bamboo)
        if (level.teachShade) {
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if (this.grid[r][c] !== Terrain.OPEN) continue;
                    const adjBamboo = [[0,-1],[0,1],[-1,0],[1,0]].some(([dc, dr]) => {
                        const nc = c + dc, nr = r + dr;
                        return nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols
                            && this.grid[nr][nc] === Terrain.BAMBOO;
                    });
                    if (!adjBamboo) continue;
                    const cx = c * TILE + TILE / 2;
                    const cy = r * TILE + TILE / 2;
                    const g = this.add.graphics();
                    g.fillStyle(0x000000, 0.12);
                    g.fillEllipse(cx - 6, cy - 2, 18, 10);
                    g.fillEllipse(cx + 8, cy + 4, 14, 8);
                    this.mazeLayer.add(g);
                }
            }
        }
    }

    /** Check if player is adjacent to a tutorial snow cave. */
    private isNearSnowCave(): boolean {
        for (const [dc, dr] of [[0,-1],[0,1],[-1,0],[1,0],[0,0]]) {
            if (this.snowCaveSet.has(`${this.gridX + dc},${this.gridY + dr}`)) return true;
        }
        return false;
    }
}
