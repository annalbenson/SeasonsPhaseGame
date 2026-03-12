import Phaser from 'phaser';
import { TILE, COLS, ROWS, HEADER, PANEL } from '../constants';
import { ALGORITHMS, AlgorithmKey, WALLS, OPPOSITE, widenCorridors } from '../maze';
import { MONTHS, MonthConfig, SeasonTheme } from '../seasons';
import { addWeather } from '../weather';
import { Hazard } from '../hazard';
import { MOVE_DIRS, Cell, solvePath, floodFill, bfsDistanceMap } from '../mazeUtils';

const W = COLS * TILE;

// Returns the first month of the season that contains `month`
// Jan–Feb → 1 (Winter),  Mar–May → 3 (Spring),
// Jun–Aug → 6 (Summer),  Sep–Nov → 9 (Fall),  Dec → 12 (Winter)
function seasonStart(month: number): number {
    if (month <= 2)  return 1;
    if (month <= 5)  return 3;
    if (month <= 8)  return 6;
    if (month <= 11) return 9;
    return 12;
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
    private algorithm: AlgorithmKey = 'kruskals';
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
    private moving   = false;
    private slideDir: { dx: number; dy: number } | null = null;

    private cells!: number[][];
    private gateEdges: { from: Cell; to: Cell }[] = [];

    private keyItems = new Map<string, Phaser.GameObjects.Rectangle>();
    private gates: Gate[] = [];
    private keyCount = 0;
    private inventoryText!: Phaser.GameObjects.Text;

    private bushCells = new Set<string>();
    private sceneryBlocked = new Set<string>();
    private hazards: Hazard[] = [];
    private isHiding = false;
    private gate1Cell: { col: number; row: number } | null = null;

    private lives = 3;
    private livesText!: Phaser.GameObjects.Text;

    private objectives   = new Map<string, Phaser.GameObjects.Container>();
    private objCompleted = 0;
    private objTotal     = 0;
    private objText: Phaser.GameObjects.Text | null = null;
    private objDone      = false;
    private goalLock:      Phaser.GameObjects.Arc | null = null;

    private fogTiles: Phaser.GameObjects.Image[][] = [];
    private revealed = new Set<string>();
    private lit      = new Set<string>();
    private lastLitTime = new Map<string, number>();  // key → timestamp of last lit
    private static FOG_DECAY_START = 30000;  // ms before fog starts returning (normal)
    private static FOG_DECAY_DURATION = 15000;  // ms to fade from dim to fully hidden (normal)
    private static FOG_DECAY_START_HARD = 10000;   // hard mode: 10s grace
    private static FOG_DECAY_DURATION_HARD = 8000; // hard mode: 8s fade
    private hardMode = false;

    // Skill system — cooldown-based seasonal ability
    private skillUsed   = false;
    private skillArmed  = false;  // true for directional skills (hop, dash) awaiting arrow key
    private skillCooldownEnd = 0; // timestamp when skill becomes available again
    private static SKILL_COOLDOWN = 15000; // 15 second cooldown
    private skillText!: Phaser.GameObjects.Text;
    private skillKey!: Phaser.Input.Keyboard.Key;

    private startCol = 0;
    private startRow = 0;
    private goalCol  = COLS - 1;
    private goalRow  = ROWS - 1;

    constructor() { super('GameScene'); }

    init(data: { algorithm?: AlgorithmKey; month?: number; from?: string; hard?: boolean }) {
        this.algorithm   = data.algorithm ?? 'kruskals';
        this.monthConfig = MONTHS[(data.month ?? 1) - 1];
        this.fromScene   = data.from ?? 'TitleScene';
        this.hardMode    = data.hard ?? false;
        this.keyItems    = new Map();
        this.gates       = [];
        this.keyCount    = 0;
        this.bushCells      = new Set();
        this.sceneryBlocked = new Set();
        this.hazards        = [];
        this.isHiding    = false;
        this.gate1Cell   = null;
        this.lives       = 3;
        this.objectives  = new Map();
        this.objCompleted = 0;
        this.objTotal     = 0;
        this.objDone      = false;
        this.goalLock     = null;
        this.objText      = null;
        this.fogTiles     = [];
        this.revealed     = new Set();
        this.lit          = new Set();
        this.lastLitTime  = new Map();
        this.skillUsed    = false;
        this.skillArmed   = false;
        this.skillCooldownEnd = 0;

        // Pick two distinct random corners for start and goal
        const corners = [
            { col: 0,        row: 0        },
            { col: COLS - 1, row: 0        },
            { col: 0,        row: ROWS - 1 },
            { col: COLS - 1, row: ROWS - 1 },
        ];
        for (let i = corners.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [corners[i], corners[j]] = [corners[j], corners[i]];
        }
        this.startCol = corners[0].col;
        this.startRow = corners[0].row;
        this.goalCol  = corners[1].col;
        this.goalRow  = corners[1].row;
    }

    create() {
        const season    = this.monthConfig.season;
        const fairyGlow = season.uiAccent;

        this.cameras.main.setBackgroundColor(season.bgColor);

        // ── Maze ──────────────────────────────────────────────────────────────
        this.cells = ALGORITHMS[this.algorithm].generate(COLS, ROWS);

        // Find gate edges on the spanning tree (every edge is a bridge here).
        // Place gates at ~33% and ~67% of the solution path so they partition
        // the maze into three progressive zones.
        const treePath = solvePath(this.cells, COLS, ROWS,
            this.startCol, this.startRow, this.goalCol, this.goalRow);
        this.gateEdges = [];
        if (treePath.length >= 10) {
            const g1Idx = Math.floor(treePath.length * 0.33);
            const g2Idx = Math.floor(treePath.length * 0.67);
            this.gateEdges = [
                { from: treePath[g1Idx], to: treePath[g1Idx + 1] },
                { from: treePath[g2Idx], to: treePath[g2Idx + 1] },
            ];
        }

        // Block gate edges before widening so corridors can't create bypasses
        for (const { from, to } of this.gateEdges) {
            const dc = to.col - from.col, dr = to.row - from.row;
            const fw = dc === 1 ? WALLS.RIGHT : dc === -1 ? WALLS.LEFT : dr === 1 ? WALLS.BOTTOM : WALLS.TOP;
            this.cells[from.row][from.col] |= fw;
            this.cells[to.row][to.col]     |= OPPOSITE[fw];
        }

        // Compute zone map so widening only connects cells within the same zone
        // (prevents creating bypass paths around gates)
        let zoneMap: Map<string, number> | undefined;
        if (this.gateEdges.length > 0) {
            zoneMap = new Map();
            const zone1 = floodFill(this.cells, COLS, ROWS, this.startCol, this.startRow);
            for (const k of zone1) zoneMap.set(k, 0);
            const g1To = this.gateEdges[0].to;
            const zone2 = floodFill(this.cells, COLS, ROWS, g1To.col, g1To.row);
            for (const k of zone2) zoneMap.set(k, 1);
            if (this.gateEdges.length >= 2) {
                const g2To = this.gateEdges[1].to;
                const zone3 = floodFill(this.cells, COLS, ROWS, g2To.col, g2To.row);
                for (const k of zone3) zoneMap.set(k, 2);
            }
        }

        // Widen some corridors — creates occasional 2-tile-wide sections
        const widenedCells = widenCorridors(this.cells, COLS, ROWS, 0.13, zoneMap);

        // Re-open gate passages (the gate objects will block the player, not walls)
        for (const { from, to } of this.gateEdges) {
            const dc = to.col - from.col, dr = to.row - from.row;
            const fw = dc === 1 ? WALLS.RIGHT : dc === -1 ? WALLS.LEFT : dr === 1 ? WALLS.BOTTOM : WALLS.TOP;
            this.cells[from.row][from.col] &= ~fw;
            this.cells[to.row][to.col]     &= ~OPPOSITE[fw];
        }

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
                this.goalCol * TILE + TILE / 2, this.goalRow * TILE + TILE / 2,
                TILE, TILE, season.goalColor
            )
        );
        this.placeGoalFlower(season);

        // Dim overlay on goal — removed once objectives are complete
        this.goalLock = this.add.circle(
            this.goalCol * TILE + TILE / 2,
            this.goalRow * TILE + TILE / 2 + HEADER,
            TILE / 2 - 2, 0x000000, 0.45,
        ).setDepth(1.6);

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
        this.placePuzzleItems(season);

        // Verify all keys are reachable from start (respecting scenery and gates)
        this.verifyKeyReachability();

        // Season objectives — placed after puzzle items so we can avoid their cells
        this.placeObjectives(season);

        // ── Weather ───────────────────────────────────────────────────────────
        addWeather(this, season.name);

        // ── Fairy + sparkle trail ─────────────────────────────────────────────
        this.createSparkleTexture();

        // Player lives in world space (not in mazeLayer) with y offset applied
        this.gridX = this.startCol; this.gridY = this.startRow;
        const startX = this.startCol * TILE + TILE / 2;
        const startY = this.startRow * TILE + TILE / 2 + HEADER;
        this.player = this.createPlayerSprite(startX, startY, season);
        this.player.setDepth(2);

        this.spawnHazard(season);

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

        // ── Input ─────────────────────────────────────────────────────────────
        this.cursors = this.input.keyboard!.createCursorKeys();
        this.wasd = {
            up:    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            down:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            left:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        };
        this.input.keyboard!.addKey('R').on('down', () => {
            for (const h of this.hazards) h.destroy();
            this.cameras.main.fadeOut(350, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart());
        });
        this.input.keyboard!.addKey('M').on('down', () => {
            for (const h of this.hazards) h.destroy();
            this.cameras.main.fadeOut(500, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(this.fromScene));
        });
        this.input.keyboard!.addKey('E').on('down', () => this.goToEnd());
        this.skillKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

        // ── Side panel ────────────────────────────────────────────────────────
        this.buildSidePanel(season);

        // ── Fog of war ────────────────────────────────────────────────────────
        this.buildFogLayer(season);
        this.revealAround(this.startCol, this.startRow);

        // ── Fade in ───────────────────────────────────────────────────────────
        this.cameras.main.fadeIn(900, 0, 0, 0);
    }

    // ── Header strip ──────────────────────────────────────────────────────────
    private buildHeader(season: MonthConfig['season']) {
        // Subtle separator line at the bottom of the header
        this.add.rectangle(W / 2, HEADER - 1, W, 1, season.uiAccent, 0.25).setDepth(3);

        const accentHex = `#${season.uiAccent.toString(16).padStart(6, '0')}`;

        // Month name — spaced-out like the title screen
        this.add.text(W / 2, 32, spaced(this.monthConfig.name), {
            fontSize:  '26px',
            fontStyle: 'bold',
            color:     accentHex,
        }).setOrigin(0.5).setDepth(3);

        // Season name — smaller, muted
        this.add.text(W / 2, 66, season.name, {
            fontSize: '15px',
            color:    `${accentHex}99`,
        }).setOrigin(0.5).setDepth(3);

        // Historical quote — italic, lightly tinted
        this.add.text(W / 2, 94, `"${this.monthConfig.quote}" — ${this.monthConfig.author}`, {
            fontSize:  '14px',
            fontStyle: 'italic',
            color:     `${accentHex}66`,
        }).setOrigin(0.5).setDepth(3);
    }

    // ── Side panel (objectives + legend) ─────────────────────────────────────
    private buildSidePanel(season: SeasonTheme) {
        const px    = W;                          // panel left edge
        const pw    = PANEL;
        const ph    = ROWS * TILE + HEADER;
        const cx    = px + pw / 2;                // panel centre x
        const depth = 3;

        const accent  = season.uiAccent;
        const accentH = `#${accent.toString(16).padStart(6, '0')}`;
        // Blend accent toward white so dim text is always legible on the dark panel
        const dimmed  = Math.floor(accent * 0.55);
        const r = Math.max((dimmed >> 16) & 0xff, 0x88);
        const g = Math.max((dimmed >>  8) & 0xff, 0x88);
        const b = Math.max( dimmed        & 0xff, 0x88);
        const dimH = `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;

        // Panel background — slightly lighter than scene bg
        const panelBg = (season.bgColor & 0xfefefe) + 0x0a0a0a;
        this.add.rectangle(px + pw / 2, ph / 2, pw, ph, panelBg).setDepth(depth - 1);

        // Thin left border
        this.add.rectangle(px + 1, ph / 2, 1, ph, accent, 0.2).setDepth(depth);

        // ── OBJECTIVES section ────────────────────────────────────────────────
        let y = HEADER + 22;

        this.add.text(cx, y, 'OBJECTIVES', {
            fontSize: '14px', color: dimH, letterSpacing: 4,
        }).setOrigin(0.5).setDepth(depth);

        y += 26;
        this.objText = this.add.text(cx, y, '', {
            fontSize: '18px', color: accentH, align: 'center',
        }).setOrigin(0.5, 0).setDepth(depth);
        this.updateObjText();

        y += 44;
        // ── LIVES section ─────────────────────────────────────────────────────
        this.add.text(cx, y, 'LIVES', {
            fontSize: '14px', color: dimH, letterSpacing: 4,
        }).setOrigin(0.5).setDepth(depth);

        y += 24;
        this.livesText = this.add.text(cx, y, '', {
            fontSize: '20px', color: '#ff5577',
        }).setOrigin(0.5, 0).setDepth(depth);
        this.updateLives();

        y += 40;
        // ── INVENTORY section ─────────────────────────────────────────────────
        this.add.text(cx, y, 'KEYS', {
            fontSize: '14px', color: dimH, letterSpacing: 4,
        }).setOrigin(0.5).setDepth(depth);

        y += 24;
        this.inventoryText = this.add.text(cx, y, '', {
            fontSize: '20px', color: `#${season.keyColor.toString(16).padStart(6, '0')}`,
        }).setOrigin(0.5, 0).setDepth(depth);
        this.updateInventory();

        y += 40;
        // ── SKILL section ───────────────────────────────────────────────────
        this.add.text(cx, y, 'SKILL', {
            fontSize: '14px', color: dimH, letterSpacing: 4,
        }).setOrigin(0.5).setDepth(depth);

        y += 24;
        this.skillText = this.add.text(cx, y, '', {
            fontSize: '16px', color: accentH, align: 'center',
        }).setOrigin(0.5, 0).setDepth(depth);
        this.updateSkillText();

        // ── Divider ───────────────────────────────────────────────────────────
        y += 44;
        this.add.rectangle(cx, y, pw - 32, 1, accent, 0.2).setDepth(depth);

        // ── LEGEND section ────────────────────────────────────────────────────
        y += 20;
        this.add.text(cx, y, 'LEGEND', {
            fontSize: '14px', color: dimH, letterSpacing: 4,
        }).setOrigin(0.5).setDepth(depth);

        y += 22;
        const lx = px + 20;   // swatch left edge
        const tx = px + 40;   // label left edge
        // Season-specific enemy info
        const enemyMap: Record<string, { color: number; label: string }> = {
            Spring: { color: 0x44aa22, label: 'frog — run!' },
            Summer: { color: 0xcc5500, label: 'snake — run!' },
            Fall:   { color: 0xdd5500, label: 'fox — run!' },
            Winter: { color: 0x6b4520, label: 'owl — run!' },
        };
        const enemy = enemyMap[season.name] ?? enemyMap.Summer;

        // Season-specific hiding spot info
        const hideMap: Record<string, { label: string; draw: (g: Phaser.GameObjects.Graphics, ly: number) => void }> = {
            Spring: {
                label: 'tall grass — hide!',
                draw: (g, ly) => {
                    g.fillStyle(0x66bb33, 0.9); g.fillEllipse(lx + 4, ly - 2, 4, 10);
                    g.fillStyle(0x88cc44, 0.9); g.fillEllipse(lx + 8, ly - 4, 4, 12);
                    g.fillStyle(0x66bb33, 0.9); g.fillEllipse(lx + 12, ly - 1, 4, 9);
                },
            },
            Summer: {
                label: 'bush — hide!',
                draw: (g, ly) => {
                    g.fillStyle(0x228844, 0.85); g.fillCircle(lx + 3, ly + 1, 5);
                    g.fillStyle(0x228844, 0.85); g.fillCircle(lx + 11, ly + 1, 5);
                    g.fillStyle(0x228844, 0.90); g.fillCircle(lx + 7, ly - 3, 6);
                },
            },
            Fall: {
                label: 'leaf pile — hide!',
                draw: (g, ly) => {
                    g.fillStyle(0xd04010, 0.88); g.fillEllipse(lx + 3, ly, 6, 4);
                    g.fillStyle(0xffaa00, 0.88); g.fillEllipse(lx + 8, ly - 2, 5, 4);
                    g.fillStyle(0xe86820, 0.88); g.fillEllipse(lx + 12, ly + 1, 6, 4);
                },
            },
            Winter: {
                label: 'snow pile — hide!',
                draw: (g, ly) => {
                    g.fillStyle(0xddeeff, 0.9); g.fillCircle(lx + 3, ly + 1, 5);
                    g.fillStyle(0xe8f4ff, 0.85); g.fillCircle(lx + 11, ly + 1, 4);
                    g.fillStyle(0xffffff, 0.95); g.fillCircle(lx + 7, ly - 2, 6);
                },
            },
        };
        const hide = hideMap[season.name] ?? hideMap.Summer;

        // Season-specific objective info
        const objMap: Record<string, { color: number; label: string; draw: (g: Phaser.GameObjects.Graphics, ly: number) => void }> = {
            Spring: {
                color: 0xff88aa, label: 'flower — collect!',
                draw: (g, ly) => { g.fillStyle(0xff88aa, 0.9); g.fillCircle(lx + 7, ly, 5); g.fillStyle(0xffee44, 0.9); g.fillCircle(lx + 7, ly, 2); },
            },
            Summer: {
                color: 0x44aaff, label: 'plant — water!',
                draw: (g, ly) => { g.fillStyle(0x44aaff, 0.9); g.fillCircle(lx + 7, ly, 5); },
            },
            Fall: {
                color: 0xc07030, label: 'acorn — plant!',
                draw: (g, ly) => { g.fillStyle(0xc07030, 0.9); g.fillCircle(lx + 7, ly, 5); },
            },
            Winter: {
                color: 0xddeeff, label: 'snowflake — collect!',
                draw: (g, ly) => { g.fillStyle(0xddeeff, 0.9); g.fillCircle(lx + 7, ly, 5); },
            },
        };
        const obj = objMap[season.name] ?? objMap.Spring;

        // Season-specific scenery obstacles — all variants shown in legend
        type LI = { label: string; draw: (g: Phaser.GameObjects.Graphics, ly: number) => void };
        const sceneryMap: Record<string, LI[]> = {
            Spring: [
                { label: 'boulder — go around!', draw: (g, ly) => { g.fillStyle(0x778877, 0.85); g.fillEllipse(lx + 7, ly, 12, 8); g.fillStyle(0x99aa99, 0.7); g.fillEllipse(lx + 6, ly - 1, 8, 5); } },
                { label: 'pond — go around!', draw: (g, ly) => { g.fillStyle(0x4477aa, 0.5); g.fillEllipse(lx + 7, ly, 14, 8); g.fillStyle(0x5599cc, 0.4); g.fillEllipse(lx + 5, ly - 1, 8, 5); } },
                { label: 'flowers — go around!', draw: (g, ly) => { g.fillStyle(0xff88bb, 0.8); g.fillCircle(lx + 3, ly, 3); g.fillStyle(0xffaa44, 0.8); g.fillCircle(lx + 9, ly - 2, 3); g.fillStyle(0xcc77ff, 0.8); g.fillCircle(lx + 6, ly + 2, 3); } },
            ],
            Summer: [
                { label: 'rock — go around!', draw: (g, ly) => { g.fillStyle(0x445544, 0.8); g.fillEllipse(lx + 7, ly, 12, 8); g.fillStyle(0x556655, 0.7); g.fillEllipse(lx + 5, ly - 1, 8, 5); } },
                { label: 'log — go around!', draw: (g, ly) => { g.fillStyle(0x5a3a1a, 0.75); g.fillEllipse(lx + 7, ly, 14, 5); g.fillStyle(0x6a4a2a, 0.7); g.fillCircle(lx + 1, ly, 2.5); } },
                { label: 'ferns — go around!', draw: (g, ly) => { g.fillStyle(0x2a7a3a, 0.65); g.fillEllipse(lx + 3, ly, 3, 8); g.fillEllipse(lx + 7, ly - 1, 3, 8); g.fillEllipse(lx + 11, ly, 3, 8); } },
            ],
            Fall: [
                { label: 'mushrooms — go around!', draw: (g, ly) => { g.fillStyle(0xeeddcc, 0.8); g.fillEllipse(lx + 5, ly + 2, 4, 8); g.fillStyle(0xcc3322, 0.8); g.fillEllipse(lx + 5, ly - 3, 10, 6); } },
                { label: 'stump — go around!', draw: (g, ly) => { g.fillStyle(0x5a3a1a, 0.8); g.fillEllipse(lx + 7, ly + 1, 12, 9); g.fillStyle(0x7a5a3a, 0.7); g.fillEllipse(lx + 7, ly - 1, 8, 6); } },
                { label: 'pumpkins — go around!', draw: (g, ly) => { g.fillStyle(0xdd7722, 0.8); g.fillEllipse(lx + 5, ly, 10, 8); g.fillStyle(0xcc6611, 0.75); g.fillEllipse(lx + 11, ly + 1, 7, 6); } },
            ],
            Winter: [
                { label: 'boulder — go around!', draw: (g, ly) => { g.fillStyle(0x556666, 0.8); g.fillEllipse(lx + 7, ly + 1, 14, 8); g.fillStyle(0x6a7a7a, 0.7); g.fillEllipse(lx + 5, ly - 1, 9, 5); } },
                { label: 'rocks — go around!', draw: (g, ly) => { g.fillStyle(0x4a5a5a, 0.8); g.fillEllipse(lx + 4, ly, 8, 6); g.fillStyle(0x5a6a6a, 0.75); g.fillEllipse(lx + 10, ly - 1, 7, 5); } },
                { label: 'stone slab — go around!', draw: (g, ly) => { g.fillStyle(0x4a5858, 0.8); g.fillEllipse(lx + 7, ly, 14, 6); g.fillStyle(0x5a6868, 0.7); g.fillEllipse(lx + 5, ly - 1, 10, 4); } },
            ],
        };
        const sceneryItems = sceneryMap[season.name] ?? sceneryMap.Summer;

        // Season-specific skill legend entry
        const skillMap: Record<string, { label: string; draw: (g: Phaser.GameObjects.Graphics, ly: number) => void }> = {
            Winter: {
                label: 'hop — jump obstacle!',
                draw: (g, ly) => { g.fillStyle(0xc8e4f4, 0.9); g.fillTriangle(lx + 2, ly + 5, lx + 7, ly - 6, lx + 12, ly + 5); },
            },
            Spring: {
                label: 'sting — stun enemy!',
                draw: (g, ly) => { g.fillStyle(0xffee22, 0.9); g.fillTriangle(lx + 3, ly - 6, lx + 7, ly + 6, lx + 11, ly - 6); },
            },
            Summer: {
                label: 'glow — reveal fog!',
                draw: (g, ly) => { g.fillStyle(0xaaffaa, 0.7); g.fillCircle(lx + 7, ly, 8); g.fillStyle(0xffffcc, 0.9); g.fillCircle(lx + 7, ly, 4); },
            },
            Fall: {
                label: 'dash — sprint 3!',
                draw: (g, ly) => { g.fillStyle(0xffcc88, 0.9); g.fillRect(lx, ly - 2, 4, 4); g.fillRect(lx + 5, ly - 2, 4, 4); g.fillRect(lx + 10, ly - 2, 4, 4); },
            },
        };
        const skill = skillMap[season.name] ?? skillMap.Summer;

        const legendItems: { draw: (g: Phaser.GameObjects.Graphics, ly: number) => void; label: string }[] = [
            {
                label: 'you',
                draw: (g, ly) => { g.fillStyle(accent, 0.9); g.fillCircle(lx + 7, ly, 6); },
            },
            {
                label: enemy.label,
                draw: (g, ly) => { g.fillStyle(enemy.color, 0.9); g.fillCircle(lx + 7, ly, 6); },
            },
            hide,
            ...sceneryItems,
            obj,
            skill,
            {
                label: 'key — collect!',
                draw: (g, ly) => {
                    g.fillStyle(season.keyColor, 1);
                    g.fillRect(lx + 2, ly - 5, 10, 10);
                },
            },
            {
                label: 'gate — unlock!',
                draw: (g, ly) => { g.fillStyle(season.gateColor, 1); g.fillRect(lx + 1, ly - 2, 13, 4); },
            },
            {
                label: 'goal — reach it!',
                draw: (g, ly) => { g.fillStyle(season.goalColor, 0.9); g.fillCircle(lx + 7, ly, 6); },
            },
        ];

        const gfx = this.add.graphics().setDepth(depth);
        for (const item of legendItems) {
            item.draw(gfx, y + 7);
            this.add.text(tx, y, item.label, {
                fontSize: '15px', color: dimH,
            }).setOrigin(0, 0).setDepth(depth);
            y += 24;
        }

        // ── Divider ───────────────────────────────────────────────────────────
        y += 6;
        this.add.rectangle(cx, y, pw - 32, 1, accent, 0.2).setDepth(depth);

        // ── Controls hint ─────────────────────────────────────────────────────
        y += 18;
        for (const line of ['SPACE  skill', 'R  new maze', 'M  menu', '↑↓←→  move', 'hold  slide']) {
            this.add.text(cx, y, line, {
                fontSize: '14px', color: `#ffffff55`,
            }).setOrigin(0.5, 0).setDepth(depth);
            y += 17;
        }
    }

    // ── Player sprite dispatcher ──────────────────────────────────────────────
    private createPlayerSprite(x: number, y: number, season: SeasonTheme): Phaser.GameObjects.Container {
        switch (season.name) {
            case 'Spring': return this.createBee(x, y);
            case 'Fall':   return this.createSquirrel(x, y);
            case 'Winter': return this.createBunny(x, y);
            default:       return this.createFairy(x, y, 0xffffaa);   // warm yellow glow — visible on green
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
    private placePuzzleItems(season: SeasonTheme) {
        if (this.gateEdges.length < 2) return;

        // Temporarily block gate edges so flood-fill respects them as barriers
        const wallOps: { from: Cell; to: Cell; fw: number }[] = [];
        for (const { from, to } of this.gateEdges) {
            const dc = to.col - from.col, dr = to.row - from.row;
            const fw = dc === 1 ? WALLS.RIGHT : dc === -1 ? WALLS.LEFT : dr === 1 ? WALLS.BOTTOM : WALLS.TOP;
            wallOps.push({ from, to, fw });
            this.cells[from.row][from.col] |= fw;
            this.cells[to.row][to.col]     |= OPPOSITE[fw];
        }

        // Zone 1: reachable from start (before gate 1)
        const zone1 = floodFill(this.cells, COLS, ROWS, this.startCol, this.startRow, this.sceneryBlocked);
        // Zone 2: reachable from gate1's far side (between gate 1 and gate 2)
        const g1To = this.gateEdges[0].to;
        const zone2 = floodFill(this.cells, COLS, ROWS, g1To.col, g1To.row, this.sceneryBlocked);

        // Restore passages (gate objects handle blocking, not walls)
        for (const { from, to, fw } of wallOps) {
            this.cells[from.row][from.col] &= ~fw;
            this.cells[to.row][to.col]     &= ~OPPOSITE[fw];
        }

        // Store gate1 position for hazard spawning
        this.gate1Cell = this.gateEdges[0].from;

        // Build sets of solution-path cells to avoid for key placement
        const pathCells = new Set<string>();
        const solPath = solvePath(this.cells, COLS, ROWS,
            this.startCol, this.startRow, this.goalCol, this.goalRow,
            this.sceneryBlocked);
        for (const c of solPath) pathCells.add(`${c.col},${c.row}`);

        // Pick key locations far from the solution path to force real detours
        const distFromPath = bfsDistanceMap(this.cells, COLS, ROWS, pathCells, this.sceneryBlocked);
        const pickOffPath = (zone: Set<string>): Cell | null => {
            const offPath = [...zone].filter(k =>
                !pathCells.has(k) &&
                k !== `${this.startCol},${this.startRow}` &&
                k !== `${this.goalCol},${this.goalRow}`
            );
            if (offPath.length > 0) {
                // Sort by distance from solution path (descending)
                offPath.sort((a, b) => (distFromPath.get(b) ?? 0) - (distFromPath.get(a) ?? 0));
                // Pick randomly from top 25% most distant
                const topN = Math.max(1, Math.floor(offPath.length * 0.25));
                const key = offPath[Math.floor(Math.random() * topN)];
                const [c, r] = key.split(',').map(Number);
                return { col: c, row: r };
            }
            // Fallback: anywhere in the zone that isn't start/goal
            const any = [...zone].filter(k =>
                k !== `${this.startCol},${this.startRow}` &&
                k !== `${this.goalCol},${this.goalRow}`
            );
            if (any.length === 0) return null;
            const key = any[Math.floor(Math.random() * any.length)];
            const [c, r] = key.split(',').map(Number);
            return { col: c, row: r };
        };

        const key1Pos = pickOffPath(zone1);
        const key2Pos = pickOffPath(zone2);

        // Safety: if either key couldn't be placed, skip gates entirely
        // (the level becomes gate-free rather than unwinnable)
        if (!key1Pos || !key2Pos) {
            console.warn('[PhaseGame] Could not place keys — skipping gates.',
                'zone1:', zone1.size, 'zone2:', zone2.size,
                'sceneryBlocked:', this.sceneryBlocked.size);
            this.gateEdges = [];
            return;
        }

        // Place keys
        for (const pos of [key1Pos, key2Pos]) {
            if (!pos) continue;
            const rect = this.add
                .rectangle(pos.col * TILE + TILE / 2, pos.row * TILE + TILE / 2, 18, 18, season.keyColor)
                .setRotation(Math.PI / 4);
            this.mazeLayer.add(rect);
            this.keyItems.set(`${pos.col},${pos.row}`, rect);
        }

        // Place gate graphics
        for (const { from, to } of this.gateEdges) {
            const dc = to.col - from.col;
            const dr = to.row - from.row;

            let gx: number, gy: number, gw: number, gh: number;
            if      (dc ===  1) { gx = from.col * TILE + TILE;     gy = from.row * TILE + TILE / 2; gw = 10; gh = TILE - 10; }
            else if (dc === -1) { gx = from.col * TILE;             gy = from.row * TILE + TILE / 2; gw = 10; gh = TILE - 10; }
            else if (dr ===  1) { gx = from.col * TILE + TILE / 2; gy = from.row * TILE + TILE;     gw = TILE - 10; gh = 10; }
            else                { gx = from.col * TILE + TILE / 2; gy = from.row * TILE;            gw = TILE - 10; gh = 10; }

            const graphic = this.add.rectangle(gx, gy, gw, gh, season.gateColor);
            this.mazeLayer.add(graphic);
            this.gates.push({ fromCol: from.col, fromRow: from.row, toCol: to.col, toRow: to.row, graphic, open: false });
        }
    }

    // ── Post-placement reachability check ─────────────────────────────────────
    // Simulates player progression: start → key1 → gate1 → key2 → gate2 → goal.
    // If any key is unreachable, removes all gates and keys so the level is still
    // winnable (just gate-free).
    private verifyKeyReachability() {
        if (this.gates.length === 0 || this.keyItems.size === 0) return;

        // Build a blocked set that includes scenery AND closed gate edges
        const gateBlocked = new Set<string>();
        for (const g of this.gates) {
            // Store the edge as "fromCol,fromRow>toCol,toRow" for lookup
            gateBlocked.add(`${g.fromCol},${g.fromRow}>${g.toCol},${g.toRow}`);
            gateBlocked.add(`${g.toCol},${g.toRow}>${g.fromCol},${g.fromRow}`);
        }

        // BFS that respects scenery blocks and optionally gate edges
        const bfs = (sc: number, sr: number, closedGates: Set<string>): Set<string> => {
            const visited = new Set<string>();
            const queue: Cell[] = [{ col: sc, row: sr }];
            visited.add(`${sc},${sr}`);
            while (queue.length > 0) {
                const { col, row } = queue.shift()!;
                for (const { dc, dr, wall } of MOVE_DIRS) {
                    const nc = col + dc, nr = row + dr;
                    const key = `${nc},${nr}`;
                    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
                    if (visited.has(key) || (this.cells[row][col] & wall)) continue;
                    if (this.sceneryBlocked.has(key)) continue;
                    // Check gate edges
                    const edge = `${col},${row}>${nc},${nr}`;
                    if (closedGates.has(edge)) continue;
                    visited.add(key);
                    queue.push({ col: nc, row: nr });
                }
            }
            return visited;
        };

        // Check key1 reachable from start (all gates closed)
        const reachable1 = bfs(this.startCol, this.startRow, gateBlocked);
        let ok = true;
        for (const keyCoord of this.keyItems.keys()) {
            if (!reachable1.has(keyCoord)) {
                // Check if it's key2 (should be behind gate1, that's fine)
                // We just need at least one key reachable to open gate1
                continue;
            }
        }

        // Verify: at least one key is in the initial reachable zone
        const keysInZone1 = [...this.keyItems.keys()].filter(k => reachable1.has(k));
        if (keysInZone1.length === 0) {
            console.warn('[PhaseGame] No key reachable from start! Removing gates.');
            ok = false;
        }

        // After collecting first key and opening gate1, check key2
        if (ok && this.gateEdges.length >= 1) {
            const gate1edge1 = `${this.gateEdges[0].from.col},${this.gateEdges[0].from.row}>${this.gateEdges[0].to.col},${this.gateEdges[0].to.row}`;
            const gate1edge2 = `${this.gateEdges[0].to.col},${this.gateEdges[0].to.row}>${this.gateEdges[0].from.col},${this.gateEdges[0].from.row}`;
            const afterGate1 = new Set(gateBlocked);
            afterGate1.delete(gate1edge1);
            afterGate1.delete(gate1edge2);

            const reachable2 = bfs(this.startCol, this.startRow, afterGate1);
            const keysInZone2 = [...this.keyItems.keys()].filter(k => reachable2.has(k));
            if (keysInZone2.length < 2) {
                console.warn('[PhaseGame] Second key unreachable after gate1! Removing gates.');
                ok = false;
            }
        }

        if (!ok) {
            // Remove all gates and keys — level becomes gate-free
            for (const g of this.gates) g.graphic.destroy();
            this.gates = [];
            this.gateEdges = [];
            for (const [, rect] of this.keyItems) rect.destroy();
            this.keyItems.clear();
        }
    }

    // ── Inventory display ─────────────────────────────────────────────────────
    private updateInventory() {
        const filled = '\u25C6'.repeat(this.keyCount);
        const empty  = '\u25C7'.repeat(Math.max(0, 2 - this.keyCount));
        this.inventoryText.setText(`${filled}${empty}  KEY`);
    }

    // ── Skill system ─────────────────────────────────────────────────────────
    private get skillName(): string {
        switch (this.monthConfig.season.name) {
            case 'Winter': return 'HOP';
            case 'Spring': return 'STING';
            case 'Summer': return 'GLOW';
            case 'Fall':   return 'DASH';
            default:       return 'GLOW';
        }
    }

    private updateSkillText() {
        if (!this.skillText) return;
        if (this.skillUsed) {
            const remain = Math.max(0, Math.ceil((this.skillCooldownEnd - this.time.now) / 1000));
            this.skillText.setText(`${this.skillName}  (${remain}s)`);
            this.skillText.setAlpha(0.35);
        } else if (this.skillArmed) {
            this.skillText.setText(`${this.skillName}  ▸▸`);
            this.skillText.setAlpha(1);
        } else {
            this.skillText.setText(`${this.skillName}  [SPACE]`);
            this.skillText.setAlpha(1);
        }
    }

    private startSkillCooldown() {
        this.skillUsed = true;
        this.skillCooldownEnd = this.time.now + GameScene.SKILL_COOLDOWN;
        this.updateSkillText();
    }

    private activateSkill() {
        if (this.skillUsed || this.skillArmed || this.moving) return;

        const season = this.monthConfig.season.name;

        if (season === 'Spring') {
            // Bee Sting — stun nearest enemy for 5 seconds
            this.startSkillCooldown();
            let nearest: Hazard | null = null;
            let bestDist = Infinity;
            for (const h of this.hazards) {
                const d = Math.abs(h.gridX - this.gridX) + Math.abs(h.gridY - this.gridY);
                if (d < bestDist) { bestDist = d; nearest = h; }
            }
            if (nearest) {
                nearest.stun(5000);
                // Flash effect on player
                this.tweens.add({ targets: this.player, scaleX: 1.3, scaleY: 1.3, yoyo: true, duration: 200 });
            }
            this.updateSkillText();
        } else if (season === 'Summer') {
            // Fairy Glow — reveal large fog area (radius 4 Chebyshev)
            this.startSkillCooldown();
            const now = this.time.now;
            for (let dr = -4; dr <= 4; dr++) {
                for (let dc = -4; dc <= 4; dc++) {
                    const nc = this.gridX + dc, nr = this.gridY + dr;
                    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
                    const key = `${nc},${nr}`;
                    this.revealed.add(key);
                    this.lit.add(key);
                    this.lastLitTime.set(key, now);
                    if (this.fogTiles[nr]?.[nc]) this.fogTiles[nr][nc].setAlpha(0);
                }
            }
            // Bright flash effect
            const flash = this.add.circle(
                this.player.x, this.player.y, TILE * 4,
                this.monthConfig.season.uiAccent, 0.4,
            ).setDepth(2.8);
            this.tweens.add({ targets: flash, alpha: 0, scale: 1.5, duration: 600, onComplete: () => flash.destroy() });
            this.updateSkillText();
        } else {
            // Winter (Hop) and Fall (Dash) — arm directional mode
            this.skillArmed = true;
            this.updateSkillText();
        }
    }

    /** Bunny Hop: jump over one scenery obstacle to the cell beyond it. */
    private tryHop(dx: number, dy: number): boolean {
        const adjX = this.gridX + dx, adjY = this.gridY + dy;

        // Must have a wall-free passage to the adjacent cell
        const walls = this.cells[this.gridY][this.gridX];
        if (dx ===  1 && (walls & WALLS.RIGHT))  return false;
        if (dx === -1 && (walls & WALLS.LEFT))   return false;
        if (dy ===  1 && (walls & WALLS.BOTTOM)) return false;
        if (dy === -1 && (walls & WALLS.TOP))    return false;

        // Adjacent cell must be scenery-blocked (that's what we hop over)
        if (!this.sceneryBlocked.has(`${adjX},${adjY}`)) return false;

        // Landing cell must be in bounds
        const landX = this.gridX + dx * 2, landY = this.gridY + dy * 2;
        if (landX < 0 || landX >= COLS || landY < 0 || landY >= ROWS) return false;

        // Must have wall-free passage from adj to landing
        const adjWalls = this.cells[adjY][adjX];
        if (dx ===  1 && (adjWalls & WALLS.RIGHT))  return false;
        if (dx === -1 && (adjWalls & WALLS.LEFT))   return false;
        if (dy ===  1 && (adjWalls & WALLS.BOTTOM)) return false;
        if (dy === -1 && (adjWalls & WALLS.TOP))    return false;

        // Landing can't be scenery or a closed gate
        if (this.sceneryBlocked.has(`${landX},${landY}`)) return false;
        if (this.findGate(adjX, adjY, landX, landY)) return false;

        // Execute the hop
        this.startSkillCooldown();
        this.skillArmed = false;
        this.gridX = landX;
        this.gridY = landY;
        this.moving = true;
        this.slideDir = null;

        // Arc tween — jump up then down
        this.tweens.add({
            targets: this.player,
            x: landX * TILE + TILE / 2,
            y: landY * TILE + TILE / 2 + HEADER,
            duration: 300,
            ease: 'Sine.easeInOut',
            onComplete: () => {
                this.moving = false;
                this.revealAround(this.gridX, this.gridY);
                this.collectKey();
                this.checkObjective();
                this.checkGoal();
                this.checkHazardCollision();
            },
        });
        // Bounce scale for hop feel
        this.tweens.add({ targets: this.player, scaleY: 1.3, yoyo: true, duration: 150 });
        this.updateSkillText();
        return true;
    }

    /** Squirrel Dash: sprint 3 cells in one direction. */
    private tryDash(dx: number, dy: number): boolean {
        // Check we can move at least 1 cell in this direction
        const walls0 = this.cells[this.gridY][this.gridX];
        if (dx ===  1 && (walls0 & WALLS.RIGHT))  return false;
        if (dx === -1 && (walls0 & WALLS.LEFT))   return false;
        if (dy ===  1 && (walls0 & WALLS.BOTTOM)) return false;
        if (dy === -1 && (walls0 & WALLS.TOP))    return false;

        const nx = this.gridX + dx, ny = this.gridY + dy;
        if (this.sceneryBlocked.has(`${nx},${ny}`)) return false;

        this.startSkillCooldown();
        this.skillArmed = false;
        this.moving = true;
        this.slideDir = null;

        // Collect up to 3 cells we can dash through
        const steps: { x: number; y: number }[] = [];
        let cx = this.gridX, cy = this.gridY;
        for (let s = 0; s < 3; s++) {
            const w = this.cells[cy][cx];
            if (dx ===  1 && (w & WALLS.RIGHT))  break;
            if (dx === -1 && (w & WALLS.LEFT))   break;
            if (dy ===  1 && (w & WALLS.BOTTOM)) break;
            if (dy === -1 && (w & WALLS.TOP))    break;
            const nsx = cx + dx, nsy = cy + dy;
            if (nsx < 0 || nsx >= COLS || nsy < 0 || nsy >= ROWS) break;
            if (this.sceneryBlocked.has(`${nsx},${nsy}`)) break;
            // Open gate if we have a key
            const gate = this.findGate(cx, cy, nsx, nsy);
            if (gate) {
                if (this.keyCount === 0) break;
                this.keyCount--;
                gate.open = true;
                gate.graphic.destroy();
                this.updateInventory();
            }
            cx = nsx;
            cy = nsy;
            steps.push({ x: cx, y: cy });
        }

        if (steps.length === 0) {
            this.skillUsed = false;
            this.skillCooldownEnd = 0;
            this.skillArmed = true;
            this.moving = false;
            return false;
        }

        this.gridX = steps[steps.length - 1].x;
        this.gridY = steps[steps.length - 1].y;

        this.tweens.add({
            targets: this.player,
            x: this.gridX * TILE + TILE / 2,
            y: this.gridY * TILE + TILE / 2 + HEADER,
            duration: 100 * steps.length,
            ease: 'Power3',
            onComplete: () => {
                this.moving = false;
                // Reveal and collect along entire path
                for (const s of steps) this.revealAround(s.x, s.y);
                this.collectKey();
                this.checkObjective();
                this.checkGoal();
            },
        });
        // Stretch effect for dash feel
        if (dx !== 0) {
            this.tweens.add({ targets: this.player, scaleX: 1.4, scaleY: 0.7, yoyo: true, duration: 100 });
        } else {
            this.tweens.add({ targets: this.player, scaleX: 0.7, scaleY: 1.4, yoyo: true, duration: 100 });
        }
        this.updateSkillText();
        return true;
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
        this.updateFogDecay();

        // Skill cooldown tick
        if (this.skillUsed && this.time.now >= this.skillCooldownEnd) {
            this.skillUsed = false;
            this.updateSkillText();
        } else if (this.skillUsed) {
            this.updateSkillText(); // update countdown display
        }

        // Hiding state — fade fairy when inside a bush cell
        const nowHiding = this.bushCells.has(`${this.gridX},${this.gridY}`);
        if (nowHiding !== this.isHiding) {
            this.isHiding = nowHiding;
            this.tweens.add({ targets: this.player, alpha: nowHiding ? 0.35 : 1.0, duration: 300 });
        }
        for (const h of this.hazards) h.setTarget(this.gridX, this.gridY, this.isHiding);

        if (this.moving) return;

        const K = Phaser.Input.Keyboard;

        // SPACE activates skill
        if (K.JustDown(this.skillKey)) {
            this.activateSkill();
            return;
        }

        let dx = 0, dy = 0;

        if      (K.JustDown(this.cursors.left)  || K.JustDown(this.wasd.left))  dx = -1;
        else if (K.JustDown(this.cursors.right) || K.JustDown(this.wasd.right)) dx =  1;
        else if (K.JustDown(this.cursors.up)    || K.JustDown(this.wasd.up))    dy = -1;
        else if (K.JustDown(this.cursors.down)  || K.JustDown(this.wasd.down))  dy =  1;

        if (dx === 0 && dy === 0) return;

        // If skill is armed, intercept the arrow for the directional skill
        if (this.skillArmed) {
            const season = this.monthConfig.season.name;
            if (season === 'Winter' && this.tryHop(dx, dy)) return;
            if (season === 'Fall'   && this.tryDash(dx, dy)) return;
            // If directional skill couldn't fire (blocked), disarm and do normal move
            this.skillArmed = false;
            this.updateSkillText();
        }

        this.slideDir = { dx, dy };
        this.tryStep(dx, dy);
    }

    // Attempt one step; called for first tap and every continued slide step.
    private tryStep(dx: number, dy: number) {
        const walls = this.cells[this.gridY][this.gridX];
        if (dx ===  1 && (walls & WALLS.RIGHT))  { this.slideDir = null; return; }
        if (dx === -1 && (walls & WALLS.LEFT))   { this.slideDir = null; return; }
        if (dy ===  1 && (walls & WALLS.BOTTOM)) { this.slideDir = null; return; }
        if (dy === -1 && (walls & WALLS.TOP))    { this.slideDir = null; return; }

        const newX = this.gridX + dx;
        const newY = this.gridY + dy;

        // Scenic obstacles block movement
        if (this.sceneryBlocked.has(`${newX},${newY}`)) { this.slideDir = null; return; }

        const gate = this.findGate(this.gridX, this.gridY, newX, newY);
        if (gate) {
            if (this.keyCount === 0) { this.slideDir = null; return; }
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
                this.revealAround(this.gridX, this.gridY);
                this.collectKey();
                this.checkObjective();
                this.checkGoal();
                if (this.checkHazardCollision()) return;
                this.continueSlide();
            },
        });
    }

    /** Check if the player just moved onto a hazard's cell. */
    private checkHazardCollision(): boolean {
        if (this.isHiding) return false;
        for (const h of this.hazards) {
            if (h.dead || h.stunned) continue;
            if (h.gridX === this.gridX && h.gridY === this.gridY) {
                h.onCatchPublic();
                return true;
            }
        }
        return false;
    }

    // After each step, keep sliding if the key is still held and the path is clear.
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
        const cx = this.goalCol * TILE + TILE / 2;
        const cy = this.goalRow * TILE + TILE / 2 + HEADER;

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

    // ── Bush drawing (shared by placeBushes and guaranteeBushNear) ───────────
    private drawBushAt(col: number, row: number, season: MonthConfig['season']) {
        const cx = col * TILE + TILE / 2;
        const cy = row * TILE + TILE / 2;

        if (season.name === 'Fall') {
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
            this.mazeLayer.add([
                this.add.circle(cx - 10, cy + 6, 10, 0xddeeff, 0.90),
                this.add.circle(cx +  9, cy + 7,  9, 0xe8f4ff, 0.85),
                this.add.circle(cx -  2, cy - 2, 13, 0xffffff, 0.95),
                this.add.circle(cx +  5, cy - 5,  8, 0xf0f8ff, 0.80),
                this.add.ellipse(cx, cy + 6, 30, 8, 0x8aaabb, 0.18),
            ]);
        } else if (season.name === 'Spring') {
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
                const green = Math.random() < 0.5 ? 0x66bb33 : 0x88cc44;
                this.mazeLayer.add(
                    this.add.ellipse(cx + b.x, cy + 2, 5, b.h, green, 0.92).setAngle(b.a)
                );
                this.mazeLayer.add(
                    this.add.circle(
                        cx + b.x + Math.sin((b.a * Math.PI) / 180) * (b.h / 2 - 2),
                        cy + 2   - Math.cos((b.a * Math.PI) / 180) * (b.h / 2 - 2),
                        2.5, 0x558822, 0.85
                    )
                );
            }
        } else {
            // Summer bushes — dark foliage with bright flower accents to pop against green floor
            this.mazeLayer.add([
                this.add.circle(cx - 9, cy + 5, 11, 0x165a30, 0.92),
                this.add.circle(cx + 9, cy + 5, 11, 0x165a30, 0.92),
                this.add.circle(cx,     cy - 3, 13, 0x1a6636, 0.95),
                // Small flowers/berries for visibility
                this.add.circle(cx - 6, cy - 5, 3, 0xff6688, 0.9),
                this.add.circle(cx + 7, cy + 2, 2.5, 0xffdd44, 0.9),
                this.add.circle(cx + 1, cy - 7, 2.5, 0xff88aa, 0.85),
            ]);
        }
    }

    // ── Bush placement ────────────────────────────────────────────────────────
    private placeBushes(widenedCells: Set<string>, season: MonthConfig['season']) {
        for (const key of widenedCells) {
            const [col, row] = key.split(',').map(Number);
            if (col === this.startCol && row === this.startRow) continue;
            if (col === this.goalCol  && row === this.goalRow)  continue;
            if (Math.random() > 0.65)                          continue;
            this.bushCells.add(key);
            this.drawBushAt(col, row, season);
        }

        // Guarantee bushes every ~5 steps along the main solution path so the
        // player always has a hiding spot reachable from common corridors.
        const path = solvePath(this.cells, COLS, ROWS, this.startCol, this.startRow, this.goalCol, this.goalRow);

        // Scenic decorations on remaining widened cells that didn't get a bush.
        // Must not land on the solution path or gate-adjacent cells (they're blocking).
        const pathSet = new Set(path.map(c => `${c.col},${c.row}`));
        // Protect cells adjacent to gates so the player can always reach gate edges
        const gateProtected = new Set<string>();
        for (const { from, to } of this.gateEdges) {
            gateProtected.add(`${from.col},${from.row}`);
            gateProtected.add(`${to.col},${to.row}`);
        }
        for (const key of widenedCells) {
            if (this.bushCells.has(key)) continue;
            if (pathSet.has(key)) continue;
            if (gateProtected.has(key)) continue;
            if (Math.random() > 0.45) continue;
            const [col, row] = key.split(',').map(Number);
            if (col === this.startCol && row === this.startRow) continue;
            if (col === this.goalCol  && row === this.goalRow)  continue;
            this.sceneryBlocked.add(key);
            this.drawScenery(col, row, season);
        }

        // Second pass: place scenery on dead-end cells (3 walls) across the grid
        // so every level gets landmarks even when few widened cells exist.
        const targetCount = 4;
        const deadEnds: string[] = [];
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                const key = `${col},${row}`;
                if (this.sceneryBlocked.has(key)) continue;
                if (this.bushCells.has(key)) continue;
                if (pathSet.has(key)) continue;
                if (gateProtected.has(key)) continue;
                if (col === this.startCol && row === this.startRow) continue;
                if (col === this.goalCol  && row === this.goalRow)  continue;
                const w = this.cells[row][col];
                const wallCount = ((w & WALLS.TOP) ? 1 : 0) + ((w & WALLS.RIGHT) ? 1 : 0)
                    + ((w & WALLS.BOTTOM) ? 1 : 0) + ((w & WALLS.LEFT) ? 1 : 0);
                if (wallCount >= 3) deadEnds.push(key);
            }
        }
        // Shuffle and pick up to targetCount minus what we already placed
        for (let i = deadEnds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deadEnds[i], deadEnds[j]] = [deadEnds[j], deadEnds[i]];
        }
        const needed = Math.max(0, targetCount - this.sceneryBlocked.size);
        for (let i = 0; i < Math.min(needed, deadEnds.length); i++) {
            const key = deadEnds[i];
            const [col, row] = key.split(',').map(Number);
            this.sceneryBlocked.add(key);
            this.drawScenery(col, row, season);
        }

        const step = 5;
        for (let i = step; i < path.length - step; i += step) {
            this.guaranteeBushNear(path[i].col, path[i].row, season);
        }
    }

    // ── Scenic obstacle (blocking landmark, tile-sized) ────────────────────
    private drawScenery(col: number, row: number, season: MonthConfig['season']) {
        const cx = col * TILE + TILE / 2;
        const cy = row * TILE + TILE / 2;
        const variant = Math.floor(Math.random() * 3);

        if (season.name === 'Spring') {
            if (variant === 0) {
                // Boulder with moss
                this.mazeLayer.add(this.add.ellipse(cx, cy + 4, 44, 32, 0x778877, 0.85));
                this.mazeLayer.add(this.add.ellipse(cx - 2, cy - 2, 36, 26, 0x99aa99, 0.8));
                this.mazeLayer.add(this.add.ellipse(cx + 8, cy - 8, 14, 8, 0x66aa44, 0.6));
                this.mazeLayer.add(this.add.ellipse(cx - 10, cy - 6, 10, 6, 0x77bb55, 0.5));
            } else if (variant === 1) {
                // Pond
                this.mazeLayer.add(this.add.ellipse(cx, cy, 46, 36, 0x4477aa, 0.5));
                this.mazeLayer.add(this.add.ellipse(cx - 4, cy - 3, 30, 20, 0x5599cc, 0.4));
                this.mazeLayer.add(this.add.ellipse(cx + 10, cy + 6, 8, 5, 0x77bbee, 0.3));
                // Lily pad
                this.mazeLayer.add(this.add.circle(cx - 8, cy + 4, 5, 0x44aa44, 0.6));
            } else {
                // Flower patch (dense wildflowers)
                const colors = [0xff88bb, 0xffaa44, 0xcc77ff, 0xff6688, 0xffdd55];
                for (let i = 0; i < 8; i++) {
                    const fx = (Math.random() - 0.5) * 40;
                    const fy = (Math.random() - 0.5) * 40;
                    const c = colors[Math.floor(Math.random() * colors.length)];
                    this.mazeLayer.add(this.add.circle(cx + fx, cy + fy, 5, c, 0.8));
                    this.mazeLayer.add(this.add.circle(cx + fx, cy + fy, 2, 0xffee88, 0.9));
                }
            }
        } else if (season.name === 'Summer') {
            if (variant === 0) {
                // Large mossy rock formation
                this.mazeLayer.add(this.add.ellipse(cx + 6, cy + 6, 36, 28, 0x445544, 0.8));
                this.mazeLayer.add(this.add.ellipse(cx - 6, cy - 2, 30, 24, 0x556655, 0.75));
                this.mazeLayer.add(this.add.ellipse(cx, cy - 8, 20, 14, 0x668866, 0.7));
                this.mazeLayer.add(this.add.ellipse(cx + 10, cy - 4, 12, 8, 0x448844, 0.6));
            } else if (variant === 1) {
                // Fallen log
                this.mazeLayer.add(this.add.ellipse(cx, cy, 48, 16, 0x5a3a1a, 0.75).setAngle(Math.random() * 30 - 15));
                this.mazeLayer.add(this.add.circle(cx - 20, cy, 8, 0x6a4a2a, 0.7));
                this.mazeLayer.add(this.add.circle(cx + 20, cy, 7, 0x4a2a0a, 0.65));
                // Moss on log
                this.mazeLayer.add(this.add.ellipse(cx + 4, cy - 6, 16, 6, 0x448844, 0.5));
            } else {
                // Dense fern cluster
                for (let i = 0; i < 6; i++) {
                    const a = (i * 60) + Math.random() * 20;
                    const r = 6 + Math.random() * 6;
                    this.mazeLayer.add(
                        this.add.ellipse(cx + Math.cos(a * 0.017) * r, cy + Math.sin(a * 0.017) * r,
                            6, 24, 0x2a7a3a, 0.65).setAngle(a)
                    );
                }
                this.mazeLayer.add(this.add.circle(cx, cy, 6, 0x1a5a2a, 0.7));
            }
        } else if (season.name === 'Fall') {
            if (variant === 0) {
                // Large mushroom cluster
                // Stem + cap 1
                this.mazeLayer.add(this.add.ellipse(cx - 10, cy + 8, 8, 18, 0xeeddcc, 0.8));
                this.mazeLayer.add(this.add.ellipse(cx - 10, cy - 4, 22, 14, 0xcc3322, 0.8));
                this.mazeLayer.add(this.add.circle(cx - 14, cy - 6, 2.5, 0xffeecc, 0.7));
                this.mazeLayer.add(this.add.circle(cx - 6, cy - 8, 2, 0xffeecc, 0.7));
                // Stem + cap 2 (smaller)
                this.mazeLayer.add(this.add.ellipse(cx + 10, cy + 10, 6, 14, 0xeeddcc, 0.75));
                this.mazeLayer.add(this.add.ellipse(cx + 10, cy + 2, 16, 10, 0xdd5533, 0.75));
                this.mazeLayer.add(this.add.circle(cx + 8, cy + 1, 1.5, 0xffeecc, 0.6));
            } else if (variant === 1) {
                // Tree stump with rings
                this.mazeLayer.add(this.add.ellipse(cx, cy + 4, 40, 32, 0x5a3a1a, 0.8));
                this.mazeLayer.add(this.add.ellipse(cx, cy - 4, 34, 26, 0x7a5a3a, 0.75));
                this.mazeLayer.add(this.add.circle(cx, cy - 4, 10, 0x8a6a4a, 0.6));
                this.mazeLayer.add(this.add.circle(cx, cy - 4, 5, 0x9a7a5a, 0.5));
            } else {
                // Pumpkin patch
                this.mazeLayer.add(this.add.ellipse(cx - 6, cy + 2, 28, 24, 0xdd7722, 0.8));
                this.mazeLayer.add(this.add.ellipse(cx + 12, cy + 6, 20, 18, 0xcc6611, 0.75));
                this.mazeLayer.add(this.add.ellipse(cx - 6, cy - 2, 4, 8, 0x338822, 0.7));
                this.mazeLayer.add(this.add.ellipse(cx + 12, cy + 2, 3, 6, 0x338822, 0.65));
            }
        } else {
            // Winter — grey rocks (distinct from white snow-pile hiding spots)
            if (variant === 0) {
                // Large boulder
                this.mazeLayer.add(this.add.ellipse(cx + 2, cy + 4, 42, 30, 0x556666, 0.8));
                this.mazeLayer.add(this.add.ellipse(cx - 2, cy - 2, 34, 24, 0x6a7a7a, 0.75));
                this.mazeLayer.add(this.add.ellipse(cx + 6, cy - 8, 16, 10, 0x7a8a8a, 0.6));
                // Snow dusting
                this.mazeLayer.add(this.add.ellipse(cx - 4, cy - 10, 18, 5, 0xddeeff, 0.4));
            } else if (variant === 1) {
                // Rock cluster
                this.mazeLayer.add(this.add.ellipse(cx - 8, cy + 4, 26, 22, 0x4a5a5a, 0.8));
                this.mazeLayer.add(this.add.ellipse(cx + 10, cy + 2, 22, 18, 0x5a6a6a, 0.75));
                this.mazeLayer.add(this.add.ellipse(cx + 2, cy - 6, 18, 16, 0x6a7a7a, 0.7));
                // Snow in crevice
                this.mazeLayer.add(this.add.ellipse(cx, cy + 8, 14, 4, 0xddeeff, 0.35));
            } else {
                // Flat stone slab
                this.mazeLayer.add(this.add.ellipse(cx, cy + 2, 44, 24, 0x4a5858, 0.8));
                this.mazeLayer.add(this.add.ellipse(cx - 2, cy - 2, 36, 18, 0x5a6868, 0.7));
                // Crack detail
                this.mazeLayer.add(this.add.ellipse(cx - 6, cy, 16, 1.5, 0x3a4a4a, 0.5).setAngle(15));
                this.mazeLayer.add(this.add.ellipse(cx + 8, cy + 2, 10, 1.5, 0x3a4a4a, 0.45).setAngle(-25));
                // Snow dusting
                this.mazeLayer.add(this.add.ellipse(cx + 4, cy - 6, 14, 4, 0xddeeff, 0.35));
            }
        }
    }

    // ── Guarantee a hiding spot near a given cell ─────────────────────────────
    private guaranteeBushNear(hCol: number, hRow: number, season: MonthConfig['season']) {
        // Already have a bush within Manhattan 2? Nothing to do.
        for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
                if (Math.abs(dc) + Math.abs(dr) > 2) continue;
                if (this.bushCells.has(`${hCol + dc},${hRow + dr}`)) return;
            }
        }
        // Pick a random orthogonal neighbour to force a bush into
        const dirs = [{ dc: 0, dr: -1 }, { dc: 1, dr: 0 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 }];
        const valid = dirs
            .map(({ dc, dr }) => ({ col: hCol + dc, row: hRow + dr }))
            .filter(({ col, row }) =>
                col >= 0 && col < COLS && row >= 0 && row < ROWS &&
                !(col === this.startCol && row === this.startRow) &&
                !(col === this.goalCol  && row === this.goalRow) &&
                !this.sceneryBlocked.has(`${col},${row}`)
            );
        if (valid.length === 0) return;
        const { col, row } = valid[Math.floor(Math.random() * valid.length)];
        this.bushCells.add(`${col},${row}`);
        this.drawBushAt(col, row, season);
    }

    // ── Hazard spawn ──────────────────────────────────────────────────────────
    private spawnHazard(season: SeasonTheme) {
        const onCaught = () => {
            this.lives--;
            this.updateLives();

            if (this.lives <= 0) {
                this.time.delayedCall(700, () => {
                    for (const h of this.hazards) h.destroy();
                    this.cameras.main.fadeOut(600, 0, 0, 0);
                    this.cameras.main.once('camerafadeoutcomplete', () => {
                        this.scene.start('GameScene', {
                            month:     seasonStart(this.monthConfig.month),
                            algorithm: this.algorithm,
                            from:      this.fromScene,
                            hard:      this.hardMode,
                        });
                    });
                });
            } else {
                this.tweens.killTweensOf(this.player);
                this.gridX    = this.startCol;
                this.gridY    = this.startRow;
                this.moving   = false;
                this.isHiding = false;
                this.tweens.add({
                    targets:  this.player,
                    x:        this.startCol * TILE + TILE / 2,
                    y:        this.startRow * TILE + TILE / 2 + HEADER,
                    alpha:    1.0,
                    duration: 500,
                    ease:     'Power2',
                });
                for (const h of this.hazards) h.scatter();
            }
        };

        const pick = (candidates: { col: number; row: number }[]) =>
            candidates[Math.floor(Math.random() * candidates.length)];

        // Split the grid into two zones: before gate1 (near start) and after gate1 (near goal)
        const g = this.gate1Cell;
        const nearStart: { col: number; row: number }[] = [];
        const nearGoal:  { col: number; row: number }[] = [];

        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                if (col === this.goalCol  && row === this.goalRow)  continue;
                if (col === this.startCol && row === this.startRow) continue;
                if (this.sceneryBlocked.has(`${col},${row}`)) continue;
                const distFromStart = Math.abs(col - this.startCol) + Math.abs(row - this.startRow);
                if (distFromStart <= 3) continue; // too close to player spawn

                if (g) {
                    const distToGate = Math.abs(col - g.col) + Math.abs(row - g.row);
                    const distToGoal = Math.abs(col - this.goalCol) + Math.abs(row - this.goalRow);
                    const distToStart = distFromStart;
                    // Before gate1: closer to start than to goal
                    if (distToStart < distToGoal && distFromStart >= 4) nearStart.push({ col, row });
                    // After gate1: closer to goal than to start, and away from gate
                    if (distToGoal < distToStart && distToGate >= 2) nearGoal.push({ col, row });
                } else {
                    // No gates — just split by distance
                    if (distFromStart <= 7) nearStart.push({ col, row });
                    else nearGoal.push({ col, row });
                }
            }
        }

        // Enemy 1: in the start-side zone
        if (nearStart.length > 0) {
            const pos = pick(nearStart);
            this.guaranteeBushNear(pos.col, pos.row, season);
            this.hazards.push(new Hazard(this, this.cells, pos.col, pos.row, season.name, onCaught, this.sceneryBlocked));
        }

        // Enemy 2: in the goal-side zone
        if (nearGoal.length > 0) {
            const pos = pick(nearGoal);
            this.guaranteeBushNear(pos.col, pos.row, season);
            this.hazards.push(new Hazard(this, this.cells, pos.col, pos.row, season.name, onCaught, this.sceneryBlocked));
        }
    }

    // ── Lives display ─────────────────────────────────────────────────────────
    private updateLives() {
        const full  = '♥'.repeat(Math.max(0, this.lives));
        const empty = '♡'.repeat(Math.max(0, 3 - this.lives));
        this.livesText.setText(full + empty);
    }

    // ── Season objectives ─────────────────────────────────────────────────────
    private placeObjectives(season: SeasonTheme) {
        const count = season.name === 'Spring' ? 3 : 2;   // Winter/Summer/Fall = 2; Spring = 3
        this.objTotal = count;

        // Only place objectives on cells the player can physically reach
        const reachable = floodFill(this.cells, COLS, ROWS,
            this.startCol, this.startRow, this.sceneryBlocked);

        const avoid = new Set<string>([`${this.startCol},${this.startRow}`, `${this.goalCol},${this.goalRow}`]);
        for (const k of this.keyItems.keys()) avoid.add(k);
        for (const k of this.sceneryBlocked) avoid.add(k);

        const candidates: Cell[] = [];
        for (const key of reachable) {
            if (avoid.has(key)) continue;
            const [col, row] = key.split(',').map(Number);
            candidates.push({ col, row });
        }

        // Compute zone membership (flood fill with gate walls blocked)
        const zoneOf = new Map<string, number>();
        if (this.gateEdges.length >= 1) {
            const wallOps: { from: Cell; to: Cell; fw: number }[] = [];
            for (const { from, to } of this.gateEdges) {
                const dc = to.col - from.col, dr = to.row - from.row;
                const fw = dc === 1 ? WALLS.RIGHT : dc === -1 ? WALLS.LEFT : dr === 1 ? WALLS.BOTTOM : WALLS.TOP;
                wallOps.push({ from, to, fw });
                this.cells[from.row][from.col] |= fw;
                this.cells[to.row][to.col] |= OPPOSITE[fw];
            }
            const z0 = floodFill(this.cells, COLS, ROWS, this.startCol, this.startRow, this.sceneryBlocked);
            for (const k of z0) zoneOf.set(k, 0);
            const g1To = this.gateEdges[0].to;
            const z1 = floodFill(this.cells, COLS, ROWS, g1To.col, g1To.row, this.sceneryBlocked);
            for (const k of z1) zoneOf.set(k, 1);
            if (this.gateEdges.length >= 2) {
                const g2To = this.gateEdges[1].to;
                const z2 = floodFill(this.cells, COLS, ROWS, g2To.col, g2To.row, this.sceneryBlocked);
                for (const k of z2) zoneOf.set(k, 2);
            }
            for (const { from, to, fw } of wallOps) {
                this.cells[from.row][from.col] &= ~fw;
                this.cells[to.row][to.col] &= ~OPPOSITE[fw];
            }
        }

        // Distance from solution path for ranking candidates
        const solPath = solvePath(this.cells, COLS, ROWS,
            this.startCol, this.startRow, this.goalCol, this.goalRow,
            this.sceneryBlocked);
        const pathSet = new Set(solPath.map(c => `${c.col},${c.row}`));
        const distFromPath = bfsDistanceMap(this.cells, COLS, ROWS, pathSet, this.sceneryBlocked);

        // Group candidates by zone
        const numZones = this.gateEdges.length >= 2 ? 3 : this.gateEdges.length >= 1 ? 2 : 1;
        const byZone: Cell[][] = Array.from({ length: numZones }, () => []);
        for (const c of candidates) {
            const z = zoneOf.get(`${c.col},${c.row}`) ?? 0;
            byZone[z].push(c);
        }
        // Sort each zone's candidates by distance from path (descending)
        for (const arr of byZone) {
            arr.sort((a, b) =>
                (distFromPath.get(`${b.col},${b.row}`) ?? 0) -
                (distFromPath.get(`${a.col},${a.row}`) ?? 0));
        }

        // Place at least 1 objective per zone (pick most distant), fill remaining
        const placed: Cell[] = [];
        const usedZones = byZone.filter(z => z.length > 0);
        for (const zoneCands of usedZones) {
            if (placed.length >= count) break;
            placed.push(zoneCands.shift()!);
        }
        // Fill remaining slots from whichever zone has the most candidates
        while (placed.length < count) {
            // Pick from the zone with the most remaining candidates
            let best = usedZones.filter(z => z.length > 0)
                .sort((a, b) => b.length - a.length)[0];
            if (!best || best.length === 0) break;
            placed.push(best.shift()!);
        }

        for (const { col, row } of placed) {
            const cx = col * TILE + TILE / 2;
            const cy = row * TILE + TILE / 2 + HEADER;
            let container: Phaser.GameObjects.Container;
            switch (season.name) {
                case 'Spring': container = this.buildFlowerSprite(cx, cy);   break;
                case 'Summer': container = this.buildPlantSprite(cx, cy);    break;
                case 'Winter': container = this.buildSnowflakeSprite(cx, cy); break;
                default:       container = this.buildAcornSprite(cx, cy);    break;
            }
            this.objectives.set(`${col},${row}`, container);
        }
        this.updateObjText();
    }

    private buildFlowerSprite(cx: number, cy: number): Phaser.GameObjects.Container {
        const palette = [0xffb7c5, 0xcc88ff, 0xffee88, 0xffffff, 0xffaadd];
        const pColor  = palette[Math.floor(Math.random() * palette.length)];
        const parts: Phaser.GameObjects.GameObject[] = [
            this.add.circle(0, 0, 24, 0xffffff, 0.72),               // contrast disc
        ];
        for (let i = 0; i < 5; i++) {
            const rad = (i * 72 * Math.PI) / 180;
            parts.push(
                this.add.ellipse(Math.sin(rad) * 8, -Math.cos(rad) * 8, 7, 14, pColor, 0.9)
                    .setAngle(i * 72),
            );
        }
        parts.push(this.add.circle(0, 0, 5, 0xffe066));
        const c = this.add.container(cx, cy, parts).setDepth(1.8);
        this.tweens.add({ targets: c, scaleX: 1.1, scaleY: 1.1, yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.easeInOut' });
        return c;
    }

    private buildPlantSprite(cx: number, cy: number): Phaser.GameObjects.Container {
        const parts: Phaser.GameObjects.GameObject[] = [
            this.add.circle(0, 2, 24, 0xffffff, 0.72),               // contrast disc
            this.add.rectangle(0, 12,  16, 12, 0x8b5e3c),            // pot body
            this.add.rectangle(0,  6,  20,  5, 0xaa7b4e),            // pot rim
            this.add.rectangle(0, -2,   3, 12, 0x559933),            // stem
            this.add.ellipse(-9, -6, 12,  8, 0x55aa22, 0.9).setAngle(-30),
            this.add.ellipse( 9, -6, 12,  8, 0x55aa22, 0.9).setAngle( 30),
            this.add.ellipse( 0,-14, 10,  6, 0x66bb33, 0.9),
        ];
        const c = this.add.container(cx, cy, parts).setDepth(1.8);
        this.tweens.add({ targets: c, scaleX: 1.08, scaleY: 1.08, yoyo: true, repeat: -1, duration: 1600, ease: 'Sine.easeInOut' });
        return c;
    }

    private buildAcornSprite(cx: number, cy: number): Phaser.GameObjects.Container {
        const parts: Phaser.GameObjects.GameObject[] = [
            this.add.circle(0, 0, 24, 0xffffff, 0.72),               // contrast disc
            this.add.rectangle(0, -13,  3,  6, 0x5a3010),            // stem
            this.add.ellipse(  0,  -7, 18, 10, 0x6b3f1e),            // cap
            this.add.circle(  -5, -7,   2, 0x8b5e3c, 0.6),           // cap texture
            this.add.circle(   5, -7,   2, 0x8b5e3c, 0.6),
            this.add.ellipse(  0,   2, 16, 20, 0xc8852a),             // body
            this.add.ellipse( -4,  -1,  5, 10, 0xdda050, 0.5),       // highlight
        ];
        const c = this.add.container(cx, cy, parts).setDepth(1.8);
        this.tweens.add({ targets: c, angle: { from: -6, to: 6 }, yoyo: true, repeat: -1, duration: 1200, ease: 'Sine.easeInOut' });
        return c;
    }

    private buildSnowflakeSprite(cx: number, cy: number): Phaser.GameObjects.Container {
        const parts: Phaser.GameObjects.GameObject[] = [
            this.add.circle(0, 0, 22, 0xddeeff, 0.55),          // soft glow disc
        ];
        // Six arms — each a thin rectangle + small diamond tip
        for (let i = 0; i < 6; i++) {
            const angleDeg = i * 60;
            const arm = this.add.rectangle(0, -10, 3, 18, 0xffffff, 0.95).setAngle(angleDeg);
            const tip = this.add.rectangle(0, -20, 4, 4, 0xddeeff, 0.9).setAngle(angleDeg + 45);
            parts.push(arm, tip);
        }
        // Centre dot
        parts.push(this.add.circle(0, 0, 4, 0xffffff));
        const c = this.add.container(cx, cy, parts).setDepth(1.8);
        // Slow spin + gentle drift
        this.tweens.add({ targets: c, angle: 360, repeat: -1, duration: 8000, ease: 'Linear' });
        this.tweens.add({ targets: c, y: cy - 6, yoyo: true, repeat: -1, duration: 1800, ease: 'Sine.easeInOut' });
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
        if (this.objCompleted >= this.objTotal) {
            this.objDone = true;
            if (this.goalLock) {
                this.tweens.add({ targets: this.goalLock, alpha: 0, duration: 700 });
            }
        }
        this.updateObjText();
    }

    private updateObjText() {
        if (!this.objText) return;
        if (this.objTotal === 0) { this.objText.setText(''); return; }

        const season = this.monthConfig.season;
        const label  = season.name === 'Spring' ? 'POLLINATE'
                     : season.name === 'Summer' ? 'WATER'
                     : season.name === 'Winter' ? 'COLLECT'
                     : 'PLANT';
        const filled = '\u25C6'.repeat(this.objCompleted);
        const empty  = '\u25C7'.repeat(Math.max(0, this.objTotal - this.objCompleted));
        this.objText.setText(this.objDone
            ? `${ '\u25C6'.repeat(this.objTotal) }  ${label} \u2713`
            : `${filled}${empty}  ${label}`
        );
    }

    // ── Month progression ─────────────────────────────────────────────────────
    private goToEnd() {
        for (const h of this.hazards) h.destroy();
        this.cameras.main.fadeOut(800, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('EndScene'));
    }

    private checkGoal() {
        if (this.gridX !== this.goalCol || this.gridY !== this.goalRow) return;
        if (!this.objDone) return;

        if (this.monthConfig.month === 12) {
            this.time.delayedCall(500, () => this.goToEnd());
            return;
        }

        const nextMonth  = this.monthConfig.month + 1;
        const curSeason  = this.monthConfig.season.name;
        const nextSeason = MONTHS[nextMonth - 1].season.name;

        this.time.delayedCall(500, () => {
            for (const h of this.hazards) h.destroy();
            this.cameras.main.fadeOut(800, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('QuoteScene', {
                    month:     nextMonth,
                    isSeason:  nextSeason !== curSeason,
                    algorithm: this.algorithm,
                    from:      this.fromScene,
                    hard:      this.hardMode,
                });
            });
        });
    }

    // ── Fog of war ────────────────────────────────────────────────────────────
    private buildFogLayer(season: SeasonTheme) {
        const fogKey = `fog_${season.name}`;
        if (!this.textures.exists(fogKey)) {
            const g = this.make.graphics({ add: false });

            // Dark base — season-tinted
            const r = (season.bgColor >> 16) & 0xff;
            const gv = (season.bgColor >> 8)  & 0xff;
            const b  =  season.bgColor         & 0xff;
            // Slightly lighter than bgColor for texture interest
            const mid = Phaser.Display.Color.GetColor(
                Math.min(255, r + 18),
                Math.min(255, gv + 18),
                Math.min(255, b + 18),
            );

            g.fillStyle(season.bgColor, 1);
            g.fillRect(0, 0, TILE, TILE);

            // Subtle grain — solid lighter blobs (no alpha, keeps tile fully opaque)
            g.fillStyle(mid, 1);
            for (let i = 0; i < 14; i++) {
                g.fillCircle(
                    Math.floor(Math.random() * TILE),
                    Math.floor(Math.random() * TILE),
                    1 + Math.random() * 3,
                );
            }

            g.generateTexture(fogKey, TILE, TILE);
            g.destroy();
        }

        this.fogTiles = [];
        for (let row = 0; row < ROWS; row++) {
            this.fogTiles[row] = [];
            for (let col = 0; col < COLS; col++) {
                this.fogTiles[row][col] = this.add.image(
                    col * TILE + TILE / 2,
                    row * TILE + TILE / 2 + HEADER,
                    fogKey,
                // TILE+2 so tiles overlap by 1px each side — no sub-pixel gaps at wall boundaries
                ).setDepth(2.5).setDisplaySize(TILE + 2, TILE + 2);
                // alpha defaults to 1.0 — unrevealed tiles are fully opaque
            }
        }
    }

    private revealAround(col: number, row: number) {
        const now = this.time.now;
        const prevLit = new Set(this.lit);
        this.lit.clear();

        for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
                const nc = col + dc, nr = row + dr;
                if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;

                const dist = Math.max(Math.abs(dc), Math.abs(dr)); // Chebyshev
                const key  = `${nc},${nr}`;
                const tile = this.fogTiles[nr][nc];

                if (dist <= 1) {
                    // Fully lit — clear the fog tile
                    this.lit.add(key);
                    this.revealed.add(key);
                    this.lastLitTime.set(key, now);
                    tile.setAlpha(0);
                } else if (!this.revealed.has(key)) {
                    // First reveal — dim overlay
                    this.revealed.add(key);
                    this.lastLitTime.set(key, now);
                    tile.setAlpha(0.52);
                }
            }
        }

        // Cells that left the lit radius get stamped with current time for decay
        for (const key of prevLit) {
            if (!this.lit.has(key)) {
                this.lastLitTime.set(key, now);
                const [c, r] = key.split(',').map(Number);
                if (this.fogTiles[r]?.[c]) this.fogTiles[r][c].setAlpha(0.52);
            }
        }
    }

    // Called every frame — gradually fade revealed-but-not-lit cells back to hidden
    private updateFogDecay() {
        const now = this.time.now;
        const start = this.hardMode ? GameScene.FOG_DECAY_START_HARD : GameScene.FOG_DECAY_START;
        const dur   = this.hardMode ? GameScene.FOG_DECAY_DURATION_HARD : GameScene.FOG_DECAY_DURATION;

        for (const key of this.revealed) {
            if (this.lit.has(key)) continue; // currently visible, no decay

            const lastLit = this.lastLitTime.get(key) ?? 0;
            const elapsed = now - lastLit;

            if (elapsed < start) continue; // grace period

            const progress = Math.min((elapsed - start) / dur, 1.0);
            // Fade from 0.52 (dim) to 1.0 (hidden)
            const alpha = 0.52 + progress * 0.48;

            const [c, r] = key.split(',').map(Number);
            if (this.fogTiles[r]?.[c]) this.fogTiles[r][c].setAlpha(alpha);

            if (progress >= 1.0) {
                // Fully hidden again
                this.revealed.delete(key);
                this.lastLitTime.delete(key);
            }
        }
    }
}
