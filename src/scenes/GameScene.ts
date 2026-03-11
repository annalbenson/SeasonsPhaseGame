import Phaser from 'phaser';
import { TILE, COLS, ROWS, HEADER } from '../constants';
import { ALGORITHMS, AlgorithmKey, WALLS, widenCorridors } from '../maze';
import { MONTHS, MonthConfig, SeasonTheme } from '../seasons';
import { addWeather } from '../weather';
import { Hazard } from '../hazard';

const W = COLS * TILE;

// ── Path-finding ──────────────────────────────────────────────────────────────
const MOVE_DIRS = [
    { dc:  0, dr: -1, wall: WALLS.TOP    },
    { dc:  1, dr:  0, wall: WALLS.RIGHT  },
    { dc:  0, dr:  1, wall: WALLS.BOTTOM },
    { dc: -1, dr:  0, wall: WALLS.LEFT   },
];

type Cell = { col: number; row: number };

function solvePath(cells: number[][], cols: number, rows: number): Cell[] {
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    const prev: (Cell | null)[][] = Array.from({ length: rows }, () => Array(cols).fill(null));
    const queue: Cell[] = [{ col: 0, row: 0 }];
    visited[0][0] = true;

    while (queue.length > 0) {
        const { col, row } = queue.shift()!;
        if (col === cols - 1 && row === rows - 1) break;
        for (const { dc, dr, wall } of MOVE_DIRS) {
            const nc = col + dc, nr = row + dr;
            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
            if (visited[nr][nc] || (cells[row][col] & wall)) continue;
            visited[nr][nc] = true;
            prev[nr][nc] = { col, row };
            queue.push({ col: nc, row: nr });
        }
    }

    const path: Cell[] = [];
    let cur: Cell | null = { col: cols - 1, row: rows - 1 };
    while (cur) { path.unshift(cur); cur = prev[cur.row][cur.col]; }
    return path;
}

// ── Gate data ─────────────────────────────────────────────────────────────────
interface Gate {
    fromCol: number; fromRow: number;
    toCol:   number; toRow:   number;
    graphic: Phaser.GameObjects.Rectangle;
    open: boolean;
}

// ── Helper: letter-spaced text (mimics title screen style) ───────────────────
function spaced(text: string): string {
    return text.toUpperCase().split('').join(' ');
}

// ── Scene ─────────────────────────────────────────────────────────────────────
export default class GameScene extends Phaser.Scene {
    private algorithm: AlgorithmKey = 'dfs';
    private monthConfig!: MonthConfig;
    private fromScene = 'TitleScene';

    private gridX = 0;
    private gridY = 0;

    // Container that holds all maze elements, shifted down by HEADER
    private mazeLayer!: Phaser.GameObjects.Container;

    private player!: Phaser.GameObjects.Container;
    private emitter!: Phaser.GameObjects.Particles.ParticleEmitter;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
    private moving = false;

    private cells!: number[][];

    private keyItems = new Map<string, Phaser.GameObjects.Rectangle>();
    private gates: Gate[] = [];
    private keyCount = 0;
    private inventoryText!: Phaser.GameObjects.Text;

    private bushCells = new Set<string>();
    private hazard!: Hazard;
    private isHiding = false;

    private lives = 3;
    private livesText!: Phaser.GameObjects.Text;

    private objectives   = new Map<string, Phaser.GameObjects.Container>();
    private objCompleted = 0;
    private objTotal     = 0;
    private objText: Phaser.GameObjects.Text | null = null;
    private objDone      = false;
    private goalLock:      Phaser.GameObjects.Arc | null = null;

    constructor() { super('GameScene'); }

    init(data: { algorithm?: AlgorithmKey; month?: number; from?: string }) {
        this.algorithm   = data.algorithm ?? 'dfs';
        this.monthConfig = MONTHS[(data.month ?? 1) - 1];
        this.fromScene   = data.from ?? 'TitleScene';
        this.keyItems    = new Map();
        this.gates       = [];
        this.keyCount    = 0;
        this.bushCells   = new Set();
        this.isHiding    = false;
        this.lives       = 3;
        this.objectives  = new Map();
        this.objCompleted = 0;
        this.objTotal     = 0;
        this.objDone      = false;
        this.goalLock     = null;
        this.objText      = null;
    }

