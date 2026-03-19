import Phaser from 'phaser';
import { TILE, MAX_COLS, MAX_ROWS, HEADER, PANEL } from '../constants';
import { MONTHS_Y2 } from '../seasons';
import { signOut, onAuthChange, isSignedIn, getDisplayName } from '../auth';

const W = MAX_COLS * TILE + PANEL;
const H = MAX_ROWS * TILE + HEADER;

export default class TitleScene extends Phaser.Scene {
    private authUnsub?: () => void;

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
        const fadeAndStart = (scene: string, data?: object) => {
            this.cameras.main.fadeOut(700, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start(scene, data);
            });
        };

        /** Large primary button (centered, pulsing). */
        const makeButton = (x: number, y: number, label: string, onClick: () => void) => {
            const b = this.add.text(x, y, label, {
                fontSize: '32px',
                color:    '#7ab8d4',
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });

            const p = this.tweens.add({
                targets: b, alpha: { from: 0.6, to: 1.0 },
                yoyo: true, repeat: -1, duration: 2000, ease: 'Sine.easeInOut',
            });

            b.on('pointerover', () => { p.pause(); b.setAlpha(1).setColor('#ffffff'); });
            b.on('pointerout',  () => { b.setColor('#7ab8d4'); p.resume(); });
            b.on('pointerdown', onClick);
            return b;
        };

        /** Small inline link for sub-options. */
        const makeLink = (label: string, onClick: () => void) => {
            const b = this.add.text(0, 0, label, {
                fontSize: '18px',
                color:    '#5a8ea8',
            }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });

            b.on('pointerover', () => b.setColor('#ffffff'));
            b.on('pointerout',  () => b.setColor('#5a8ea8'));
            b.on('pointerdown', onClick);
            return b;
        };

        /** Lay out an inline row of links with ' | ' separators, centered at (cx, y). */
        const linkRow = (cx: number, y: number, items: { label: string; onClick: () => void }[]) => {
            const links = items.map(it => makeLink(it.label, it.onClick));
            const sepStyle = { fontSize: '18px', color: '#334455' };
            const seps: Phaser.GameObjects.Text[] = [];
            for (let i = 0; i < links.length - 1; i++) {
                seps.push(this.add.text(0, 0, ' | ', sepStyle).setOrigin(0, 0.5));
            }
            // Measure total width
            let totalW = 0;
            for (const l of links) totalW += l.width;
            for (const s of seps) totalW += s.width;
            // Position left-to-right
            let x = cx - totalW / 2;
            for (let i = 0; i < links.length; i++) {
                links[i].setPosition(x, y);
                x += links[i].width;
                if (i < seps.length) {
                    seps[i].setPosition(x, y);
                    x += seps[i].width;
                }
            }
        };

        // How to Play — with Year One / Year Two sub-links
        makeButton(W / 2, H / 2 + 10, 'How to Play', () => fadeAndStart('TutorialScene'));
        linkRow(W / 2, H / 2 + 48, [
            { label: 'Year One', onClick: () => fadeAndStart('TutorialScene') },
            { label: 'Year Two', onClick: () => fadeAndStart('TutorialY2Scene', { from: 'TitleScene' }) },
        ]);

        // Year One — main button + sub-links
        makeButton(W / 2, H / 2 + 100, 'Year One', () =>
            fadeAndStart('QuoteScene', { month: 1, isSeason: true, from: 'TitleScene' }));
        linkRow(W / 2, H / 2 + 138, [
            { label: 'Hard Mode', onClick: () =>
                fadeAndStart('QuoteScene', { month: 1, isSeason: true, from: 'TitleScene', hard: true }) },
            { label: 'Random Start', onClick: () => {
                const month = Math.floor(Math.random() * 12) + 1;
                fadeAndStart('QuoteScene', { month, isSeason: true, from: 'TitleScene' });
            }},
        ]);

        // Year Two — main button + sub-link
        makeButton(W / 2, H / 2 + 200, 'Year Two', () =>
            fadeAndStart('GameY2Scene', { monthIndex: 0, from: 'TitleScene' }));
        linkRow(W / 2, H / 2 + 238, [
            { label: 'Random Start', onClick: () => {
                const monthIndex = Math.floor(Math.random() * MONTHS_Y2.length);
                fadeAndStart('GameY2Scene', { monthIndex, from: 'TitleScene' });
            }},
        ]);

        // Utilities
        linkRow(W / 2, H / 2 + 300, [
            { label: 'Map Toolkit', onClick: () => fadeAndStart('ToolkitScene') },
            { label: 'My Stats',    onClick: () => fadeAndStart('StatsScene') },
        ]);

        // ── Sign in / out ────────────────────────────────────────────────────
        const authBtn = this.add.text(W / 2, H / 2 + 360, '', {
            fontSize: '18px', color: '#556677',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        authBtn.on('pointerover', () => authBtn.setColor('#aabbcc'));
        authBtn.on('pointerout',  () => authBtn.setColor('#556677'));
        authBtn.on('pointerdown', () => {
            if (isSignedIn()) {
                signOut();
            } else {
                this.cameras.main.fadeOut(500, 0, 0, 0);
                this.cameras.main.once('camerafadeoutcomplete', () => {
                    this.scene.start('AuthScene');
                });
            }
        });

        const updateAuthLabel = () => {
            if (isSignedIn()) {
                authBtn.setText(`Signed in as ${getDisplayName() ?? 'User'} (sign out)`);
            } else {
                authBtn.setText('Sign in');
            }
        };
        updateAuthLabel();

        // Listen for auth state changes
        if (this.authUnsub) this.authUnsub();
        this.authUnsub = onAuthChange(() => updateAuthLabel());

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

    shutdown() {
        if (this.authUnsub) { this.authUnsub(); this.authUnsub = undefined; }
    }
}
