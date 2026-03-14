import Phaser from 'phaser';
import { TILE } from './constants';
import { WALLS } from './maze';
import { Hazard } from './hazard';
import { FogOfWar } from './fog';
import { statsEvents, STAT } from './statsEmitter';

// ── Skill system ─────────────────────────────────────────────────────────────
// Each season has a unique active ability with a shared cooldown timer.
//
//   Winter (BURROW) — toggle: hide in place until SPACE again (like a bush)
//   Spring (STING)  — immediate: stun an adjacent enemy for 5s
//   Summer (GLOW)   — immediate: reveal a large fog area
//   Fall   (DASH)   — directional: sprint 3 cells in one direction

const DEFAULT_COOLDOWN = 15_000; // 15 seconds default

/** Shared state and scene references needed by all skills. */
export interface SkillContext {
    scene: Phaser.Scene;
    gridX: number;
    gridY: number;
    cols: number;
    rows: number;
    cells: number[][];
    sceneryBlocked: Set<string>;
    hazards: Hazard[];
    fog: FogOfWar;
    player: Phaser.GameObjects.Container;
    worldX(col: number): number;
    worldY(row: number): number;
    findGate(fromCol: number, fromRow: number, toCol: number, toRow: number): { open: boolean; graphic: Phaser.GameObjects.GameObject } | null;
    keyCount: number;
    updateInventory(): void;
    collectKey(): void;
    checkObjective(): void;
    checkGoal(): void;
    checkHazardCollision(): void;
    setGrid(x: number, y: number): void;
    setMoving(m: boolean): void;
    setBurrowed?(active: boolean): void;
    emergeBurrow?(): void;
    setSwimming?(active: boolean): void;
}

export type SeasonName = 'Winter' | 'Spring' | 'Summer' | 'Fall' | 'Tutorial' | 'WinterY2';

export interface Skill {
    readonly name: string;
    readonly label: string;
    readonly isDirectional: boolean;
    readonly cooldown: number;
    /** Attempt immediate activation. Returns true if consumed. */
    activate(ctx: SkillContext): boolean;
    /** Attempt directional activation. Returns true if consumed. */
    tryDirectional(dx: number, dy: number, ctx: SkillContext): boolean;
}

// ── Skill state (managed by SkillManager) ────────────────────────────────────

export class SkillManager {
    used   = false;
    armed  = false;
    cooldownEnd = 0;
    text!: Phaser.GameObjects.Text;

    private readonly skill: Skill;

    constructor(season: SeasonName) {
        this.skill = SKILLS[season];
    }

    get name() { return this.skill.name; }
    get label() { return this.skill.label; }

    activate(ctx: SkillContext, now: number): boolean {
        if (this.used || this.armed) return false;

        if (this.skill.isDirectional) {
            this.armed = true;
            this.updateText(now);
            return true;
        }

        const consumed = this.skill.activate(ctx);
        if (consumed) {
            this.startCooldown(now);
            statsEvents.emit(STAT.SKILL_USED, { skill: this.skill.name });
        }
        this.updateText(now);
        return consumed;
    }

    tryDirectional(dx: number, dy: number, ctx: SkillContext, now: number): boolean {
        if (!this.armed) return false;
        const consumed = this.skill.tryDirectional(dx, dy, ctx);
        if (consumed) {
            this.armed = false;
            this.startCooldown(now);
            statsEvents.emit(STAT.SKILL_USED, { skill: this.skill.name });
        }
        this.updateText(now);
        return consumed;
    }

    /** Cancel armed mode without consuming. */
    cancelArm(now: number) {
        this.armed = false;
        this.updateText(now);
    }

    /** Call each frame to update cooldown display and check expiry. */
    tick(now: number) {
        if (this.used) {
            if (now >= this.cooldownEnd) {
                this.used = false;
            }
            this.updateText(now);
        }
    }

    updateText(now: number) {
        if (!this.text) return;
        if (this.used) {
            const remain = Math.max(0, Math.ceil((this.cooldownEnd - now) / 1000));
            this.text.setText(`${this.skill.name}  (${remain}s)`);
            this.text.setAlpha(0.35);
        } else if (this.armed) {
            this.text.setText(`${this.skill.name}  ▸▸`);
            this.text.setAlpha(1);
        } else {
            this.text.setText(`${this.skill.name}  [SPACE]`);
            this.text.setAlpha(1);
        }
    }

