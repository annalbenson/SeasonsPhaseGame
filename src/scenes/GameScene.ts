import Phaser from 'phaser';
import { TILE, MAX_COLS, MAX_ROWS, HEADER } from '../constants';
import { ALGORITHMS, AlgorithmKey, WALLS, OPPOSITE, widenCorridors } from '../maze';
import { MONTHS, SEASONS, MonthConfig, SeasonTheme } from '../seasons';
import { CustomMapData } from '../toolkit';
import { addWeather } from '../weather';
import { Hazard } from '../hazard';
import { FogOfWar } from '../fog';
import { SkillManager, SkillContext } from '../skills';
import { MOVE_DIRS, Cell, solvePath, floodFill, bfsDistanceMap } from '../mazeUtils';
import { statsEvents, STAT } from '../statsEmitter';
import { createPlayerSprite, ensureSparkleTexture, buildObjectiveSprite } from '../sprites';
import { drawBushAt, drawScenery } from '../scenery';
import { buildHeader, buildSidePanel } from '../sidePanel';


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

// ── Scene ─────────────────────────────────────────────────────────────────────
export default class GameScene extends Phaser.Scene {
    private algorithm: AlgorithmKey = 'kruskals';
    private monthConfig!: MonthConfig;
    private fromScene = 'TitleScene';
    private cols = 10;
    private rows = 10;

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

    private fog!: FogOfWar;
    private hardMode = false;
    private customMap: CustomMapData | null = null;

    private skill!: SkillManager;
    private skillKey!: Phaser.Input.Keyboard.Key;

    private startCol = 0;
    private startRow = 0;
    private goalCol  = 9;
    private goalRow  = 9;

    /** Maze pixel width for the current level (excludes panel). */
    private get W() { return this.cols * TILE; }
    /** Horizontal offset to center maze+panel in the canvas. */
    private get offsetX() { return Math.floor((MAX_COLS * TILE - this.cols * TILE) / 2); }
    /** Vertical offset to center maze in the canvas. */
    private get offsetY() { return Math.floor((MAX_ROWS * TILE - this.rows * TILE) / 2); }
    /** World-space X for a grid column. */
    private worldX(col: number) { return col * TILE + TILE / 2 + this.offsetX; }
    /** World-space Y for a grid row (includes header offset). */
    private worldY(row: number) { return row * TILE + TILE / 2 + HEADER + this.offsetY; }

    constructor() { super('GameScene'); }

