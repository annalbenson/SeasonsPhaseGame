import Phaser from 'phaser';
import { TILE, MAX_COLS, MAX_ROWS, HEADER, PANEL } from '../constants';

const W = MAX_COLS * TILE + PANEL;
const H = MAX_ROWS * TILE + HEADER;

export default class EndScene extends Phaser.Scene {
    private stars = 0;
    private explorePct = 0;
    private bonusCollected = 0;
    private bonusTotal = 0;

    constructor() { super('EndScene'); }

    init(data: { stars?: number; explorePct?: number; bonusCollected?: number; bonusTotal?: number }) {
        this.stars = data.stars ?? 1;
        this.explorePct = data.explorePct ?? 0;
        this.bonusCollected = data.bonusCollected ?? 0;
        this.bonusTotal = data.bonusTotal ?? 0;
    }

    create() {
        this.cameras.main.setBackgroundColor(0x060c14);

        const cx = W / 2;
        const targets: Phaser.GameObjects.GameObject[] = [];

        // Title
        targets.push(
            this.add.text(cx, H / 2 - 160, 'THE SEASONS PASS', {
                fontSize:      '36px',
                fontStyle:     'bold',
                color:         '#c8d8e8',
                letterSpacing: 10,
            }).setOrigin(0.5).setAlpha(0),
        );

        // Thin rule
        targets.push(
            this.add.rectangle(cx, H / 2 - 110, 200, 1, 0x4a6a80, 1).setAlpha(0),
        );

        // Stars
        const starStr = '★'.repeat(this.stars) + '☆'.repeat(3 - this.stars);
        targets.push(
            this.add.text(cx, H / 2 - 70, starStr, {
                fontSize: '40px',
                color:    '#ffe066',
            }).setOrigin(0.5).setAlpha(0),
        );

        // Stats line
        const statsLine = `${this.explorePct}% explored  ·  ${this.bonusCollected} bonus collected`;
        targets.push(
            this.add.text(cx, H / 2 - 25, statsLine, {
                fontSize: '16px',
                color:    '#6a8fa8',
            }).setOrigin(0.5).setAlpha(0),
        );

        // Thin rule
        targets.push(
            this.add.rectangle(cx, H / 2 + 10, 200, 1, 0x4a6a80, 1).setAlpha(0),
        );

        // Quote
        targets.push(
            this.add.text(cx, H / 2 + 45, '"If Winter comes, can Spring be far behind?"', {
                fontSize:  '20px',
                fontStyle: 'italic',
                color:     '#7ab8d4',
                wordWrap:  { width: W - 160 },
                align:     'center',
            }).setOrigin(0.5).setAlpha(0),
        );

        // Attribution
        targets.push(
            this.add.text(cx, H / 2 + 85, '— Percy Bysshe Shelley', {
                fontSize: '14px',
                color:    '#6a8fa8',
            }).setOrigin(0.5).setAlpha(0),
        );

        // Play again button
        const btn = this.add.text(cx, H / 2 + 150, 'Play Again', {
            fontSize: '18px',
            color:    '#7ab8d4',
        }).setOrigin(0.5).setAlpha(0).setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => btn.setColor('#ffffff'));
        btn.on('pointerout',  () => btn.setColor('#7ab8d4'));
        btn.on('pointerdown', () => {
            this.cameras.main.fadeOut(600, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () =>
                this.scene.start('TitleScene'),
            );
        });

        targets.push(btn);

        this.cameras.main.fadeIn(1000, 0, 0, 0);
        this.tweens.add({
            targets,
            alpha:    1,
            duration: 1200,
            ease:     'Sine.easeIn',
            delay:    600,
        });
    }
}
