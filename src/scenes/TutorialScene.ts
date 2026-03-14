import Phaser from 'phaser';
import { TILE, MAX_COLS, MAX_ROWS, HEADER, PANEL } from '../constants';
import { ALGORITHMS, WALLS } from '../maze';
import { MOVE_DIRS } from '../mazeUtils';

const W = MAX_COLS * TILE + PANEL;
const H = MAX_ROWS * TILE + HEADER;

// ── Tutorial color theme (purple / yellow) ───────────────────────────────────
const T = {
    floorLight:  0xc8b0e8,
    floorDark:   0x9a78c8,
    wallColor:   0x2a1048,
    goalColor:   0xffe060,
    bgColor:     0x0e0618,
    accent:      0xffe060,
    accentHex:   '#ffe060',
    dimHex:      '#9a78c8',
    textColor:   '#d8c0f8',
    keyColor:    0xffe060,
    gateColor:   0xff6644,
    bushColor:   0x7844aa,
    bushLight:   0x9966cc,
    enemyColor:  0xff4444,
    playerColor: 0xffe060,
    playerGlow:  0xccaaff,
};

interface Gate {
    fromCol: number; fromRow: number;
    toCol: number;   toRow: number;
    graphic: Phaser.GameObjects.Rectangle;
    open: boolean;
}

// ── Season color themes for skill tutorials ─────────────────────────────────
interface SeasonThemeT {
    floorLight: number; floorDark: number; wallColor: number;
    goalColor: number; bgColor: number; accent: number; accentHex: string;
    dimHex: string; textColor: string; bushColor: number; bushLight: number;
    playerColor: number; playerGlow: number; enemyColor: number;
    sceneryColor: number; sceneryLight: number;
    skillName: string;
}

const SEASON_THEMES: Record<string, SeasonThemeT> = {
    Winter: {
        floorLight: 0xb0ccdf, floorDark: 0x7a9db8, wallColor: 0x0e1c28,
        goalColor: 0x7ec8e8, bgColor: 0x080e18, accent: 0xc8e4f4, accentHex: '#c8e4f4',
        dimHex: '#7a9db8', textColor: '#b0ccdf', bushColor: 0xccddee, bushLight: 0xeef4ff,
        playerColor: 0xffffff, playerGlow: 0xc8e4f4, enemyColor: 0x6b4520,
        sceneryColor: 0x556666, sceneryLight: 0x6a7a7a, skillName: 'HOP',
    },
    Spring: {
        floorLight: 0xf5b8cc, floorDark: 0xe088a8, wallColor: 0x5a1828,
        goalColor: 0xff80c0, bgColor: 0x1a0810, accent: 0xffccdd, accentHex: '#ffccdd',
        dimHex: '#e088a8', textColor: '#f5b8cc', bushColor: 0x55aa22, bushLight: 0x77cc44,
        playerColor: 0xffdd44, playerGlow: 0xffccdd, enemyColor: 0x44aa22,
        sceneryColor: 0x778877, sceneryLight: 0x99aa99, skillName: 'STING',
    },
    Summer: {
        floorLight: 0x7ab87a, floorDark: 0x4e8a4e, wallColor: 0x0a2a0a,
        goalColor: 0xf5e040, bgColor: 0x041408, accent: 0xaaffaa, accentHex: '#aaffaa',
        dimHex: '#4e8a4e', textColor: '#7ab87a', bushColor: 0x336622, bushLight: 0x448833,
        playerColor: 0xffffaa, playerGlow: 0xaaffaa, enemyColor: 0xcc5500,
        sceneryColor: 0x5a3a1a, sceneryLight: 0x6a4a2a, skillName: 'GLOW',
    },
    Fall: {
        floorLight: 0xf09838, floorDark: 0xc06818, wallColor: 0x200a02,
        goalColor: 0xffd020, bgColor: 0x120602, accent: 0xffcc88, accentHex: '#ffcc88',
        dimHex: '#c06818', textColor: '#f09838', bushColor: 0xcc6622, bushLight: 0xdd8844,
        playerColor: 0x8b5e3c, playerGlow: 0xffcc88, enemyColor: 0xdd5500,
        sceneryColor: 0x5a3a1a, sceneryLight: 0x7a5a3a, skillName: 'DASH',
    },
};

// ── Tutorial steps ───────────────────────────────────────────────────────────
interface StepConfig {
    cols: number; rows: number; hint: string;
    season?: string;  // if set, uses season theme + teaches that skill
    hardcoded?: number[][];  // optional pre-built maze (wall bitmasks)
}

const ALL_WALLS = 1 | 2 | 4 | 8; // TOP|RIGHT|BOTTOM|LEFT — cell with all walls = isolated

/** Build a maze from a list of edges (col,row → col,row). Starts fully walled. */
function carveMaze(cols: number, rows: number, edges: [number, number, number, number][]): number[][] {
    const ALL = ALL_WALLS;
    const grid = Array.from({ length: rows }, () => Array(cols).fill(ALL));
    for (const [c1, r1, c2, r2] of edges) {
        const dc = c2 - c1, dr = r2 - r1;
        if (dc === 1)  { grid[r1][c1] &= ~2; grid[r2][c2] &= ~8; } // remove RIGHT / LEFT
        if (dc === -1) { grid[r1][c1] &= ~8; grid[r2][c2] &= ~2; }
        if (dr === 1)  { grid[r1][c1] &= ~4; grid[r2][c2] &= ~1; } // remove BOTTOM / TOP
        if (dr === -1) { grid[r1][c1] &= ~1; grid[r2][c2] &= ~4; }
    }
    return grid;
}

/*
 * Hardcoded tutorial mazes — small, simple, designed for each lesson.
 * All use carveMaze(cols, rows, edges) where edges are [c1,r1, c2,r2].
 */

/*
 * Step 1 (3×2): Basic movement — L-shaped, just move and reach the flower.
 *   [S]→[.]→[.]
 *             ↓
 *            [G]
 */
const MAZE_STEP1 = carveMaze(3, 2, [
    [0,0, 1,0], [1,0, 2,0], [2,0, 2,1],
]);

/*
 * Step 2 (4×2): Key + gate — key is down a side branch.
 *   [S]→[.]→[gate]→[.]
 *         ↓          ↓
 *       [key]  .   [G]
 *   Gate blocks (2,0)→(3,0), key at (1,1)
 */
const MAZE_STEP2 = carveMaze(4, 2, [
    [0,0, 1,0], [1,0, 2,0], [2,0, 3,0],  // main corridor
    [1,0, 1,1],                            // branch down to key
    [3,0, 3,1],                            // down to goal
]);

/*
 * Step 3 (4×3): Hiding + enemy — bush between player and enemy, room to roam.
 *   [S]→[bush]→[enemy]→[.]
 *                  ↓      ↓
 *           .     [.]   [.]
 *                  ↓      ↓
 *           .     [.]→ [G]
 */
const MAZE_STEP3 = carveMaze(4, 3, [
    [0,0, 1,0], [1,0, 2,0], [2,0, 3,0],  // top corridor
    [2,0, 2,1], [2,1, 2,2], [2,2, 3,2],  // down left side + across to goal
    [3,0, 3,1], [3,1, 3,2],              // down right side for enemy to roam
]);

/*
 * Step 4 (5×3): Objectives — one branch up, one branch down, goal at end.
 *         [obj1]
 *           ↑
 *   [S]→[.]→[.]→[.]→[G]
 *                ↓
 *              [obj2]
 */
const MAZE_STEP4 = carveMaze(5, 3, [
    [0,0, 0,1],                                         // start down to corridor
    [0,1, 1,1], [1,1, 2,1], [2,1, 3,1], [3,1, 4,1],  // main corridor (row 1)
    [4,1, 4,2],                                         // down to goal
    [2,1, 2,0],                                         // branch up to obj1
    [3,1, 3,2],                                         // branch down to obj2
]);

/*
 * Step 5 (3×3): Fog — same shape as step 3 but with fog.
 */
const MAZE_STEP5 = carveMaze(3, 3, [
    [0,0, 1,0], [1,0, 2,0],
    [2,0, 2,1], [2,1, 2,2],
    [0,0, 0,1], [0,1, 0,2], [0,2, 1,2], [1,2, 2,2],
]);

/*
 * Step 6 (4×3, Winter): HOP — corridor bends, rock blocks the way.
 *   [S]→[.]
 *         ↓
 *       [rock]   ← must hop over
 *         ↓
 *       [.]→[G]
 */
const MAZE_WINTER = carveMaze(4, 3, [
    [0,0, 1,0],              // right
    [1,0, 1,1],              // down into rock at (1,1)
    [1,1, 1,2],              // down past rock
    [1,2, 2,2], [2,2, 3,2],  // right to goal
]);

