import Phaser from 'phaser';
import { TILE, HEADER } from './constants';
import { WALLS } from './maze';

const DIRS = [
    { dc:  0, dr: -1, wall: WALLS.TOP    },
    { dc:  1, dr:  0, wall: WALLS.RIGHT  },
    { dc:  0, dr:  1, wall: WALLS.BOTTOM },
    { dc: -1, dr:  0, wall: WALLS.LEFT   },
] as const;

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
    private danger!: Phaser.GameObjects.Arc;   // red aura, visible only when hunting
    private scene:   Phaser.Scene;
    private cells:   number[][];
    private state:   'wandering' | 'hunting' = 'wandering';
    private moving   = false;
    private dead     = false;
    private timer!:  Phaser.Time.TimerEvent;
    private onCatch: () => void;

    private fairyCol    = 0;
    private fairyRow    = 0;
    private fairyHiding = false;

    constructor(
        scene:      Phaser.Scene,
        cells:      number[][],
        startCol:   number,
        startRow:   number,
        seasonName: string,
        onCatch:    () => void,
    ) {
        this.scene   = scene;
        this.cells   = cells;
        this.gridX   = startCol;
        this.gridY   = startRow;
        this.onCatch = onCatch;

        this.sprite = this.buildSprite(
            startCol * TILE + TILE / 2,
            startRow * TILE + TILE / 2 + HEADER,
            seasonName,
        );

        this.scheduleMove();
    }

    // ── Called every frame from GameScene.update() ────────────────────────────
    setTarget(col: number, row: number, hiding: boolean) {
        this.fairyCol    = col;
        this.fairyRow    = row;
        this.fairyHiding = hiding;

        const dist = Math.abs(col - this.gridX) + Math.abs(row - this.gridY);
        const next: typeof this.state = (!hiding && dist <= 5) ? 'hunting' : 'wandering';

        if (next !== this.state) {
            this.state = next;
            this.scene.tweens.add({
                targets:  this.danger,
                alpha:    next === 'hunting' ? 0.38 : 0,
                duration: 350,
            });
        }
    }

    scatter() {
        if (this.moving || this.dead) return;
        const walls = this.cells[this.gridY][this.gridX];
        const dir = [...DIRS]
            .filter(d => !(walls & d.wall))
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
            x:          this.gridX * TILE + TILE / 2,
            y:          this.gridY * TILE + TILE / 2 + HEADER,
            duration:   450,
            ease:       'Back.easeOut',
            onComplete: () => { this.moving = false; },
        });
    }

    destroy() {
        this.dead = true;
        this.timer?.remove();
        this.sprite?.destroy();
    }

    // ── Movement internals ────────────────────────────────────────────────────
    private scheduleMove() {
        if (this.dead) return;
        const delay = this.state === 'hunting' ? 900 : 1600 + Math.random() * 700;
        this.timer = this.scene.time.delayedCall(delay, () => this.move());
    }

    private move() {
        if (this.dead || this.moving) { this.scheduleMove(); return; }

        const dir = this.state === 'hunting' ? this.huntDir() : this.randomDir();
        if (!dir) { this.scheduleMove(); return; }

        this.gridX += dir.dc;
        this.gridY += dir.dr;
        this.moving = true;

        this.scene.tweens.add({
            targets:  this.sprite,
            x:        this.gridX * TILE + TILE / 2,
            y:        this.gridY * TILE + TILE / 2 + HEADER,
            duration: this.state === 'hunting' ? 820 : 1500,
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

    private huntDir() {
        const walls = this.cells[this.gridY][this.gridX];
        return [...DIRS]
            .filter(d => !(walls & d.wall))
            .map(d => ({
                ...d,
                dist: Math.abs(this.fairyCol - (this.gridX + d.dc))
                    + Math.abs(this.fairyRow  - (this.gridY + d.dr)),
            }))
            .sort((a, b) => a.dist - b.dist)[0] ?? null;
    }

    private randomDir() {
        const walls = this.cells[this.gridY][this.gridX];
        const valid = DIRS.filter(d => !(walls & d.wall));
        return valid.length ? valid[Math.floor(Math.random() * valid.length)] : null;
    }

    // ── Sprite dispatcher ─────────────────────────────────────────────────────
    private buildSprite(x: number, y: number, seasonName: string): Phaser.GameObjects.Container {
        switch (seasonName) {
            case 'Spring': return this.buildFrog(x, y);
            case 'Fall':   return this.buildFox(x, y);
            case 'Winter': return this.buildOwl(x, y);
            default:       return this.buildSnake(x, y);   // Summer
        }
    }

    // ── Snake (Summer / Fall) ─────────────────────────────────────────────────
    private buildSnake(x: number, y: number): Phaser.GameObjects.Container {
        const bodyCol  = 0x3d7028;
        const headCol  = 0x4e8f35;
        const bellyCol = 0x7ab840;

        this.danger = this.scene.add.circle(0, 0, 32, 0xcc2200, 0);

        const tail = this.scene.add.circle(-13, -10, 4, bodyCol);
        const s4   = this.scene.add.circle(-18,  -3, 6, bodyCol);
        const s3   = this.scene.add.circle(-17,   7, 7, bodyCol);
        const s2   = this.scene.add.circle(-11,  13, 8, bodyCol);
        const s1   = this.scene.add.circle( -4,   9, 9, bodyCol);

        const head  = this.scene.add.ellipse(0, 0, 20, 14, headCol);
        const belly = this.scene.add.ellipse(0, 1, 12,  7, bellyCol, 0.35);

        const eyeL = this.scene.add.circle(-5, -4, 2.5, 0xffffff);
        const pupL = this.scene.add.circle(-5, -4, 1.5, 0x111111);
        const eyeR = this.scene.add.circle( 4, -4, 2.5, 0xffffff);
        const pupR = this.scene.add.circle( 4, -4, 1.5, 0x111111);

        const tongue = this.scene.add.graphics();
        tongue.lineStyle(1.5, 0xee1111);
        tongue.strokeLineShape(new Phaser.Geom.Line( 7,  0, 13,  0));
        tongue.strokeLineShape(new Phaser.Geom.Line(13,  0, 17, -3));
        tongue.strokeLineShape(new Phaser.Geom.Line(13,  0, 17,  3));

        const visual = this.scene.add.container(0, 0, [
            this.danger, tail, s4, s3, s2, s1, head, belly,
            eyeL, pupL, eyeR, pupR, tongue,
        ]);
        const outer = this.scene.add.container(x, y, [visual]);
        outer.setDepth(3);

        this.scene.tweens.add({ targets: tongue, alpha: { from: 1, to: 0 }, yoyo: true, repeat: -1, duration: 190 });
        this.scene.tweens.add({ targets: visual, angle: { from: -7, to: 7 }, yoyo: true, repeat: -1, duration: 1300, ease: 'Sine.easeInOut' });

        return outer;
    }

    // ── Frog (Spring) ─────────────────────────────────────────────────────────
    private buildFrog(x: number, y: number): Phaser.GameObjects.Container {
        const green  = 0x44aa22;
        const dark   = 0x2a7a10;
        const belly  = 0x99cc44;

        this.danger = this.scene.add.circle(0, 0, 32, 0xcc2200, 0);

        // Back legs — wide ellipses swept outward at bottom
        const legBL = this.scene.add.ellipse(-15, 14, 16, 8, dark, 0.85).setAngle(-35);
        const legBR = this.scene.add.ellipse( 15, 14, 16, 8, dark, 0.85).setAngle( 35);
        // Front feet — smaller, at sides
        const legFL = this.scene.add.ellipse(-16, -5, 10, 6, dark, 0.8).setAngle(-20);
        const legFR = this.scene.add.ellipse( 16, -5, 10, 6, dark, 0.8).setAngle( 20);

        // Body
        const body  = this.scene.add.circle(0, 4, 18, green);
        const bellySpot = this.scene.add.ellipse(0, 6, 22, 14, belly, 0.45);

        // Head (slightly raised, different shade)
        const head  = this.scene.add.circle(0, -10, 12, 0x55bb33);

        // Wide mouth — dark ellipse at bottom of head
        const mouth = this.scene.add.ellipse(0, -4, 20, 5, dark, 0.65);

        // Nostril dots
        const nosL  = this.scene.add.circle(-4, -12, 2, dark);
        const nosR  = this.scene.add.circle( 4, -12, 2, dark);

        // Bulging eyes on sides of head
        const eyeL  = this.scene.add.circle(-14, -12, 8, 0xffffff);
        const eyeR  = this.scene.add.circle( 14, -12, 8, 0xffffff);
        const irisL = this.scene.add.circle(-14, -12, 5, 0xcc8800);
        const irisR = this.scene.add.circle( 14, -12, 5, 0xcc8800);
        const pupL  = this.scene.add.circle(-14, -12, 2.5, 0x111111);
        const pupR  = this.scene.add.circle( 14, -12, 2.5, 0x111111);

        const visual = this.scene.add.container(0, 0, [
            this.danger, legBL, legBR, legFL, legFR,
            body, bellySpot, head, mouth, nosL, nosR,
            eyeL, eyeR, irisL, irisR, pupL, pupR,
        ]);
        const outer = this.scene.add.container(x, y, [visual]);
        outer.setDepth(3);

        // Slow idle breathing bob
        this.scene.tweens.add({ targets: visual, y: { from: 0, to: -5 }, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
        // Eye pulse
        this.scene.tweens.add({ targets: [eyeL, eyeR, irisL, irisR], scale: { from: 1, to: 1.12 }, yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.easeInOut' });

        return outer;
    }

    // ── Fox (Fall) ────────────────────────────────────────────────────────────
    private buildFox(x: number, y: number): Phaser.GameObjects.Container {
        const orange = 0xdd5500;
        const light  = 0xee8833;
        const cream  = 0xffd090;
        const dark   = 0x221100;

        this.danger = this.scene.add.circle(0, 0, 32, 0xcc2200, 0);

        // Fluffy tail — behind body, sways independently
        const tail    = this.scene.add.ellipse(0, 17, 18, 14, light, 0.9);
        const tailTip = this.scene.add.circle(0, 23, 6, cream, 0.9);

        // Body
        const body  = this.scene.add.ellipse(0, 3, 18, 22, orange);
        const belly = this.scene.add.ellipse(0, 4, 10, 15, cream, 0.5);

        // Hind paws
        const pawBL = this.scene.add.circle(-8, 13, 4, dark, 0.65);
        const pawBR = this.scene.add.circle( 8, 13, 4, dark, 0.65);

        // Head — slightly elongated
        const head   = this.scene.add.ellipse(0, -8, 16, 14, orange);

        // Pointed snout
        const snout  = this.scene.add.ellipse(0, -17, 8, 10, light);
        const nose   = this.scene.add.circle(0, -21, 3, dark);

        // White muzzle cheeks
        const muzzleL = this.scene.add.ellipse(-6, -16, 7, 6, cream, 0.6);
        const muzzleR = this.scene.add.ellipse( 6, -16, 7, 6, cream, 0.6);

        // Large ears — pointed
        const earL  = this.scene.add.ellipse(-10, -13, 8, 12, orange);
        const earR  = this.scene.add.ellipse( 10, -13, 8, 12, orange);
        const earLi = this.scene.add.ellipse(-10, -13, 4,  7, dark, 0.45);
        const earRi = this.scene.add.ellipse( 10, -13, 4,  7, dark, 0.45);

        // Amber eyes
        const eyeL = this.scene.add.circle(-6, -10, 2.5, 0xdd9900);
        const eyeR = this.scene.add.circle( 6, -10, 2.5, 0xdd9900);
        const pupL = this.scene.add.circle(-6, -10, 1.5, dark);
        const pupR = this.scene.add.circle( 6, -10, 1.5, dark);

        // Front paws
        const pawFL = this.scene.add.circle(-7, -1, 3.5, dark, 0.55);
        const pawFR = this.scene.add.circle( 7, -1, 3.5, dark, 0.55);

        const visual = this.scene.add.container(0, 0, [
            this.danger, tail, tailTip,
            body, belly, pawBL, pawBR,
            head, muzzleL, muzzleR, snout, nose,
            earL, earR, earLi, earRi,
            eyeL, eyeR, pupL, pupR,
            pawFL, pawFR,
        ]);
        const outer = this.scene.add.container(x, y, [visual]);
        outer.setDepth(3);

        // Tail sway
        this.scene.tweens.add({ targets: [tail, tailTip], angle: { from: -13, to: 13 }, yoyo: true, repeat: -1, duration: 1500, ease: 'Sine.easeInOut' });
        // Prowling body shift
        this.scene.tweens.add({ targets: visual, y: { from: 0, to: -4 }, yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.easeInOut' });

        return outer;
    }

    // ── Owl (Winter) ──────────────────────────────────────────────────────────
    private buildOwl(x: number, y: number): Phaser.GameObjects.Container {
        const brown  = 0x6b4520;
        const light  = 0x9a6840;
        const cream  = 0xe8dcc8;

        this.danger = this.scene.add.circle(0, 0, 32, 0xcc2200, 0);

        // Body
        const body  = this.scene.add.circle(0, 5, 18, brown);
        // Wing patches on sides
        const wingL = this.scene.add.ellipse(-14, 6, 12, 22, light, 0.75);
        const wingR = this.scene.add.ellipse( 14, 6, 12, 22, light, 0.75);
        // Tail feathers
        const tail  = this.scene.add.ellipse(0, 19, 18, 10, light, 0.9);

        // Facial disc
        const face  = this.scene.add.circle(0, -4, 13, cream);

        // Ear tufts
        const tuftL = this.scene.add.ellipse(-8, -18, 7, 13, brown);
        const tuftR = this.scene.add.ellipse( 8, -18, 7, 13, brown);

        // Large yellow eyes
        const eyeL   = this.scene.add.circle(-6, -6, 6, 0xffe060);
        const eyeR   = this.scene.add.circle( 6, -6, 6, 0xffe060);
        const pupL   = this.scene.add.circle(-6, -6, 3.5, 0x111111);
        const pupR   = this.scene.add.circle( 6, -6, 3.5, 0x111111);
        const glintL = this.scene.add.circle(-5, -7, 1.2, 0xffffff);
        const glintR = this.scene.add.circle( 7, -7, 1.2, 0xffffff);

        // Beak — small rounded oval
        const beak  = this.scene.add.ellipse(0, -1, 9, 6, 0xcc8800);

        const visual = this.scene.add.container(0, 0, [
            this.danger, body, wingL, wingR, tail,
            face, tuftL, tuftR,
            eyeL, eyeR, pupL, pupR, glintL, glintR, beak,
        ]);
        const outer = this.scene.add.container(x, y, [visual]);
        outer.setDepth(3);

        // Slow head-turn (owls rotate their heads)
        this.scene.tweens.add({ targets: visual, angle: { from: -12, to: 12 }, yoyo: true, repeat: -1, duration: 2600, ease: 'Sine.easeInOut' });
        // Eye glow pulse
        this.scene.tweens.add({ targets: [eyeL, eyeR], alpha: { from: 0.75, to: 1.0 }, yoyo: true, repeat: -1, duration: 1800, ease: 'Sine.easeInOut' });

        return outer;
    }
}
