import Phaser from 'phaser';
import { TILE, COLS, ROWS, HEADER, PANEL } from '../constants';

const W = COLS * TILE + PANEL;
const H = ROWS * TILE + HEADER;

export default class TitleScene extends Phaser.Scene {
    constructor() { super('TitleScene'); }

    preload() {
        this.load.audio('bgm', 'music.mp3');
    }

    create() {
        // ── Background ────────────────────────────────────────────────────────
        this.add.rectangle(W / 2, H / 2, W, H, 0x060c14);

        // ── Falling snow ──────────────────────────────────────────────────────
        if (!this.textures.exists('snow')) {
            const g = this.make.graphics({ add: false });
            g.fillStyle(0xffffff, 1);
            g.fillCircle(3, 3, 3);
            g.generateTexture('snow', 6, 6);
            g.destroy();
        }

        // Distant layer — small, slow, wispy
        this.add.particles(0, 0, 'snow', {
            x:        { min: 0,   max: W   },
            y:        { min: -6,  max: 0   },
            speedY:   { min: 22,  max: 50  },
            speedX:   { min: -10, max: 10  },
            scale:    { min: 0.1, max: 0.3 },
            alpha:    { min: 0.2, max: 0.5 },
            lifespan: { min: 7000, max: 14000 },
            frequency: 220,
            quantity:  2,
        });

        // Foreground layer — larger, a little faster
        this.add.particles(0, 0, 'snow', {
            x:        { min: 0,   max: W   },
            y:        { min: -6,  max: 0   },
            speedY:   { min: 55,  max: 105 },
            speedX:   { min: -18, max: 18  },
            scale:    { min: 0.25, max: 0.65 },
            alpha:    { min: 0.35, max: 0.8  },
            lifespan: { min: 4000, max: 7000 },
            frequency: 380,
            quantity:  1,
        });

        // ── Title ─────────────────────────────────────────────────────────────
        this.add.text(W / 2, H / 2 - 180, 'S E A S O N S', {
            fontSize:    '72px',
            fontStyle:   'bold',
            color:       '#c8e4f4',
        }).setOrigin(0.5);

        this.add.text(W / 2, H / 2 - 100, 'a quiet journey through the year', {
            fontSize: '22px',
            color:    '#6a8fa8',
        }).setOrigin(0.5);

        // ── Buttons ───────────────────────────────────────────────────────────
        const makeButton = (x: number, y: number, label: string, onClick: () => void) => {
            const b = this.add.text(x, y, label, {
                fontSize: '32px',
                color:    '#7ab8d4',
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });

            const p = this.tweens.add({
                targets:  b,
                alpha:    { from: 0.6, to: 1.0 },
                yoyo:     true,
                repeat:   -1,
                duration: 2000,
                ease:     'Sine.easeInOut',
            });

            b.on('pointerover', () => { p.pause(); b.setAlpha(1).setColor('#ffffff'); });
            b.on('pointerout',  () => { b.setColor('#7ab8d4'); p.resume(); });
            b.on('pointerdown', onClick);
            return b;
        };

        makeButton(W / 2, H / 2 + 10, 'New Game', () => {
            this.cameras.main.fadeOut(700, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('QuoteScene', { month: 1, isSeason: true, from: 'TitleScene' });
            });
        });

        makeButton(W / 2, H / 2 + 70, 'New Hard Game', () => {
            this.cameras.main.fadeOut(700, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('QuoteScene', { month: 1, isSeason: true, from: 'TitleScene', hard: true });
            });
        });

        makeButton(W / 2, H / 2 + 130, 'How to Play', () => {
            this.cameras.main.fadeOut(700, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('TutorialScene');
            });
        });

        // ── Music + persistent HUD ────────────────────────────────────────────
        if (!this.sound.get('bgm')?.isPlaying) {
            this.sound.play('bgm', { loop: true, volume: 0.07 });
        }
        if (!this.scene.isActive('UIScene')) {
            this.scene.launch('UIScene');
        }

        // ── Fade in from black ────────────────────────────────────────────────
        this.cameras.main.fadeIn(1400, 0, 0, 0);
    }
}
