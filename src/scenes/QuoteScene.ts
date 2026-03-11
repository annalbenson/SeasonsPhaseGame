import Phaser from 'phaser';
import { TILE, COLS, ROWS, HEADER } from '../constants';
import { MONTHS } from '../seasons';
import { AlgorithmKey } from '../maze';

const W = COLS * TILE;
const H = ROWS * TILE + HEADER;

// Shown on every month transition.
// If isSeason=true (crossing into a new season) the season name is shown large.
export default class QuoteScene extends Phaser.Scene {
    constructor() { super('QuoteScene'); }

    create(data: { month: number; isSeason?: boolean; algorithm?: AlgorithmKey; from?: string }) {
        const cfg      = MONTHS[(data.month ?? 1) - 1];
        const season   = cfg.season;
        const isSeason = data.isSeason ?? false;

        this.cameras.main.setBackgroundColor(season.bgColor);

        const accentHex = `#${season.uiAccent.toString(16).padStart(6, '0')}`;
        const dimHex    = `#${Math.floor(season.uiAccent * 0.5).toString(16).padStart(6, '0')}`;

        const targets: Phaser.GameObjects.GameObject[] = [];

        if (isSeason) {
            // Big season name — centred, dominant
            const nameY = H / 2 - 70;
            targets.push(
                this.add.text(W / 2, nameY, season.name.toUpperCase(), {
                    fontSize:      '52px',
                    fontStyle:     'bold',
                    color:         accentHex,
                    letterSpacing: 12,
                }).setOrigin(0.5).setAlpha(0),
            );

            // Thin separator line
            const line = this.add.rectangle(W / 2, nameY + 44, 120, 1, season.uiAccent, 0.35).setAlpha(0);
            targets.push(line);

            // Quote below the line
            targets.push(
                this.add.text(W / 2, nameY + 72, `"${cfg.quote}"`, {
                    fontSize:  '14px',
                    fontStyle: 'italic',
                    color:     dimHex,
                    wordWrap:  { width: W - 100 },
                    align:     'center',
                }).setOrigin(0.5).setAlpha(0),
            );

            targets.push(
                this.add.text(W / 2, nameY + 120, `— ${cfg.author}`, {
                    fontSize: '12px',
                    color:    dimHex,
                }).setOrigin(0.5).setAlpha(0),
            );
        } else {
            // Just the quote, centred
            const quoteText = this.add.text(W / 2, H / 2 - 30, `"${cfg.quote}"`, {
                fontSize:  '17px',
                fontStyle: 'italic',
                color:     accentHex,
                wordWrap:  { width: W - 80 },
                align:     'center',
            }).setOrigin(0.5).setAlpha(0);

            const authorText = this.add.text(
                W / 2,
                H / 2 + quoteText.height / 2 + 20,
                `— ${cfg.author}`,
                { fontSize: '13px', color: dimHex },
            ).setOrigin(0.5).setAlpha(0);

            targets.push(quoteText, authorText);
        }

        // Month name — bottom centre, always
        targets.push(
            this.add.text(W / 2, H - 36, cfg.name, {
                fontSize: '11px',
                color:    dimHex,
            }).setOrigin(0.5).setAlpha(0),
        );

        const holdMs = isSeason ? 3200 : 2400;

        this.cameras.main.fadeIn(600, 0, 0, 0);
        this.tweens.add({
            targets,
            alpha:    1,
            duration: 800,
            ease:     'Sine.easeIn',
            delay:    400,
            onComplete: () => {
                this.time.delayedCall(holdMs, () => {
                    this.cameras.main.fadeOut(900, 0, 0, 0);
                    this.cameras.main.once('camerafadeoutcomplete', () => {
                        this.scene.start('GameScene', {
                            month:     data.month,
                            algorithm: data.algorithm,
                            from:      data.from ?? 'TitleScene',
                        });
                    });
                });
            },
        });
    }
}