    reset() {
        this.used = false;
        this.armed = false;
        this.cooldownEnd = 0;
    }

    private startCooldown(now: number) {
        if (this.skill.cooldown <= 0) return; // no cooldown
        this.used = true;
        this.cooldownEnd = now + this.skill.cooldown;
    }
}

// ── Individual skill implementations ─────────────────────────────────────────

const BURROW: Skill = {
    name: 'BURROW',
    label: 'burrow — hide in place!',
    isDirectional: false,
    cooldown: DEFAULT_COOLDOWN,

    activate(ctx) {
        if (!ctx.setBurrowed) return false;

        // If already burrowed, pressing SPACE again = emerge
        if (ctx.emergeBurrow) {
            ctx.emergeBurrow();
            return false; // don't consume another cooldown
        }

        ctx.setBurrowed(true);
        ctx.setMoving(true); // lock movement while burrowed

        // Shrink into ground effect
        ctx.scene.tweens.add({
            targets: ctx.player, scaleX: 0.5, scaleY: 0.3, alpha: 0.35,
            duration: 300, ease: 'Back.easeIn',
        });

        // Dirt mound visual
        const mound = ctx.scene.add.ellipse(
            ctx.player.x, ctx.player.y + 12, TILE * 0.6, TILE * 0.25,
            0x8a7050, 0.6,
        ).setDepth(1.9);

        // Expose emerge so SPACE can end burrow
        ctx.emergeBurrow = () => {
            if (!ctx.setBurrowed) return;
            ctx.setBurrowed(false);
            ctx.setMoving(false);
            ctx.emergeBurrow = undefined;
            ctx.scene.tweens.add({
                targets: ctx.player, scaleX: 1, scaleY: 1, alpha: 1,
                duration: 300, ease: 'Back.easeOut',
            });
            ctx.scene.tweens.add({
                targets: mound, alpha: 0, duration: 300,
                onComplete: () => mound.destroy(),
            });
        };

        return true;
    },

    tryDirectional: () => false,
};

const STING: Skill = {
    name: 'STING',
    label: 'sting — stun frog!',
    isDirectional: false,
    cooldown: DEFAULT_COOLDOWN,

    activate(ctx) {
        let nearest: Hazard | null = null;
        let bestDist = Infinity;
        for (const h of ctx.hazards) {
            if (h.dead || h.stunned) continue;
            const d = Math.abs(h.gridX - ctx.gridX) + Math.abs(h.gridY - ctx.gridY);
            if (d < bestDist) { bestDist = d; nearest = h; }
        }
        if (!nearest || bestDist > 1) return false; // no adjacent enemy
        nearest.stun(5000);
        statsEvents.emit(STAT.MONSTER_STUNNED);
        ctx.scene.tweens.add({ targets: ctx.player, scaleX: 1.3, scaleY: 1.3, yoyo: true, duration: 200 });
        return true;
    },

    tryDirectional: () => false,
};

const GLOW: Skill = {
    name: 'GLOW',
    label: 'glow — reveal fog!',
    isDirectional: false,
    cooldown: DEFAULT_COOLDOWN,

    activate(ctx) {
        ctx.fog.revealArea(ctx.gridX, ctx.gridY, 4, ctx.scene.time.now);
        // Bright flash effect
        const flash = ctx.scene.add.circle(
            ctx.player.x, ctx.player.y, TILE * 4,
            0xaaffaa, 0.4, // approximate — overridden per season below
        ).setDepth(2.8);
        ctx.scene.tweens.add({ targets: flash, alpha: 0, scale: 1.5, duration: 600, onComplete: () => flash.destroy() });
        return true;
    },

    tryDirectional: () => false,
};

