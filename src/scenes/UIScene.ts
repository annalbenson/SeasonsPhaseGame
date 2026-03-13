import Phaser from 'phaser';
import { TILE, MAX_COLS, MAX_ROWS, HEADER, PANEL, VERSION } from '../constants';

// Runs in parallel on top of every other scene.
// Owns the mute button so neither MenuScene nor GameScene has to.
export default class UIScene extends Phaser.Scene {
    private btn!: Phaser.GameObjects.Text;

    constructor() { super('UIScene'); }

    create() {
        this.btn = this.add
            .text(MAX_COLS * TILE + PANEL - 10, Math.round(HEADER / 2), this.label(), {
                fontSize: '15px',
                color: '#aabbcc',
                backgroundColor: '#00000055',
                padding: { x: 7, y: 4 },
            })
            .setDepth(100)
            .setOrigin(1, 0)
            .setInteractive({ useHandCursor: true });

        this.btn.on('pointerdown', () => {
            this.sound.mute = !this.sound.mute;
            this.btn.setText(this.label());
        });
        this.btn.on('pointerover', () => this.btn.setAlpha(0.75));
        this.btn.on('pointerout',  () => this.btn.setAlpha(1));

        // Version tag — bottom-right corner
        this.add.text(MAX_COLS * TILE + PANEL - 8, MAX_ROWS * TILE + HEADER - 8, VERSION, {
            fontSize: '12px',
            color: '#555566',
        }).setOrigin(1, 1).setDepth(100);
    }

    private label(): string {
        return this.sound.mute ? '\u266A off' : '\u266A on';
    }
}
