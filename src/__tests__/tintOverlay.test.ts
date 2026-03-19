// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for the tint overlay lifecycle in GameY2Scene.
 *
 * The tint overlay is a full-screen rectangle that darkens the scene during
 * dusk/night. It uses two independent alpha values:
 *   - fillAlpha: set via setFillStyle(color, alpha)
 *   - gameObject.alpha: set via .alpha or .setAlpha(), and what tweens target
 *
 * Rendered opacity = fillAlpha × gameObject.alpha.
 *
 * The bug: fillAlpha started at 0 (from creation) while gameObject.alpha
 * defaulted to 1. The first setFillStyle(color, 1) made fillAlpha=1,
 * exposing gameObject.alpha=1 → full black flash before the tween kicked in.
 */

// ── Minimal Phaser mocks ────────────────────────────────────────────────────

class MockRectangle {
    x: number;
    y: number;
    width: number;
    height: number;
    fillColor: number;
    fillAlpha: number;
    alpha: number; // game object alpha — Phaser default is 1

    constructor(x: number, y: number, w: number, h: number, fillColor: number, fillAlpha: number) {
        this.x = x;
        this.y = y;
        this.width = w;
        this.height = h;
        this.fillColor = fillColor;
        this.fillAlpha = fillAlpha;
        this.alpha = 1; // Phaser default — THIS is what was causing the flash
    }

    setFillStyle(color: number, alpha?: number) {
        this.fillColor = color;
        if (alpha !== undefined) this.fillAlpha = alpha;
        else this.fillAlpha = 1; // Phaser behavior: omitting alpha resets to 1
        return this;
    }

    setAlpha(a: number) {
        this.alpha = a;
        return this;
    }

    setDepth(_d: number) { return this; }
    setScrollFactor(_s: number) { return this; }

    /** What the player sees: fill alpha × game object alpha. */
    get renderedOpacity() {
        return this.fillAlpha * this.alpha;
    }
}

interface TweenConfig {
    targets: MockRectangle;
    alpha: number;
    duration: number;
}

class MockTween {
    target: MockRectangle;
    toAlpha: number;
    stopped = false;

    constructor(config: TweenConfig) {
        this.target = config.targets;
        this.toAlpha = config.alpha;
    }

    /** Simulate the tween completing instantly. */
    complete() {
        if (!this.stopped) {
            this.target.alpha = this.toAlpha;
        }
    }

    stop() {
        this.stopped = true;
    }
}

// ── Simulate the overlay lifecycle ──────────────────────────────────────────

/** Reproduces the tint overlay logic from GameY2Scene. */
class TintOverlaySimulator {
    overlay: MockRectangle;
    tween: MockTween | null = null;
    timeOfDay: 'DAWN' | 'MIDDAY' | 'DUSK' | 'NIGHT' = 'DAWN';
    stepCount = 0;
    nightThreshold = 80;

    constructor(initGoAlpha: boolean) {
        // Matches GameY2Scene line 261-263
        this.overlay = new MockRectangle(0, 0, 100, 100, 0x000000, 0);
        // The fix: explicitly set gameObject.alpha to 0
        if (initGoAlpha) {
            this.overlay.alpha = 0;
        }
    }

    applyTimeOfDay() {
        const settings: Record<string, { color: number; alpha: number }> = {
            DAWN:   { color: 0x000000, alpha: 0 },
            MIDDAY: { color: 0x000000, alpha: 0 },
            DUSK:   { color: 0x331800, alpha: 0.15 },
            NIGHT:  { color: 0x000822, alpha: 0.35 },
        };
        const { color, alpha } = settings[this.timeOfDay];

        if (this.tween) {
            this.tween.stop();
            this.tween = null;
        }
        this.overlay.setFillStyle(color, 1);
        this.tween = new MockTween({ targets: this.overlay, alpha, duration: 1200 });
    }

    advanceDayClock() {
        this.stepCount++;
        const frac = this.stepCount / this.nightThreshold;

        let newPhase: 'DAWN' | 'MIDDAY' | 'DUSK' | 'NIGHT';
        if (frac < 0.4) newPhase = 'DAWN';
        else if (frac < 0.8) newPhase = 'MIDDAY';
        else if (frac < 1.0) newPhase = 'DUSK';
        else newPhase = 'NIGHT';

        if (newPhase !== this.timeOfDay) {
            this.timeOfDay = newPhase;
            this.applyTimeOfDay();
        }
    }

