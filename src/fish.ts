import Phaser from 'phaser';
import { TILE, HEADER } from './constants';
import { Terrain, isSwimmable } from './terrain';
import { DEPTH } from './gameplay';

// ── Fish — swims in water, flees from the polar bear at half hazard speed ──

export class Fish {
    gridX: number;
    gridY: number;
    dead = false;

    private sprite:   Phaser.GameObjects.Container;
    private scene:    Phaser.Scene;
    private grid:     Terrain[][];
    private cols:     number;
    private rows:     number;
    private moving    = false;
    private timer!:   Phaser.Time.TimerEvent;
    private bearCol   = 0;
    private bearRow   = 0;
    private ox: number;
    private oy: number;

    constructor(
        scene:    Phaser.Scene,
        terrGrid: Terrain[][],
        cols:     number,
        rows:     number,
        startCol: number,
        startRow: number,
        offsetX:  number,
        offsetY:  number,
    ) {
        this.scene = scene;
        this.grid  = terrGrid;
        this.cols  = cols;
        this.rows  = rows;
        this.gridX = startCol;
        this.gridY = startRow;
        this.ox    = offsetX;
        this.oy    = offsetY;

        const wx = startCol * TILE + TILE / 2 + this.ox;
        const wy = startRow * TILE + TILE / 2 + HEADER + this.oy;
        this.sprite = this.buildSprite(wx, wy);

        this.scheduleMove();
    }

    setTarget(bearCol: number, bearRow: number) {
        this.bearCol = bearCol;
        this.bearRow = bearRow;
    }

    destroy() {
        this.dead = true;
        this.timer?.remove();
        this.sprite?.destroy();
    }

    // ── Movement ────────────────────────────────────────────────────────────────
    private scheduleMove() {
        if (this.dead) return;
        // Half hazard speed — hazards move every ~1.5-2.1s, fish move every ~3-4s
        const delay = 2800 + Math.random() * 1200;
        this.timer = this.scene.time.delayedCall(delay, () => this.move());
    }

    private move() {
        if (this.dead || this.moving) { this.scheduleMove(); return; }

        const dist = Math.abs(this.bearCol - this.gridX) + Math.abs(this.bearRow - this.gridY);

        let dir;
        if (dist <= 4) {
            // Flee — pick the water cell that maximizes distance from bear
            dir = this.fleeDir();
        } else {
            // Idle drift — random water cell
            dir = this.randomDir();
        }

        if (!dir) { this.scheduleMove(); return; }

        this.gridX += dir.dc;
        this.gridY += dir.dr;
        this.moving = true;

        // Flip sprite horizontally based on movement direction
        if (dir.dc !== 0) {
            const inner = this.sprite.list[0] as Phaser.GameObjects.Container;
            inner.setScale(dir.dc > 0 ? 1 : -1, 1);
        }

        this.scene.tweens.add({
            targets: this.sprite,
            x: this.gridX * TILE + TILE / 2 + this.ox,
            y: this.gridY * TILE + TILE / 2 + HEADER + this.oy,
            duration: 1400,
            ease: 'Sine.easeInOut',
            onComplete: () => {
                if (this.dead) return;
                this.moving = false;
                this.scheduleMove();
            },
        });
    }

    private validWaterDirs(): { dc: number; dr: number }[] {
        return [
            { dc: 0, dr: -1 }, { dc: 0, dr: 1 },
            { dc: -1, dr: 0 }, { dc: 1, dr: 0 },
        ].filter(d => isSwimmable(this.grid, this.gridX + d.dc, this.gridY + d.dr, this.cols, this.rows));
    }

    private fleeDir() {
        const valid = this.validWaterDirs();
        if (valid.length === 0) return null;
        // Pick direction that maximizes distance from bear
        return valid.sort((a, b) => {
            const da = Math.abs(this.bearCol - (this.gridX + a.dc))
                     + Math.abs(this.bearRow - (this.gridY + a.dr));
            const db = Math.abs(this.bearCol - (this.gridX + b.dc))
                     + Math.abs(this.bearRow - (this.gridY + b.dr));
            return db - da;
        })[0];
    }

    private randomDir() {
        const valid = this.validWaterDirs();
        return valid.length ? valid[Math.floor(Math.random() * valid.length)] : null;
    }

    // ── Sprite ──────────────────────────────────────────────────────────────────
    private buildSprite(x: number, y: number): Phaser.GameObjects.Container {
        // Orange fish body
        const body  = this.scene.add.ellipse(0, 0, 24, 14, 0xff8844);
        // Tail fin
        const tail  = this.scene.add.triangle(14, 0, 0, -7, 0, 7, 10, 0, 0xff6622);
        // Dorsal fin
        const dorsal = this.scene.add.triangle(2, -8, -5, 6, 0, 0, 5, 6, 0xee7733, 0.8);
        // Belly highlight
        const belly = this.scene.add.ellipse(0, 3, 16, 6, 0xffaa66, 0.5);
        // Eye
        const eye   = this.scene.add.circle(-7, -2, 3, 0xffffff);
        const pupil = this.scene.add.circle(-7, -2, 1.8, 0x111111);
        // Mouth
        const mouth = this.scene.add.graphics();
        mouth.lineStyle(1, 0xcc5500, 0.6);
        mouth.strokeLineShape(new Phaser.Geom.Line(-12, 1, -9, 2));

        const visual = this.scene.add.container(0, 0, [body, tail, dorsal, belly, eye, pupil, mouth]);
        const outer  = this.scene.add.container(x, y, [visual]);
        outer.setDepth(DEPTH.SPRITE);

        // Gentle swimming bob
        this.scene.tweens.add({
            targets: visual,
            y: { from: -3, to: 3 },
            yoyo: true, repeat: -1,
            duration: 1000 + Math.random() * 400,
            ease: 'Sine.easeInOut',
        });
        // Subtle tail waggle
        this.scene.tweens.add({
            targets: tail,
            angle: { from: -12, to: 12 },
            yoyo: true, repeat: -1,
            duration: 400,
            ease: 'Sine.easeInOut',
        });

        return outer;
    }
}