    init(data: { algorithm?: AlgorithmKey; month?: number; from?: string; hard?: boolean; customMap?: CustomMapData }) {
        this.algorithm   = data.algorithm ?? 'kruskals';
        this.fromScene   = data.from ?? 'TitleScene';
        this.hardMode    = data.hard ?? false;
        this.customMap   = data.customMap ?? null;

        if (this.customMap) {
            const season = SEASONS[this.customMap.seasonName];
            this.monthConfig = {
                month: 1, name: 'Custom', shortName: 'Cst', season,
                quote: 'A world of your own making.', author: 'You',
                cols: this.customMap.cols, rows: this.customMap.rows,
            };
        } else {
            this.monthConfig = MONTHS[(data.month ?? 1) - 1];
        }

        this.skill       = new SkillManager(this.monthConfig.season.name);
        this.cols        = this.monthConfig.cols;
        this.rows        = this.monthConfig.rows;
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

        if (this.customMap) {
            this.startCol = this.customMap.start.col;
            this.startRow = this.customMap.start.row;
            this.goalCol  = this.customMap.goal.col;
            this.goalRow  = this.customMap.goal.row;
        } else {
            // Pick two distinct random corners for start and goal
            const corners = [
                { col: 0,            row: 0            },
                { col: this.cols - 1, row: 0            },
                { col: 0,            row: this.rows - 1 },
                { col: this.cols - 1, row: this.rows - 1 },
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
    }

    create() {
        const season    = this.monthConfig.season;
        const fairyGlow = season.uiAccent;

        this.cameras.main.setBackgroundColor(season.bgColor);

        // ── Maze ──────────────────────────────────────────────────────────────
        let widenedCells = new Set<string>();
        if (this.customMap) {
            // Custom map: use user-provided cells directly
            this.cells = this.customMap.cells.map(row => [...row]);
            this.gateEdges = this.customMap.gates.map(g => ({ from: { ...g.from }, to: { ...g.to } }));
        } else {
            this.cells = ALGORITHMS[this.algorithm].generate(this.cols, this.rows);

            // Find gate edges on the spanning tree (every edge is a bridge here).
            // Gate count scales with grid: 8→1, 10→2, 12→3
            const numGates = Math.max(1, Math.floor(this.cols / 4) - 1);
            const treePath = solvePath(this.cells, this.cols, this.rows,
                this.startCol, this.startRow, this.goalCol, this.goalRow);
            this.gateEdges = [];
            if (treePath.length >= 10) {
                for (let i = 0; i < numGates; i++) {
                    const frac = (i + 1) / (numGates + 1);
                    const idx = Math.floor(treePath.length * frac);
                    if (idx + 1 < treePath.length) {
                        this.gateEdges.push({ from: treePath[idx], to: treePath[idx + 1] });
                    }
                }
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
                // Zone 0: reachable from start
                const z0 = floodFill(this.cells, this.cols, this.rows, this.startCol, this.startRow);
                for (const k of z0) zoneMap.set(k, 0);
                // Zones 1..N: reachable from each gate's far side
                for (let i = 0; i < this.gateEdges.length; i++) {
                    const gTo = this.gateEdges[i].to;
                    const zi = floodFill(this.cells, this.cols, this.rows, gTo.col, gTo.row);
                    for (const k of zi) zoneMap.set(k, i + 1);
                }
            }

            // Widen some corridors — creates occasional 2-tile-wide sections
            widenedCells = widenCorridors(this.cells, this.cols, this.rows, 0.13, zoneMap);
        }

        // Re-open gate passages (the gate objects will block the player, not walls)
        for (const { from, to } of this.gateEdges) {
            const dc = to.col - from.col, dr = to.row - from.row;
            const fw = dc === 1 ? WALLS.RIGHT : dc === -1 ? WALLS.LEFT : dr === 1 ? WALLS.BOTTOM : WALLS.TOP;
            this.cells[from.row][from.col] &= ~fw;
            this.cells[to.row][to.col]     &= ~OPPOSITE[fw];
        }

        // All maze content lives in this container, offset below the header and centered
        this.mazeLayer = this.add.container(this.offsetX, HEADER + this.offsetY);

        // Floor tiles
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
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
            this.worldX(this.goalCol),
            this.worldY(this.goalRow),
            TILE / 2 - 2, 0x000000, 0.45,
        ).setDepth(1.6);

        // Walls
        const g = this.add.graphics();
        g.lineStyle(4, season.wallColor, 1);
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const x = col * TILE, y = row * TILE;
                const walls = this.cells[row][col];
                if (walls & WALLS.TOP)    g.strokeLineShape(new Phaser.Geom.Line(x,        y,        x + TILE, y       ));
                if (walls & WALLS.RIGHT)  g.strokeLineShape(new Phaser.Geom.Line(x + TILE, y,        x + TILE, y + TILE));
                if (walls & WALLS.BOTTOM) g.strokeLineShape(new Phaser.Geom.Line(x,        y + TILE, x + TILE, y + TILE));
                if (walls & WALLS.LEFT)   g.strokeLineShape(new Phaser.Geom.Line(x,        y,        x,        y + TILE));
            }
        }
        this.mazeLayer.add(g);

        if (this.customMap) {
            // Custom map: place entities from user data
            this.placeCustomEntities(season);
        } else {
            // Bushes go into mazeLayer BEFORE puzzle items so keys/gates render on top
            this.placeBushes(widenedCells, season);

            // Winter: place blocking rocks on corridors that require HOP to pass
            if (season.name === 'Winter') {
                this.placeBlockingRocks(season);
            }

            // Keys + gates (also added to mazeLayer inside placePuzzleItems)
            this.placePuzzleItems(season);

            // Verify all keys are reachable from start (respecting scenery and gates)
            this.verifyKeyReachability();

            // Season objectives — placed after puzzle items so we can avoid their cells
            this.placeObjectives(season);
        }

