import Phaser from 'phaser';
import { TILE, COLS, ROWS, HEADER, PANEL } from '../constants';
import { ALGORITHMS, WALLS } from '../maze';

const W = COLS * TILE + PANEL;
const H = ROWS * TILE + HEADER;

const MOVE_DIRS = [
    { dc:  0, dr: -1, wall: WALLS.TOP    },
    { dc:  1, dr:  0, wall: WALLS.RIGHT  },
    { dc:  0, dr:  1, wall: WALLS.BOTTOM },
    { dc: -1, dr:  0, wall: WALLS.LEFT   },
];

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

// ── Tutorial steps ───────────────────────────────────────────────────────────
const STEPS = [
    { cols: 4, rows: 4, hint: 'Use arrow keys or WASD to move.\nReach the yellow flower!' },
    { cols: 4, rows: 4, hint: 'Collect the key to open the gate.' },
    { cols: 5, rows: 5, hint: 'Hide in bushes when the creature is near!\nReach the flower to continue.' },
    { cols: 5, rows: 5, hint: 'Collect all treasures before\nthe exit unlocks.' },
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

        // Center the small grid
        this.offsetX = Math.floor((W - cfg.cols * TILE) / 2);
        this.offsetY = Math.floor(90 + (H - 90 - 80 - cfg.rows * TILE) / 2);

        this.stepLabel.setText(`Step ${this.step + 1} of ${STEPS.length}`);
        this.hintText.setText(cfg.hint);

        // Generate maze
        this.cells = ALGORITHMS.dfs.generate(cfg.cols, cfg.rows);

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
    }

    // ── Maze rendering ───────────────────────────────────────────────────────
    private drawMaze() {
        const ox = this.offsetX, oy = this.offsetY;
        const cols = this.tutCols, rows = this.tutRows;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const light = (row + col) % 2 === 0;
                const r = this.add.rectangle(
                    ox + col * TILE + TILE / 2, oy + row * TILE + TILE / 2,
                    TILE, TILE, light ? T.floorLight : T.floorDark
                );
                this.stepGroup.add(r);
            }
        }

        const g = this.add.graphics();
        g.lineStyle(4, T.wallColor, 1);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
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
        const cx = this.offsetX + this.goalCol * TILE + TILE / 2;
        const cy = this.offsetY + this.goalRow * TILE + TILE / 2;
        const bg = this.add.rectangle(cx, cy, TILE, TILE, T.goalColor, 0.35);
        this.stepGroup.add(bg);

        // Simple flower
        const petals = 5;
        for (let i = 0; i < petals; i++) {
            const a = (i / petals) * Math.PI * 2;
            const p = this.add.ellipse(cx + Math.cos(a) * 10, cy + Math.sin(a) * 10, 10, 14, T.goalColor, 0.8)
                .setAngle((a * 180 / Math.PI) + 90);
            this.stepGroup.add(p);
        }
        const center = this.add.circle(cx, cy, 6, 0xffffff, 0.9);
        this.stepGroup.add(center);
        this.tweens.add({ targets: center, scale: { from: 0.9, to: 1.15 }, yoyo: true, repeat: -1, duration: 1200, ease: 'Sine.easeInOut' });
    }

    private spawnPlayer() {
        const px = this.offsetX + this.gridX * TILE + TILE / 2;
        const py = this.offsetY + this.gridY * TILE + TILE / 2;
        const glow = this.add.circle(0, 0, 20, T.playerGlow, 0.25);
        const body = this.add.circle(0, 0, 12, T.playerColor, 0.95);
        const inner = this.add.circle(0, -2, 5, 0xffffff, 0.7);
        this.player = this.add.container(px, py, [glow, body, inner]).setDepth(5);
        this.stepGroup.add(this.player);
        this.tweens.add({ targets: glow, alpha: { from: 0.15, to: 0.4 }, yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.easeInOut' });
    }

    // ── Step 2: Keys + Gates ─────────────────────────────────────────────────
    private buildStep2() {
        // Find solution path, place gate at midpoint, key before it
        const path = this.solvePath();
        if (path.length < 4) return;

        const gateIdx = Math.floor(path.length * 0.5);
        const from = path[gateIdx], to = path[gateIdx + 1];
        if (!to) return;

        // Key somewhere before the gate
        const keyIdx = 1 + Math.floor(Math.random() * (gateIdx - 1));
        const keyCell = path[keyIdx];
        const kx = this.offsetX + keyCell.col * TILE + TILE / 2;
        const ky = this.offsetY + keyCell.row * TILE + TILE / 2;
        const rect = this.add.rectangle(kx, ky, 18, 18, T.keyColor).setRotation(Math.PI / 4);
        this.stepGroup.add(rect);
        this.keyItems.set(`${keyCell.col},${keyCell.row}`, rect);

        // Gate
        const dc = to.col - from.col, dr = to.row - from.row;
        let gx: number, gy: number, gw: number, gh: number;
        if      (dc ===  1) { gx = from.col * TILE + TILE;     gy = from.row * TILE + TILE / 2; gw = 10; gh = TILE - 10; }
        else if (dc === -1) { gx = from.col * TILE;             gy = from.row * TILE + TILE / 2; gw = 10; gh = TILE - 10; }
        else if (dr ===  1) { gx = from.col * TILE + TILE / 2; gy = from.row * TILE + TILE;     gw = TILE - 10; gh = 10; }
        else                { gx = from.col * TILE + TILE / 2; gy = from.row * TILE;            gw = TILE - 10; gh = 10; }

        const graphic = this.add.rectangle(this.offsetX + gx, this.offsetY + gy, gw, gh, T.gateColor);
        this.stepGroup.add(graphic);
        this.gates.push({ fromCol: from.col, fromRow: from.row, toCol: to.col, toRow: to.row, graphic, open: false });
    }

    // ── Step 3: Hiding + Enemy ───────────────────────────────────────────────
    private buildStep3() {
        // Place bushes along solution path
        const path = this.solvePath();
        for (let i = 2; i < path.length - 1; i += 2) {
            const { col, row } = path[i];
            const key = `${col},${row}`;
            if (key === `${this.goalCol},${this.goalRow}`) continue;
            this.bushCells.add(key);
            this.drawBush(col, row);
        }

        // Spawn enemy far from player
        const startCol = this.tutCols - 1;
        const startRow = this.tutRows - 1 > 1 ? 1 : 0;
        this.enemyCol = startCol;
        this.enemyRow = startRow;

        const ex = this.offsetX + startCol * TILE + TILE / 2;
        const ey = this.offsetY + startRow * TILE + TILE / 2;
        const danger = this.add.circle(0, 0, 18, T.enemyColor, 0.15);
        const ebody = this.add.circle(0, 0, 10, T.enemyColor, 0.9);
        const eye1 = this.add.circle(-4, -3, 2.5, 0xffffff, 0.9);
        const eye2 = this.add.circle(4, -3, 2.5, 0xffffff, 0.9);
        this.enemySprite = this.add.container(ex, ey, [danger, ebody, eye1, eye2]).setDepth(4);
        this.stepGroup.add(this.enemySprite);

        this.tweens.add({ targets: danger, alpha: { from: 0.1, to: 0.3 }, yoyo: true, repeat: -1, duration: 800, ease: 'Sine.easeInOut' });
        this.scheduleEnemyMove();
    }

    private drawBush(col: number, row: number) {
        const cx = this.offsetX + col * TILE + TILE / 2;
        const cy = this.offsetY + row * TILE + TILE / 2;
        const b1 = this.add.circle(cx - 9, cy + 5, 11, T.bushColor, 0.85);
        const b2 = this.add.circle(cx + 9, cy + 5, 11, T.bushColor, 0.85);
        const b3 = this.add.circle(cx, cy - 3, 13, T.bushLight, 0.9);
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
        if (!this.enemySprite || this.enemyMoving || this.completed) {
            this.scheduleEnemyMove();
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

        // Place 2 objectives on non-start/goal cells
        const path = this.solvePath();
        const candidates = path.filter(c =>
            !(c.col === 0 && c.row === 0) &&
            !(c.col === this.goalCol && c.row === this.goalRow)
        );
        // Pick 2 spread-out positions
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

        // Hiding check
        if (this.step === 2) {
            const nowHiding = this.bushCells.has(`${this.gridX},${this.gridY}`);
            if (nowHiding !== this.isHiding) {
                this.isHiding = nowHiding;
                this.tweens.add({ targets: this.player, alpha: nowHiding ? 0.35 : 1.0, duration: 300 });
            }
        }

        if (this.moving) return;

        const K = Phaser.Input.Keyboard;
        let dx = 0, dy = 0;
        if      (K.JustDown(this.cursors.left)  || K.JustDown(this.wasd.left))  dx = -1;
        else if (K.JustDown(this.cursors.right) || K.JustDown(this.wasd.right)) dx =  1;
        else if (K.JustDown(this.cursors.up)    || K.JustDown(this.wasd.up))    dy = -1;
        else if (K.JustDown(this.cursors.down)  || K.JustDown(this.wasd.down))  dy =  1;

        if (dx === 0 && dy === 0) return;
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
                this.collectKey();
                this.checkObjective();
                this.checkGoal();
                this.continueSlide();
            },
        });
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

        const checkmark = this.step < STEPS.length - 1 ? '✓' : '✓  Tutorial complete!';
        this.hintText.setText(checkmark);

        this.time.delayedCall(1200, () => {
            this.step++;
            this.completed = false;
            this.hintText.setColor(T.textColor);
            this.buildStep();
        });
    }

    private showComplete() {
        this.hintText.setText('');
        this.stepLabel.setText('');

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
