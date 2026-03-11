import Phaser from 'phaser';
import { TILE, COLS, ROWS } from '../constants';
import { MONTHS, MonthConfig } from '../seasons';

const W = COLS * TILE;   // 640
const H = ROWS * TILE;   // 640

// Grid layout constants
const COLS_GRID = 4;
const ROWS_GRID = 3;
const MARGIN_X  = 14;
const GRID_TOP  = 82;
const GAP       = 8;
const TILE_W    = (W - MARGIN_X * 2 - GAP * (COLS_GRID - 1)) / COLS_GRID;  // ~148
const TILE_H    = (H - GRID_TOP - 36 - GAP * (ROWS_GRID - 1)) / ROWS_GRID; // ~168

export default class CalendarScene extends Phaser.Scene {
    constructor() { super('CalendarScene'); }

    preload() {
        // Music is loaded here so it plays even if the algorithm MenuScene is never visited
        this.load.audio('bgm', 'music.mp3');
    }

    create() {
        // ── Background ────────────────────────────────────────────────────────
        this.add.rectangle(W / 2, H / 2, W, H, 0x0a0a14);

        // ── Title ─────────────────────────────────────────────────────────────
        this.add.text(W / 2, 22, 'The Year', {
            fontSize: '30px', fontStyle: 'bold', color: '#ffffff',
        }).setOrigin(0.5, 0);

        this.add.text(W / 2, 58, 'choose a month', {
            fontSize: '13px', color: '#888899',
        }).setOrigin(0.5, 0);

        // ── Month tiles ───────────────────────────────────────────────────────
        MONTHS.forEach((month, i) => {
            const col = i % COLS_GRID;
            const row = Math.floor(i / COLS_GRID);
            const tx  = MARGIN_X + col * (TILE_W + GAP) + TILE_W / 2;
            const ty  = GRID_TOP  + row * (TILE_H + GAP) + TILE_H / 2;
            this.buildTile(tx, ty, month);
        });

        // ── Footer ────────────────────────────────────────────────────────────
        const algoBtn = this.add.text(W / 2, H - 14, 'or try algorithm mode', {
            fontSize: '12px', color: '#555566',
        }).setOrigin(0.5, 1).setInteractive({ useHandCursor: true });

        algoBtn.on('pointerover', () => algoBtn.setColor('#9999bb'));
        algoBtn.on('pointerout',  () => algoBtn.setColor('#555566'));
        algoBtn.on('pointerdown', () => this.scene.start('MenuScene'));

        // ── Music & persistent HUD ────────────────────────────────────────────
        if (!this.sound.get('bgm')?.isPlaying) {
            this.sound.play('bgm', { loop: true, volume: 0.45 });
        }
        if (!this.scene.isActive('UIScene')) {
            this.scene.launch('UIScene');
        }
    }

    private buildTile(cx: number, cy: number, month: MonthConfig) {
        const { season } = month;

        // Shadow / outer frame in dark tone
        const shadow = this.add.rectangle(cx + 3, cy + 3, TILE_W, TILE_H, 0x000000, 0.4).setOrigin(0.5);

        // Main tile face
        const face = this.add.rectangle(cx, cy, TILE_W, TILE_H, season.floorLight)
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });

        // Season colour band along the bottom quarter
        this.add.rectangle(cx, cy + TILE_H / 2 - TILE_H / 4 / 2, TILE_W, TILE_H / 4, season.floorDark)
            .setOrigin(0.5, 0.5);

        // Month name — centred, bold
        this.add.text(cx, cy - 16, month.name, {
            fontSize: '14px', fontStyle: 'bold',
            color: Phaser.Display.Color.IntegerToRGB(season.textColor)
                ? `#${season.textColor.toString(16).padStart(6, '0')}`
                : '#111111',
        }).setOrigin(0.5);

        // Season name — small, in the dark band
        this.add.text(cx, cy + TILE_H / 2 - TILE_H / 4 / 2, season.name, {
            fontSize: '11px',
            color: '#ffffff',
        }).setOrigin(0.5);

        // Hover: lighten the face slightly
        face.on('pointerover', () => {
            face.setScale(1.04);
            shadow.setScale(1.04);
        });
        face.on('pointerout', () => {
            face.setScale(1);
            shadow.setScale(1);
        });

        // Click → start that month's maze
        face.on('pointerdown', () => {
            this.scene.start('GameScene', { month: month.month, from: 'CalendarScene' });
        });
    }
}
