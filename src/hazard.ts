import Phaser from 'phaser';
import { TILE, HEADER } from './constants';
import { WALLS, MOVE_DIRS as DIRS } from './maze';
import {
    HUNT_DISTANCE, PASSING_DISTANCE,
    HAZARD_HUNT_DELAY, HAZARD_WANDER_MIN, HAZARD_WANDER_RAND,
    HAZARD_HUNT_ANIM, HAZARD_WANDER_ANIM, DEPTH,
} from './gameplay';
import { createEnemySprite } from './sprites';

// ─────────────────────────────────────────────────────────────────────────────
// Hazard — a season-specific predator that hunts the player.
//
//  Spring  → Frog    Summer → Snake
//  Winter  → Owl     Fall   → Snake (placeholder)
//
// State machine:
//   wandering  random walk, moves every ~1.6–2.3 s
//   hunting    greedy move toward player, moves every ~0.9 s
//              triggered when player ≤ 5 cells away AND not hiding
//
// On catch: onCatch() fires (GameScene deducts a life and resets player).
// ─────────────────────────────────────────────────────────────────────────────
export class Hazard {
    gridX: number;
    gridY: number;

    private sprite:  Phaser.GameObjects.Container;
    private scene:   Phaser.Scene;
    private cells:   number[][];
    private blocked: Set<string>;
    private state:   'wandering' | 'hunting' | 'passing' = 'wandering';
    private moving   = false;
    dead     = false;
    private timer!:  Phaser.Time.TimerEvent;
    private onCatch: () => void;

    private fairyCol     = 0;
    private fairyRow     = 0;
    private fairyHiding  = false;
    private retreatMoves = 5;  // first N wander moves go away from (0,0)
    stunned      = false;
    private ox = 0;  // world-space x offset (centering)
    private oy = 0;  // world-space y offset (centering)
    private siblings: Hazard[] = [];  // other hazards to avoid
    private isGateBlocked: (fromCol: number, fromRow: number, toCol: number, toRow: number) => boolean;

    constructor(
        scene:      Phaser.Scene,
        cells:      number[][],
        startCol:   number,
        startRow:   number,
        seasonName: string,
        onCatch:    () => void,
        blocked:    Set<string> = new Set(),
        offsetX     = 0,
        offsetY     = 0,
        isGateBlocked: (fromCol: number, fromRow: number, toCol: number, toRow: number) => boolean = () => false,
    ) {
        this.scene   = scene;
        this.cells   = cells;
        this.blocked = blocked;
        this.gridX   = startCol;
        this.gridY   = startRow;
        this.onCatch = onCatch;
        this.ox      = offsetX;
        this.oy      = offsetY;
        this.isGateBlocked = isGateBlocked;

        this.sprite = this.buildSprite(
            startCol * TILE + TILE / 2 + this.ox,
            startRow * TILE + TILE / 2 + HEADER + this.oy,
            seasonName,
        );

        this.scheduleMove();
    }

    // ── Called every frame from GameScene.update() ────────────────────────────
    setTarget(col: number, row: number, hiding: boolean) {
        this.fairyCol    = col;
        this.fairyRow    = row;
        this.fairyHiding = hiding;

        if (this.stunned) return; // don't change behaviour while stunned

        const dist = Math.abs(col - this.gridX) + Math.abs(row - this.gridY);
        const next: typeof this.state =
            (!hiding && dist <= HUNT_DISTANCE) ? 'hunting' :
            ( hiding && dist <= PASSING_DISTANCE) ? 'passing' :
            'wandering';

        if (next !== this.state) {
            this.state = next;
        }
    }

    /** Trigger catch from outside (e.g. player walked onto this hazard). */
    onCatchPublic() { this.onCatch(); }

    scatter() {
        if (this.moving || this.dead) return;
        const dir = [...this.validDirs()]
            .sort((a, b) => {
                const da = Math.abs(this.fairyCol - (this.gridX + a.dc))
                         + Math.abs(this.fairyRow  - (this.gridY + a.dr));
                const db = Math.abs(this.fairyCol - (this.gridX + b.dc))
                         + Math.abs(this.fairyRow  - (this.gridY + b.dr));
                return db - da;
            })[0];

        if (!dir) return;
        this.gridX += dir.dc;
        this.gridY += dir.dr;
        this.moving = true;
        this.scene.tweens.add({
            targets:    this.sprite,
            x:          this.gridX * TILE + TILE / 2 + this.ox,
            y:          this.gridY * TILE + TILE / 2 + HEADER + this.oy,
            duration:   450,
            ease:       'Back.easeOut',
            onComplete: () => { this.moving = false; },
        });
    }