        // ── Weather ───────────────────────────────────────────────────────────
        addWeather(this, season.name);

        // ── Fairy + sparkle trail ─────────────────────────────────────────────
        ensureSparkleTexture(this);

        // Player lives in world space (not in mazeLayer) with y offset applied
        this.gridX = this.startCol; this.gridY = this.startRow;
        const startX = this.worldX(this.startCol);
        const startY = this.worldY(this.startRow);
        this.player = createPlayerSprite(this, startX, startY, season);
        this.player.setDepth(2);

        if (this.customMap) {
            this.spawnCustomHazards(season);
        } else {
            this.spawnHazard(season);
        }

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
        buildHeader(this, this.monthConfig, this.offsetX, this.offsetY, this.W);

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
        const panelRefs = buildSidePanel(this, season, this.cols, this.rows, this.offsetX, this.offsetY, this.skill);
        this.objText       = panelRefs.objText;
        this.livesText     = panelRefs.livesText;
        this.inventoryText = panelRefs.inventoryText;
        this.updateObjText();
        this.updateLives();
        this.updateInventory();

        // ── Fog of war ────────────────────────────────────────────────────────
        this.fog = new FogOfWar(
            this, this.cols, this.rows, this.hardMode, season,
            (c) => this.worldX(c), (r) => this.worldY(r),
        );
        this.fog.revealAround(this.startCol, this.startRow, this.time.now);

        // ── Stats ────────────────────────────────────────────────────────────
        statsEvents.emit(STAT.MAZE_START, {
            month: this.monthConfig.month,
            gridSize: `${this.cols}x${this.rows}`,
            hard: this.hardMode,
            custom: !!this.customMap,
        });

