import Phaser from 'phaser';
import { TILE, COLS, ROWS, HEADER, PANEL } from '../constants';
import { MONTHS, MonthConfig } from '../seasons';
import { AlgorithmKey } from '../maze';

const W = COLS * TILE + PANEL;
const H = ROWS * TILE + HEADER;

// Two sequential cards on season boundaries:
//   Card 1 — season name only (big, typographic)
//   Card 2 — month name + quote
// Non-season months show only the quote card.
export default class QuoteScene extends Phaser.Scene {
    constructor() { super('QuoteScene'); }

    create(data: { month: number; isSeason?: boolean; algorithm?: AlgorithmKey; from?: string }) {
        const cfg      = MONTHS[(data.month ?? 1) - 1];
        const season   = cfg.season;
        const isSeason = data.isSeason ?? false;

        this.cameras.main.setBackgroundColor(season.bgColor);

        const accentHex = `#${season.uiAccent.toString(16).padStart(6, '0')}`;
        const dimHex    = `#${Math.floor(season.uiAccent * 0.5).toString(16).padStart(6, '0')}`;

        const goToGame = () => {
            this.cameras.main.fadeOut(900, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('GameScene', {
                    month:     data.month,
                    algorithm: data.algorithm,
                    from:      data.from ?? 'TitleScene',
                });
            });
        };

        if (isSeason) {
            // ── Card 1: season name ───────────────────────────────────────────
            const seasonLabel = this.add.text(W / 2, H / 2, season.name.toUpperCase(), {
                fontSize:      '64px',
                fontStyle:     'bold',
                color:         accentHex,
                letterSpacing: 16,
            }).setOrigin(0.5).setAlpha(0);

            this.cameras.main.fadeIn(600, 0, 0, 0);
            this.tweens.add({
                targets:  seasonLabel,
                alpha:    1,
                duration: 900,
                ease:     'Sine.easeIn',
                delay:    300,
                onComplete: () => {
                    this.time.delayedCall(2200, () => {
                        // Fade out card 1, then show card 2
                        this.tweens.add({
                            targets:  seasonLabel,
                            alpha:    0,
                            duration: 600,
                            ease:     'Sine.easeOut',
                            onComplete: () => this.showQuoteCard(cfg, accentHex, dimHex, goToGame),
                        });
                    });
                },
            });
        } else {
            this.cameras.main.fadeIn(600, 0, 0, 0);
            this.showQuoteCard(cfg, accentHex, dimHex, goToGame);
        }
    }

    private showQuoteCard(
        cfg: MonthConfig,
        accentHex: string,
        dimHex: string,
        onDone: () => void,
    ) {
        const monthLabel = this.add.text(W / 2, H / 2 - 80, cfg.name.toUpperCase(), {
            fontSize:      '13px',
            color:         dimHex,
            letterSpacing: 5,
        }).setOrigin(0.5).setAlpha(0);

        const quoteText = this.add.text(W / 2, H / 2 - 20, `"${cfg.quote}"`, {
            fontSize:  '21px',
            fontStyle: 'italic',
            color:     accentHex,
            wordWrap:  { width: W - 120 },
            align:     'center',
        }).setOrigin(0.5).setAlpha(0);

        const authorText = this.add.text(
            W / 2,
            H / 2 + quoteText.height / 2 + 28,
            `— ${cfg.author}`,
            { fontSize: '14px', color: dimHex },
        ).setOrigin(0.5).setAlpha(0);

        this.tweens.add({
            targets:  [monthLabel, quoteText, authorText],
            alpha:    1,
            duration: 800,
            ease:     'Sine.easeIn',
            delay:    200,
            onComplete: () => {
                this.time.delayedCall(2600, onDone);
            },
        });
    }
}
