import Phaser from 'phaser';
import { TILE, MAX_COLS, MAX_ROWS, HEADER, PANEL } from '../constants';

const W = MAX_COLS * TILE + PANEL;
const H = MAX_ROWS * TILE + HEADER;

export default class EndScene extends Phaser.Scene {
    constructor() { super('EndScene'); }

    create() {
        this.cameras.main.setBackgroundColor(0x060c14);

        const cx = W / 2;
        const targets: Phaser.GameObjects.GameObject[] = [];

        // Title
        targets.push(
            this.add.text(cx, H / 2 - 140, 'THE SEASONS PASS', {
                fontSize:      '36px',
                fontStyle:     'bold',
                color:         '#c8d8e8',
                letterSpacing: 10,
            }).setOrigin(0.5).setAlpha(0),
        );

        // Thin rule
        targets.push(
            this.add.rectangle(cx, H / 2 - 90, 200, 1, 0x4a6a80, 1).setAlpha(0),
        );

        // Quote
        targets.push(
            this.add.text(cx, H / 2 - 40, '"If Winter comes, can Spring be far behind?"', {
                fontSize:  '20px',
                fontStyle: 'italic',
                color:     '#7ab8d4',
                wordWrap:  { width: W - 160 },
                align:     'center',
            }).setOrigin(0.5).setAlpha(0),
        );

        // Attribution
        targets.push(
            this.add.text(cx, H / 2 + 20, '— Percy Bysshe Shelley', {
                fontSize: '14px',
                color:    '#6a8fa8',
            }).setOrigin(0.5).setAlpha(0),
        );

        // Play again button
        const btn = this.add.text(cx, H / 2 + 110, 'Play Again', {
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