    /** Simulate N steps, checking rendered opacity never spikes. */
    simulateSteps(n: number): { maxOpacity: number; flashSteps: number[] } {
        let maxOpacity = this.overlay.renderedOpacity;
        const flashSteps: number[] = [];

        for (let i = 0; i < n; i++) {
            this.advanceDayClock();
            // Check opacity BEFORE tween completes (this is what the player sees)
            const opacityBeforeTween = this.overlay.renderedOpacity;
            if (opacityBeforeTween > maxOpacity) maxOpacity = opacityBeforeTween;
            if (opacityBeforeTween > 0.5) flashSteps.push(this.stepCount);
            // Then let the tween complete for next frame
            if (this.tween) this.tween.complete();
        }
        return { maxOpacity, flashSteps };
    }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('tint overlay lifecycle', () => {
    describe('BUG: without gameObject.alpha init', () => {
        it('flashes fully opaque on first phase transition (DAWN→MIDDAY)', () => {
            const sim = new TintOverlaySimulator(false); // no fix
            expect(sim.overlay.alpha).toBe(1);       // Phaser default
            expect(sim.overlay.fillAlpha).toBe(0);   // from creation
            expect(sim.overlay.renderedOpacity).toBe(0); // invisible at start

            // Advance to step 32 (40% of 80 threshold → DAWN→MIDDAY transition)
            sim.stepCount = 31;
            sim.advanceDayClock();

            // BEFORE tween completes — this is what the player sees for one frame
            // setFillStyle(0x000000, 1) set fillAlpha=1, gameObject.alpha is still 1
            expect(sim.overlay.fillAlpha).toBe(1);
            expect(sim.overlay.alpha).toBe(1);        // never was set to 0!
            expect(sim.overlay.renderedOpacity).toBe(1); // FULL BLACK FLASH
        });

        it('flash occurs on every phase transition', () => {
            const sim = new TintOverlaySimulator(false);
            const result = sim.simulateSteps(100);
            expect(result.flashSteps.length).toBeGreaterThan(0);
            expect(result.maxOpacity).toBe(1);
        });
    });

    describe('FIX: with gameObject.alpha init to 0', () => {
        it('no flash on first phase transition (DAWN→MIDDAY)', () => {
            const sim = new TintOverlaySimulator(true); // with fix
            expect(sim.overlay.alpha).toBe(0);        // explicitly set
            expect(sim.overlay.fillAlpha).toBe(0);    // from creation
            expect(sim.overlay.renderedOpacity).toBe(0);

            // Advance to DAWN→MIDDAY transition
            sim.stepCount = 31;
            sim.advanceDayClock();

            // setFillStyle(0x000000, 1) sets fillAlpha=1, but gameObject.alpha=0
            expect(sim.overlay.fillAlpha).toBe(1);
            expect(sim.overlay.alpha).toBe(0);
            expect(sim.overlay.renderedOpacity).toBe(0); // no flash
        });

        it('DUSK transition shows correct opacity (0.15), not a flash', () => {
            const sim = new TintOverlaySimulator(true);
            // Fast-forward through DAWN and MIDDAY
            sim.stepCount = 31;
            sim.advanceDayClock(); // → MIDDAY
            sim.tween?.complete();

            sim.stepCount = 63;
            sim.advanceDayClock(); // → DUSK

            // Before tween: fillAlpha=1, gameObject.alpha=0 (from MIDDAY tween)
            expect(sim.overlay.renderedOpacity).toBe(0);
            // After tween completes: gameObject.alpha → 0.15
            sim.tween?.complete();
            expect(sim.overlay.renderedOpacity).toBeCloseTo(0.15);
        });

        it('NIGHT transition shows correct opacity (0.35)', () => {
            const sim = new TintOverlaySimulator(true);

            // Walk through all phases
            sim.stepCount = 31;
            sim.advanceDayClock(); sim.tween?.complete(); // → MIDDAY, alpha=0

            sim.stepCount = 63;
            sim.advanceDayClock(); sim.tween?.complete(); // → DUSK, alpha=0.15

            sim.stepCount = 80;
            sim.advanceDayClock(); // → NIGHT

            // Before tween: fillAlpha=1, gameObject.alpha=0.15 (from DUSK)
            expect(sim.overlay.renderedOpacity).toBeCloseTo(0.15); // no spike
            // After tween: gameObject.alpha → 0.35
            sim.tween?.complete();
            expect(sim.overlay.renderedOpacity).toBeCloseTo(0.35);
        });

        it('no opacity spike above 0.5 across full day cycle', () => {
            const sim = new TintOverlaySimulator(true);
            const result = sim.simulateSteps(100);
            expect(result.flashSteps).toEqual([]);
            expect(result.maxOpacity).toBeLessThanOrEqual(0.35);
        });
    });

    describe('setFillStyle without alpha arg resets to 1', () => {
        it('omitting alpha in setFillStyle causes fillAlpha=1', () => {
            const rect = new MockRectangle(0, 0, 10, 10, 0x000000, 0);
            expect(rect.fillAlpha).toBe(0);
            rect.setFillStyle(0xff0000);
            expect(rect.fillAlpha).toBe(1); // Phaser behavior
        });
    });
});