        // ── Fade in ───────────────────────────────────────────────────────────
        this.cameras.main.fadeIn(900, 0, 0, 0);
    }

    // ── Puzzle item placement ─────────────────────────────────────────────────
    private placePuzzleItems(season: SeasonTheme) {
        if (this.gateEdges.length === 0) return;

        // Temporarily block gate edges so flood-fill respects them as barriers
        const wallOps: { from: Cell; to: Cell; fw: number }[] = [];
        for (const { from, to } of this.gateEdges) {
            const dc = to.col - from.col, dr = to.row - from.row;
            const fw = dc === 1 ? WALLS.RIGHT : dc === -1 ? WALLS.LEFT : dr === 1 ? WALLS.BOTTOM : WALLS.TOP;
            wallOps.push({ from, to, fw });
            this.cells[from.row][from.col] |= fw;
            this.cells[to.row][to.col]     |= OPPOSITE[fw];
        }

        // Build zones: zone 0 = start, zone i = after gate i
        const zones: Set<string>[] = [];
        zones.push(floodFill(this.cells, this.cols, this.rows, this.startCol, this.startRow, this.sceneryBlocked));
        for (let i = 0; i < this.gateEdges.length; i++) {
            const gTo = this.gateEdges[i].to;
            zones.push(floodFill(this.cells, this.cols, this.rows, gTo.col, gTo.row, this.sceneryBlocked));
        }

        // Restore passages (gate objects handle blocking, not walls)
        for (const { from, to, fw } of wallOps) {
            this.cells[from.row][from.col] &= ~fw;
            this.cells[to.row][to.col]     &= ~OPPOSITE[fw];
        }

        // Store gate1 position for hazard spawning
        this.gate1Cell = this.gateEdges[0].from;

        // Build sets of solution-path cells to avoid for key placement
        const pathCells = new Set<string>();
        const solPath = solvePath(this.cells, this.cols, this.rows,
            this.startCol, this.startRow, this.goalCol, this.goalRow,
            this.sceneryBlocked);
        for (const c of solPath) pathCells.add(`${c.col},${c.row}`);

        // Pick key locations far from the solution path to force real detours
        const distFromPath = bfsDistanceMap(this.cells, this.cols, this.rows, pathCells, this.sceneryBlocked);
        const pickOffPath = (zone: Set<string>): Cell | null => {
            const offPath = [...zone].filter(k =>
                !pathCells.has(k) &&
                k !== `${this.startCol},${this.startRow}` &&
                k !== `${this.goalCol},${this.goalRow}`
            );
            if (offPath.length > 0) {
                offPath.sort((a, b) => (distFromPath.get(b) ?? 0) - (distFromPath.get(a) ?? 0));
                const topN = Math.max(1, Math.floor(offPath.length * 0.25));
                const key = offPath[Math.floor(Math.random() * topN)];
                const [c, r] = key.split(',').map(Number);
                return { col: c, row: r };
            }
            const any = [...zone].filter(k =>
                k !== `${this.startCol},${this.startRow}` &&
                k !== `${this.goalCol},${this.goalRow}`
            );
            if (any.length === 0) return null;
            const key = any[Math.floor(Math.random() * any.length)];
            const [c, r] = key.split(',').map(Number);
            return { col: c, row: r };
        };

        // One key per zone (except the last zone which has the goal)
        const keyPositions: Cell[] = [];
        for (let i = 0; i < zones.length - 1; i++) {
            const pos = pickOffPath(zones[i]);
            if (!pos) {
                console.warn('[PhaseGame] Could not place key in zone', i, '— skipping gates.');
                this.gateEdges = [];
                return;
            }
            keyPositions.push(pos);
        }

        // Place keys
        for (const pos of keyPositions) {
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
                    if (nc < 0 || nc >= this.cols || nr < 0 || nr >= this.rows) continue;
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

        // Progressively verify: after opening gates 0..i, key i+1 must be reachable
        let ok = true;
        const openedGates = new Set(gateBlocked);
        const allKeys = [...this.keyItems.keys()];

        // Initially: at least one key must be reachable with all gates closed
        const reachable0 = bfs(this.startCol, this.startRow, openedGates);
        if (!allKeys.some(k => reachable0.has(k))) {
            console.warn('[PhaseGame] No key reachable from start! Removing gates.');
            ok = false;
        }

        // After each gate opens, the next key must become reachable
        if (ok) {
            for (let i = 0; i < this.gateEdges.length && ok; i++) {
                const ge = this.gateEdges[i];
                openedGates.delete(`${ge.from.col},${ge.from.row}>${ge.to.col},${ge.to.row}`);
                openedGates.delete(`${ge.to.col},${ge.to.row}>${ge.from.col},${ge.from.row}`);
                const reachable = bfs(this.startCol, this.startRow, openedGates);
                const keysFound = allKeys.filter(k => reachable.has(k)).length;
                if (keysFound < i + 1) {
                    console.warn(`[PhaseGame] Key ${i + 1} unreachable after gate ${i}! Removing gates.`);
                    ok = false;
                }
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
        const total  = this.gateEdges.length;
        const filled = '\u25C6'.repeat(this.keyCount);
        const empty  = '\u25C7'.repeat(Math.max(0, total - this.keyCount));
        this.inventoryText.setText(`${filled}${empty}  KEY`);
    }

    // ── Skill context ───────────────────────────────────────────────────────
    private get skillCtx(): SkillContext {
        return {
            scene: this,
            gridX: this.gridX, gridY: this.gridY,
            cols: this.cols, rows: this.rows,
            cells: this.cells,
            sceneryBlocked: this.sceneryBlocked,
            hazards: this.hazards,
            fog: this.fog,
            player: this.player,
            worldX: (c) => this.worldX(c),
            worldY: (r) => this.worldY(r),
            findGate: (fc, fr, tc, tr) => this.findGate(fc, fr, tc, tr),
            keyCount: this.keyCount,
            updateInventory: () => this.updateInventory(),
            collectKey: () => this.collectKey(),
            checkObjective: () => this.checkObjective(),
            checkGoal: () => this.checkGoal(),
            checkHazardCollision: () => this.checkHazardCollision(),
            setGrid: (x, y) => { this.gridX = x; this.gridY = y; },
            setMoving: (m) => { this.moving = m; this.slideDir = null; },
        };
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
        this.fog.updateDecay(this.time.now);

        // Skill cooldown tick
        this.skill.tick(this.time.now);

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
            this.skill.activate(this.skillCtx, this.time.now);
            return;
        }

        let dx = 0, dy = 0;

        if      (K.JustDown(this.cursors.left)  || K.JustDown(this.wasd.left))  dx = -1;
        else if (K.JustDown(this.cursors.right) || K.JustDown(this.wasd.right)) dx =  1;
        else if (K.JustDown(this.cursors.up)    || K.JustDown(this.wasd.up))    dy = -1;
        else if (K.JustDown(this.cursors.down)  || K.JustDown(this.wasd.down))  dy =  1;

        if (dx === 0 && dy === 0) return;

        // If skill is armed, intercept the arrow for the directional skill
        if (this.skill.armed) {
            if (this.skill.tryDirectional(dx, dy, this.skillCtx, this.time.now)) return;
            // If directional skill couldn't fire (blocked), disarm and do normal move
            this.skill.cancelArm(this.time.now);
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
            statsEvents.emit(STAT.GATE_OPENED);
        }

        this.gridX = newX;
        this.gridY = newY;
        this.moving = true;

        this.tweens.add({
            targets:  this.player,
            x:        this.worldX(this.gridX),
            y:        this.worldY(this.gridY),
            duration: 120,
            ease:     'Power2',
            onComplete: () => {
                this.moving = false;
                this.fog.revealAround(this.gridX, this.gridY, this.time.now);
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
        statsEvents.emit(STAT.KEY_COLLECTED);
    }

    // ── Goal flower ───────────────────────────────────────────────────────────
    private placeGoalFlower(season: SeasonTheme) {
        // World-space centre of the goal cell
        const cx = this.worldX(this.goalCol);
        const cy = this.worldY(this.goalRow);

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
            if (col === this.startCol && row === this.startRow) continue;
            if (col === this.goalCol  && row === this.goalRow)  continue;
            if (Math.random() > 0.65)                          continue;
            this.bushCells.add(key);
            drawBushAt(this, this.mazeLayer, col, row, season.name);
        }

        // Guarantee bushes every ~5 steps along the main solution path so the
        // player always has a hiding spot reachable from common corridors.
        const path = solvePath(this.cells, this.cols, this.rows, this.startCol, this.startRow, this.goalCol, this.goalRow);

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
            drawScenery(this, this.mazeLayer, col, row, season.name);
        }

        // Second pass: place scenery on dead-end cells (3 walls) across the grid
        // so every level gets landmarks even when few widened cells exist.
        // Scale target: 8→3, 10→5, 12→7
        const targetCount = Math.floor(this.cols * this.rows / 20);
        const deadEnds: string[] = [];
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
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
            drawScenery(this, this.mazeLayer, col, row, season.name);
        }

        // Bush spacing scales with grid: 8→4, 10→5, 12→6
        const step = Math.floor(this.cols / 2);
        for (let i = step; i < path.length - step; i += step) {
            this.guaranteeBushNear(path[i].col, path[i].row, season);
        }
    }

    // ── Scenic obstacle (blocking landmark, tile-sized) ────────────────────
    // ── Winter blocking rocks — require HOP to pass ───────────────────────────
    private placeBlockingRocks(season: SeasonTheme) {
        const MIN_ROCKS = 2;
        // Scale: 8→2, 10→3, 12→4
        const count = Math.max(MIN_ROCKS, Math.floor(this.cols / 4));

        // Build the solution path so we can prefer cells ON it (forces HOP usage)
        const solPath = solvePath(this.cells, this.cols, this.rows,
            this.startCol, this.startRow, this.goalCol, this.goalRow, this.sceneryBlocked);
        const solPathSet = new Set(solPath.map(c => `${c.col},${c.row}`));

        // Protect cells adjacent to gates — a rock next to a gate makes HOP
        // fail because the gate blocks the landing check.
        const gateProtected = new Set<string>();
        for (const { from, to } of this.gateEdges) {
            gateProtected.add(`${from.col},${from.row}`);
            gateProtected.add(`${to.col},${to.row}`);
        }

        // Candidates: any cell that can be hopped over (has at least one pair of
        // opposite open walls so the player can approach from one side and land
        // on the other). Prefer solution-path cells — they guarantee the player
        // MUST use HOP to proceed.
        const onPath: Cell[] = [];
        const offPath: Cell[] = [];
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const key = `${col},${row}`;
                if (this.sceneryBlocked.has(key)) continue;
                if (this.bushCells.has(key)) continue;
                if (gateProtected.has(key)) continue;
                if (col === this.startCol && row === this.startRow) continue;
                if (col === this.goalCol && row === this.goalRow) continue;
                const distStart = Math.abs(col - this.startCol) + Math.abs(row - this.startRow);
                const distGoal = Math.abs(col - this.goalCol) + Math.abs(row - this.goalRow);
                if (distStart <= 2 || distGoal <= 2) continue;

                // Must have at least one hoppable axis: both sides open
                const w = this.cells[row][col];
                const hoppableH = !(w & WALLS.LEFT) && !(w & WALLS.RIGHT);
                const hoppableV = !(w & WALLS.TOP) && !(w & WALLS.BOTTOM);
                if (!hoppableH && !hoppableV) continue;

                if (solPathSet.has(key)) {
                    onPath.push({ col, row });
                } else {
                    offPath.push({ col, row });
                }
            }
        }

        // Shuffle both pools
        const shuffle = (arr: Cell[]) => {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
        };
        shuffle(onPath);
        shuffle(offPath);

        // Place on-path rocks first (these force HOP), then off-path
        const candidates = [...onPath, ...offPath];

        let placed = 0;
        for (const c of candidates) {
            if (placed >= count) break;
            const key = `${c.col},${c.row}`;
            this.sceneryBlocked.add(key);

            if (this.hopAwareBfs()) {
                drawScenery(this, this.mazeLayer, c.col, c.row, season.name);
                placed++;
            } else {
                // Undo — this rock makes the level unsolvable even with HOP
                this.sceneryBlocked.delete(key);
            }
        }
    }

    /** BFS from start to goal that treats hop-over-scenery as a valid move. */
    private hopAwareBfs(): boolean {
        const visited = new Set<string>();
        const queue: Cell[] = [{ col: this.startCol, row: this.startRow }];
        visited.add(`${this.startCol},${this.startRow}`);

        while (queue.length > 0) {
            const { col, row } = queue.shift()!;
            if (col === this.goalCol && row === this.goalRow) return true;

            for (const { dc, dr, wall } of MOVE_DIRS) {
                if (this.cells[row][col] & wall) continue;
                const nc = col + dc, nr = row + dr;
                if (nc < 0 || nc >= this.cols || nr < 0 || nr >= this.rows) continue;
                const nk = `${nc},${nr}`;

                if (this.sceneryBlocked.has(nk)) {
                    // Try hopping over it
                    const lc = col + dc * 2, lr = row + dr * 2;
                    if (lc < 0 || lc >= this.cols || lr < 0 || lr >= this.rows) continue;
                    const lk = `${lc},${lr}`;
                    if (visited.has(lk)) continue;
                    if (this.sceneryBlocked.has(lk)) continue;
                    // Check wall from adj to landing
                    const adjWalls = this.cells[nr][nc];
                    if (dc === 1 && (adjWalls & WALLS.RIGHT)) continue;
                    if (dc === -1 && (adjWalls & WALLS.LEFT)) continue;
                    if (dr === 1 && (adjWalls & WALLS.BOTTOM)) continue;
                    if (dr === -1 && (adjWalls & WALLS.TOP)) continue;
                    visited.add(lk);
                    queue.push({ col: lc, row: lr });
                } else {
                    if (visited.has(nk)) continue;
                    visited.add(nk);
                    queue.push({ col: nc, row: nr });
                }
            }
        }
        return false;
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
                col >= 0 && col < this.cols && row >= 0 && row < this.rows &&
                !(col === this.startCol && row === this.startRow) &&
                !(col === this.goalCol  && row === this.goalRow) &&
                !this.sceneryBlocked.has(`${col},${row}`)
            );
        if (valid.length === 0) return;
        const { col, row } = valid[Math.floor(Math.random() * valid.length)];
        this.bushCells.add(`${col},${row}`);
        drawBushAt(this, this.mazeLayer, col, row, season.name);
    }

    // ── Hazard spawn ──────────────────────────────────────────────────────────
    private spawnHazard(season: SeasonTheme) {
        const onCaught = () => {
            this.lives--;
            this.updateLives();
            statsEvents.emit(STAT.CAUGHT);

            if (this.lives <= 0) {
                statsEvents.emit(STAT.DEATH);
                this.time.delayedCall(700, () => {
                    for (const h of this.hazards) h.destroy();
                    this.cameras.main.fadeOut(600, 0, 0, 0);
                    this.cameras.main.once('camerafadeoutcomplete', () => {
                        this.scene.start('GameScene', {
                            month:     seasonStart(this.monthConfig.month),
                            algorithm: this.algorithm,
                            from:      this.fromScene,
                            hard:      this.hardMode,
                            customMap: this.customMap ?? undefined,
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
                    x:        this.worldX(this.startCol),
                    y:        this.worldY(this.startRow),
                    alpha:    1.0,
                    duration: 500,
                    ease:     'Power2',
                });
                this.fog.revealAround(this.startCol, this.startRow, this.time.now);
                for (const h of this.hazards) h.scatter();
            }
        };

        const pick = (candidates: { col: number; row: number }[]) =>
            candidates[Math.floor(Math.random() * candidates.length)];

        // Split the grid into two zones: before gate1 (near start) and after gate1 (near goal)
        const g = this.gate1Cell;
        const nearStart: { col: number; row: number }[] = [];
        const nearGoal:  { col: number; row: number }[] = [];

        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
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
            this.hazards.push(new Hazard(this, this.cells, pos.col, pos.row, season.name, onCaught, this.sceneryBlocked, this.offsetX, this.offsetY));
        }

        // Enemy 2: in the goal-side zone
        if (nearGoal.length > 0) {
            const pos = pick(nearGoal);
            this.guaranteeBushNear(pos.col, pos.row, season);
            this.hazards.push(new Hazard(this, this.cells, pos.col, pos.row, season.name, onCaught, this.sceneryBlocked, this.offsetX, this.offsetY));
        }

        // Tell each hazard about its siblings so they spread out
        for (const h of this.hazards) h.setSiblings(this.hazards);
    }

    // ── Lives display ─────────────────────────────────────────────────────────
    private updateLives() {
        const full  = '♥'.repeat(Math.max(0, this.lives));
        const empty = '♡'.repeat(Math.max(0, 3 - this.lives));
        this.livesText.setText(full + empty);
    }

    // ── Season objectives ─────────────────────────────────────────────────────
    private placeObjectives(season: SeasonTheme) {
        // Scale objectives with grid: 8→2, 10→2, 12→3
        const count = Math.floor(this.cols / 4);
        this.objTotal = count;

        // Only place objectives on cells the player can physically reach
        const reachable = floodFill(this.cells, this.cols, this.rows,
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
            const z0 = floodFill(this.cells, this.cols, this.rows, this.startCol, this.startRow, this.sceneryBlocked);
            for (const k of z0) zoneOf.set(k, 0);
            for (let i = 0; i < this.gateEdges.length; i++) {
                const gTo = this.gateEdges[i].to;
                const zi = floodFill(this.cells, this.cols, this.rows, gTo.col, gTo.row, this.sceneryBlocked);
                for (const k of zi) zoneOf.set(k, i + 1);
            }
            for (const { from, to, fw } of wallOps) {
                this.cells[from.row][from.col] &= ~fw;
                this.cells[to.row][to.col] &= ~OPPOSITE[fw];
            }
        }

        // Distance from solution path for ranking candidates
        const solPath = solvePath(this.cells, this.cols, this.rows,
            this.startCol, this.startRow, this.goalCol, this.goalRow,
            this.sceneryBlocked);
        const pathSet = new Set(solPath.map(c => `${c.col},${c.row}`));
        const distFromPath = bfsDistanceMap(this.cells, this.cols, this.rows, pathSet, this.sceneryBlocked);

        // Group candidates by zone
        const numZones = this.gateEdges.length + 1;
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
            const cx = this.worldX(col);
            const cy = this.worldY(row);
            const container = buildObjectiveSprite(this, cx, cy, season.name);
            this.objectives.set(`${col},${row}`, container);
        }
        this.updateObjText();
    }

    private checkObjective() {
        if (this.objDone) return;
        const k = `${this.gridX},${this.gridY}`;
        const container = this.objectives.get(k);
        if (!container) return;

        this.objectives.delete(k);
        this.objCompleted++;
        statsEvents.emit(STAT.OBJ_COMPLETED);

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

    // ── Custom map entity placement ─────────────────────────────────────────
    private placeCustomEntities(season: SeasonTheme) {
        const cm = this.customMap!;

        // Bushes (hiding spots)
        for (const { col, row } of cm.bushes) {
            this.bushCells.add(`${col},${row}`);
            drawBushAt(this, this.mazeLayer, col, row, season.name);
        }

        // Scenic obstacles
        for (const { col, row } of cm.scenery) {
            this.sceneryBlocked.add(`${col},${row}`);
            drawScenery(this, this.mazeLayer, col, row, season.name);
        }

        // Keys
        for (const pos of cm.keys) {
            const rect = this.add
                .rectangle(pos.col * TILE + TILE / 2, pos.row * TILE + TILE / 2, 18, 18, season.keyColor)
                .setRotation(Math.PI / 4);
            this.mazeLayer.add(rect);
            this.keyItems.set(`${pos.col},${pos.row}`, rect);
        }

        // Gates
        for (const { from, to } of cm.gates) {
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
        if (this.gates.length > 0) {
            this.gate1Cell = { col: cm.gates[0].from.col, row: cm.gates[0].from.row };
        }

        // Objectives
        this.objTotal = cm.objectives.length;
        for (const { col, row } of cm.objectives) {
            const cx = this.worldX(col);
            const cy = this.worldY(row);
            const container = buildObjectiveSprite(this, cx, cy, season.name);
            this.objectives.set(`${col},${row}`, container);
        }
        // If no objectives, mark as done immediately so goal is accessible
        if (this.objTotal === 0) {
            this.objDone = true;
            if (this.goalLock) { this.goalLock.destroy(); this.goalLock = null; }
        }
        this.updateObjText();
    }

    private spawnCustomHazards(season: SeasonTheme) {
        const cm = this.customMap!;
        if (cm.enemies.length === 0) return;

        const onCaught = () => {
            this.lives--;
            this.updateLives();
            statsEvents.emit(STAT.CAUGHT);
            if (this.lives <= 0) {
                statsEvents.emit(STAT.DEATH);
                this.time.delayedCall(700, () => {
                    for (const h of this.hazards) h.destroy();
                    this.cameras.main.fadeOut(600, 0, 0, 0);
                    this.cameras.main.once('camerafadeoutcomplete', () => {
                        this.scene.start('GameScene', {
                            customMap: this.customMap ?? undefined,
                            from: 'ToolkitScene',
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
                    x:        this.worldX(this.startCol),
                    y:        this.worldY(this.startRow),
                    alpha:    1.0,
                    duration: 500,
                    ease:     'Power2',
                });
                this.fog.revealAround(this.startCol, this.startRow, this.time.now);
                for (const h of this.hazards) h.scatter();
            }
        };

        for (const { col, row } of cm.enemies) {
            this.hazards.push(new Hazard(this, this.cells, col, row, season.name, onCaught, this.sceneryBlocked, this.offsetX, this.offsetY));
        }
        for (const h of this.hazards) h.setSiblings(this.hazards);
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
        statsEvents.emit(STAT.MAZE_COMPLETE);

        // Custom map: return to toolkit on completion
        if (this.customMap) {
            this.time.delayedCall(500, () => {
                for (const h of this.hazards) h.destroy();
                this.cameras.main.fadeOut(800, 0, 0, 0);
                this.cameras.main.once('camerafadeoutcomplete', () => {
                    this.scene.start('ToolkitScene');
                });
            });
            return;
        }

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

}
