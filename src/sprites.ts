import Phaser from 'phaser';
import { SeasonTheme } from './seasons';
import { DEPTH } from './gameplay';

// ── Player sprite factory ─────────────────────────────────────────────────────
// Pure construction functions — no game state, just scene.add calls and tweens.

export function ensureSparkleTexture(scene: Phaser.Scene): void {
    if (!scene.textures.exists('sparkle')) {
        const g = scene.make.graphics({ add: false });
        g.fillStyle(0xffffff, 1);
        g.fillCircle(4, 4, 4);
        g.generateTexture('sparkle', 8, 8);
        g.destroy();
    }
}

export function createPlayerSprite(scene: Phaser.Scene, x: number, y: number, season: SeasonTheme): Phaser.GameObjects.Container {
    switch (season.name) {
        case 'Spring': return createBee(scene, x, y);
        case 'Fall':   return createSquirrel(scene, x, y);
        case 'Winter': return createBunny(scene, x, y);
        default:       return createFairy(scene, x, y, 0xffffaa);
    }
}

// ── Bee (Spring) ────────────────────────────────────────────────────────────

function createBee(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
    const glow   = scene.add.circle(0, 0, 22, 0xffdd00, 0.18);

    const wingL  = scene.add.ellipse(-17, 1, 22, 12, 0xccecff, 0.78);
    const wingR  = scene.add.ellipse( 17, 1, 22, 12, 0xccecff, 0.78);

    const body    = scene.add.ellipse(0,  3, 13, 20, 0xffdd00);
    const stripe1 = scene.add.ellipse(0, -1, 11,  5, 0x111100, 0.75);
    const stripe2 = scene.add.ellipse(0,  5, 11,  5, 0x111100, 0.75);
    const stinger = scene.add.ellipse(0, 14,  5,  8, 0x333300);

    const head   = scene.add.circle(0, -11, 7, 0xffcc00);
    const antL   = scene.add.circle(-5, -20, 2, 0x222200);
    const antR   = scene.add.circle( 5, -20, 2, 0x222200);

    const visual = scene.add.container(0, 0, [glow, wingL, wingR, body, stripe1, stripe2, stinger, head, antL, antR]);
    const outer  = scene.add.container(x, y, [visual]);

    scene.tweens.add({ targets: wingL, scaleX: 0.1, yoyo: true, repeat: -1, duration: 90, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: wingR, scaleX: 0.1, yoyo: true, repeat: -1, duration: 90, delay: 45, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: glow, alpha: { from: 0.08, to: 0.28 }, yoyo: true, repeat: -1, duration: 1200 });
    scene.tweens.add({ targets: visual, y: 4, yoyo: true, repeat: -1, duration: 800, ease: 'Sine.easeInOut' });

    return outer;
}

// ── Bunny (Winter) ──────────────────────────────────────────────────────────

function createBunny(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
    const white = 0xe8f4ff;

    const glow   = scene.add.circle(0, 0, 22, 0xddeeff, 0.22);

    const earL     = scene.add.ellipse(-9, -20, 8, 22, white);
    const earR     = scene.add.ellipse( 9, -20, 8, 22, white);
    const innerEarL = scene.add.ellipse(-9, -20, 4, 13, 0xffb8c8, 0.8);
    const innerEarR = scene.add.ellipse( 9, -20, 4, 13, 0xffb8c8, 0.8);

    const body   = scene.add.ellipse(0,  4, 20, 18, white);
    const head   = scene.add.circle( 0, -7,  9, 0xeef8ff);

    const tail   = scene.add.circle(0, 13, 6, 0xffffff);

    const eyeL   = scene.add.circle(-4, -9, 2.5, 0x224488);
    const eyeR   = scene.add.circle( 4, -9, 2.5, 0x224488);
    const nose   = scene.add.circle( 0, -5, 1.8, 0xffaacc);

    const visual = scene.add.container(0, 0, [glow, tail, earL, earR, innerEarL, innerEarR, body, head, eyeL, eyeR, nose]);
    const outer  = scene.add.container(x, y, [visual]);

    scene.tweens.add({ targets: [earL, innerEarL], angle: { from: -5, to: 5 }, yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: [earR, innerEarR], angle: { from:  5, to: -5 }, yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: glow, alpha: { from: 0.12, to: 0.32 }, yoyo: true, repeat: -1, duration: 1500 });
    scene.tweens.add({ targets: visual, y: 4, yoyo: true, repeat: -1, duration: 950, ease: 'Sine.easeInOut' });

    return outer;
}