const DASH: Skill = {
    name: 'DASH',
    label: 'dash — sprint ahead!',
    isDirectional: true,
    cooldown: DEFAULT_COOLDOWN,

    activate: () => false,

    tryDirectional(dx, dy, ctx) {
        // Check we can move at least 1 cell
        const walls0 = ctx.cells[ctx.gridY][ctx.gridX];
        if (dx ===  1 && (walls0 & WALLS.RIGHT))  return false;
        if (dx === -1 && (walls0 & WALLS.LEFT))   return false;
        if (dy ===  1 && (walls0 & WALLS.BOTTOM)) return false;
        if (dy === -1 && (walls0 & WALLS.TOP))    return false;

        const nx = ctx.gridX + dx, ny = ctx.gridY + dy;
        if (ctx.sceneryBlocked.has(`${nx},${ny}`)) return false;

        ctx.setMoving(true);

        // Collect up to 3 cells we can dash through
        const steps: { x: number; y: number }[] = [];
        let cx = ctx.gridX, cy = ctx.gridY;
        for (let s = 0; s < 3; s++) {
            const w = ctx.cells[cy][cx];
            if (dx ===  1 && (w & WALLS.RIGHT))  break;
            if (dx === -1 && (w & WALLS.LEFT))   break;
            if (dy ===  1 && (w & WALLS.BOTTOM)) break;
            if (dy === -1 && (w & WALLS.TOP))    break;
            const nsx = cx + dx, nsy = cy + dy;
            if (nsx < 0 || nsx >= ctx.cols || nsy < 0 || nsy >= ctx.rows) break;
            if (ctx.sceneryBlocked.has(`${nsx},${nsy}`)) break;
            const gate = ctx.findGate(cx, cy, nsx, nsy);
            if (gate) {
                if (ctx.keyCount === 0) break;
                ctx.keyCount--;
                gate.open = true;
                gate.graphic.destroy();
                ctx.updateInventory();
                statsEvents.emit(STAT.GATE_OPENED);
            }
            cx = nsx;
            cy = nsy;
            steps.push({ x: cx, y: cy });
        }

        if (steps.length === 0) {
            ctx.setMoving(false);
            return false;
        }

        const finalX = steps[steps.length - 1].x;
        const finalY = steps[steps.length - 1].y;
        ctx.setGrid(finalX, finalY);

        ctx.scene.tweens.add({
            targets: ctx.player,
            x: ctx.worldX(finalX),
            y: ctx.worldY(finalY),
            duration: 100 * steps.length,
            ease: 'Power3',
            onComplete: () => {
                ctx.setMoving(false);
                for (const s of steps) ctx.fog.revealAround(s.x, s.y, ctx.scene.time.now);
                ctx.collectKey();
                ctx.checkObjective();
                ctx.checkGoal();
            },
        });
        // Stretch effect for dash feel
        if (dx !== 0) {
            ctx.scene.tweens.add({ targets: ctx.player, scaleX: 1.4, scaleY: 0.7, yoyo: true, duration: 100 });
        } else {
            ctx.scene.tweens.add({ targets: ctx.player, scaleX: 0.7, scaleY: 1.4, yoyo: true, duration: 100 });
        }
        return true;
    },
};

const SWIM: Skill = {
    name: 'SWIM',
    label: 'swim — cross water!',
    isDirectional: false,
    cooldown: DEFAULT_COOLDOWN,

    activate(ctx) {
        if (ctx.setSwimming) {
            ctx.setSwimming(true);
            // 10s swimming buff — visual feedback handled in GameScene
            ctx.scene.time.delayedCall(10_000, () => {
                if (ctx.setSwimming) ctx.setSwimming(false);
            });
            // Ripple effect
            const ripple = ctx.scene.add.circle(
                ctx.player.x, ctx.player.y, TILE * 2,
                0x4090d0, 0.3,
            ).setDepth(2.8);
            ctx.scene.tweens.add({ targets: ripple, alpha: 0, scale: 2, duration: 600, onComplete: () => ripple.destroy() });
            return true;
        }
        return false;
    },

    tryDirectional: () => false,
};

const SKILLS: Record<SeasonName, Skill> = {
    Winter:   BURROW,
    Spring:   STING,
    Summer:   GLOW,
    Fall:     DASH,
    Tutorial: GLOW,
    WinterY2: SWIM,
};
