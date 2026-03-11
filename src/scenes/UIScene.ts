import Phaser from 'phaser';
import { TILE, COLS, HEADER, PANEL } from '../constants';

// Runs in parallel on top of every other scene.
// Owns the mute button so neither MenuScene nor GameScene has to.
export default class UIScene extends Phaser.Scene {
    private btn!: Phaser.GameObjects.Text;

    constructor() { super('UIScene'); }

    create() {
        this.btn = this.add
            .text(COLS * TILE + PANEL - 10, Math.round(HEADER / 2), this.label(), {
                fontSize: '13px',
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
    }

    private label(): string {
        return this.sound.mute ? '\u266A off' : '\u266A on';
    }
}