// ── Squirrel (Fall) ─────────────────────────────────────────────────────────

function createSquirrel(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
    const brown   = 0xb05818;
    const tailCol = 0xd88030;
    const cream   = 0xffd090;

    const glow = scene.add.circle(0, 0, 22, tailCol, 0.15);

    const tailOuter = scene.add.ellipse(11, 3, 22, 28, tailCol);
    const tailInner = scene.add.ellipse(12, 2, 13, 20, 0xe8a050, 0.65);

    const body  = scene.add.ellipse(-2, 4, 16, 20, brown);
    const belly = scene.add.ellipse(-2, 5, 10, 13, cream, 0.4);

    const head  = scene.add.circle(-3, -8, 8, brown);

    const earL   = scene.add.ellipse(-9,  -14, 6, 8, brown);
    const earR   = scene.add.ellipse( 3,  -14, 6, 8, brown);
    const earLi  = scene.add.ellipse(-9,  -14, 3, 5, 0xffb8c8, 0.7);
    const earRi  = scene.add.ellipse( 3,  -14, 3, 5, 0xffb8c8, 0.7);

    const eyeL = scene.add.circle(-7, -10, 2.5, 0x331100);
    const eyeR = scene.add.circle( 0, -10, 2.5, 0x331100);
    const nose = scene.add.circle(-3,  -5, 1.8, 0x553322);

    const visual = scene.add.container(0, 0, [
        glow, tailOuter, tailInner,
        body, belly, head,
        earL, earR, earLi, earRi,
        eyeL, eyeR, nose,
    ]);
    const outer = scene.add.container(x, y, [visual]);

    scene.tweens.add({ targets: [tailOuter, tailInner], scaleY: { from: 1, to: 1.1 }, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: glow, alpha: { from: 0.08, to: 0.22 }, yoyo: true, repeat: -1, duration: 1400 });
    scene.tweens.add({ targets: visual, y: 4, yoyo: true, repeat: -1, duration: 850, ease: 'Sine.easeInOut' });

    return outer;
}

// ── Fairy (Summer / default) ────────────────────────────────────────────────

export function createFairy(scene: Phaser.Scene, x: number, y: number, glowColor = 0xdd88ff): Phaser.GameObjects.Container {
    const glow     = scene.add.circle(0, 0, 22, glowColor, 0.22);
    const wingL    = scene.add.ellipse(-14, -1, 18, 28, 0xbbddff, 0.72);
    const wingR    = scene.add.ellipse( 14, -1, 18, 28, 0xbbddff, 0.72);
    const body     = scene.add.ellipse(0, 4, 11, 16, 0xff88cc);
    const head     = scene.add.circle(0, -8, 7, 0xffddee);
    const antennaL = scene.add.circle(-5, -17, 2, 0xff99cc);
    const antennaR = scene.add.circle( 5, -17, 2, 0xff99cc);

    const visual = scene.add.container(0, 0, [glow, wingL, wingR, body, head, antennaL, antennaR]);
    const outer  = scene.add.container(x, y, [visual]);

    scene.tweens.add({ targets: wingL, scaleX: 0.15, yoyo: true, repeat: -1, duration: 105, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: wingR, scaleX: 0.15, yoyo: true, repeat: -1, duration: 105, delay: 52, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: glow, alpha: { from: 0.12, to: 0.38 }, yoyo: true, repeat: -1, duration: 1500, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: visual, y: 4, yoyo: true, repeat: -1, duration: 950, ease: 'Sine.easeInOut' });

    return outer;
}

// ── Objective sprites ───────────────────────────────────────────────────────

export function buildObjectiveSprite(scene: Phaser.Scene, cx: number, cy: number, seasonName: string): Phaser.GameObjects.Container {
    switch (seasonName) {
        case 'Spring': return buildFlowerSprite(scene, cx, cy);
        case 'Summer': return buildBerrySprite(scene, cx, cy);
        case 'Winter': return buildSnowflakeSprite(scene, cx, cy);
        default:       return buildAcornSprite(scene, cx, cy);
    }
}

