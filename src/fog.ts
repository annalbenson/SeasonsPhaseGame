import Phaser from 'phaser';
import { TILE } from './constants';
import { SeasonTheme } from './seasons';
import {
    FOG_DECAY_START, FOG_DECAY_DURATION,
    FOG_DECAY_START_HARD, FOG_DECAY_DURATION_HARD, DEPTH,
} from './gameplay';

// ── Fog-of-war system ────────────────────────────────────────────────────────
// Manages per-cell fog tiles, visibility, and decay.
//
//   - Cells within Chebyshev distance 1 of the player are fully lit (alpha 0).
//   - Cells at distance 2 are "dimmed" (alpha 0.52) on first reveal.
//   - After leaving the lit radius, cells slowly fade back to fully hidden.
//   - Hard mode accelerates the decay timing.

export class FogOfWar {
    private tiles: Phaser.GameObjects.Image[][] = [];
    private revealed = new Set<string>();
    private lit      = new Set<string>();
    private lastLitTime = new Map<string, number>();

    private readonly cols: number;
    private readonly rows: number;
    private readonly hardMode: boolean;
    private readonly scene: Phaser.Scene;
    private revealRadius: number;

    constructor(
        scene: Phaser.Scene,
        cols: number,
        rows: number,
        hardMode: boolean,
        season: SeasonTheme,
        worldX: (col: number) => number,
        worldY: (row: number) => number,
        revealRadius = 2,
    ) {
        this.scene    = scene;
        this.cols     = cols;
        this.rows     = rows;
        this.hardMode = hardMode;
        this.revealRadius = revealRadius;

        // Generate fog texture if it doesn't exist yet
        const fogKey = `fog_${season.name}`;
        if (!scene.textures.exists(fogKey)) {
            const g = scene.make.graphics({ add: false });

            const r  = (season.bgColor >> 16) & 0xff;
            const gv = (season.bgColor >>  8) & 0xff;
            const b  =  season.bgColor        & 0xff;
            const mid = Phaser.Display.Color.GetColor(
                Math.min(255, r + 18),
                Math.min(255, gv + 18),
                Math.min(255, b + 18),
            );

            g.fillStyle(season.bgColor, 1);
            g.fillRect(0, 0, TILE, TILE);

            g.fillStyle(mid, 1);
            for (let i = 0; i < 14; i++) {
                g.fillCircle(
                    Math.floor(Math.random() * TILE),
                    Math.floor(Math.random() * TILE),
                    1 + Math.random() * 3,
                );
            }

            g.generateTexture(fogKey, TILE, TILE);
            g.destroy();
        }

        // Create fog tile grid
        this.tiles = [];
        for (let row = 0; row < rows; row++) {
            this.tiles[row] = [];
            for (let col = 0; col < cols; col++) {
                this.tiles[row][col] = scene.add.image(
                    worldX(col),
                    worldY(row),
                    fogKey,
                ).setDepth(DEPTH.FOG).setDisplaySize(TILE + 2, TILE + 2);
            }
        }
    }

    /** Dynamically adjust the reveal radius (e.g. for night falls). */
    setRevealRadius(r: number) {
        this.revealRadius = Math.max(1, r);
    }

    /** Reveal cells around a position. Fully lit within litRadius, dimmed up to revealRadius. */
    revealAround(col: number, row: number, now: number) {
        const prevLit = new Set(this.lit);
        this.lit.clear();

        const r = this.revealRadius;
        const litR = Math.max(1, r - 1);

        for (let dr = -r; dr <= r; dr++) {
            for (let dc = -r; dc <= r; dc++) {
                const nc = col + dc, nr = row + dr;
                if (nc < 0 || nc >= this.cols || nr < 0 || nr >= this.rows) continue;

                const dist = Math.max(Math.abs(dc), Math.abs(dr));
                if (dist > r) continue;
                const key  = `${nc},${nr}`;
                const tile = this.tiles[nr][nc];

                if (dist <= litR) {
                    this.lit.add(key);
                    this.revealed.add(key);
                    this.lastLitTime.set(key, now);
                    tile.setAlpha(0);
                } else if (!this.revealed.has(key)) {
                    this.revealed.add(key);
                    this.lastLitTime.set(key, now);
                    tile.setAlpha(0.52);
                }
            }
        }

        // Cells that left the lit radius — stamp with current time for decay
        for (const key of prevLit) {
            if (!this.lit.has(key)) {
                this.lastLitTime.set(key, now);
                const [c, r] = key.split(',').map(Number);
                if (this.tiles[r]?.[c]) this.tiles[r][c].setAlpha(0.52);
            }
        }
    }

    /** Reveal a large area (for Fairy Glow skill). */
    revealArea(centerCol: number, centerRow: number, radius: number, now: number) {
        for (let dr = -radius; dr <= radius; dr++) {
            for (let dc = -radius; dc <= radius; dc++) {
                const nc = centerCol + dc, nr = centerRow + dr;
                if (nc < 0 || nc >= this.cols || nr < 0 || nr >= this.rows) continue;
                const key = `${nc},${nr}`;
                this.revealed.add(key);
                this.lit.add(key);
                this.lastLitTime.set(key, now);
                if (this.tiles[nr]?.[nc]) this.tiles[nr][nc].setAlpha(0);
            }
        }
    }

    /** Call every frame — gradually fade revealed-but-not-lit cells back to hidden. */
    updateDecay(now: number) {
        const start = this.hardMode ? FOG_DECAY_START_HARD : FOG_DECAY_START;
        const dur   = this.hardMode ? FOG_DECAY_DURATION_HARD : FOG_DECAY_DURATION;

        for (const key of this.revealed) {
            if (this.lit.has(key)) continue;

            const lastLit = this.lastLitTime.get(key) ?? 0;
            const elapsed = now - lastLit;
            if (elapsed < start) continue;

            const progress = Math.min((elapsed - start) / dur, 1.0);
            const alpha = 0.52 + progress * 0.48;

            const [c, r] = key.split(',').map(Number);
            if (this.tiles[r]?.[c]) this.tiles[r][c].setAlpha(alpha);

            if (progress >= 1.0) {
                this.revealed.delete(key);
                this.lastLitTime.delete(key);
            }
        }
    }

    /** Reset all state (for scene restart). */
    reset() {
        this.revealed.clear();
        this.lit.clear();
        this.lastLitTime.clear();
    }
}
