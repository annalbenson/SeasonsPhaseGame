import Phaser from 'phaser';
import { TILE, COLS, ROWS, HEADER } from '../constants';

const W = COLS * TILE;
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
        this.add.text(W / 2, 195, 'S E A S O N S', {
            fontSize:    '44px',
            fontStyle:   'bold',
            color:       '#c8e4f4',
        }).setOrigin(0.5);

        this.add.text(W / 2, 252, 'a quiet journey through the year', {
            fontSize: '13px',
            color:    '#4a6a80',
        }).setOrigin(0.5);

        // ── New Game button ───────────────────────────────────────────────────
        const btn = this.add.text(W / 2, 365, 'New Game', {
            fontSize: '21px',
            color:    '#7ab8d4',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        // Gentle breathing pulse while idle
        const pulse = this.tweens.add({
            targets:  btn,
            alpha:    { from: 0.6, to: 1.0 },
            yoyo:     true,
            repeat:   -1,
            duration: 2000,
            ease:     'Sine.easeInOut',
        });

        btn.on('pointerover', () => {
            pulse.pause();
            btn.setAlpha(1).setColor('#ffffff');
        });
        btn.on('pointerout', () => {
            btn.setColor('#7ab8d4');
            pulse.resume();
        });
        btn.on('pointerdown', () => {
            this.cameras.main.fadeOut(700, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('GameScene', { month: 1, from: 'TitleScene' });
            });
        });

        // ── Music + persistent HUD ────────────────────────────────────────────
        if (!this.sound.get('bgm')?.isPlaying) {
            this.sound.play('bgm', { loop: true, volume: 0.45 });
        }
        if (!this.scene.isActive('UIScene')) {
            this.scene.launch('UIScene');
        }

        // ── Fade in from black ────────────────────────────────────────────────
        this.cameras.main.fadeIn(1400, 0, 0, 0);
    }
}