function buildFlowerSprite(scene: Phaser.Scene, cx: number, cy: number): Phaser.GameObjects.Container {
    const palette = [0xffb7c5, 0xcc88ff, 0xffee88, 0xffffff, 0xffaadd];
    const pColor  = palette[Math.floor(Math.random() * palette.length)];
    const parts: Phaser.GameObjects.GameObject[] = [
        scene.add.circle(0, 0, 24, 0xffffff, 0.72),
    ];
    for (let i = 0; i < 5; i++) {
        const rad = (i * 72 * Math.PI) / 180;
        parts.push(
            scene.add.ellipse(Math.sin(rad) * 8, -Math.cos(rad) * 8, 7, 14, pColor, 0.9)
                .setAngle(i * 72),
        );
    }
    parts.push(scene.add.circle(0, 0, 5, 0xffe066));
    const c = scene.add.container(cx, cy, parts).setDepth(DEPTH.SPRITE);
    scene.tweens.add({ targets: c, scaleX: 1.1, scaleY: 1.1, yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.easeInOut' });
    return c;
}

function buildBerrySprite(scene: Phaser.Scene, cx: number, cy: number): Phaser.GameObjects.Container {
    const berryColors = [0xdd2244, 0xcc1133, 0xee3355];
    const parts: Phaser.GameObjects.GameObject[] = [
        scene.add.circle(0, 2, 24, 0xffffff, 0.72),
        // Three clustered berries
        scene.add.circle(-7, 2, 8, berryColors[0]),
        scene.add.circle( 7, 2, 8, berryColors[1]),
        scene.add.circle( 0, -6, 8, berryColors[2]),
        // Berry highlights
        scene.add.circle(-9, 0, 2.5, 0xff8899, 0.7),
        scene.add.circle( 5, 0, 2.5, 0xff8899, 0.7),
        scene.add.circle(-2, -8, 2.5, 0xff8899, 0.7),
        // Tiny leaf on top
        scene.add.ellipse(0, -14, 10, 5, 0x338822, 0.9),
        scene.add.ellipse(0, -12,  2, 6, 0x336622, 0.8),
    ];
    const c = scene.add.container(cx, cy, parts).setDepth(DEPTH.SPRITE);
    scene.tweens.add({ targets: c, scaleX: 1.08, scaleY: 1.08, yoyo: true, repeat: -1, duration: 1600, ease: 'Sine.easeInOut' });
    return c;
}

function buildAcornSprite(scene: Phaser.Scene, cx: number, cy: number): Phaser.GameObjects.Container {
    const parts: Phaser.GameObjects.GameObject[] = [
        scene.add.circle(0, 0, 24, 0xffffff, 0.72),
        scene.add.rectangle(0, -13,  3,  6, 0x5a3010),
        scene.add.ellipse(  0,  -7, 18, 10, 0x6b3f1e),
        scene.add.circle(  -5, -7,   2, 0x8b5e3c, 0.6),
        scene.add.circle(   5, -7,   2, 0x8b5e3c, 0.6),
        scene.add.ellipse(  0,   2, 16, 20, 0xc8852a),
        scene.add.ellipse( -4,  -1,  5, 10, 0xdda050, 0.5),
    ];
    const c = scene.add.container(cx, cy, parts).setDepth(DEPTH.SPRITE);
    scene.tweens.add({ targets: c, angle: { from: -6, to: 6 }, yoyo: true, repeat: -1, duration: 1200, ease: 'Sine.easeInOut' });
    return c;
}

function buildSnowflakeSprite(scene: Phaser.Scene, cx: number, cy: number): Phaser.GameObjects.Container {
    const parts: Phaser.GameObjects.GameObject[] = [
        scene.add.circle(0, 0, 22, 0xddeeff, 0.55),
    ];
    for (let i = 0; i < 6; i++) {
        const angleDeg = i * 60;
        const arm = scene.add.rectangle(0, -10, 3, 18, 0xffffff, 0.95).setAngle(angleDeg);
        const tip = scene.add.rectangle(0, -20, 4, 4, 0xddeeff, 0.9).setAngle(angleDeg + 45);
        parts.push(arm, tip);
    }
    parts.push(scene.add.circle(0, 0, 4, 0xffffff));
    const c = scene.add.container(cx, cy, parts).setDepth(DEPTH.SPRITE);
    scene.tweens.add({ targets: c, angle: 360, repeat: -1, duration: 8000, ease: 'Linear' });
    scene.tweens.add({ targets: c, y: cy - 6, yoyo: true, repeat: -1, duration: 1800, ease: 'Sine.easeInOut' });
    return c;
}