    create() {
        const season    = this.monthConfig.season;
        const fairyGlow = season.uiAccent;

        this.cameras.main.setBackgroundColor(season.bgColor);

        // ── Maze ──────────────────────────────────────────────────────────────
        this.cells = ALGORITHMS[this.algorithm].generate(COLS, ROWS);

        // Widen some corridors — creates occasional 2-tile-wide sections for
        // atmosphere and future interactables (bushes, hiding spots, etc.)
        const widenedCells = widenCorridors(this.cells, COLS, ROWS);

        // All maze content lives in this container, offset below the header
        this.mazeLayer = this.add.container(0, HEADER);

        // Floor tiles
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                const light = (row + col) % 2 === 0;
                this.mazeLayer.add(
                    this.add.rectangle(
                        col * TILE + TILE / 2, row * TILE + TILE / 2,
                        TILE, TILE, light ? season.floorLight : season.floorDark
                    )
                );
            }
        }

        // Goal tile
        this.mazeLayer.add(
            this.add.rectangle(
                (COLS - 1) * TILE + TILE / 2, (ROWS - 1) * TILE + TILE / 2,
                TILE, TILE, season.goalColor
            )
        );
        this.placeGoalFlower(season);

        // Dim overlay on goal — removed once objectives are complete
        if (season.name !== 'Winter') {
            this.goalLock = this.add.circle(
                (COLS - 1) * TILE + TILE / 2,
                (ROWS - 1) * TILE + TILE / 2 + HEADER,
                TILE / 2 - 2, 0x000000, 0.45,
            ).setDepth(1.6);
        }

        // Walls
        const g = this.add.graphics();
        g.lineStyle(4, season.wallColor, 1);
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                const x = col * TILE, y = row * TILE;
                const walls = this.cells[row][col];
                if (walls & WALLS.TOP)    g.strokeLineShape(new Phaser.Geom.Line(x,        y,        x + TILE, y       ));
                if (walls & WALLS.RIGHT)  g.strokeLineShape(new Phaser.Geom.Line(x + TILE, y,        x + TILE, y + TILE));
                if (walls & WALLS.BOTTOM) g.strokeLineShape(new Phaser.Geom.Line(x,        y + TILE, x + TILE, y + TILE));
                if (walls & WALLS.LEFT)   g.strokeLineShape(new Phaser.Geom.Line(x,        y,        x,        y + TILE));
            }
        }
        this.mazeLayer.add(g);

        // Bushes go into mazeLayer BEFORE puzzle items so keys/gates render on top
        this.placeBushes(widenedCells, season);

        // Keys + gates (also added to mazeLayer inside placePuzzleItems)
        this.placePuzzleItems();

        // Season objectives — placed after puzzle items so we can avoid their cells
        this.placeObjectives(season);

        // ── Weather ───────────────────────────────────────────────────────────
        addWeather(this, season.name);

        // ── Fairy + sparkle trail ─────────────────────────────────────────────
        this.createSparkleTexture();

        // Player lives in world space (not in mazeLayer) with y offset applied
        this.gridX = 0; this.gridY = 0;
        const startX = TILE / 2;
        const startY = TILE / 2 + HEADER;
        this.player = this.createPlayerSprite(startX, startY, season);
        this.player.setDepth(2);

        this.spawnHazard(season.name);

        const trailTints: Record<string, number[]> = {
            Spring: [0xffdd00, 0xffffff, 0xffaa00, 0xffee88],
            Summer: [fairyGlow, 0xffffff, fairyGlow, 0xffffff],
            Winter: [0xffffff, 0xddeeff, 0xaaccff, 0xffffff],
            Fall:   [0xd88030, 0xffd090, 0xc06010, 0xffaa00],   // autumn/acorn
        };
        this.emitter = this.add.particles(startX, startY, 'sparkle', {
            scale:     { start: 0.6, end: 0 },
            alpha:     { start: 0.8, end: 0 },
            speed:     { min: 6, max: 28 },
            angle:     { min: 0, max: 360 },
            lifespan:  480,
            frequency: 55,
            quantity:  1,
            tint:      trailTints[season.name] ?? [fairyGlow, 0xffffff],
            blendMode: Phaser.BlendModes.ADD,
        }).setDepth(1.9);

        // ── Header strip ──────────────────────────────────────────────────────
        this.buildHeader(season);

        this.livesText = this.add.text(10, 8, '', {
            fontSize: '14px',
            color:    '#ff5577',
        }).setOrigin(0, 0).setDepth(3);
        this.updateLives();

        this.objText = this.add.text(W - 10, 8, '', {
            fontSize: '13px',
            color:    '#ffe066',
        }).setOrigin(1, 0).setDepth(3);
        this.updateObjText();

        // ── Input ─────────────────────────────────────────────────────────────
        this.cursors = this.input.keyboard!.createCursorKeys();
        this.wasd = {
            up:    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            down:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            left:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        };
        this.input.keyboard!.addKey('R').on('down', () => {
            this.hazard?.destroy();
            this.cameras.main.fadeOut(350, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart());
        });
        this.input.keyboard!.addKey('M').on('down', () => {
            this.hazard?.destroy();
            this.cameras.main.fadeOut(500, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(this.fromScene));
        });

        // ── Inventory (bottom-left, inside maze area) ─────────────────────────
        this.inventoryText = this.add.text(10, ROWS * TILE + HEADER - 10, '', {
            fontSize: '14px', color: '#ffe066',
            backgroundColor: '#00000044', padding: { x: 6, y: 3 },
        }).setDepth(3).setOrigin(0, 1);
        this.updateInventory();

        // Hint (bottom-right)
        this.add.text(W - 10, ROWS * TILE + HEADER - 10, 'R  new maze   M  menu', {
            fontSize: '11px', color: '#ffffff33',
            backgroundColor: '#00000033', padding: { x: 6, y: 3 },
        }).setDepth(3).setOrigin(1, 1);

        // ── Fade in ───────────────────────────────────────────────────────────
        this.cameras.main.fadeIn(900, 0, 0, 0);
    }

    // ── Header strip ──────────────────────────────────────────────────────────
    private buildHeader(season: MonthConfig['season']) {
        // Subtle separator line at the bottom of the header
        this.add.rectangle(W / 2, HEADER - 1, W, 1, season.uiAccent, 0.25).setDepth(3);

        const accentHex = `#${season.uiAccent.toString(16).padStart(6, '0')}`;

        // Month name — spaced-out like the title screen
        this.add.text(W / 2, 30, spaced(this.monthConfig.name), {
            fontSize:  '22px',
            fontStyle: 'bold',
            color:     accentHex,
        }).setOrigin(0.5).setDepth(3);

        // Season name — smaller, muted
        this.add.text(W / 2, 58, season.name, {
            fontSize: '13px',
            color:    `${accentHex}99`,
        }).setOrigin(0.5).setDepth(3);

        // Historical quote — italic, lightly tinted
        this.add.text(W / 2, 80, `"${this.monthConfig.quote}" — ${this.monthConfig.author}`, {
            fontSize:  '12px',
            fontStyle: 'italic',
            color:     `${accentHex}66`,
        }).setOrigin(0.5).setDepth(3);
    }

    // ── Player sprite dispatcher ──────────────────────────────────────────────
    private createPlayerSprite(x: number, y: number, season: SeasonTheme): Phaser.GameObjects.Container {
        switch (season.name) {
            case 'Spring': return this.createBee(x, y);
            case 'Fall':   return this.createSquirrel(x, y);
            case 'Winter': return this.createBunny(x, y);
            default:       return this.createFairy(x, y, season.uiAccent);
        }
    }

    // ── Bee (Spring) ──────────────────────────────────────────────────────────
    private createBee(x: number, y: number): Phaser.GameObjects.Container {
        const glow   = this.add.circle(0, 0, 22, 0xffdd00, 0.18);

        // Wings — translucent, one each side
        const wingL  = this.add.ellipse(-17, 1, 22, 12, 0xccecff, 0.78);
        const wingR  = this.add.ellipse( 17, 1, 22, 12, 0xccecff, 0.78);

        // Body — yellow with dark stripes
        const body    = this.add.ellipse(0,  3, 13, 20, 0xffdd00);
        const stripe1 = this.add.ellipse(0, -1, 11,  5, 0x111100, 0.75);
        const stripe2 = this.add.ellipse(0,  5, 11,  5, 0x111100, 0.75);
        const stinger = this.add.ellipse(0, 14,  5,  8, 0x333300);

        // Head
        const head   = this.add.circle(0, -11, 7, 0xffcc00);

        // Antennae tips
        const antL   = this.add.circle(-5, -20, 2, 0x222200);
        const antR   = this.add.circle( 5, -20, 2, 0x222200);

        const visual = this.add.container(0, 0, [glow, wingL, wingR, body, stripe1, stripe2, stinger, head, antL, antR]);
        const outer  = this.add.container(x, y, [visual]);

        // Wing flutter
        this.tweens.add({ targets: wingL, scaleX: 0.1, yoyo: true, repeat: -1, duration: 90, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: wingR, scaleX: 0.1, yoyo: true, repeat: -1, duration: 90, delay: 45, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: glow, alpha: { from: 0.08, to: 0.28 }, yoyo: true, repeat: -1, duration: 1200 });
        this.tweens.add({ targets: visual, y: 4, yoyo: true, repeat: -1, duration: 800, ease: 'Sine.easeInOut' });

        return outer;
    }

    // ── Bunny (Winter) ────────────────────────────────────────────────────────
    private createBunny(x: number, y: number): Phaser.GameObjects.Container {
        const white = 0xe8f4ff;

        const glow   = this.add.circle(0, 0, 22, 0xddeeff, 0.22);

        // Ears
        const earL     = this.add.ellipse(-9, -20, 8, 22, white);
        const earR     = this.add.ellipse( 9, -20, 8, 22, white);
        const innerEarL = this.add.ellipse(-9, -20, 4, 13, 0xffb8c8, 0.8);
        const innerEarR = this.add.ellipse( 9, -20, 4, 13, 0xffb8c8, 0.8);

        // Body + head
        const body   = this.add.ellipse(0,  4, 20, 18, white);
        const head   = this.add.circle( 0, -7,  9, 0xeef8ff);

        // Fluffy tail
        const tail   = this.add.circle(0, 13, 6, 0xffffff);

        // Face
        const eyeL   = this.add.circle(-4, -9, 2.5, 0x224488);
        const eyeR   = this.add.circle( 4, -9, 2.5, 0x224488);
        const nose   = this.add.circle( 0, -5, 1.8, 0xffaacc);

        const visual = this.add.container(0, 0, [glow, tail, earL, earR, innerEarL, innerEarR, body, head, eyeL, eyeR, nose]);
        const outer  = this.add.container(x, y, [visual]);

        // Ear wiggle
        this.tweens.add({ targets: [earL, innerEarL], angle: { from: -5, to: 5 }, yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: [earR, innerEarR], angle: { from:  5, to: -5 }, yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: glow, alpha: { from: 0.12, to: 0.32 }, yoyo: true, repeat: -1, duration: 1500 });
        this.tweens.add({ targets: visual, y: 4, yoyo: true, repeat: -1, duration: 950, ease: 'Sine.easeInOut' });

        return outer;
    }

    // ── Squirrel (Fall) ───────────────────────────────────────────────────────
    private createSquirrel(x: number, y: number): Phaser.GameObjects.Container {
        const brown   = 0xb05818;
        const tailCol = 0xd88030;
        const cream   = 0xffd090;

        const glow = this.add.circle(0, 0, 22, tailCol, 0.15);

        // Bushy tail — two overlapping ellipses curling to the right
        const tailOuter = this.add.ellipse(11, 3, 22, 28, tailCol);
        const tailInner = this.add.ellipse(12, 2, 13, 20, 0xe8a050, 0.65);

        // Body
        const body  = this.add.ellipse(-2, 4, 16, 20, brown);
        const belly = this.add.ellipse(-2, 5, 10, 13, cream, 0.4);

        // Head
        const head  = this.add.circle(-3, -8, 8, brown);

        // Ears — small rounded with pink inner
        const earL   = this.add.ellipse(-9,  -14, 6, 8, brown);
        const earR   = this.add.ellipse( 3,  -14, 6, 8, brown);
        const earLi  = this.add.ellipse(-9,  -14, 3, 5, 0xffb8c8, 0.7);
        const earRi  = this.add.ellipse( 3,  -14, 3, 5, 0xffb8c8, 0.7);

        // Face
        const eyeL = this.add.circle(-7, -10, 2.5, 0x331100);
        const eyeR = this.add.circle( 0, -10, 2.5, 0x331100);
        const nose = this.add.circle(-3,  -5, 1.8, 0x553322);

        const visual = this.add.container(0, 0, [
            glow, tailOuter, tailInner,
            body, belly, head,
            earL, earR, earLi, earRi,
            eyeL, eyeR, nose,
        ]);
        const outer = this.add.container(x, y, [visual]);

        // Tail fluff
        this.tweens.add({ targets: [tailOuter, tailInner], scaleY: { from: 1, to: 1.1 }, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: glow, alpha: { from: 0.08, to: 0.22 }, yoyo: true, repeat: -1, duration: 1400 });
        this.tweens.add({ targets: visual, y: 4, yoyo: true, repeat: -1, duration: 850, ease: 'Sine.easeInOut' });

        return outer;
    }

    // ── Fairy construction ────────────────────────────────────────────────────
    private createSparkleTexture() {
        if (!this.textures.exists('sparkle')) {
            const g = this.make.graphics({ add: false });
            g.fillStyle(0xffffff, 1);
            g.fillCircle(4, 4, 4);
            g.generateTexture('sparkle', 8, 8);
            g.destroy();
        }
    }

    private createFairy(x: number, y: number, glowColor = 0xdd88ff): Phaser.GameObjects.Container {
        const glow     = this.add.circle(0, 0, 22, glowColor, 0.22);
        const wingL    = this.add.ellipse(-14, -1, 18, 28, 0xbbddff, 0.72);
        const wingR    = this.add.ellipse( 14, -1, 18, 28, 0xbbddff, 0.72);
        const body     = this.add.ellipse(0, 4, 11, 16, 0xff88cc);
        const head     = this.add.circle(0, -8, 7, 0xffddee);
        const antennaL = this.add.circle(-5, -17, 2, 0xff99cc);
        const antennaR = this.add.circle( 5, -17, 2, 0xff99cc);

        const visual = this.add.container(0, 0, [glow, wingL, wingR, body, head, antennaL, antennaR]);
        const outer  = this.add.container(x, y, [visual]);

        this.tweens.add({ targets: wingL, scaleX: 0.15, yoyo: true, repeat: -1, duration: 105, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: wingR, scaleX: 0.15, yoyo: true, repeat: -1, duration: 105, delay: 52, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: glow, alpha: { from: 0.12, to: 0.38 }, yoyo: true, repeat: -1, duration: 1500, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: visual, y: 4, yoyo: true, repeat: -1, duration: 950, ease: 'Sine.easeInOut' });

        return outer;
    }

    // ── Puzzle item placement ─────────────────────────────────────────────────
    private placePuzzleItems() {
        const path = solvePath(this.cells, COLS, ROWS);
        const n    = path.length;
        if (n < 8) return;

        const keyIndices  = [Math.floor(n * 0.18), Math.floor(n * 0.55)];
        const gateIndices = [Math.floor(n * 0.35), Math.floor(n * 0.72)];

        for (const idx of keyIndices) {
            const { col, row } = path[idx];
            const rect = this.add
                .rectangle(col * TILE + TILE / 2, row * TILE + TILE / 2, 16, 16, 0xffe066)
                .setRotation(Math.PI / 4);
            this.mazeLayer.add(rect);
            this.keyItems.set(`${col},${row}`, rect);
        }

        for (const idx of gateIndices) {
            const from = path[idx];
            const to   = path[idx + 1];
            if (!to) continue;

            const dc = to.col - from.col;
            const dr = to.row - from.row;

            let gx: number, gy: number, gw: number, gh: number;
            if      (dc ===  1) { gx = from.col * TILE + TILE;     gy = from.row * TILE + TILE / 2; gw = 10; gh = TILE - 10; }
            else if (dc === -1) { gx = from.col * TILE;             gy = from.row * TILE + TILE / 2; gw = 10; gh = TILE - 10; }
            else if (dr ===  1) { gx = from.col * TILE + TILE / 2; gy = from.row * TILE + TILE;     gw = TILE - 10; gh = 10; }
            else                { gx = from.col * TILE + TILE / 2; gy = from.row * TILE;            gw = TILE - 10; gh = 10; }

            const graphic = this.add.rectangle(gx, gy, gw, gh, 0xcc4444);
            this.mazeLayer.add(graphic);
            this.gates.push({ fromCol: from.col, fromRow: from.row, toCol: to.col, toRow: to.row, graphic, open: false });
        }
    }

    // ── Inventory display ─────────────────────────────────────────────────────
    private updateInventory() {
        const filled = '\u25C6'.repeat(this.keyCount);
        const empty  = '\u25C7'.repeat(Math.max(0, 2 - this.keyCount));
        this.inventoryText.setText(`${filled}${empty}  KEY`);
    }

    // ── Gate lookup ───────────────────────────────────────────────────────────
    private findGate(fromCol: number, fromRow: number, toCol: number, toRow: number): Gate | null {
        return this.gates.find(g =>
            !g.open && (
                (g.fromCol === fromCol && g.fromRow === fromRow && g.toCol === toCol && g.toRow === toRow) ||
                (g.fromCol === toCol   && g.fromRow === toRow   && g.toCol === fromCol && g.toRow === fromRow)
            )
        ) ?? null;
    }

    // ── Update loop ───────────────────────────────────────────────────────────
    update() {
        this.emitter.setPosition(this.player.x, this.player.y);

        // Hiding state — fade fairy when inside a bush cell
        const nowHiding = this.bushCells.has(`${this.gridX},${this.gridY}`);
        if (nowHiding !== this.isHiding) {
            this.isHiding = nowHiding;
            this.tweens.add({ targets: this.player, alpha: nowHiding ? 0.35 : 1.0, duration: 300 });
        }
        this.hazard.setTarget(this.gridX, this.gridY, this.isHiding);

        if (this.moving) return;

        const K = Phaser.Input.Keyboard;
        let dx = 0, dy = 0;

        if      (K.JustDown(this.cursors.left)  || K.JustDown(this.wasd.left))  dx = -1;
        else if (K.JustDown(this.cursors.right) || K.JustDown(this.wasd.right)) dx =  1;
        else if (K.JustDown(this.cursors.up)    || K.JustDown(this.wasd.up))    dy = -1;
        else if (K.JustDown(this.cursors.down)  || K.JustDown(this.wasd.down))  dy =  1;

        if (dx === 0 && dy === 0) return;

        const walls = this.cells[this.gridY][this.gridX];
        if (dx ===  1 && (walls & WALLS.RIGHT))  return;
        if (dx === -1 && (walls & WALLS.LEFT))   return;
        if (dy ===  1 && (walls & WALLS.BOTTOM)) return;
        if (dy === -1 && (walls & WALLS.TOP))    return;

        const newX = this.gridX + dx;
        const newY = this.gridY + dy;

        const gate = this.findGate(this.gridX, this.gridY, newX, newY);
        if (gate) {
            if (this.keyCount === 0) return;
            this.keyCount--;
            gate.open = true;
            gate.graphic.destroy();
            this.updateInventory();
        }

        this.gridX = newX;
        this.gridY = newY;
        this.moving = true;

        this.tweens.add({
            targets:  this.player,
            x:        this.gridX * TILE + TILE / 2,
            y:        this.gridY * TILE + TILE / 2 + HEADER,
            duration: 120,
            ease:     'Power2',
            onComplete: () => {
                this.moving = false;
                this.collectKey();
                this.checkObjective();
                this.checkGoal();
            },
        });
    }

    private collectKey() {
        const k    = `${this.gridX},${this.gridY}`;
        const rect = this.keyItems.get(k);
        if (!rect) return;
        rect.destroy();
        this.keyItems.delete(k);
        this.keyCount++;
        this.updateInventory();
    }

    // ── Goal flower ───────────────────────────────────────────────────────────
    private placeGoalFlower(season: SeasonTheme) {
        // World-space centre of the goal cell (mazeLayer is at y=HEADER)
        const cx = (COLS - 1) * TILE + TILE / 2;
        const cy = (ROWS - 1) * TILE + TILE / 2 + HEADER;

        const parts: Phaser.GameObjects.GameObject[] = [];

        // Helper — lays out `count` rotated ellipses around the origin
        const petals = (count: number, dist: number, w: number, h: number, color: number, alpha = 1, startDeg = 0) => {
            for (let i = 0; i < count; i++) {
                const deg = startDeg + i * (360 / count);
                const rad = (deg * Math.PI) / 180;
                parts.push(
                    this.add.ellipse(Math.sin(rad) * dist, -Math.cos(rad) * dist, w, h, color, alpha)
                        .setAngle(deg),
                );
            }
        };

        switch (season.name) {
            case 'Winter':
                // Six-petalled snowflake flower — ice-blue petals, tip dots, pale centre
                petals(6, 11,  7, 20, 0xddeeff, 0.85);
                petals(6, 21,  4,  4, 0xffffff, 0.70);
                parts.push(this.add.circle(0, 0, 6, 0x7ec8e8));
                break;

            case 'Spring':
                // Five-petalled cherry blossom — blush pink, golden centre
                petals(5, 11, 11, 21, 0xffb7c5);
                parts.push(this.add.circle(0, 0, 6, 0xffe066));
                parts.push(this.add.circle(0, 0, 3, 0xffcc44));
                break;

            case 'Summer':
                // Eight-petalled sunflower — bright yellow, dark brown centre
                petals(8, 14, 10, 22, 0xffdd00);
                petals(8, 11,  7, 16, 0xffc200, 0.55, 22.5);   // staggered inner ring
                parts.push(this.add.circle(0, 0, 10, 0x5c3200));
                parts.push(this.add.circle(0, 0,  5, 0x9a5400));
                break;

            case 'Fall':
                // Chrysanthemum — two layers of petals, warm red-orange, amber centre
                petals(12, 11, 6, 16, 0xd04010);
                petals( 8,  7, 5, 11, 0xe86820);
                parts.push(this.add.circle(0, 0, 4, 0xffaa00));
                break;
        }

        const flower = this.add.container(cx, cy, parts).setDepth(1.5);

        // All flowers breathe gently
        this.tweens.add({
            targets:  flower,
            scaleX:   1.08,
            scaleY:   1.08,
            yoyo:     true,
            repeat:   -1,
            duration: 1800,
            ease:     'Sine.easeInOut',
        });

        // Snowflake and chrysanthemum rotate slowly
        if (season.name === 'Winter' || season.name === 'Fall') {
            this.tweens.add({
                targets:  flower,
                angle:    360,
                repeat:   -1,
                duration: season.name === 'Winter' ? 18000 : 25000,
                ease:     'Linear',
            });
        }
    }

    // ── Bush placement ────────────────────────────────────────────────────────
    private placeBushes(widenedCells: Set<string>, season: MonthConfig['season']) {
        for (const key of widenedCells) {
            const [col, row] = key.split(',').map(Number);
            if (col === 0 && row === 0)               continue;
            if (col === COLS - 1 && row === ROWS - 1) continue;
            if (Math.random() > 0.5)                  continue;

            this.bushCells.add(key);
            const cx = col * TILE + TILE / 2;
            const cy = row * TILE + TILE / 2;

            if (season.name === 'Fall') {
                // Leaf pile — scattered autumn leaves
                const leafColors = [0xd04010, 0xe86820, 0xffaa00, 0xf0d020, 0xc06010, 0xa03008, 0xd4a010];
                const leaves = [
                    { x: -10, y:  -4, w: 10, h: 16, a: -35 },
                    { x:   4, y:  -8, w:  9, h: 15, a:  20 },
                    { x:  10, y:   5, w: 11, h: 15, a: -55 },
                    { x:  -5, y:   8, w: 10, h: 14, a:  40 },
                    { x:  -1, y:  -1, w:  9, h: 14, a:  10 },
                    { x:   8, y:  -3, w:  8, h: 13, a: -20 },
                    { x:  -8, y:   3, w:  7, h: 12, a:  60 },
                ];
                for (const l of leaves) {
                    const c = leafColors[Math.floor(Math.random() * leafColors.length)];
                    this.mazeLayer.add(this.add.ellipse(cx + l.x, cy + l.y, l.w, l.h, c, 0.88).setAngle(l.a));
                }
            } else if (season.name === 'Winter') {
                // Snow pile — irregular lumpy mounds in white/icy blue
                this.mazeLayer.add([
                    this.add.circle(cx - 10, cy + 6, 10, 0xddeeff, 0.90),
                    this.add.circle(cx +  9, cy + 7,  9, 0xe8f4ff, 0.85),
                    this.add.circle(cx -  2, cy - 2, 13, 0xffffff, 0.95),
                    this.add.circle(cx +  5, cy - 5,  8, 0xf0f8ff, 0.80),
                    // Subtle shadow underneath the pile
                    this.add.ellipse(cx, cy + 6, 30, 8, 0x8aaabb, 0.18),
                ]);
            } else if (season.name === 'Spring') {
                // Tall grass — cluster of thin upright blades
                const blades = [
                    { x: -9,  h: 22, a: -12 },
                    { x: -4,  h: 26, a:   5 },
                    { x:  1,  h: 24, a:  -6 },
                    { x:  6,  h: 20, a:  14 },
                    { x: 11,  h: 23, a:  -3 },
                    { x: -6,  h: 18, a:  20 },
                    { x:  4,  h: 19, a: -18 },
                ];
                for (const b of blades) {
                    // Blade — tall thin ellipse, slightly varied greens
                    const green = Math.random() < 0.5 ? 0x66bb33 : 0x88cc44;
                    this.mazeLayer.add(
                        this.add.ellipse(cx + b.x, cy + 2, 5, b.h, green, 0.92).setAngle(b.a)
                    );
                    // Seed tip — tiny darker dot at the top of each blade
                    this.mazeLayer.add(
                        this.add.circle(
                            cx + b.x + Math.sin((b.a * Math.PI) / 180) * (b.h / 2 - 2),
                            cy + 2   - Math.cos((b.a * Math.PI) / 180) * (b.h / 2 - 2),
                            2.5, 0x558822, 0.85
                        )
                    );
                }
            } else {
                // Summer bush — three overlapping circles
                this.mazeLayer.add([
                    this.add.circle(cx - 9, cy + 5, 11, 0x228844, 0.85),
                    this.add.circle(cx + 9, cy + 5, 11, 0x228844, 0.85),
                    this.add.circle(cx,     cy - 3, 13, 0x228844, 0.90),
                ]);
            }
        }
    }

    // ── Hazard spawn ──────────────────────────────────────────────────────────
    private spawnHazard(seasonName: string) {
        // Pick a start cell with Manhattan distance > 5 from the fairy's start
        const candidates: { col: number; row: number }[] = [];
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                if (col === COLS - 1 && row === ROWS - 1) continue;
                if (col + row <= 5) continue;
                candidates.push({ col, row });
            }
        }
        const { col, row } = candidates[Math.floor(Math.random() * candidates.length)];

        this.hazard = new Hazard(this, this.cells, col, row, seasonName, () => {
            this.cameras.main.flash(450, 180, 0, 0);
            this.cameras.main.shake(300, 0.009);

            this.lives--;
            this.updateLives();

            if (this.lives <= 0) {
                // Game over — restart the month with fresh lives
                this.time.delayedCall(700, () => {
                    this.hazard?.destroy();
                    this.cameras.main.fadeOut(600, 0, 0, 0);
                    this.cameras.main.once('camerafadeoutcomplete', () => {
                        this.scene.start('GameScene', {
                            month:     this.monthConfig.month,
                            algorithm: this.algorithm,
                            from:      this.fromScene,
                        });
                    });
                });
            } else {
                // Send fairy back to start, scatter the snake
                this.tweens.killTweensOf(this.player);
                this.gridX    = 0;
                this.gridY    = 0;
                this.moving   = false;
                this.isHiding = false;
                this.tweens.add({
                    targets:  this.player,
                    x:        TILE / 2,
                    y:        TILE / 2 + HEADER,
                    alpha:    1.0,
                    duration: 500,
                    ease:     'Power2',
                });
                this.hazard.scatter();
            }
        });
    }

    // ── Lives display ─────────────────────────────────────────────────────────
    private updateLives() {
        const full  = '♥'.repeat(Math.max(0, this.lives));
        const empty = '♡'.repeat(Math.max(0, 3 - this.lives));
        this.livesText.setText(full + empty);
    }

    // ── Season objectives ─────────────────────────────────────────────────────
    private placeObjectives(season: SeasonTheme) {
        if (season.name === 'Winter') {
            this.objDone  = true;
            this.objTotal = 0;
            this.updateObjText();
            return;
        }

        const count = season.name === 'Spring' ? 3 : 2;
        this.objTotal = count;

        const avoid = new Set<string>(['0,0', `${COLS - 1},${ROWS - 1}`]);
        for (const k of this.keyItems.keys()) avoid.add(k);

        const candidates: Cell[] = [];
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                if (!avoid.has(`${col},${row}`)) candidates.push({ col, row });
            }
        }
        // Fisher-Yates shuffle
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }

        for (let i = 0; i < Math.min(count, candidates.length); i++) {
            const { col, row } = candidates[i];
            const cx = col * TILE + TILE / 2;
            const cy = row * TILE + TILE / 2 + HEADER;
            let container: Phaser.GameObjects.Container;
            switch (season.name) {
                case 'Spring': container = this.buildFlowerSprite(cx, cy); break;
                case 'Summer': container = this.buildPlantSprite(cx, cy);  break;
                default:       container = this.buildAcornSprite(cx, cy);  break;
            }
            this.objectives.set(`${col},${row}`, container);
        }
        this.updateObjText();
    }

    private buildFlowerSprite(cx: number, cy: number): Phaser.GameObjects.Container {
        const palette = [0xffb7c5, 0xcc88ff, 0xffee88, 0xffffff, 0xffaadd];
        const pColor  = palette[Math.floor(Math.random() * palette.length)];
        const parts: Phaser.GameObjects.GameObject[] = [];
        for (let i = 0; i < 5; i++) {
            const rad = (i * 72 * Math.PI) / 180;
            parts.push(
                this.add.ellipse(Math.sin(rad) * 8, -Math.cos(rad) * 8, 7, 14, pColor, 0.9)
                    .setAngle(i * 72),
            );
        }
        parts.push(this.add.circle(0, 0, 5, 0xffe066));
        const c = this.add.container(cx, cy, parts).setDepth(1.8).setAlpha(0.5);
        this.tweens.add({ targets: c, scaleX: 1.1, scaleY: 1.1, yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.easeInOut' });
        return c;
    }

    private buildPlantSprite(cx: number, cy: number): Phaser.GameObjects.Container {
        const parts: Phaser.GameObjects.GameObject[] = [
            this.add.rectangle(0, 12,  16, 12, 0x8b5e3c),            // pot body
            this.add.rectangle(0,  6,  20,  5, 0xaa7b4e),            // pot rim
            this.add.rectangle(0, -2,   3, 12, 0x559933),            // stem
            this.add.ellipse(-9, -6, 12,  8, 0x55aa22, 0.9).setAngle(-30),
            this.add.ellipse( 9, -6, 12,  8, 0x55aa22, 0.9).setAngle( 30),
            this.add.ellipse( 0,-14, 10,  6, 0x66bb33, 0.9),
        ];
        const c = this.add.container(cx, cy, parts).setDepth(1.8).setAlpha(0.45);
        this.tweens.add({ targets: c, scaleX: 1.08, scaleY: 1.08, yoyo: true, repeat: -1, duration: 1600, ease: 'Sine.easeInOut' });
        return c;
    }

    private buildAcornSprite(cx: number, cy: number): Phaser.GameObjects.Container {
        const parts: Phaser.GameObjects.GameObject[] = [
            this.add.rectangle(0, -13,  3,  6, 0x5a3010),            // stem
            this.add.ellipse(  0,  -7, 18, 10, 0x6b3f1e),            // cap
            this.add.circle(  -5, -7,   2, 0x8b5e3c, 0.6),           // cap texture
            this.add.circle(   5, -7,   2, 0x8b5e3c, 0.6),
            this.add.ellipse(  0,   2, 16, 20, 0xc8852a),             // body
            this.add.ellipse( -4,  -1,  5, 10, 0xdda050, 0.5),       // highlight
        ];
        const c = this.add.container(cx, cy, parts).setDepth(1.8).setAlpha(0.5);
        this.tweens.add({ targets: c, angle: { from: -6, to: 6 }, yoyo: true, repeat: -1, duration: 1200, ease: 'Sine.easeInOut' });
        return c;
    }

    private checkObjective() {
        if (this.objDone) return;
        const k = `${this.gridX},${this.gridY}`;
        const container = this.objectives.get(k);
        if (!container) return;

        this.objectives.delete(k);
        this.objCompleted++;

        // Bloom/collect burst then destroy
        this.tweens.add({
            targets:  container,
            scaleX:   1.6, scaleY: 1.6,
            alpha:    0,
            duration: 380,
            ease:     'Back.easeOut',
            onComplete: () => container.destroy(),
        });
        this.cameras.main.flash(250, 255, 240, 180, false);

        if (this.objCompleted >= this.objTotal) {
            this.objDone = true;
            if (this.goalLock) {
                this.tweens.add({ targets: this.goalLock, alpha: 0, duration: 700 });
            }
            this.cameras.main.flash(500, 120, 255, 160, false);
        }
        this.updateObjText();
    }

    private updateObjText() {
        if (!this.objText) return;
        if (this.objTotal === 0) { this.objText.setText(''); return; }

        const season = this.monthConfig.season;
        const label  = season.name === 'Spring' ? 'POLLINATE'
                     : season.name === 'Summer' ? 'WATER'
                     : 'PLANT';
        const filled = '\u25C6'.repeat(this.objCompleted);
        const empty  = '\u25C7'.repeat(Math.max(0, this.objTotal - this.objCompleted));
        this.objText.setText(this.objDone
            ? `${ '\u25C6'.repeat(this.objTotal) }  ${label} \u2713`
            : `${filled}${empty}  ${label}`
        );
    }

    // ── Month progression ─────────────────────────────────────────────────────
    private checkGoal() {
        if (this.gridX !== COLS - 1 || this.gridY !== ROWS - 1) return;
        if (!this.objDone) return;

        const nextMonth = (this.monthConfig.month % 12) + 1;   // 12 → 1

        this.time.delayedCall(500, () => {
            this.hazard?.destroy();
            this.cameras.main.fadeOut(800, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('GameScene', {
                    month:     nextMonth,
                    algorithm: this.algorithm,
                    from:      this.fromScene,
                });
            });
        });
    }
}
