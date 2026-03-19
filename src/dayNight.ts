import Phaser from 'phaser';
import { FogOfWar } from './fog';
import { ZoneInfo } from './terrain';

// ── Time-of-day phases ──────────────────────────────────────────────────────

export const enum TimeOfDay { DAWN, MIDDAY, DUSK, NIGHT }

// ── DayNightCycle ───────────────────────────────────────────────────────────
// Manages the step-based day/night cycle: tint overlay, fog radius, day bar.
// Extracted from GameY2Scene to reduce scene size.

export class DayNightCycle {
    private stepCount = 0;
    private nightThreshold: number;
    private timeOfDay: TimeOfDay = TimeOfDay.DAWN;
    private baseFogRadius: number;
    private onRidge = false;
    private readonly ridgeFogBonus = 2;

    private scene: Phaser.Scene;
    private fog: FogOfWar;
    private zones: ZoneInfo[];

    private tintOverlay: Phaser.GameObjects.Rectangle | null = null;
    private tintTween: Phaser.Tweens.Tween | null = null;
    private dayBar: Phaser.GameObjects.Rectangle | null = null;
    private dayBarBg: Phaser.GameObjects.Rectangle | null = null;
    private dayIcon: Phaser.GameObjects.Text | null = null;

    constructor(
        scene: Phaser.Scene,
        fog: FogOfWar,
        zones: ZoneInfo[],
        nightThreshold: number,
        baseFogRadius: number,
    ) {
        this.scene = scene;
        this.fog = fog;
        this.zones = zones;
        this.nightThreshold = nightThreshold;
        this.baseFogRadius = baseFogRadius;
    }

    /** Bind the UI elements created by the side panel builder. */
    setUI(
        tintOverlay: Phaser.GameObjects.Rectangle,
        dayBar: Phaser.GameObjects.Rectangle,
        dayBarBg: Phaser.GameObjects.Rectangle,
        dayIcon: Phaser.GameObjects.Text,
    ) {
        this.tintOverlay = tintOverlay;
        this.dayBar = dayBar;
        this.dayBarBg = dayBarBg;
        this.dayIcon = dayIcon;
    }

    /** Current phase — used by energy drain to double cost at night. */
    getPhase(): TimeOfDay { return this.timeOfDay; }

    /** Whether player is currently on a ridge zone. */
    isOnRidge(): boolean { return this.onRidge; }

    // ── Step advancement ────────────────────────────────────────────────────

    /** Call after each player step to advance the clock. */
    advance() {
        this.stepCount++;
        const frac = this.stepCount / this.nightThreshold;

        let newPhase: TimeOfDay;
        if      (frac < 0.4)  newPhase = TimeOfDay.DAWN;
        else if (frac < 0.8)  newPhase = TimeOfDay.MIDDAY;
        else if (frac < 1.0)  newPhase = TimeOfDay.DUSK;
        else                  newPhase = TimeOfDay.NIGHT;

        if (newPhase !== this.timeOfDay) {
            this.timeOfDay = newPhase;
            this.applyTimeOfDay();
        }

        this.updateDayBar();
    }

    // ── Ridge lookout ───────────────────────────────────────────────────────

    /** Call after each step to check if player entered/left a ridge zone. */
    updateRidgeLookout(gridY: number, gridX: number, now: number) {
        const zone = this.zones.find(z => gridY >= z.startRow && gridY < z.startRow + z.height);
        const wasOnRidge = this.onRidge;
        this.onRidge = zone?.type === 'ridge';
        if (this.onRidge !== wasOnRidge) {
            this.updateFogRadius();
            if (this.onRidge) {
                this.fog.revealAround(gridX, gridY, now);
            }
        }
    }

    // ── Internals ───────────────────────────────────────────────────────────

    private applyTimeOfDay() {
        // Tint overlay
        if (this.tintOverlay) {
            let color: number, alpha: number;
            switch (this.timeOfDay) {
                case TimeOfDay.DAWN:   color = 0x000000; alpha = 0;    break;
                case TimeOfDay.MIDDAY: color = 0x000000; alpha = 0;    break;
                case TimeOfDay.DUSK:   color = 0x331800; alpha = 0.15; break;
                case TimeOfDay.NIGHT:  color = 0x000822; alpha = 0.35; break;
            }
            if (this.tintTween) {
                this.tintTween.stop();
                this.tintTween = null;
            }
            this.tintOverlay.setFillStyle(color, 1);
            this.tintTween = this.scene.tweens.add({
                targets: this.tintOverlay,
                alpha,
                duration: 1200,
                ease: 'Sine.easeInOut',
                onComplete: () => { this.tintTween = null; },
            });
        }

        this.updateFogRadius();

        // Day icon
        if (this.dayIcon) {
            switch (this.timeOfDay) {
                case TimeOfDay.DAWN:   this.dayIcon.setText('☀').setColor('#ffdd44'); break;
                case TimeOfDay.MIDDAY: this.dayIcon.setText('☀').setColor('#ffcc22'); break;
                case TimeOfDay.DUSK:   this.dayIcon.setText('☀').setColor('#ff8833'); break;
                case TimeOfDay.NIGHT:  this.dayIcon.setText('☽').setColor('#8899cc'); break;
            }
        }
    }

    /** Compute fog radius from time-of-day + ridge bonus. */
    private updateFogRadius() {
        let fogR: number;
        switch (this.timeOfDay) {
            case TimeOfDay.DAWN:   fogR = this.baseFogRadius;     break;
            case TimeOfDay.MIDDAY: fogR = this.baseFogRadius;     break;
            case TimeOfDay.DUSK:   fogR = Math.max(1, this.baseFogRadius - 1); break;
            case TimeOfDay.NIGHT:  fogR = 1;                       break;
        }
        if (this.onRidge) fogR += this.ridgeFogBonus;
        this.fog.setRevealRadius(fogR);
    }

    private updateDayBar() {
        if (!this.dayBar || !this.dayBarBg) return;
        const frac = Math.min(1, this.stepCount / this.nightThreshold);
        const fullW = this.dayBarBg.width;
        this.dayBar.width = fullW * (1 - frac);

        if (frac < 0.8) {
            const t = frac / 0.8;
            const r = Math.round(255 - t * 80);
            const g = Math.round(220 - t * 120);
            const b = Math.round(60  + t * 40);
            this.dayBar.setFillStyle(Phaser.Display.Color.GetColor(r, g, b));
        } else {
            const t = (frac - 0.8) / 0.2;
            const r = Math.round(175 - t * 100);
            const g = Math.round(100 - t * 50);
            const b = Math.round(100 + t * 100);
            this.dayBar.setFillStyle(Phaser.Display.Color.GetColor(r, g, b));
        }
    }
}