/*
 * Step 7 (3×2, Spring): STING — enemy patrols, bush to hide in.
 *   [S]→[enemy]→[.]
 *    ↓            ↓
 *  [bush]  .    [G]
 */
const MAZE_SPRING = carveMaze(3, 2, [
    [0,0, 1,0], [1,0, 2,0],  // top corridor
    [2,0, 2,1],               // down to goal
    [0,0, 0,1],               // down to bush alcove
]);

/*
 * Step 8 (3×2, Summer): GLOW — fog + objectives, L-shape.
 *   [S]→[obj]→[.]
 *               ↓
 *         .   [G]
 *   Objective at (1,0), goal at (2,1). Fog hides everything.
 */
const MAZE_SUMMER = carveMaze(3, 2, [
    [0,0, 1,0], [1,0, 2,0],  // top corridor
    [2,0, 2,1],               // bend to goal
]);

/*
 * Step 9 (5×2, Fall): DASH — long corridor with a bend, perfect for dashing.
 *   [S]→[.]→[.]→[.]
 *                  ↓
 *                [G]
 */
const MAZE_FALL = carveMaze(4, 2, [
    [0,0, 1,0], [1,0, 2,0], [2,0, 3,0],  // long straight
    [3,0, 3,1],                            // bend to goal
]);

const STEPS: StepConfig[] = [
    { cols: 3, rows: 2, hint: 'Use arrow keys or WASD to move.\nReach the yellow flower!', hardcoded: MAZE_STEP1 },
    { cols: 4, rows: 2, hint: 'Collect the key to open the gate.', hardcoded: MAZE_STEP2 },
    { cols: 4, rows: 3, hint: 'Hide in bushes when the creature is near!\nReach the flower to continue.', hardcoded: MAZE_STEP3 },
    { cols: 5, rows: 3, hint: 'Collect all treasures before\nthe exit unlocks.', hardcoded: MAZE_STEP4 },
    { cols: 3, rows: 3, hint: 'Fog hides the maze! Explore to reveal tiles.\nFog returns over time — move quickly!', hardcoded: MAZE_STEP5 },
    { cols: 4, rows: 3, hint: 'Bunny can HOP over obstacles!\nPress SPACE then an arrow key.', season: 'Winter', hardcoded: MAZE_WINTER },
    { cols: 3, rows: 2, hint: 'Bee can STING the nearest enemy!\nPress SPACE to stun it.', season: 'Spring', hardcoded: MAZE_SPRING },
    { cols: 3, rows: 2, hint: 'Fairy can GLOW to reveal the map!\nPress SPACE to light up the fog.', season: 'Summer', hardcoded: MAZE_SUMMER },
    { cols: 4, rows: 2, hint: 'Squirrel can DASH 3 cells!\nPress SPACE then an arrow key.', season: 'Fall', hardcoded: MAZE_FALL },
];

export default class TutorialScene extends Phaser.Scene {
    private step = 0;
    private cells!: number[][];
    private tutCols = 4;
    private tutRows = 4;
    private offsetX = 0;
    private offsetY = 0;

    private gridX = 0;
    private gridY = 0;
    private moving = false;
    private slideDir: { dx: number; dy: number } | null = null;

    private player!: Phaser.GameObjects.Container;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private wasd!: Record<string, Phaser.Input.Keyboard.Key>;

    private stepGroup!: Phaser.GameObjects.Group;
    private hintText!: Phaser.GameObjects.Text;
    private stepLabel!: Phaser.GameObjects.Text;

    // Puzzle state
    private keyItems = new Map<string, Phaser.GameObjects.Rectangle>();
    private keyCount = 0;
    private gates: Gate[] = [];
    private bushCells = new Set<string>();
    private isHiding = false;

    // Enemy (inline, step 3 only)
    private enemySprite: Phaser.GameObjects.Container | null = null;
    private enemyCol = 0;
    private enemyRow = 0;
    private enemyMoving = false;
    private enemyTimer: Phaser.Time.TimerEvent | null = null;
    private enemyState: 'wander' | 'hunt' = 'wander';

    // Objectives (step 4)
    private objectives = new Map<string, Phaser.GameObjects.Container>();
    private objCollected = 0;
    private objTotal = 0;
    private goalLocked = false;
    private goalLockOverlay: Phaser.GameObjects.Arc | null = null;

    private goalCol = 0;
    private goalRow = 0;
    private completed = false;

    // Skill tutorial state
    private skillUsed = false;
    private skillArmed = false;
    private sceneryBlocked = new Set<string>();
    private spaceKey!: Phaser.Input.Keyboard.Key;
    private skillHintText: Phaser.GameObjects.Text | null = null;

    // Stun state for enemy
    private enemyStunned = false;

    // Fog of war (step 5 + Summer skill)
    private fogEnabled = false;
    private fogTiles: Phaser.GameObjects.Rectangle[][] = [];
    private fogRevealed = new Set<string>();
    private fogLit      = new Set<string>();
    private fogLastLit  = new Map<string, number>();
    private static FOG_DECAY_START = 15000;    // shorter for tutorial
    private static FOG_DECAY_DURATION = 10000;

    constructor() { super('TutorialScene'); }

    create() {
        this.cameras.main.setBackgroundColor(T.bgColor);

        this.cursors = this.input.keyboard!.createCursorKeys();
        this.wasd = {
            up:    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            down:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            left:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        };

        this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

        // Title
        this.add.text(W / 2, 30, 'H O W   T O   P L A Y', {
            fontSize: '28px', fontStyle: 'bold', color: T.accentHex,
        }).setOrigin(0.5).setDepth(10);

        this.stepLabel = this.add.text(W / 2, 65, '', {
            fontSize: '15px', color: T.dimHex,
        }).setOrigin(0.5).setDepth(10);

        this.hintText = this.add.text(W / 2, H - 50, '', {
            fontSize: '18px', color: T.textColor, align: 'center',
        }).setOrigin(0.5).setDepth(10);

        // Skip button
        const skip = this.add.text(W - 20, 30, 'Skip ›', {
            fontSize: '16px', color: '#888899',
        }).setOrigin(1, 0.5).setDepth(10).setInteractive({ useHandCursor: true });
        skip.on('pointerover', () => skip.setColor('#ccccdd'));
        skip.on('pointerout',  () => skip.setColor('#888899'));
        skip.on('pointerdown', () => this.goToTitle());

        this.stepGroup = this.add.group();
        this.step = 0;
        this.completed = false;
        this.buildStep();

        this.cameras.main.fadeIn(600, 0, 0, 0);
    }

    /** Active theme — switches to season theme for skill tutorial steps. */
    private activeTheme(): SeasonThemeT | null {
        const cfg = STEPS[this.step];
        return cfg?.season ? SEASON_THEMES[cfg.season] : null;
    }

    // ── Step builder ─────────────────────────────────────────────────────────
    private buildStep() {
        this.clearStep();
        if (this.step >= STEPS.length) {
            this.showComplete();
            return;
        }

        const cfg = STEPS[this.step];
        this.tutCols = cfg.cols;
        this.tutRows = cfg.rows;

        // Apply season bg if this is a skill tutorial
        const st = this.activeTheme();
        this.cameras.main.setBackgroundColor(st ? st.bgColor : T.bgColor);

        // Center the small grid
        this.offsetX = Math.floor((W - cfg.cols * TILE) / 2);
        this.offsetY = Math.floor(90 + (H - 90 - 80 - cfg.rows * TILE) / 2);

        this.stepLabel.setText(`Step ${this.step + 1} of ${STEPS.length}`);
        this.stepLabel.setColor(st ? st.dimHex : T.dimHex);
        this.hintText.setText(cfg.hint);
        this.hintText.setColor(st ? st.textColor : T.textColor);

        // Generate maze (or use hardcoded layout)
        this.cells = cfg.hardcoded
            ? cfg.hardcoded.map(row => [...row])
            : ALGORITHMS.dfs.generate(cfg.cols, cfg.rows);

        // Player starts top-left, goal bottom-right
        this.gridX = 0;
        this.gridY = 0;
        this.goalCol = cfg.cols - 1;
        this.goalRow = cfg.rows - 1;
        this.goalLocked = false;

        this.drawMaze();
        this.drawGoal();

        switch (this.step) {
            case 1: this.buildStep2(); break;
            case 2: this.buildStep3(); break;
            case 3: this.buildStep4(); break;
            case 4: this.buildStep5(); break;
        }

        // Skill tutorials (seasonal steps)
        if (cfg.season) {
            switch (cfg.season) {
                case 'Winter': this.buildWinterSkill(); break;
                case 'Spring': this.buildSpringSkill(); break;
                case 'Summer': this.buildSummerSkill(); break;
                case 'Fall':   this.buildFallSkill();   break;
            }
        }

        this.spawnPlayer();
    }