    /** Stun this hazard for `ms` milliseconds — it stops moving and turns grey. */
    stun(ms: number) {
        if (this.dead || this.stunned) return;
        this.stunned = true;
        this.timer?.remove();

        // Visual: grey tint + spin
        this.sprite.setAlpha(0.5);
        const spin = this.scene.tweens.add({
            targets: this.sprite.list[0],  // inner visual container
            angle: { from: 0, to: 360 },
            duration: 600,
            repeat: -1,
        });

        this.scene.time.delayedCall(ms, () => {
            if (this.dead) return;
            this.stunned = false;
            this.sprite.setAlpha(1.0);
            spin.stop();
            (this.sprite.list[0] as Phaser.GameObjects.Container).setAngle(0);
            this.scheduleMove();
        });
    }

    /** Tell this hazard about its siblings so it avoids clustering. */
    setSiblings(others: Hazard[]) {
        this.siblings = others.filter(h => h !== this);
    }

    destroy() {
        this.dead = true;
        this.timer?.remove();
        this.sprite?.destroy();
    }

    // ── Movement internals ────────────────────────────────────────────────────
    private scheduleMove() {
        if (this.dead) return;
        const delay = this.state === 'hunting' ? HAZARD_HUNT_DELAY : HAZARD_WANDER_MIN + Math.random() * HAZARD_WANDER_RAND;
        this.timer = this.scene.time.delayedCall(delay, () => this.move());
    }

    private move() {
        if (this.dead || this.moving || this.stunned) { if (!this.stunned) this.scheduleMove(); return; }

        let dir;
        if (this.state === 'hunting') {
            dir = this.huntDir();
        } else if (this.state === 'passing') {
            // Walk toward and through the hidden player — the catch check
            // at move-end skips hidden players, so they're safe
            dir = this.huntDir();
        } else if (this.retreatMoves > 0) {
            dir = this.retreatDir();
            this.retreatMoves--;
        } else {
            dir = this.randomDir();
        }
        if (!dir) { this.scheduleMove(); return; }

        this.gridX += dir.dc;
        this.gridY += dir.dr;
        this.moving = true;

        this.scene.tweens.add({
            targets:  this.sprite,
            x:        this.gridX * TILE + TILE / 2 + this.ox,
            y:        this.gridY * TILE + TILE / 2 + HEADER + this.oy,
            duration: this.state === 'hunting' ? HAZARD_HUNT_ANIM : HAZARD_WANDER_ANIM,
            ease:     'Sine.easeInOut',
            onComplete: () => {
                if (this.dead) return;
                this.moving = false;
                if (!this.fairyHiding
                    && this.gridX === this.fairyCol
                    && this.gridY === this.fairyRow) {
                    this.onCatch();
                }
                this.scheduleMove();
            },
        });
    }

    private validDirs() {
        const walls = this.cells[this.gridY][this.gridX];
        return DIRS.filter(d => {
            if (walls & d.wall) return false;
            const nx = this.gridX + d.dc, ny = this.gridY + d.dr;
            if (this.blocked.has(`${nx},${ny}`)) return false;
            if (this.isGateBlocked(this.gridX, this.gridY, nx, ny)) return false;
            // Avoid moving onto or adjacent to a sibling (within Manhattan 2)
            for (const s of this.siblings) {
                if (s.dead) continue;
                const dist = Math.abs(nx - s.gridX) + Math.abs(ny - s.gridY);
                if (dist <= 2) return false;
            }
            return true;
        });
    }

    private retreatDir() {
        const valid = this.validDirs();
        if (valid.length === 0) return null;
        return valid.sort((a, b) => {
            const da = (this.gridX + a.dc) + (this.gridY + a.dr);
            const db = (this.gridX + b.dc) + (this.gridY + b.dr);
            return db - da;
        })[0];
    }

    private huntDir() {
        return [...this.validDirs()]
            .map(d => ({
                ...d,
                dist: Math.abs(this.fairyCol - (this.gridX + d.dc))
                    + Math.abs(this.fairyRow  - (this.gridY + d.dr)),
            }))
            .sort((a, b) => a.dist - b.dist)[0] ?? null;
    }

    private randomDir() {
        const valid = this.validDirs();
        return valid.length ? valid[Math.floor(Math.random() * valid.length)] : null;
    }

    // ── Sprite dispatcher ─────────────────────────────────────────────────────
    private buildSprite(x: number, y: number, seasonName: string): Phaser.GameObjects.Container {
        return createEnemySprite(this.scene, x, y, seasonName, DEPTH.HAZARD);
    }

}
