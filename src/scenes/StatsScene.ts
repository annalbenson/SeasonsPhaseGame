import Phaser from 'phaser';
import { TILE, MAX_COLS, MAX_ROWS, HEADER, PANEL } from '../constants';
import { isSignedIn } from '../auth';
import { getStats } from '../stats';
import { type UserStats } from '../statsModel';

const W = MAX_COLS * TILE + PANEL;
const H = MAX_ROWS * TILE + HEADER;

export default class StatsScene extends Phaser.Scene {
    constructor() { super('StatsScene'); }

    async create() {
        this.cameras.main.setBackgroundColor(0x060c14);
        this.add.rectangle(W / 2, H / 2, W, H, 0x060c14);

        // Title
        this.add.text(W / 2, 50, 'Y O U R   S T A T S', {
            fontSize: '32px', fontStyle: 'bold', color: '#c8e4f4',
        }).setOrigin(0.5);

        if (!isSignedIn()) {
            this.add.text(W / 2, H / 2, 'Sign in from the title screen\nto track your stats.', {
                fontSize: '20px', color: '#6688aa', align: 'center',
            }).setOrigin(0.5);
            this.addBackButton();
            return;
        }

        // Loading indicator
        const loading = this.add.text(W / 2, H / 2, 'Loading...', {
            fontSize: '20px', color: '#6688aa',
        }).setOrigin(0.5);

        const stats = await getStats();
        loading.destroy();

        this.renderStats(stats);
        this.addBackButton();

        this.cameras.main.fadeIn(600, 0, 0, 0);
    }

    private renderStats(s: UserStats) {
        const col1 = W / 2 - 200;
        const col2 = W / 2 + 100;
        const labelStyle  = { fontSize: '16px', color: '#8899aa' };
        const valueStyle  = { fontSize: '16px', color: '#c8e4f4', fontStyle: 'bold' };
        const headerStyle = { fontSize: '18px', color: '#7ab8d4', fontStyle: 'bold' };

        let y = 100;

        // ── Mazes ────────────────────────────────────────────────────────────
        this.add.text(col1, y, 'JOURNEY', headerStyle);
        y += 30;
        this.statRow(col1, y, 'Mazes completed', `${s.mazesCompleted}`, labelStyle, valueStyle); y += 24;
        this.statRow(col1, y, 'Hard mode', `${s.mazesCompletedHard}`, labelStyle, valueStyle); y += 24;
        this.statRow(col1, y, 'Custom maps', `${s.customMapsPlayed}`, labelStyle, valueStyle); y += 24;
        this.statRow(col1, y, 'Deaths', `${s.totalDeaths}`, labelStyle, valueStyle); y += 24;
        this.statRow(col1, y, 'Times caught', `${s.totalCaught}`, labelStyle, valueStyle); y += 24;

        // ── Collectibles ─────────────────────────────────────────────────────
        y += 16;
        this.add.text(col1, y, 'COLLECTIBLES', headerStyle);
        y += 30;
        this.statRow(col1, y, 'Keys collected', `${s.totalKeysCollected}`, labelStyle, valueStyle); y += 24;
        this.statRow(col1, y, 'Gates opened', `${s.totalGatesOpened}`, labelStyle, valueStyle); y += 24;
        this.statRow(col1, y, 'Objectives done', `${s.totalObjectivesCompleted}`, labelStyle, valueStyle); y += 24;

        // ── Combat ──────────────────────────────────────────────────────────
        y += 16;
        this.add.text(col1, y, 'SKILLS', headerStyle);
        y += 30;
        this.statRow(col1, y, 'Monsters stunned', `${s.totalMonstersStunned}`, labelStyle, valueStyle); y += 24;
        this.statRow(col1, y, 'Hops (Winter)', `${s.skillUses.HOP}`, labelStyle, valueStyle); y += 24;
        this.statRow(col1, y, 'Stings (Spring)', `${s.skillUses.STING}`, labelStyle, valueStyle); y += 24;
        this.statRow(col1, y, 'Glows (Summer)', `${s.skillUses.GLOW}`, labelStyle, valueStyle); y += 24;
        this.statRow(col1, y, 'Dashes (Fall)', `${s.skillUses.DASH}`, labelStyle, valueStyle); y += 24;

        // ── Right column: times ─────────────────────────────────────────────
        let ry = 100;
        this.add.text(col2, ry, 'AVERAGE TIMES', headerStyle);
        ry += 30;

        for (const size of ['8x8', '10x10', '12x12']) {
            const entry = s.timeByGrid[size];
            if (entry && entry.count > 0) {
                const avg = Math.round(entry.totalMs / entry.count / 1000);
                this.statRow(col2, ry, size, `${avg}s (${entry.count} runs)`, labelStyle, valueStyle);
            } else {
                this.statRow(col2, ry, size, '—', labelStyle, valueStyle);
            }
            ry += 24;
        }

        // ── Monthly bests ────────────────────────────────────────────────────
        ry += 16;
        this.add.text(col2, ry, 'MONTHLY BESTS', headerStyle);
        ry += 30;

        const months = Object.keys(s.monthly).sort().reverse().slice(0, 6);
        if (months.length === 0) {
            this.add.text(col2, ry, 'No data yet', { fontSize: '14px', color: '#556677' });
        } else {
            for (const ym of months) {
                const m = s.monthly[ym];
                const best = m.bestTimeMs < Infinity ? `${Math.round(m.bestTimeMs / 1000)}s` : '—';
                this.statRow(col2, ry, ym, `${m.completed} done, best ${best}`, labelStyle, valueStyle);
                ry += 24;
            }
        }
    }

    private statRow(
        x: number, y: number, label: string, value: string,
        labelStyle: object, valueStyle: object,
    ) {
        this.add.text(x, y, label, labelStyle);
        this.add.text(x + 180, y, value, valueStyle);
    }

    private addBackButton() {
        const btn = this.add.text(W / 2, H - 50, 'Back', {
            fontSize: '22px', color: '#556677',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        btn.on('pointerover', () => btn.setColor('#aabbcc'));
        btn.on('pointerout', () => btn.setColor('#556677'));
        btn.on('pointerdown', () => {
            this.cameras.main.fadeOut(500, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('TitleScene');
            });
        });
    }
}