    private clearStep() {
        this.stepGroup.clear(true, true);
        this.keyItems.clear();
        this.keyCount = 0;
        this.gates = [];
        this.bushCells.clear();
        this.isHiding = false;
        this.moving = false;
        this.slideDir = null;
        this.objectives.clear();
        this.objCollected = 0;
        this.objTotal = 0;
        this.goalLockOverlay = null;

        if (this.enemyTimer) { this.enemyTimer.remove(); this.enemyTimer = null; }
        if (this.enemySprite) { this.enemySprite.destroy(); this.enemySprite = null; }
        this.enemyState = 'wander';

        // Fog
        this.fogEnabled = false;
        this.fogTiles = [];
        this.fogRevealed.clear();
        this.fogLit.clear();
        this.fogLastLit.clear();

        // Skill
        this.skillUsed = false;
        this.skillArmed = false;
        this.sceneryBlocked.clear();
        this.skillHintText = null;
        this.enemyStunned = false;
    }

    // ── Maze rendering ───────────────────────────────────────────────────────
    private drawMaze() {
        const st = this.activeTheme();
        const ox = this.offsetX, oy = this.offsetY;
        const cols = this.tutCols, rows = this.tutRows;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if (this.cells[row][col] === ALL_WALLS) continue; // skip isolated cells
                const light = (row + col) % 2 === 0;
                const r = this.add.rectangle(
                    ox + col * TILE + TILE / 2, oy + row * TILE + TILE / 2,
                    TILE, TILE, light ? (st?.floorLight ?? T.floorLight) : (st?.floorDark ?? T.floorDark)
                );
                this.stepGroup.add(r);
            }
        }

        const g = this.add.graphics();
        g.lineStyle(6, st?.wallColor ?? T.wallColor, 1);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if (this.cells[row][col] === ALL_WALLS) continue; // skip isolated cells
                const x = ox + col * TILE, y = oy + row * TILE;
                const walls = this.cells[row][col];
                if (walls & WALLS.TOP)    g.strokeLineShape(new Phaser.Geom.Line(x, y, x + TILE, y));
                if (walls & WALLS.RIGHT)  g.strokeLineShape(new Phaser.Geom.Line(x + TILE, y, x + TILE, y + TILE));
                if (walls & WALLS.BOTTOM) g.strokeLineShape(new Phaser.Geom.Line(x, y + TILE, x + TILE, y + TILE));
                if (walls & WALLS.LEFT)   g.strokeLineShape(new Phaser.Geom.Line(x, y, x, y + TILE));
            }
        }
        this.stepGroup.add(g);
    }

    private drawGoal() {
        const st = this.activeTheme();
        const goalColor = st?.goalColor ?? T.goalColor;
        const cx = this.offsetX + this.goalCol * TILE + TILE / 2;
        const cy = this.offsetY + this.goalRow * TILE + TILE / 2;
        const bg = this.add.rectangle(cx, cy, TILE, TILE, goalColor, 0.35);
        this.stepGroup.add(bg);

        // Simple flower
        const petals = 5;
        for (let i = 0; i < petals; i++) {
            const a = (i / petals) * Math.PI * 2;
            const p = this.add.ellipse(cx + Math.cos(a) * 10, cy + Math.sin(a) * 10, 10, 14, goalColor, 0.8)
                .setAngle((a * 180 / Math.PI) + 90);
            this.stepGroup.add(p);
        }
        const center = this.add.circle(cx, cy, 6, 0xffffff, 0.9);
        this.stepGroup.add(center);
        this.tweens.add({ targets: center, scale: { from: 0.9, to: 1.15 }, yoyo: true, repeat: -1, duration: 1200, ease: 'Sine.easeInOut' });
    }

    private spawnPlayer() {
        const cfg = STEPS[this.step];
        const px = this.offsetX + this.gridX * TILE + TILE / 2;
        const py = this.offsetY + this.gridY * TILE + TILE / 2;

        if (cfg?.season) {
            switch (cfg.season) {
                case 'Winter': this.player = this.buildTutBunny(px, py);   break;
                case 'Spring': this.player = this.buildTutBee(px, py);     break;
                case 'Summer': this.player = this.buildTutFairy(px, py);   break;
                case 'Fall':   this.player = this.buildTutSquirrel(px, py); break;
                default: this.player = this.buildGenericPlayer(px, py);
            }
        } else {
            this.player = this.buildGenericPlayer(px, py);
        }
        this.player.setDepth(5);
        this.stepGroup.add(this.player);
    }

    private buildGenericPlayer(x: number, y: number): Phaser.GameObjects.Container {
        const glow = this.add.circle(0, 0, 20, T.playerGlow, 0.25);
        const body = this.add.circle(0, 0, 12, T.playerColor, 0.95);
        const inner = this.add.circle(0, -2, 5, 0xffffff, 0.7);
        const c = this.add.container(x, y, [glow, body, inner]);
        this.tweens.add({ targets: glow, alpha: { from: 0.15, to: 0.4 }, yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.easeInOut' });
        return c;
    }

    // ── Season-specific player sprites (mirrors GameScene) ──────────────────
    private buildTutBunny(x: number, y: number): Phaser.GameObjects.Container {
        const white = 0xe8f4ff;
        const glow = this.add.circle(0, 0, 22, 0xddeeff, 0.22);
        const earL = this.add.ellipse(-9, -20, 8, 22, white);
        const earR = this.add.ellipse(9, -20, 8, 22, white);
        const innerEarL = this.add.ellipse(-9, -20, 4, 13, 0xffb8c8, 0.8);
        const innerEarR = this.add.ellipse(9, -20, 4, 13, 0xffb8c8, 0.8);
        const body = this.add.ellipse(0, 4, 20, 18, white);
        const head = this.add.circle(0, -7, 9, 0xeef8ff);
        const tail = this.add.circle(0, 13, 6, 0xffffff);
        const eyeL = this.add.circle(-4, -9, 2.5, 0x224488);
        const eyeR = this.add.circle(4, -9, 2.5, 0x224488);
        const nose = this.add.circle(0, -5, 1.8, 0xffaacc);
        const visual = this.add.container(0, 0, [glow, tail, earL, earR, innerEarL, innerEarR, body, head, eyeL, eyeR, nose]);
        const outer = this.add.container(x, y, [visual]);
        this.tweens.add({ targets: [earL, innerEarL], angle: { from: -5, to: 5 }, yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: [earR, innerEarR], angle: { from: 5, to: -5 }, yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: glow, alpha: { from: 0.12, to: 0.32 }, yoyo: true, repeat: -1, duration: 1500 });
        this.tweens.add({ targets: visual, y: 4, yoyo: true, repeat: -1, duration: 950, ease: 'Sine.easeInOut' });
        return outer;
    }

    private buildTutBee(x: number, y: number): Phaser.GameObjects.Container {
        const glow = this.add.circle(0, 0, 22, 0xffdd00, 0.18);
        const wingL = this.add.ellipse(-17, 1, 22, 12, 0xccecff, 0.78);
        const wingR = this.add.ellipse(17, 1, 22, 12, 0xccecff, 0.78);
        const body = this.add.ellipse(0, 3, 13, 20, 0xffdd00);
        const stripe1 = this.add.ellipse(0, -1, 11, 5, 0x111100, 0.75);
        const stripe2 = this.add.ellipse(0, 5, 11, 5, 0x111100, 0.75);
        const stinger = this.add.ellipse(0, 14, 5, 8, 0x333300);
        const head = this.add.circle(0, -11, 7, 0xffcc00);
        const antL = this.add.circle(-5, -20, 2, 0x222200);
        const antR = this.add.circle(5, -20, 2, 0x222200);
        const visual = this.add.container(0, 0, [glow, wingL, wingR, body, stripe1, stripe2, stinger, head, antL, antR]);
        const outer = this.add.container(x, y, [visual]);
        this.tweens.add({ targets: wingL, scaleX: 0.1, yoyo: true, repeat: -1, duration: 90, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: wingR, scaleX: 0.1, yoyo: true, repeat: -1, duration: 90, delay: 45, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: glow, alpha: { from: 0.08, to: 0.28 }, yoyo: true, repeat: -1, duration: 1200 });
        this.tweens.add({ targets: visual, y: 4, yoyo: true, repeat: -1, duration: 800, ease: 'Sine.easeInOut' });
        return outer;
    }

    private buildTutFairy(x: number, y: number): Phaser.GameObjects.Container {
        const glow = this.add.circle(0, 0, 22, 0xffffaa, 0.22);
        const wingL = this.add.ellipse(-14, -1, 18, 28, 0xbbddff, 0.72);
        const wingR = this.add.ellipse(14, -1, 18, 28, 0xbbddff, 0.72);
        const body = this.add.ellipse(0, 4, 11, 16, 0xff88cc);
        const head = this.add.circle(0, -8, 7, 0xffddee);
        const antennaL = this.add.circle(-5, -17, 2, 0xff99cc);
        const antennaR = this.add.circle(5, -17, 2, 0xff99cc);
        const visual = this.add.container(0, 0, [glow, wingL, wingR, body, head, antennaL, antennaR]);
        const outer = this.add.container(x, y, [visual]);
        this.tweens.add({ targets: wingL, scaleX: 0.15, yoyo: true, repeat: -1, duration: 105, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: wingR, scaleX: 0.15, yoyo: true, repeat: -1, duration: 105, delay: 52, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: glow, alpha: { from: 0.12, to: 0.38 }, yoyo: true, repeat: -1, duration: 1500, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: visual, y: 4, yoyo: true, repeat: -1, duration: 950, ease: 'Sine.easeInOut' });
        return outer;
    }

    private buildTutSquirrel(x: number, y: number): Phaser.GameObjects.Container {
        const brown = 0xb05818, tailCol = 0xd88030, cream = 0xffd090;
        const glow = this.add.circle(0, 0, 22, tailCol, 0.15);
        const tailOuter = this.add.ellipse(11, 3, 22, 28, tailCol);
        const tailInner = this.add.ellipse(12, 2, 13, 20, 0xe8a050, 0.65);
        const body = this.add.ellipse(-2, 4, 16, 20, brown);
        const belly = this.add.ellipse(-2, 5, 10, 13, cream, 0.4);
        const head = this.add.circle(-3, -8, 8, brown);
        const earL = this.add.ellipse(-9, -14, 6, 8, brown);
        const earR = this.add.ellipse(3, -14, 6, 8, brown);
        const earLi = this.add.ellipse(-9, -14, 3, 5, 0xffb8c8, 0.7);
        const earRi = this.add.ellipse(3, -14, 3, 5, 0xffb8c8, 0.7);
        const eyeL = this.add.circle(-7, -10, 2.5, 0x331100);
        const eyeR = this.add.circle(0, -10, 2.5, 0x331100);
        const nose = this.add.circle(-3, -5, 1.8, 0x553322);
        const visual = this.add.container(0, 0, [glow, tailOuter, tailInner, body, belly, head, earL, earR, earLi, earRi, eyeL, eyeR, nose]);
        const outer = this.add.container(x, y, [visual]);
        this.tweens.add({ targets: [tailOuter, tailInner], scaleY: { from: 1, to: 1.1 }, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: glow, alpha: { from: 0.08, to: 0.22 }, yoyo: true, repeat: -1, duration: 1400 });
        this.tweens.add({ targets: visual, y: 4, yoyo: true, repeat: -1, duration: 850, ease: 'Sine.easeInOut' });
        return outer;
    }

    // ── Step 2: Keys + Gates ─────────────────────────────────────────────────
    private buildStep2() {
        // Hardcoded: key down the branch at (1,1), gate between (1,0)→(2,0)
        const kx = this.offsetX + 1 * TILE + TILE / 2;
        const ky = this.offsetY + 1 * TILE + TILE / 2;
        const rect = this.add.rectangle(kx, ky, 18, 18, T.keyColor).setRotation(Math.PI / 4);
        this.stepGroup.add(rect);
        this.keyItems.set('1,1', rect);

        // Gate on the right edge of (1,0), blocking passage to (2,0)
        const gx = 1 * TILE + TILE;           // right edge of col 1
        const gy = 0 * TILE + TILE / 2;       // vertical center of row 0
        const graphic = this.add.rectangle(this.offsetX + gx, this.offsetY + gy, 10, TILE - 10, T.gateColor);
        this.stepGroup.add(graphic);
        this.gates.push({ fromCol: 1, fromRow: 0, toCol: 2, toRow: 0, graphic, open: false });
    }

    // ── Step 3: Hiding + Enemy ───────────────────────────────────────────────
    private buildStep3() {
        // Hardcoded: bush at (1,0) between player and enemy, enemy at (2,0)
        this.bushCells.add('1,0');
        this.drawBush(1, 0);

        this.enemyCol = 2;
        this.enemyRow = 0;
        const ex = this.offsetX + this.enemyCol * TILE + TILE / 2;
        const ey = this.offsetY + this.enemyRow * TILE + TILE / 2;
        this.enemySprite = this.buildTutEnemy(ex, ey);
        this.stepGroup.add(this.enemySprite);
        this.scheduleEnemyMove();
    }

    private drawBush(col: number, row: number) {
        const st = this.activeTheme();
        const cx = this.offsetX + col * TILE + TILE / 2;
        const cy = this.offsetY + row * TILE + TILE / 2;
        const b1 = this.add.circle(cx - 9, cy + 5, 11, st?.bushColor ?? T.bushColor, 0.85);
        const b2 = this.add.circle(cx + 9, cy + 5, 11, st?.bushColor ?? T.bushColor, 0.85);
        const b3 = this.add.circle(cx, cy - 3, 13, st?.bushLight ?? T.bushLight, 0.9);
        this.stepGroup.add(b1);
        this.stepGroup.add(b2);
        this.stepGroup.add(b3);
    }

    // Inline enemy AI
    private scheduleEnemyMove() {
        if (!this.enemySprite) return;
        const delay = this.enemyState === 'hunt' ? 1000 : 1600 + Math.random() * 500;
        this.enemyTimer = this.time.delayedCall(delay, () => this.moveEnemy());
    }

    private moveEnemy() {
        if (!this.enemySprite || this.enemyMoving || this.completed || this.enemyStunned) {
            if (!this.enemyStunned) this.scheduleEnemyMove();
            return;
        }

        // Detect player
        const dist = Math.abs(this.gridX - this.enemyCol) + Math.abs(this.gridY - this.enemyRow);
        if (!this.isHiding && dist <= 4) this.enemyState = 'hunt';
        else this.enemyState = 'wander';

        const walls = this.cells[this.enemyRow][this.enemyCol];
        const valid = MOVE_DIRS.filter(d => !(walls & d.wall));
        if (valid.length === 0) { this.scheduleEnemyMove(); return; }

        let dir;
        if (this.enemyState === 'hunt') {
            dir = [...valid].sort((a, b) => {
                const da = Math.abs(this.gridX - (this.enemyCol + a.dc)) + Math.abs(this.gridY - (this.enemyRow + a.dr));
                const db = Math.abs(this.gridX - (this.enemyCol + b.dc)) + Math.abs(this.gridY - (this.enemyRow + b.dr));
                return da - db;
            })[0];
        } else {
            dir = valid[Math.floor(Math.random() * valid.length)];
        }

        this.enemyCol += dir.dc;
        this.enemyRow += dir.dr;
        this.enemyMoving = true;

        this.tweens.add({
            targets: this.enemySprite,
            x: this.offsetX + this.enemyCol * TILE + TILE / 2,
            y: this.offsetY + this.enemyRow * TILE + TILE / 2,
            duration: this.enemyState === 'hunt' ? 900 : 1300,
            ease: 'Sine.easeInOut',
            onComplete: () => {
                this.enemyMoving = false;
                if (!this.isHiding && this.enemyCol === this.gridX && this.enemyRow === this.gridY) {
                    this.onCaught();
                }
                this.scheduleEnemyMove();
            },
        });
    }

    private onCaught() {
        // Reset player to start
        this.gridX = 0;
        this.gridY = 0;
        this.tweens.killTweensOf(this.player);
        this.tweens.add({
            targets: this.player,
            x: this.offsetX + TILE / 2,
            y: this.offsetY + TILE / 2,
            alpha: 1.0,
            duration: 400,
            ease: 'Power2',
        });
        // Scatter enemy
        const walls = this.cells[this.enemyRow][this.enemyCol];
        const away = MOVE_DIRS.filter(d => !(walls & d.wall))
            .sort((a, b) => {
                const da = Math.abs(this.gridX - (this.enemyCol + a.dc)) + Math.abs(this.gridY - (this.enemyRow + a.dr));
                const db = Math.abs(this.gridX - (this.enemyCol + b.dc)) + Math.abs(this.gridY - (this.enemyRow + b.dr));
                return db - da;
            })[0];
        if (away && this.enemySprite) {
            this.enemyCol += away.dc;
            this.enemyRow += away.dr;
            this.tweens.add({
                targets: this.enemySprite,
                x: this.offsetX + this.enemyCol * TILE + TILE / 2,
                y: this.offsetY + this.enemyRow * TILE + TILE / 2,
                duration: 400,
                ease: 'Back.easeOut',
            });
        }
    }

    // ── Step 4: Objectives ───────────────────────────────────────────────────
    private buildStep4() {
        this.goalLocked = true;
        this.objTotal = 2;

        // Lock overlay on goal
        const gcx = this.offsetX + this.goalCol * TILE + TILE / 2;
        const gcy = this.offsetY + this.goalRow * TILE + TILE / 2;
        this.goalLockOverlay = this.add.circle(gcx, gcy, TILE / 2 - 2, 0x000000, 0.45).setDepth(2);
        this.stepGroup.add(this.goalLockOverlay);

        // Hardcoded: objectives at (2,0) up and (3,2) down — the branch ends
        for (const [col, row] of [[2, 0], [3, 2]] as [number, number][]) {
            const cx = this.offsetX + col * TILE + TILE / 2;
            const cy = this.offsetY + row * TILE + TILE / 2;
            const glow = this.add.circle(0, 0, 14, T.goalColor, 0.2);
            const gem = this.add.circle(0, 0, 8, T.goalColor, 0.9);
            const sparkle = this.add.circle(0, -3, 3, 0xffffff, 0.7);
            const c = this.add.container(cx, cy, [glow, gem, sparkle]).setDepth(1.5);
            this.tweens.add({ targets: glow, alpha: { from: 0.1, to: 0.35 }, yoyo: true, repeat: -1, duration: 1000, ease: 'Sine.easeInOut' });
            this.tweens.add({ targets: c, y: cy + 3, yoyo: true, repeat: -1, duration: 1300, ease: 'Sine.easeInOut' });
            this.stepGroup.add(c);
            this.objectives.set(`${col},${row}`, c);
        }
    }

    // ── Step 5: Fog of War ──────────────────────────────────────────────────
    private buildStep5() {
        this.fogEnabled = true;
        this.fogTiles = [];

        // Place 2 objectives (same as step 4) so there's a reason to explore
        this.goalLocked = true;
        this.objTotal = 2;
        const gcx = this.offsetX + this.goalCol * TILE + TILE / 2;
        const gcy = this.offsetY + this.goalRow * TILE + TILE / 2;
        this.goalLockOverlay = this.add.circle(gcx, gcy, TILE / 2 - 2, 0x000000, 0.45).setDepth(2);
        this.stepGroup.add(this.goalLockOverlay);

        const path = this.solvePath();
        const candidates = path.filter(c =>
            !(c.col === 0 && c.row === 0) &&
            !(c.col === this.goalCol && c.row === this.goalRow)
        );
        const i1 = Math.floor(candidates.length * 0.3);
        const i2 = Math.floor(candidates.length * 0.7);
        for (const idx of [i1, i2]) {
            const { col, row } = candidates[idx];
            const cx = this.offsetX + col * TILE + TILE / 2;
            const cy = this.offsetY + row * TILE + TILE / 2;
            const glow = this.add.circle(0, 0, 14, T.goalColor, 0.2);
            const gem = this.add.circle(0, 0, 8, T.goalColor, 0.9);
            const sparkle = this.add.circle(0, -3, 3, 0xffffff, 0.7);
            const c = this.add.container(cx, cy, [glow, gem, sparkle]).setDepth(1.5);
            this.tweens.add({ targets: glow, alpha: { from: 0.1, to: 0.35 }, yoyo: true, repeat: -1, duration: 1000, ease: 'Sine.easeInOut' });
            this.tweens.add({ targets: c, y: cy + 3, yoyo: true, repeat: -1, duration: 1300, ease: 'Sine.easeInOut' });
            this.stepGroup.add(c);
            this.objectives.set(`${col},${row}`, c);
        }

        // Create fog overlay — one opaque rectangle per cell
        for (let row = 0; row < this.tutRows; row++) {
            this.fogTiles[row] = [];
            for (let col = 0; col < this.tutCols; col++) {
                const fx = this.offsetX + col * TILE + TILE / 2;
                const fy = this.offsetY + row * TILE + TILE / 2;
                if (this.cells[row][col] === ALL_WALLS) { this.fogTiles[row][col] = null as any; continue; }
                const fog = this.add.rectangle(fx, fy, TILE, TILE, T.bgColor, 1.0).setDepth(8);
                this.stepGroup.add(fog);
                this.fogTiles[row][col] = fog;
            }
        }

        // Reveal around starting position
        this.revealTutorialFog(0, 0);
    }

    private revealTutorialFog(centerCol: number, centerRow: number) {
        const now = this.time.now;
        const prevLit = new Set(this.fogLit);
        this.fogLit.clear();

        // Reveal in a 1-cell radius (the cell itself + orthogonal neighbours)
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (Math.abs(dr) + Math.abs(dc) > 1) continue; // skip diagonals
                const c = centerCol + dc, r = centerRow + dr;
                if (c < 0 || c >= this.tutCols || r < 0 || r >= this.tutRows) continue;
                const key = `${c},${r}`;
                this.fogLit.add(key);
                this.fogRevealed.add(key);
                this.fogLastLit.set(key, now);
                // Immediately make fully visible
                this.fogTiles[r]?.[c]?.setAlpha(0);
            }
        }

        // Cells that just left the lit radius → dim them
        for (const key of prevLit) {
            if (!this.fogLit.has(key)) {
                const [c, r] = key.split(',').map(Number);
                this.fogTiles[r]?.[c]?.setAlpha(0.52);
            }
        }
    }

    private updateTutorialFogDecay() {
        const now = this.time.now;
        for (const key of this.fogRevealed) {
            if (this.fogLit.has(key)) continue; // currently visible
            const lastLit = this.fogLastLit.get(key);
            if (lastLit === undefined) continue;
            const elapsed = now - lastLit;
            if (elapsed < TutorialScene.FOG_DECAY_START) continue; // grace period
            const decay = elapsed - TutorialScene.FOG_DECAY_START;
            const t = Math.min(decay / TutorialScene.FOG_DECAY_DURATION, 1);
            const [c, r] = key.split(',').map(Number);
            // Fade from dim (0.52) back to fully hidden (1.0)
            const alpha = 0.52 + t * 0.48;
            this.fogTiles[r]?.[c]?.setAlpha(alpha);
            if (t >= 1) {
                this.fogRevealed.delete(key);
                this.fogLastLit.delete(key);
            }
        }
    }

    // ── Season-specific enemy sprites (mirrors Hazard class) ──────────────────
    private buildTutEnemy(x: number, y: number, season?: string): Phaser.GameObjects.Container {
        switch (season) {
            case 'Spring': return this.buildTutFrog(x, y);
            case 'Fall':   return this.buildTutFox(x, y);
            case 'Winter': return this.buildTutOwl(x, y);
            case 'Summer': return this.buildTutSnake(x, y);
            default:       return this.buildTutGenericEnemy(x, y);
        }
    }

    private buildTutGenericEnemy(x: number, y: number): Phaser.GameObjects.Container {
        const danger = this.add.circle(0, 0, 18, T.enemyColor, 0.15);
        const ebody = this.add.circle(0, 0, 10, T.enemyColor, 0.9);
        const eye1 = this.add.circle(-4, -3, 2.5, 0xffffff, 0.9);
        const eye2 = this.add.circle(4, -3, 2.5, 0xffffff, 0.9);
        const c = this.add.container(x, y, [danger, ebody, eye1, eye2]).setDepth(4);
        this.tweens.add({ targets: danger, alpha: { from: 0.1, to: 0.3 }, yoyo: true, repeat: -1, duration: 800, ease: 'Sine.easeInOut' });
        return c;
    }

    private buildTutFrog(x: number, y: number): Phaser.GameObjects.Container {
        const green = 0x44aa22, dark = 0x2a7a10, belly = 0x99cc44;
        const danger = this.add.circle(0, 0, 24, 0xcc2200, 0);
        const legBL = this.add.ellipse(-15, 14, 16, 8, dark, 0.85).setAngle(-35);
        const legBR = this.add.ellipse(15, 14, 16, 8, dark, 0.85).setAngle(35);
        const legFL = this.add.ellipse(-16, -5, 10, 6, dark, 0.8).setAngle(-20);
        const legFR = this.add.ellipse(16, -5, 10, 6, dark, 0.8).setAngle(20);
        const body = this.add.circle(0, 4, 18, green);
        const bellySpot = this.add.ellipse(0, 6, 22, 14, belly, 0.45);
        const head = this.add.circle(0, -10, 12, 0x55bb33);
        const mouth = this.add.ellipse(0, -4, 20, 5, dark, 0.65);
        const eyeL = this.add.circle(-14, -12, 8, 0xffffff);
        const eyeR = this.add.circle(14, -12, 8, 0xffffff);
        const irisL = this.add.circle(-14, -12, 5, 0xcc8800);
        const irisR = this.add.circle(14, -12, 5, 0xcc8800);
        const pupL = this.add.circle(-14, -12, 2.5, 0x111111);
        const pupR = this.add.circle(14, -12, 2.5, 0x111111);
        const visual = this.add.container(0, 0, [danger, legBL, legBR, legFL, legFR, body, bellySpot, head, mouth, eyeL, eyeR, irisL, irisR, pupL, pupR]);
        const outer = this.add.container(x, y, [visual]).setDepth(4);
        this.tweens.add({ targets: visual, y: { from: 0, to: -5 }, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
        return outer;
    }

    private buildTutSnake(x: number, y: number): Phaser.GameObjects.Container {
        const bodyCol = 0xcc5500, headCol = 0xdd6600, bellyCol = 0xffcc88;
        const danger = this.add.circle(0, 0, 24, 0xcc2200, 0);
        const tail = this.add.circle(-13, -10, 4, bodyCol);
        const s4 = this.add.circle(-18, -3, 6, bodyCol);
        const s3 = this.add.circle(-17, 7, 7, bodyCol);
        const s2 = this.add.circle(-11, 13, 8, bodyCol);
        const s1 = this.add.circle(-4, 9, 9, bodyCol);
        const head = this.add.ellipse(0, 0, 20, 14, headCol);
        const belly = this.add.ellipse(0, 1, 12, 7, bellyCol, 0.80);
        const eyeL = this.add.circle(-5, -4, 2.5, 0xffffff);
        const pupL = this.add.circle(-5, -4, 1.5, 0x111111);
        const eyeR = this.add.circle(4, -4, 2.5, 0xffffff);
        const pupR = this.add.circle(4, -4, 1.5, 0x111111);
        const visual = this.add.container(0, 0, [danger, tail, s4, s3, s2, s1, head, belly, eyeL, pupL, eyeR, pupR]);
        const outer = this.add.container(x, y, [visual]).setDepth(4);
        this.tweens.add({ targets: visual, angle: { from: -7, to: 7 }, yoyo: true, repeat: -1, duration: 1300, ease: 'Sine.easeInOut' });
        return outer;
    }

    private buildTutFox(x: number, y: number): Phaser.GameObjects.Container {
        const orange = 0xdd5500, light = 0xee8833, cream = 0xffd090, dark = 0x221100;
        const danger = this.add.circle(0, 0, 24, 0xcc2200, 0);
        const tail = this.add.ellipse(0, 17, 18, 14, light, 0.9);
        const tailTip = this.add.circle(0, 23, 6, cream, 0.9);
        const body = this.add.ellipse(0, 3, 18, 22, orange);
        const belly = this.add.ellipse(0, 4, 10, 15, cream, 0.5);
        const head = this.add.ellipse(0, -8, 16, 14, orange);
        const snout = this.add.ellipse(0, -17, 8, 10, light);
        const nose = this.add.circle(0, -21, 3, dark);
        const earL = this.add.ellipse(-10, -13, 8, 12, orange);
        const earR = this.add.ellipse(10, -13, 8, 12, orange);
        const earLi = this.add.ellipse(-10, -13, 4, 7, dark, 0.45);
        const earRi = this.add.ellipse(10, -13, 4, 7, dark, 0.45);
        const eyeL = this.add.circle(-6, -10, 2.5, 0xdd9900);
        const eyeR = this.add.circle(6, -10, 2.5, 0xdd9900);
        const pupL = this.add.circle(-6, -10, 1.5, dark);
        const pupR = this.add.circle(6, -10, 1.5, dark);
        const visual = this.add.container(0, 0, [danger, tail, tailTip, body, belly, head, snout, nose, earL, earR, earLi, earRi, eyeL, eyeR, pupL, pupR]);
        const outer = this.add.container(x, y, [visual]).setDepth(4);
        this.tweens.add({ targets: [tail, tailTip], angle: { from: -13, to: 13 }, yoyo: true, repeat: -1, duration: 1500, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: visual, y: { from: 0, to: -4 }, yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.easeInOut' });
        return outer;
    }

    private buildTutOwl(x: number, y: number): Phaser.GameObjects.Container {
        const brown = 0x6b4520, light = 0x9a6840, cream = 0xe8dcc8;
        const danger = this.add.circle(0, 0, 24, 0xcc2200, 0);
        const body = this.add.circle(0, 5, 18, brown);
        const wingL = this.add.ellipse(-14, 6, 12, 22, light, 0.75);
        const wingR = this.add.ellipse(14, 6, 12, 22, light, 0.75);
        const tail = this.add.ellipse(0, 19, 18, 10, light, 0.9);
        const face = this.add.circle(0, -4, 13, cream);
        const tuftL = this.add.ellipse(-8, -18, 7, 13, brown);
        const tuftR = this.add.ellipse(8, -18, 7, 13, brown);
        const eyeL = this.add.circle(-6, -6, 6, 0xffe060);
        const eyeR = this.add.circle(6, -6, 6, 0xffe060);
        const pupL = this.add.circle(-6, -6, 3.5, 0x111111);
        const pupR = this.add.circle(6, -6, 3.5, 0x111111);
        const beak = this.add.ellipse(0, -1, 9, 6, 0xcc8800);
        const visual = this.add.container(0, 0, [danger, body, wingL, wingR, tail, face, tuftL, tuftR, eyeL, eyeR, pupL, pupR, beak]);
        const outer = this.add.container(x, y, [visual]).setDepth(4);
        this.tweens.add({ targets: visual, angle: { from: -12, to: 12 }, yoyo: true, repeat: -1, duration: 2600, ease: 'Sine.easeInOut' });
        return outer;
    }

    // ── Scenery obstacle drawing ─────────────────────────────────────────────
    private drawSceneryBlock(col: number, row: number) {
        const st = this.activeTheme();
        const cx = this.offsetX + col * TILE + TILE / 2;
        const cy = this.offsetY + row * TILE + TILE / 2;
        const c1 = st?.sceneryColor ?? 0x556666;
        const c2 = st?.sceneryLight ?? 0x6a7a7a;
        const r1 = this.add.ellipse(cx, cy + 4, 44, 32, c1, 0.85);
        const r2 = this.add.ellipse(cx - 2, cy - 2, 36, 26, c2, 0.8);
        this.stepGroup.add(r1);
        this.stepGroup.add(r2);
        this.sceneryBlocked.add(`${col},${row}`);
    }

    // ── Skill hint text (below the maze, above the main hint) ─────────────
    private showSkillHint(text: string) {
        const st = this.activeTheme()!;
        if (this.skillHintText) this.skillHintText.destroy();
        this.skillHintText = this.add.text(W / 2, this.offsetY - 18, text, {
            fontSize: '16px', fontStyle: 'bold', color: st.accentHex, align: 'center',
        }).setOrigin(0.5).setDepth(10);
        this.stepGroup.add(this.skillHintText);
    }

    private updateSkillHint() {
        if (!this.skillHintText) return;
        const cfg = STEPS[this.step];
        if (!cfg?.season) return;
        const st = SEASON_THEMES[cfg.season];
        if (this.skillUsed) {
            this.skillHintText.setText(`${st.skillName} used!`);
            this.skillHintText.setAlpha(0.4);
        } else if (this.skillArmed) {
            this.skillHintText.setText(`${st.skillName} ready — press an arrow!`);
        } else {
            this.skillHintText.setText(`Press SPACE to use ${st.skillName}`);
        }
    }

    // ── Step 6: Winter — Bunny HOP ─────────────────────────────────────────
    private buildWinterSkill() {
        // Hardcoded rock at (1,1) — blocks the vertical corridor.
        // Player approaches from (1,0) and hops south over the rock to (1,2).
        this.drawSceneryBlock(1, 1);
        this.showSkillHint('Press SPACE to use HOP');
    }

    // ── Step 7: Spring — Bee STING ─────────────────────────────────────────
    private buildSpringSkill() {
        // Hardcoded: bush at (0,1) for hiding, enemy starts at (1,0)
        this.bushCells.add('0,1');
        this.drawBush(0, 1);

        this.enemyCol = 1;
        this.enemyRow = 0;
        const ex = this.offsetX + this.enemyCol * TILE + TILE / 2;
        const ey = this.offsetY + this.enemyRow * TILE + TILE / 2;
        this.enemySprite = this.buildTutEnemy(ex, ey, 'Spring');
        this.stepGroup.add(this.enemySprite);
        this.scheduleEnemyMove();

        this.showSkillHint('Press SPACE to use STING');
    }

    // ── Step 8: Summer — Fairy GLOW ────────────────────────────────────────
    private buildSummerSkill() {
        this.fogEnabled = true;
        this.fogTiles = [];

        // Place 2 objectives so there's reason to use glow
        this.goalLocked = true;
        this.objTotal = 2;
        const gcx = this.offsetX + this.goalCol * TILE + TILE / 2;
        const gcy = this.offsetY + this.goalRow * TILE + TILE / 2;
        this.goalLockOverlay = this.add.circle(gcx, gcy, TILE / 2 - 2, 0x000000, 0.45).setDepth(2);
        this.stepGroup.add(this.goalLockOverlay);

        const path = this.solvePath();
        const candidates = path.filter(c =>
            !(c.col === 0 && c.row === 0) &&
            !(c.col === this.goalCol && c.row === this.goalRow)
        );
        const i1 = Math.floor(candidates.length * 0.3);
        const i2 = Math.floor(candidates.length * 0.7);
        const st = SEASON_THEMES.Summer;
        for (const idx of [i1, i2]) {
            const { col, row } = candidates[idx];
            const cx = this.offsetX + col * TILE + TILE / 2;
            const cy = this.offsetY + row * TILE + TILE / 2;
            const glow = this.add.circle(0, 0, 14, st.goalColor, 0.2);
            const gem = this.add.circle(0, 0, 8, st.goalColor, 0.9);
            const sparkle = this.add.circle(0, -3, 3, 0xffffff, 0.7);
            const c = this.add.container(cx, cy, [glow, gem, sparkle]).setDepth(1.5);
            this.tweens.add({ targets: glow, alpha: { from: 0.1, to: 0.35 }, yoyo: true, repeat: -1, duration: 1000, ease: 'Sine.easeInOut' });
            this.tweens.add({ targets: c, y: cy + 3, yoyo: true, repeat: -1, duration: 1300, ease: 'Sine.easeInOut' });
            this.stepGroup.add(c);
            this.objectives.set(`${col},${row}`, c);
        }

        // Create fog overlay
        const bgColor = st.bgColor;
        for (let row = 0; row < this.tutRows; row++) {
            this.fogTiles[row] = [];
            for (let col = 0; col < this.tutCols; col++) {
                const fx = this.offsetX + col * TILE + TILE / 2;
                const fy = this.offsetY + row * TILE + TILE / 2;
                const fog = this.add.rectangle(fx, fy, TILE, TILE, bgColor, 1.0).setDepth(8);
                this.stepGroup.add(fog);
                this.fogTiles[row][col] = fog;
            }
        }
        this.revealTutorialFog(0, 0);

        this.showSkillHint('Press SPACE to use GLOW');
    }

    // ── Step 9: Fall — Squirrel DASH ───────────────────────────────────────
    private buildFallSkill() {
        // Straight corridor — DASH lets squirrel sprint 3 cells at once
        this.showSkillHint('Press SPACE to use DASH');
    }

    // ── Path solving (BFS) ───────────────────────────────────────────────────
    private solvePath(): { col: number; row: number }[] {
        const cols = this.tutCols, rows = this.tutRows;
        const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
        const prev: ({ col: number; row: number } | null)[][] = Array.from({ length: rows }, () => Array(cols).fill(null));
        const queue = [{ col: 0, row: 0 }];
        visited[0][0] = true;

        while (queue.length > 0) {
            const { col, row } = queue.shift()!;
            if (col === this.goalCol && row === this.goalRow) break;
            for (const { dc, dr, wall } of MOVE_DIRS) {
                const nc = col + dc, nr = row + dr;
                if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
                if (visited[nr][nc] || (this.cells[row][col] & wall)) continue;
                visited[nr][nc] = true;
                prev[nr][nc] = { col, row };
                queue.push({ col: nc, row: nr });
            }
        }

        if (!visited[this.goalRow][this.goalCol]) return [];
        const path: { col: number; row: number }[] = [];
        let cur: { col: number; row: number } | null = { col: this.goalCol, row: this.goalRow };
        while (cur) { path.unshift(cur); cur = prev[cur.row][cur.col]; }
        return path;
    }

    // ── Movement ─────────────────────────────────────────────────────────────
    update() {
        if (this.completed) return;

        // Fog decay
        if (this.fogEnabled) this.updateTutorialFogDecay();

        // Hiding check (step 3 enemy or Spring skill)
        const cfg = STEPS[this.step];
        if (this.step === 2 || cfg?.season === 'Spring') {
            const nowHiding = this.bushCells.has(`${this.gridX},${this.gridY}`);
            if (nowHiding !== this.isHiding) {
                this.isHiding = nowHiding;
                this.tweens.add({ targets: this.player, alpha: nowHiding ? 0.35 : 1.0, duration: 300 });
            }
        }

        if (this.moving) return;

        const K = Phaser.Input.Keyboard;

        // SPACE activates skill in seasonal tutorial steps
        if (cfg?.season && K.JustDown(this.spaceKey)) {
            this.activateTutorialSkill();
            return;
        }

        let dx = 0, dy = 0;
        if      (K.JustDown(this.cursors.left)  || K.JustDown(this.wasd.left))  dx = -1;
        else if (K.JustDown(this.cursors.right) || K.JustDown(this.wasd.right)) dx =  1;
        else if (K.JustDown(this.cursors.up)    || K.JustDown(this.wasd.up))    dy = -1;
        else if (K.JustDown(this.cursors.down)  || K.JustDown(this.wasd.down))  dy =  1;

        if (dx === 0 && dy === 0) return;

        // Handle armed directional skills
        if (this.skillArmed && cfg?.season) {
            if (cfg.season === 'Winter' && this.tryTutorialHop(dx, dy)) return;
            if (cfg.season === 'Fall'   && this.tryTutorialDash(dx, dy)) return;
            // If couldn't fire, disarm and do normal move
            this.skillArmed = false;
            this.updateSkillHint();
        }

        this.slideDir = { dx, dy };
        this.tryStep(dx, dy);
    }

    private tryStep(dx: number, dy: number) {
        const walls = this.cells[this.gridY][this.gridX];
        if (dx ===  1 && (walls & WALLS.RIGHT))  { this.slideDir = null; return; }
        if (dx === -1 && (walls & WALLS.LEFT))   { this.slideDir = null; return; }
        if (dy ===  1 && (walls & WALLS.BOTTOM)) { this.slideDir = null; return; }
        if (dy === -1 && (walls & WALLS.TOP))    { this.slideDir = null; return; }

        const newX = this.gridX + dx;
        const newY = this.gridY + dy;

        // Scenery blocks movement
        if (this.sceneryBlocked.has(`${newX},${newY}`)) { this.slideDir = null; return; }

        // Gate check
        const gate = this.findGate(this.gridX, this.gridY, newX, newY);
        if (gate) {
            if (this.keyCount === 0) { this.slideDir = null; return; }
            this.keyCount--;
            gate.open = true;
            gate.graphic.destroy();
        }

        this.gridX = newX;
        this.gridY = newY;
        this.moving = true;

        this.tweens.add({
            targets: this.player,
            x: this.offsetX + this.gridX * TILE + TILE / 2,
            y: this.offsetY + this.gridY * TILE + TILE / 2,
            duration: 120,
            ease: 'Power2',
            onComplete: () => {
                this.moving = false;
                if (this.fogEnabled) this.revealTutorialFog(this.gridX, this.gridY);
                this.collectKey();
                this.checkObjective();
                this.checkGoal();
                if (this.checkEnemyCollision()) return;
                this.continueSlide();
            },
        });
    }

    /** Check if the player walked onto the enemy's cell. */
    private checkEnemyCollision(): boolean {
        if (this.isHiding || !this.enemySprite || this.enemyStunned) return false;
        if (this.enemyCol === this.gridX && this.enemyRow === this.gridY) {
            this.onCaught();
            return true;
        }
        return false;
    }

    private continueSlide() {
        if (!this.slideDir) return;
        const { dx, dy } = this.slideDir;
        const stillHeld =
            (dx === -1 && (this.cursors.left.isDown  || this.wasd.left.isDown))  ||
            (dx ===  1 && (this.cursors.right.isDown || this.wasd.right.isDown)) ||
            (dy === -1 && (this.cursors.up.isDown    || this.wasd.up.isDown))    ||
            (dy ===  1 && (this.cursors.down.isDown  || this.wasd.down.isDown));
        if (!stillHeld) { this.slideDir = null; return; }
        this.tryStep(dx, dy);
    }

    // ── Tutorial skill activation ─────────────────────────────────────────────
    private activateTutorialSkill() {
        if (this.skillUsed || this.skillArmed) return;
        const cfg = STEPS[this.step];
        if (!cfg?.season) return;

        if (cfg.season === 'Spring') {
            // Sting: stun the enemy
            this.skillUsed = true;
            if (this.enemySprite && !this.enemyStunned) {
                this.enemyStunned = true;
                if (this.enemyTimer) { this.enemyTimer.remove(); this.enemyTimer = null; }
                this.enemySprite.setAlpha(0.4);
                const inner = this.enemySprite.list[0] as Phaser.GameObjects.Arc;
                const spin = this.tweens.add({ targets: inner, angle: { from: 0, to: 360 }, duration: 600, repeat: -1 });
                this.time.delayedCall(5000, () => {
                    if (!this.enemySprite) return;
                    this.enemyStunned = false;
                    this.enemySprite.setAlpha(1.0);
                    spin.stop();
                    inner.setAngle(0);
                    this.scheduleEnemyMove();
                });
            }
            this.tweens.add({ targets: this.player, scaleX: 1.3, scaleY: 1.3, yoyo: true, duration: 200 });
            this.updateSkillHint();
        } else if (cfg.season === 'Summer') {
            // Glow: reveal large fog area
            this.skillUsed = true;
            const now = this.time.now;
            for (let dr = -3; dr <= 3; dr++) {
                for (let dc = -3; dc <= 3; dc++) {
                    const nc = this.gridX + dc, nr = this.gridY + dr;
                    if (nc < 0 || nc >= this.tutCols || nr < 0 || nr >= this.tutRows) continue;
                    const key = `${nc},${nr}`;
                    this.fogRevealed.add(key);
                    this.fogLit.add(key);
                    this.fogLastLit.set(key, now);
                    if (this.fogTiles[nr]?.[nc]) this.fogTiles[nr][nc].setAlpha(0);
                }
            }
            // Flash effect
            const flash = this.add.circle(
                this.player.x, this.player.y, TILE * 3,
                SEASON_THEMES.Summer.accent, 0.4,
            ).setDepth(9);
            this.tweens.add({ targets: flash, alpha: 0, scale: 1.5, duration: 600, onComplete: () => flash.destroy() });
            this.updateSkillHint();
        } else {
            // Winter (Hop) and Fall (Dash) — arm directional mode
            this.skillArmed = true;
            this.updateSkillHint();
        }
    }

    private tryTutorialHop(dx: number, dy: number): boolean {
        const adjX = this.gridX + dx, adjY = this.gridY + dy;
        const walls = this.cells[this.gridY][this.gridX];
        if (dx ===  1 && (walls & WALLS.RIGHT))  return false;
        if (dx === -1 && (walls & WALLS.LEFT))   return false;
        if (dy ===  1 && (walls & WALLS.BOTTOM)) return false;
        if (dy === -1 && (walls & WALLS.TOP))    return false;
        if (!this.sceneryBlocked.has(`${adjX},${adjY}`)) return false;

        const landX = this.gridX + dx * 2, landY = this.gridY + dy * 2;
        if (landX < 0 || landX >= this.tutCols || landY < 0 || landY >= this.tutRows) return false;
        const adjWalls = this.cells[adjY][adjX];
        if (dx ===  1 && (adjWalls & WALLS.RIGHT))  return false;
        if (dx === -1 && (adjWalls & WALLS.LEFT))   return false;
        if (dy ===  1 && (adjWalls & WALLS.BOTTOM)) return false;
        if (dy === -1 && (adjWalls & WALLS.TOP))    return false;
        if (this.sceneryBlocked.has(`${landX},${landY}`)) return false;

        this.skillUsed = true;
        this.skillArmed = false;
        this.gridX = landX;
        this.gridY = landY;
        this.moving = true;
        this.slideDir = null;

        this.tweens.add({
            targets: this.player,
            x: this.offsetX + landX * TILE + TILE / 2,
            y: this.offsetY + landY * TILE + TILE / 2,
            duration: 300,
            ease: 'Sine.easeInOut',
            onComplete: () => {
                this.moving = false;
                if (this.fogEnabled) this.revealTutorialFog(this.gridX, this.gridY);
                this.collectKey();
                this.checkObjective();
                this.checkGoal();
                this.checkEnemyCollision();
            },
        });
        this.tweens.add({ targets: this.player, scaleY: 1.3, yoyo: true, duration: 150 });
        this.updateSkillHint();
        return true;
    }

    private tryTutorialDash(dx: number, dy: number): boolean {
        const walls0 = this.cells[this.gridY][this.gridX];
        if (dx ===  1 && (walls0 & WALLS.RIGHT))  return false;
        if (dx === -1 && (walls0 & WALLS.LEFT))   return false;
        if (dy ===  1 && (walls0 & WALLS.BOTTOM)) return false;
        if (dy === -1 && (walls0 & WALLS.TOP))    return false;
        const nx = this.gridX + dx, ny = this.gridY + dy;
        if (this.sceneryBlocked.has(`${nx},${ny}`)) return false;

        this.skillUsed = true;
        this.skillArmed = false;
        this.moving = true;
        this.slideDir = null;

        const steps: { x: number; y: number }[] = [];
        let cx = this.gridX, cy = this.gridY;
        for (let s = 0; s < 3; s++) {
            const w = this.cells[cy][cx];
            if (dx ===  1 && (w & WALLS.RIGHT))  break;
            if (dx === -1 && (w & WALLS.LEFT))   break;
            if (dy ===  1 && (w & WALLS.BOTTOM)) break;
            if (dy === -1 && (w & WALLS.TOP))    break;
            const nsx = cx + dx, nsy = cy + dy;
            if (nsx < 0 || nsx >= this.tutCols || nsy < 0 || nsy >= this.tutRows) break;
            if (this.sceneryBlocked.has(`${nsx},${nsy}`)) break;
            cx = nsx; cy = nsy;
            steps.push({ x: cx, y: cy });
        }

        if (steps.length === 0) {
            this.skillUsed = false;
            this.skillArmed = true;
            this.moving = false;
            return false;
        }

        this.gridX = steps[steps.length - 1].x;
        this.gridY = steps[steps.length - 1].y;

        this.tweens.add({
            targets: this.player,
            x: this.offsetX + this.gridX * TILE + TILE / 2,
            y: this.offsetY + this.gridY * TILE + TILE / 2,
            duration: 100 * steps.length,
            ease: 'Power3',
            onComplete: () => {
                this.moving = false;
                if (this.fogEnabled) this.revealTutorialFog(this.gridX, this.gridY);
                this.collectKey();
                this.checkObjective();
                this.checkGoal();
            },
        });
        if (dx !== 0) {
            this.tweens.add({ targets: this.player, scaleX: 1.4, scaleY: 0.7, yoyo: true, duration: 100 });
        } else {
            this.tweens.add({ targets: this.player, scaleX: 0.7, scaleY: 1.4, yoyo: true, duration: 100 });
        }
        this.updateSkillHint();
        return true;
    }

    private findGate(fromCol: number, fromRow: number, toCol: number, toRow: number): Gate | null {
        return this.gates.find(g =>
            (g.fromCol === fromCol && g.fromRow === fromRow && g.toCol === toCol && g.toRow === toRow) ||
            (g.fromCol === toCol   && g.fromRow === toRow   && g.toCol === fromCol && g.toRow === fromRow)
        ) ?? null;
    }

    private collectKey() {
        const k = `${this.gridX},${this.gridY}`;
        const rect = this.keyItems.get(k);
        if (!rect) return;
        rect.destroy();
        this.keyItems.delete(k);
        this.keyCount++;
    }

    private checkObjective() {
        const k = `${this.gridX},${this.gridY}`;
        const obj = this.objectives.get(k);
        if (!obj) return;
        this.tweens.killTweensOf(obj);
        obj.destroy();
        this.objectives.delete(k);
        this.objCollected++;
        if (this.objCollected >= this.objTotal && this.goalLockOverlay) {
            this.goalLocked = false;
            this.tweens.add({ targets: this.goalLockOverlay, alpha: 0, duration: 500, onComplete: () => this.goalLockOverlay?.destroy() });
        }
    }

    private checkGoal() {
        if (this.gridX === this.goalCol && this.gridY === this.goalRow && !this.goalLocked) {
            this.onStepComplete();
        }
    }

    private onStepComplete() {
        this.completed = true;
        this.hintText.setColor('#66ff88');

        const isLast = this.step >= STEPS.length - 1;
        const checkmark = isLast ? '✓  Tutorial complete!' : '✓';
        this.hintText.setText(checkmark);

        this.time.delayedCall(1200, () => {
            this.step++;
            this.completed = false;
            const st = this.activeTheme();
            this.hintText.setColor(st ? st.textColor : T.textColor);
            this.buildStep();
        });
    }

    private showComplete() {
        this.hintText.setText('');
        this.stepLabel.setText('');

        // Reset to generic tutorial theme for completion screen
        this.cameras.main.setBackgroundColor(T.bgColor);

        const done = this.add.text(W / 2, H / 2 - 20, 'You\'re ready!', {
            fontSize: '36px', fontStyle: 'bold', color: T.accentHex,
        }).setOrigin(0.5).setAlpha(0);

        const sub = this.add.text(W / 2, H / 2 + 30, 'Returning to title...', {
            fontSize: '18px', color: T.dimHex,
        }).setOrigin(0.5).setAlpha(0);

        this.tweens.add({ targets: [done, sub], alpha: 1, duration: 600, ease: 'Sine.easeIn' });

        this.time.delayedCall(2000, () => this.goToTitle());
    }

    private goToTitle() {
        this.cameras.main.fadeOut(500, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('TitleScene');
        });
    }
}
