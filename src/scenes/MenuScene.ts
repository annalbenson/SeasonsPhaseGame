import Phaser from 'phaser';
import { TILE, COLS, ROWS } from '../constants';
import { ALGORITHMS, AlgorithmKey } from '../maze';

export default class MenuScene extends Phaser.Scene {
    constructor() {
        super('MenuScene');
    }

    preload() {
        this.load.audio('bgm', 'music.mp3');
    }

    create() {
        // Start music once — persists across scene transitions because the
        // sound manager is game-level, not scene-level.
        if (!this.sound.get('bgm')?.isPlaying) {
            this.sound.play('bgm', { loop: true, volume: 0.45 });
        }

        // Launch the persistent HUD (mute button) once; it stays alive forever.
        if (!this.scene.isActive('UIScene')) {
            this.scene.launch('UIScene');
        }
        const W = COLS * TILE;
        const H = ROWS * TILE;

        // Background
        this.add.rectangle(W / 2, H / 2, W, H, 0x1a1a2e);

        // Title
        this.add.text(W / 2, 60, 'Maze Game', {
            fontSize: '36px',
            color: '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        this.add.text(W / 2, 100, 'Choose a maze algorithm', {
            fontSize: '16px',
            color: '#aaaaaa',
        }).setOrigin(0.5);

        // Algorithm buttons
        const keys = Object.keys(ALGORITHMS) as AlgorithmKey[];
        const btnW = 360;
        const btnH = 80;
        const gap   = 16;
        const totalH = keys.length * (btnH + gap) - gap;
        const startY = H / 2 - totalH / 2 + 20;

        keys.forEach((key, i) => {
            const algo = ALGORITHMS[key];
            const x = W / 2;
            const y = startY + i * (btnH + gap) + btnH / 2;

            // Button background
            const bg = this.add.rectangle(x, y, btnW, btnH, algo.color, 0.9)
                .setInteractive({ useHandCursor: true });

            // Hover effect
            bg.on('pointerover',  () => bg.setAlpha(1).setScale(1.03));
            bg.on('pointerout',   () => bg.setAlpha(0.9).setScale(1));

            // Click → start GameScene with chosen algorithm
            bg.on('pointerdown', () => {
                this.scene.start('GameScene', { algorithm: key });
            });

            // Algorithm name
            this.add.text(x, y - 14, algo.name, {
                fontSize: '18px',
                color: '#ffffff',
                fontStyle: 'bold',
            }).setOrigin(0.5);

            // Description
            this.add.text(x, y + 14, algo.description, {
                fontSize: '13px',
                color: '#ffffffcc',
            }).setOrigin(0.5);
        });

        // Footer hint
        this.add.text(W / 2, H - 30, 'Press M during a game to return here', {
            fontSize: '13px',
            color: '#666688',
        }).setOrigin(0.5);
    }
}
