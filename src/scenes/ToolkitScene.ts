import Phaser from 'phaser';
import { TILE, MAX_COLS, MAX_ROWS, HEADER, PANEL } from '../constants';
import { WALLS, OPPOSITE, ALGORITHMS } from '../maze';
import { SEASONS, SeasonTheme } from '../seasons';
import { solvePath } from '../mazeUtils';
import { CustomMapData } from '../toolkit';

const W = MAX_COLS * TILE + PANEL;
const H = MAX_ROWS * TILE + HEADER;

const ALL_WALLS = WALLS.TOP | WALLS.RIGHT | WALLS.BOTTOM | WALLS.LEFT;

type ToolName = 'wall' | 'start' | 'goal' | 'bush' | 'scenery' | 'enemy' | 'objective' | 'gate' | 'key' | 'eraser';

const TOOLS: { name: ToolName; label: string }[] = [
    { name: 'wall',      label: 'Walls'     },
    { name: 'start',     label: 'Start'     },
    { name: 'goal',      label: 'Goal'      },
    { name: 'enemy',     label: 'Enemy'     },
    { name: 'bush',      label: 'Hiding'    },
    { name: 'scenery',   label: 'Obstacle'  },
    { name: 'objective', label: 'Objective' },
    { name: 'gate',      label: 'Gate'      },
    { name: 'key',       label: 'Key'       },
    { name: 'eraser',    label: 'Eraser'    },
];

const STORAGE_KEY = 'phasegame_toolkit_maps';
const MAX_SAVES = 10;

// ── Snapshot for undo/redo ────────────────────────────────────────────────────
interface EditorSnapshot {
    cells: number[][];
    startCell: { col: number; row: number };
    goalCell: { col: number; row: number };
    enemies: { col: number; row: number }[];
    bushes: string[];
    scenery: string[];
    objectives: string[];
    gates: { from: { col: number; row: number }; to: { col: number; row: number } }[];
    keys: string[];
}

// ── Saved map entry ──────────────────────────────────────────────────────────
interface SavedMap {
    name: string;
    date: string;
    data: CustomMapData;
}

export default class ToolkitScene extends Phaser.Scene {
    // Setup state
    private gridSize = 10;
    private seasonName: keyof typeof SEASONS = 'Spring';

    // Editor state
    private cells: number[][] = [];
    private startCell = { col: 0, row: 0 };
    private goalCell = { col: 9, row: 9 };
    private enemies: { col: number; row: number }[] = [];
    private bushes = new Set<string>();
    private scenery = new Set<string>();
    private objectives = new Set<string>();
    private gates: { from: { col: number; row: number }; to: { col: number; row: number } }[] = [];
    private keys = new Set<string>();
    private activeTool: ToolName = 'wall';

    // Undo/redo stacks
    private undoStack: EditorSnapshot[] = [];
    private redoStack: EditorSnapshot[] = [];
    private undoBtn?: Phaser.GameObjects.Text;
    private redoBtn?: Phaser.GameObjects.Text;

    // Display objects
    private mazeLayer!: Phaser.GameObjects.Container;
    private wallGraphics!: Phaser.GameObjects.Graphics;
    private entityLayer!: Phaser.GameObjects.Container;
    private toolButtons: Phaser.GameObjects.Text[] = [];
    private toolCounts: Phaser.GameObjects.Text[] = [];
    private toolHighlight!: Phaser.GameObjects.Rectangle;
    private statusText!: Phaser.GameObjects.Text;
    private setupGroup: Phaser.GameObjects.GameObject[] = [];

    // Gate placement helper (need two clicks: from-cell and to-cell)
    private gatePending: { col: number; row: number } | null = null;

    constructor() { super('ToolkitScene'); }

    private get season(): SeasonTheme { return SEASONS[this.seasonName]; }
    private get cols() { return this.gridSize; }
    private get rows() { return this.gridSize; }
    private get offsetX() { return Math.floor((MAX_COLS * TILE - this.cols * TILE) / 2); }
    private get offsetY() { return Math.floor((MAX_ROWS * TILE - this.rows * TILE) / 2); }
    private worldX(col: number) { return col * TILE + TILE / 2 + this.offsetX; }
    private worldY(row: number) { return row * TILE + TILE / 2 + HEADER + this.offsetY; }

    create() {
        this.cameras.main.setBackgroundColor(0x060c14);
        this.showSetup();
    }

    // ── Setup screen ─────────────────────────────────────────────────────────
    private showSetup() {
        this.setupGroup = [];

        const bg = this.add.rectangle(W / 2, H / 2, W, H, 0x060c14);
        this.setupGroup.push(bg);

        const title = this.add.text(W / 2, 80, 'M A P   T O O L K I T', {
            fontSize: '36px', fontStyle: 'bold', color: '#c8e4f4',
        }).setOrigin(0.5);
        this.setupGroup.push(title);

        // ── Grid size picker ─────────────────────────────────────────────────
        const sizeLabel = this.add.text(W / 2, 180, 'Grid Size', {
            fontSize: '20px', color: '#8899aa',
        }).setOrigin(0.5);
        this.setupGroup.push(sizeLabel);

        const sizes = [8, 10, 12];
        sizes.forEach((s, i) => {
            const x = W / 2 + (i - 1) * 120;
            const active = s === this.gridSize;
            const btn = this.add.text(x, 220, `${s}x${s}`, {
                fontSize: '24px', fontStyle: active ? 'bold' : 'normal',
                color: active ? '#ffffff' : '#6688aa',
                backgroundColor: active ? '#334466' : undefined,
                padding: { x: 16, y: 8 },
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });
            btn.on('pointerdown', () => {
                this.gridSize = s;
                this.clearSetup();
                this.showSetup();
            });
            this.setupGroup.push(btn);
        });

        // ── Season picker ────────────────────────────────────────────────────
        const seasonLabel = this.add.text(W / 2, 300, 'Season', {
            fontSize: '20px', color: '#8899aa',
        }).setOrigin(0.5);
        this.setupGroup.push(seasonLabel);

        const seasonNames = ['Winter', 'Spring', 'Summer', 'Fall'] as const;
        seasonNames.forEach((name, i) => {
            const x = W / 2 + (i - 1.5) * 140;
            const s = SEASONS[name];
            const active = name === this.seasonName;
            const btn = this.add.text(x, 350, name, {
                fontSize: '22px', fontStyle: active ? 'bold' : 'normal',
                color: active ? '#ffffff' : s.accentHex,
                backgroundColor: active ? `#${(s.floorDark & 0xfefefe).toString(16).padStart(6, '0')}` : undefined,
                padding: { x: 14, y: 8 },
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });
            btn.on('pointerdown', () => {
                this.seasonName = name;
                this.clearSetup();
                this.showSetup();
            });
            this.setupGroup.push(btn);
        });

        // ── Start editing button ─────────────────────────────────────────────
        const startBtn = this.add.text(W / 2, 460, 'Start Editing', {
            fontSize: '32px', fontStyle: 'bold', color: '#7ab8d4',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        this.tweens.add({
            targets: startBtn, alpha: { from: 0.6, to: 1 },
            yoyo: true, repeat: -1, duration: 2000, ease: 'Sine.easeInOut',
        });
        startBtn.on('pointerover', () => startBtn.setColor('#ffffff'));
        startBtn.on('pointerout', () => startBtn.setColor('#7ab8d4'));
        startBtn.on('pointerdown', () => {
            this.clearSetup();
            this.initEditor();
        });
        this.setupGroup.push(startBtn);

        // ── Saved maps list ─────────────────────────────────────────────────
        const saved = this.loadSavedMaps();
        if (saved.length > 0) {
            const savedLabel = this.add.text(W / 2, 530, 'Saved Maps', {
                fontSize: '20px', color: '#8899aa',
            }).setOrigin(0.5);
            this.setupGroup.push(savedLabel);

            const listY = 565;
            saved.forEach((entry, i) => {
                if (i >= 5) return; // show at most 5 on setup screen
                const y = listY + i * 36;
                const lbl = this.add.text(W / 2 - 120, y, `${entry.name}`, {
                    fontSize: '18px', color: '#aabbcc',
                }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
                lbl.on('pointerover', () => lbl.setColor('#ffffff'));
                lbl.on('pointerout', () => lbl.setColor('#aabbcc'));
                lbl.on('pointerdown', () => {
                    this.clearSetup();
                    this.loadMapIntoEditor(entry.data);
                });
                this.setupGroup.push(lbl);

                const dateText = this.add.text(W / 2 + 100, y, entry.date, {
                    fontSize: '13px', color: '#667788',
                }).setOrigin(0, 0.5);
                this.setupGroup.push(dateText);

                const delBtn = this.add.text(W / 2 + 180, y, '\u2715', {
                    fontSize: '16px', color: '#884444',
                }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
                delBtn.on('pointerover', () => delBtn.setColor('#ff6666'));
                delBtn.on('pointerout', () => delBtn.setColor('#884444'));
                delBtn.on('pointerdown', () => {
                    this.deleteSavedMap(i);
                    this.clearSetup();
                    this.showSetup();
                });
                this.setupGroup.push(delBtn);
            });
        }

        // ── Back to title ────────────────────────────────────────────────────
        const backY = saved.length > 0 ? 570 + Math.min(saved.length, 5) * 36 + 20 : 540;
        const backBtn = this.add.text(W / 2, backY, 'Back', {
            fontSize: '20px', color: '#556677',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        backBtn.on('pointerover', () => backBtn.setColor('#aabbcc'));
        backBtn.on('pointerout', () => backBtn.setColor('#556677'));
        backBtn.on('pointerdown', () => this.scene.start('TitleScene'));
        this.setupGroup.push(backBtn);
    }

    private clearSetup() {
        for (const obj of this.setupGroup) obj.destroy();
        this.setupGroup = [];
    }

    // ── Editor ───────────────────────────────────────────────────────────────
    private initEditor() {
        const season = this.season;

        // Reset map data
        this.cells = Array.from({ length: this.rows }, () => Array(this.cols).fill(ALL_WALLS));
        this.startCell = { col: 0, row: 0 };
        this.goalCell = { col: this.cols - 1, row: this.rows - 1 };
        this.enemies = [];
        this.bushes.clear();
        this.scenery.clear();
        this.objectives.clear();
        this.gates = [];
        this.keys.clear();
        this.activeTool = 'wall';
        this.gatePending = null;
        this.undoStack = [];
        this.redoStack = [];

        this.buildEditorUI(season);
    }

    private loadMapIntoEditor(data: CustomMapData) {
        this.gridSize = data.cols;
        this.seasonName = data.seasonName;
        const season = this.season;

        this.cells = data.cells.map(row => [...row]);
        this.startCell = { ...data.start };
        this.goalCell = { ...data.goal };
        this.enemies = data.enemies.map(e => ({ ...e }));
        this.bushes = new Set(data.bushes.map(b => `${b.col},${b.row}`));
        this.scenery = new Set(data.scenery.map(s => `${s.col},${s.row}`));
        this.objectives = new Set(data.objectives.map(o => `${o.col},${o.row}`));
        this.gates = data.gates.map(g => ({ from: { ...g.from }, to: { ...g.to } }));
        this.keys = new Set(data.keys.map(k => `${k.col},${k.row}`));
        this.activeTool = 'wall';
        this.gatePending = null;
        this.undoStack = [];
        this.redoStack = [];

        this.buildEditorUI(season);
    }

    private buildEditorUI(season: SeasonTheme) {
        this.cameras.main.setBackgroundColor(season.bgColor);

        // ── Floor tiles ──────────────────────────────────────────────────────
        this.mazeLayer = this.add.container(this.offsetX, HEADER + this.offsetY);

        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const light = (row + col) % 2 === 0;
                this.mazeLayer.add(
                    this.add.rectangle(
                        col * TILE + TILE / 2, row * TILE + TILE / 2,
                        TILE, TILE, light ? season.floorLight : season.floorDark,
                    ),
                );
            }
        }

        // ── Wall graphics ────────────────────────────────────────────────────
        this.wallGraphics = this.add.graphics();
        this.mazeLayer.add(this.wallGraphics);
        this.redrawWalls();

        // ── Entity layer (above walls) ───────────────────────────────────────
        this.entityLayer = this.add.container(this.offsetX, HEADER + this.offsetY);
        this.redrawEntities();

        // ── Header ───────────────────────────────────────────────────────────
        const hx = this.offsetX + this.cols * TILE / 2;
        this.add.text(hx, this.offsetY + 30, 'M A P   T O O L K I T', {
            fontSize: '22px', fontStyle: 'bold', color: season.accentHex,
        }).setOrigin(0.5).setDepth(3);

        this.add.text(hx, this.offsetY + 60, `${this.cols}x${this.rows} ${this.seasonName}`, {
            fontSize: '15px', color: `${season.accentHex}88`,
        }).setOrigin(0.5).setDepth(3);

        // Header buttons
        const headerBtnStyle = { fontSize: '14px', color: season.accentHex };

        const backBtn = this.add.text(this.offsetX + 10, this.offsetY + 20, 'Back', headerBtnStyle)
            .setInteractive({ useHandCursor: true }).setDepth(3);
        backBtn.on('pointerdown', () => this.scene.restart());

        const clearBtn = this.add.text(this.offsetX + 10, this.offsetY + 45, 'Clear', headerBtnStyle)
            .setInteractive({ useHandCursor: true }).setDepth(3);
        clearBtn.on('pointerdown', () => {
            this.pushUndo();
            this.cells = Array.from({ length: this.rows }, () => Array(this.cols).fill(ALL_WALLS));
            this.enemies = [];
            this.bushes.clear();
            this.scenery.clear();
            this.objectives.clear();
            this.gates = [];
            this.keys.clear();
            this.redrawWalls();
            this.redrawEntities();
            this.setStatus('');
        });

        // Save button
        const saveBtn = this.add.text(this.offsetX + 10, this.offsetY + 70, 'Save', headerBtnStyle)
            .setInteractive({ useHandCursor: true }).setDepth(3);
        saveBtn.on('pointerdown', () => this.saveCurrentMap());

        // Generate maze button
        const genBtn = this.add.text(this.offsetX + 10, this.offsetY + 95, 'Generate', headerBtnStyle)
            .setInteractive({ useHandCursor: true }).setDepth(3);
        genBtn.on('pointerdown', () => this.generateMaze());

        // Undo / Redo buttons (right side of header)
        const rightX = this.offsetX + this.cols * TILE - 10;

        const playBtn = this.add.text(
            rightX, this.offsetY + 30,
            'PLAY', { fontSize: '20px', fontStyle: 'bold', color: '#ffffff', backgroundColor: '#228844', padding: { x: 12, y: 6 } },
        ).setOrigin(1, 0.5).setInteractive({ useHandCursor: true }).setDepth(3);
        playBtn.on('pointerdown', () => this.tryPlay());

        this.undoBtn = this.add.text(rightX, this.offsetY + 60, 'Undo', headerBtnStyle)
            .setOrigin(1, 0).setInteractive({ useHandCursor: true }).setDepth(3);
        this.undoBtn.on('pointerdown', () => this.undo());

        this.redoBtn = this.add.text(rightX, this.offsetY + 80, 'Redo', headerBtnStyle)
            .setOrigin(1, 0).setInteractive({ useHandCursor: true }).setDepth(3);
        this.redoBtn.on('pointerdown', () => this.redo());

        this.updateUndoRedoStyle();

        // ── Status text ──────────────────────────────────────────────────────
        this.statusText = this.add.text(hx, this.offsetY + 95, '', {
            fontSize: '13px', color: '#ff6666',
        }).setOrigin(0.5).setDepth(3);

        // ── Side panel: tool palette ─────────────────────────────────────────
        this.buildToolPanel(season);

        // ── Keyboard shortcuts ───────────────────────────────────────────────
        this.input.keyboard!.addKey('Z').on('down', () => this.undo());
        this.input.keyboard!.addKey('Y').on('down', () => this.redo());

        // ── Click handler ────────────────────────────────────────────────────
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            this.handleClick(pointer);
        });
    }

    // ── Undo / Redo ───────────────────────────────────────────────────────────
    private takeSnapshot(): EditorSnapshot {
        return {
            cells: this.cells.map(row => [...row]),
            startCell: { ...this.startCell },
            goalCell: { ...this.goalCell },
            enemies: this.enemies.map(e => ({ ...e })),
            bushes: [...this.bushes],
            scenery: [...this.scenery],
            objectives: [...this.objectives],
            gates: this.gates.map(g => ({ from: { ...g.from }, to: { ...g.to } })),
            keys: [...this.keys],
        };
    }

    private applySnapshot(snap: EditorSnapshot) {
        this.cells = snap.cells.map(row => [...row]);
        this.startCell = { ...snap.startCell };
        this.goalCell = { ...snap.goalCell };
        this.enemies = snap.enemies.map(e => ({ ...e }));
        this.bushes = new Set(snap.bushes);
        this.scenery = new Set(snap.scenery);
        this.objectives = new Set(snap.objectives);
        this.gates = snap.gates.map(g => ({ from: { ...g.from }, to: { ...g.to } }));
        this.keys = new Set(snap.keys);
        this.redrawWalls();
        this.redrawEntities();
    }

    private pushUndo() {
        this.undoStack.push(this.takeSnapshot());
        if (this.undoStack.length > 50) this.undoStack.shift();
        this.redoStack = [];
        this.updateUndoRedoStyle();
    }

    private undo() {
        if (this.undoStack.length === 0) return;
        this.redoStack.push(this.takeSnapshot());
        this.applySnapshot(this.undoStack.pop()!);
        this.updateUndoRedoStyle();
        this.setStatus('');
    }

    private redo() {
        if (this.redoStack.length === 0) return;
        this.undoStack.push(this.takeSnapshot());
        this.applySnapshot(this.redoStack.pop()!);
        this.updateUndoRedoStyle();
        this.setStatus('');
    }

    private updateUndoRedoStyle() {
        if (this.undoBtn) this.undoBtn.setAlpha(this.undoStack.length > 0 ? 1 : 0.3);
        if (this.redoBtn) this.redoBtn.setAlpha(this.redoStack.length > 0 ? 1 : 0.3);
    }

    // ── Generate random maze ────────────────────────────────────────────────
    private generateMaze() {
        this.pushUndo();
        this.cells = ALGORITHMS['kruskals'].generate(this.cols, this.rows);
        this.redrawWalls();
        this.setStatus('Maze generated \u2014 edit as you like');
        this.statusText?.setColor('#66ff66');
        this.time.delayedCall(2000, () => {
            this.setStatus('');
            this.statusText?.setColor('#ff6666');
        });
    }

    // ── Save / Load ───────────────────────────────────────────────────────────
    private loadSavedMaps(): SavedMap[] {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            return JSON.parse(raw) as SavedMap[];
        } catch { return []; }
    }

    private writeSavedMaps(maps: SavedMap[]) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(maps));
    }

    private saveCurrentMap() {
        const maps = this.loadSavedMaps();
        const count = maps.length + 1;
        const now = new Date();
        const date = `${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

        const entry: SavedMap = {
            name: `${this.seasonName} ${this.cols}x${this.rows} #${count}`,
            date,
            data: this.buildMapData(),
        };

        maps.unshift(entry);
        if (maps.length > MAX_SAVES) maps.length = MAX_SAVES;
        this.writeSavedMaps(maps);
        this.setStatus('Map saved!');
        this.statusText?.setColor('#66ff66');
        this.time.delayedCall(2000, () => {
            this.setStatus('');
            this.statusText?.setColor('#ff6666');
        });
    }

    private deleteSavedMap(index: number) {
        const maps = this.loadSavedMaps();
        maps.splice(index, 1);
        this.writeSavedMaps(maps);
    }

    private buildMapData(): CustomMapData {
        return {
            cols: this.cols,
            rows: this.rows,
            seasonName: this.seasonName as CustomMapData['seasonName'],
            cells: this.cells.map(row => [...row]),
            start: { ...this.startCell },
            goal: { ...this.goalCell },
            enemies: this.enemies.map(e => ({ ...e })),
            bushes: [...this.bushes].map(k => {
                const [c, r] = k.split(',').map(Number);
                return { col: c, row: r };
            }),
            scenery: [...this.scenery].map(k => {
                const [c, r] = k.split(',').map(Number);
                return { col: c, row: r };
            }),
            objectives: [...this.objectives].map(k => {
                const [c, r] = k.split(',').map(Number);
                return { col: c, row: r };
            }),
            gates: this.gates.map(g => ({ from: { ...g.from }, to: { ...g.to } })),
            keys: [...this.keys].map(k => {
                const [c, r] = k.split(',').map(Number);
                return { col: c, row: r };
            }),
        };
    }

    // ── Tool panel ───────────────────────────────────────────────────────────
    private buildToolPanel(season: SeasonTheme) {
        const px = this.offsetX + this.cols * TILE;
        const pw = PANEL;
        const py = this.offsetY;
        const cx = px + pw / 2;
        const depth = 3;

        // Panel background
        const panelBg = (season.bgColor & 0xfefefe) + 0x0a0a0a;
        this.add.rectangle(px + pw / 2, py + HEADER / 2 + this.rows * TILE / 2, pw, HEADER + this.rows * TILE, panelBg).setDepth(depth - 1);

        this.add.text(cx, HEADER + py + 10, 'TOOLS', {
            fontSize: '14px', color: season.panelDimHex, letterSpacing: 4,
        }).setOrigin(0.5).setDepth(depth);

        this.toolHighlight = this.add.rectangle(cx, 0, pw - 20, 28, season.uiAccent, 0.15)
            .setDepth(depth);

        this.toolButtons = [];
        this.toolCounts = [];
        let y = HEADER + py + 38;
        for (const tool of TOOLS) {
            const active = tool.name === this.activeTool;
            const btn = this.add.text(cx - 20, y, tool.label, {
                fontSize: '16px',
                color: active ? '#ffffff' : season.accentHex,
                fontStyle: active ? 'bold' : 'normal',
            }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(depth);

            btn.on('pointerdown', () => {
                this.activeTool = tool.name;
                this.gatePending = null;
                this.updateToolHighlight();
                this.setStatus('');
            });

            // Count label (right of tool name)
            const countText = this.add.text(cx + 55, y, '', {
                fontSize: '13px', color: season.panelDimHex,
            }).setOrigin(0.5).setDepth(depth);
            this.toolCounts.push(countText);

            if (active) this.toolHighlight.setY(y);
            this.toolButtons.push(btn);
            y += 32;
        }
        this.updateToolCounts();

        // ── Instructions ─────────────────────────────────────────────────────
        y += 20;
        this.add.text(cx, y, 'Walls: click edges\nEntities: click cells\nGate: click 2 adjacent\n  cells for gate edge\n\nZ = Undo  Y = Redo', {
            fontSize: '12px', color: season.panelDimHex, align: 'center',
            lineSpacing: 4,
        }).setOrigin(0.5, 0).setDepth(depth);
    }

    private updateToolCounts() {
        if (this.toolCounts.length === 0) return;
        // Order matches TOOLS: wall, start, goal, enemy, bush, scenery, objective, gate, key, eraser
        const counts: (string | null)[] = [
            null,                                       // wall — no count
            null,                                       // start — always 1
            null,                                       // goal — always 1
            `${this.enemies.length}/4`,                 // enemy
            `${this.bushes.size}`,                      // bush
            `${this.scenery.size}`,                     // scenery
            `${this.objectives.size}`,                  // objective
            `${this.gates.length}`,                     // gate
            `${this.keys.size}`,                        // key
            null,                                       // eraser — no count
        ];
        for (let i = 0; i < this.toolCounts.length; i++) {
            this.toolCounts[i].setText(counts[i] ?? '');
        }
    }

    private updateToolHighlight() {
        const idx = TOOLS.findIndex(t => t.name === this.activeTool);
        for (let i = 0; i < this.toolButtons.length; i++) {
            const btn = this.toolButtons[i];
            const active = i === idx;
            btn.setColor(active ? '#ffffff' : this.season.accentHex);
            btn.setFontStyle(active ? 'bold' : 'normal');
        }
        if (idx >= 0) {
            const btn = this.toolButtons[idx];
            this.toolHighlight.setY(btn.y);
        }
    }

    // ── Click handling ───────────────────────────────────────────────────────
    private handleClick(pointer: Phaser.Input.Pointer) {
        // Convert to grid-local coordinates
        const lx = pointer.x - this.offsetX;
        const ly = pointer.y - HEADER - this.offsetY;

        // Out of grid bounds?
        if (lx < 0 || lx >= this.cols * TILE || ly < 0 || ly >= this.rows * TILE) return;

        if (this.activeTool === 'wall') {
            this.handleWallClick(lx, ly);
        } else if (this.activeTool === 'gate') {
            this.handleGateClick(lx, ly);
        } else {
            this.handleCellClick(lx, ly);
        }
    }

    private handleWallClick(lx: number, ly: number) {
        const col = Math.floor(lx / TILE);
        const row = Math.floor(ly / TILE);
        const inCellX = lx - col * TILE;
        const inCellY = ly - row * TILE;

        const edge = 14; // click zone near cell edges

        // Determine which wall edge was clicked
        type WallHit = { row: number; col: number; wall: number; nr: number; nc: number; opp: number };
        let hit: WallHit | null = null;

        if (inCellY < edge && row > 0) {
            // Top edge
            hit = { row, col, wall: WALLS.TOP, nr: row - 1, nc: col, opp: WALLS.BOTTOM };
        } else if (inCellY > TILE - edge && row < this.rows - 1) {
            // Bottom edge
            hit = { row, col, wall: WALLS.BOTTOM, nr: row + 1, nc: col, opp: WALLS.TOP };
        } else if (inCellX < edge && col > 0) {
            // Left edge
            hit = { row, col, wall: WALLS.LEFT, nr: row, nc: col - 1, opp: WALLS.RIGHT };
        } else if (inCellX > TILE - edge && col < this.cols - 1) {
            // Right edge
            hit = { row, col, wall: WALLS.RIGHT, nr: row, nc: col + 1, opp: WALLS.LEFT };
        }

        if (!hit) return;

        // Push undo before modifying
        this.pushUndo();

        // Toggle the wall
        this.cells[hit.row][hit.col] ^= hit.wall;
        this.cells[hit.nr][hit.nc] ^= hit.opp;
        this.redrawWalls();
    }

    private handleGateClick(lx: number, ly: number) {
        const col = Math.floor(lx / TILE);
        const row = Math.floor(ly / TILE);

        if (!this.gatePending) {
            this.gatePending = { col, row };
            this.setStatus('Click an adjacent cell for gate edge');
            return;
        }

        const from = this.gatePending;
        this.gatePending = null;

        // Must be adjacent (Manhattan distance 1)
        const dc = col - from.col, dr = row - from.row;
        if (Math.abs(dc) + Math.abs(dr) !== 1) {
            this.setStatus('Gate cells must be adjacent');
            return;
        }

        // Must not have a wall between them
        const fw = dc === 1 ? WALLS.RIGHT : dc === -1 ? WALLS.LEFT : dr === 1 ? WALLS.BOTTOM : WALLS.TOP;
        if (this.cells[from.row][from.col] & fw) {
            this.setStatus('Remove the wall first');
            return;
        }

        this.pushUndo();

        // Check if gate already exists here — toggle off
        const existing = this.gates.findIndex(g =>
            (g.from.col === from.col && g.from.row === from.row && g.to.col === col && g.to.row === row) ||
            (g.from.col === col && g.from.row === row && g.to.col === from.col && g.to.row === from.row)
        );
        if (existing >= 0) {
            this.gates.splice(existing, 1);
        } else {
            this.gates.push({ from, to: { col, row } });
        }
        this.setStatus('');
        this.redrawEntities();
    }

    private handleCellClick(lx: number, ly: number) {
        const col = Math.floor(lx / TILE);
        const row = Math.floor(ly / TILE);
        const key = `${col},${row}`;

        this.pushUndo();

        switch (this.activeTool) {
            case 'start':
                this.startCell = { col, row };
                break;
            case 'goal':
                this.goalCell = { col, row };
                break;
            case 'enemy':
                if (this.enemies.find(e => e.col === col && e.row === row)) {
                    this.enemies = this.enemies.filter(e => !(e.col === col && e.row === row));
                } else if (this.enemies.length < 4) {
                    this.enemies.push({ col, row });
                } else {
                    this.setStatus('Max 4 enemies');
                    return;
                }
                break;
            case 'bush':
                if (this.bushes.has(key)) this.bushes.delete(key);
                else this.bushes.add(key);
                break;
            case 'scenery':
                if (this.scenery.has(key)) this.scenery.delete(key);
                else this.scenery.add(key);
                break;
            case 'objective':
                if (this.objectives.has(key)) this.objectives.delete(key);
                else this.objectives.add(key);
                break;
            case 'key':
                if (this.keys.has(key)) this.keys.delete(key);
                else this.keys.add(key);
                break;
            case 'eraser':
                this.enemies = this.enemies.filter(e => !(e.col === col && e.row === row));
                this.bushes.delete(key);
                this.scenery.delete(key);
                this.objectives.delete(key);
                this.keys.delete(key);
                // Remove gates touching this cell
                this.gates = this.gates.filter(g =>
                    !(g.from.col === col && g.from.row === row) &&
                    !(g.to.col === col && g.to.row === row)
                );
                break;
        }

        this.redrawEntities();
    }

    // ── Rendering ────────────────────────────────────────────────────────────
    private redrawWalls() {
        const g = this.wallGraphics;
        g.clear();
        g.lineStyle(4, this.season.wallColor, 1);

        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const x = col * TILE, y = row * TILE;
                const w = this.cells[row][col];
                if (w & WALLS.TOP)    g.strokeLineShape(new Phaser.Geom.Line(x, y, x + TILE, y));
                if (w & WALLS.RIGHT)  g.strokeLineShape(new Phaser.Geom.Line(x + TILE, y, x + TILE, y + TILE));
                if (w & WALLS.BOTTOM) g.strokeLineShape(new Phaser.Geom.Line(x, y + TILE, x + TILE, y + TILE));
                if (w & WALLS.LEFT)   g.strokeLineShape(new Phaser.Geom.Line(x, y, x, y + TILE));
            }
        }
    }

    private redrawEntities() {
        this.entityLayer.removeAll(true);
        this.updateToolCounts();
        const s = this.season;

        // Seasonal labels for display
        const enemyLabel  = s.name === 'Spring' ? '\ud83d\udc38' : s.name === 'Summer' ? '\ud83d\udc0d' : s.name === 'Fall' ? '\ud83e\udd8a' : '\ud83e\udd89';
        const bushLabel   = s.name === 'Spring' ? '\ud83c\udf3f' : s.name === 'Summer' ? '\ud83c\udf33' : s.name === 'Fall' ? '\ud83c\udf42' : '\u2744\ufe0f';
        const objLabel    = s.name === 'Spring' ? '\ud83c\udf3c' : s.name === 'Summer' ? '\ud83c\udf31' : s.name === 'Fall' ? '\ud83c\udf30' : '\u2744\ufe0f';

        // Start
        const sc = this.startCell;
        this.entityLayer.add(
            this.add.circle(sc.col * TILE + TILE / 2, sc.row * TILE + TILE / 2, TILE / 3, 0x44dd44, 0.8),
        );
        this.entityLayer.add(
            this.add.text(sc.col * TILE + TILE / 2, sc.row * TILE + TILE / 2, 'S', {
                fontSize: '18px', fontStyle: 'bold', color: '#000000',
            }).setOrigin(0.5),
        );

        // Goal
        const gc = this.goalCell;
        this.entityLayer.add(
            this.add.circle(gc.col * TILE + TILE / 2, gc.row * TILE + TILE / 2, TILE / 3, s.goalColor, 0.8),
        );
        this.entityLayer.add(
            this.add.text(gc.col * TILE + TILE / 2, gc.row * TILE + TILE / 2, 'G', {
                fontSize: '18px', fontStyle: 'bold', color: '#000000',
            }).setOrigin(0.5),
        );

        // Enemies — season-specific emoji + red tint
        for (const e of this.enemies) {
            this.entityLayer.add(
                this.add.circle(e.col * TILE + TILE / 2, e.row * TILE + TILE / 2, TILE / 4, 0xff4444, 0.6),
            );
            this.entityLayer.add(
                this.add.text(e.col * TILE + TILE / 2, e.row * TILE + TILE / 2, enemyLabel, {
                    fontSize: '24px',
                }).setOrigin(0.5),
            );
        }

        // Bushes (hiding spots) — season-specific emoji
        for (const key of this.bushes) {
            const [col, row] = key.split(',').map(Number);
            this.entityLayer.add(
                this.add.circle(col * TILE + TILE / 2, row * TILE + TILE / 2, TILE / 3, 0x228844, 0.5),
            );
            this.entityLayer.add(
                this.add.text(col * TILE + TILE / 2, row * TILE + TILE / 2, bushLabel, {
                    fontSize: '22px',
                }).setOrigin(0.5),
            );
        }

        // Scenery (obstacles) — rock/block symbol
        for (const key of this.scenery) {
            const [col, row] = key.split(',').map(Number);
            this.entityLayer.add(
                this.add.rectangle(col * TILE + TILE / 2, row * TILE + TILE / 2, TILE * 0.6, TILE * 0.6, 0x888888, 0.7),
            );
            this.entityLayer.add(
                this.add.text(col * TILE + TILE / 2, row * TILE + TILE / 2, '\ud83e\udea8', {
                    fontSize: '22px',
                }).setOrigin(0.5),
            );
        }

        // Objectives — season-specific emoji
        for (const key of this.objectives) {
            const [col, row] = key.split(',').map(Number);
            this.entityLayer.add(
                this.add.circle(col * TILE + TILE / 2, row * TILE + TILE / 2, TILE / 4, 0xffdd00, 0.5),
            );
            this.entityLayer.add(
                this.add.text(col * TILE + TILE / 2, row * TILE + TILE / 2, objLabel, {
                    fontSize: '22px',
                }).setOrigin(0.5),
            );
        }

        // Gates
        for (const gate of this.gates) {
            const fx = gate.from.col * TILE + TILE / 2;
            const fy = gate.from.row * TILE + TILE / 2;
            const tx = gate.to.col * TILE + TILE / 2;
            const ty = gate.to.row * TILE + TILE / 2;
            const mx = (fx + tx) / 2, my = (fy + ty) / 2;

            const gfx = this.add.graphics();
            gfx.lineStyle(6, s.gateColor, 1);
            gfx.strokeLineShape(new Phaser.Geom.Line(fx, fy, tx, ty));
            this.entityLayer.add(gfx);

            this.entityLayer.add(
                this.add.circle(mx, my, 6, s.gateColor),
            );
        }

        // Keys
        for (const key of this.keys) {
            const [col, row] = key.split(',').map(Number);
            const cx = col * TILE + TILE / 2, cy = row * TILE + TILE / 2;
            this.entityLayer.add(
                this.add.rectangle(cx, cy, 18, 18, s.keyColor).setRotation(Math.PI / 4),
            );
            this.entityLayer.add(
                this.add.text(cx, cy, '\ud83d\udd11', {
                    fontSize: '18px',
                }).setOrigin(0.5),
            );
        }
    }

    // ── Play ──────────────────────────────────────────────────────────────────
    private tryPlay() {
        // Validate
        const { col: sc, row: sr } = this.startCell;
        const { col: gc, row: gr } = this.goalCell;

        if (sc === gc && sr === gr) {
            this.setStatus('Start and goal cannot be the same cell');
            return;
        }

        // Build scenery blocked set for pathfinding
        const blocked = new Set(this.scenery);

        // Check path from start to goal
        const path = solvePath(this.cells, this.cols, this.rows, sc, sr, gc, gr, blocked);
        if (path.length === 0) {
            this.setStatus('No path from start to goal \u2014 carve more walls');
            return;
        }

        // Check objectives are reachable
        for (const key of this.objectives) {
            const [c, r] = key.split(',').map(Number);
            const p = solvePath(this.cells, this.cols, this.rows, sc, sr, c, r, blocked);
            if (p.length === 0) {
                this.setStatus(`Objective at ${c},${r} is unreachable`);
                return;
            }
        }

        // Check keys are reachable
        for (const key of this.keys) {
            const [c, r] = key.split(',').map(Number);
            const p = solvePath(this.cells, this.cols, this.rows, sc, sr, c, r, blocked);
            if (p.length === 0) {
                this.setStatus(`Key at ${c},${r} is unreachable`);
                return;
            }
        }

        this.scene.start('GameScene', { customMap: this.buildMapData(), from: 'ToolkitScene' });
    }

    private setStatus(msg: string) {
        if (this.statusText) this.statusText.setText(msg);
    }
}
