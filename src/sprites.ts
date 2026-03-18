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

// ── Enemy sprite factory ────────────────────────────────────────────────────
// Shared by Hazard class and TutorialScene.

export function createEnemySprite(
    scene: Phaser.Scene, x: number, y: number, seasonName: string,
    depth = DEPTH.HAZARD,
): Phaser.GameObjects.Container {
    switch (seasonName) {
        case 'Spring':   return createFrog(scene, x, y, depth);
        case 'Fall':     return createFox(scene, x, y, depth);
        case 'Winter':   return createOwl(scene, x, y, depth);
        case 'WinterY2': return createWolf(scene, x, y, depth);
        default:         return createSnake(scene, x, y, depth); // Summer
    }
}

function createSnake(scene: Phaser.Scene, x: number, y: number, depth: number): Phaser.GameObjects.Container {
    const bodyCol  = 0xcc5500;
    const headCol  = 0xdd6600;
    const bellyCol = 0xffcc88;

    const danger = scene.add.circle(0, 0, 32, 0xcc2200, 0);
    const tail = scene.add.circle(-13, -10, 4, bodyCol);
    const s4   = scene.add.circle(-18,  -3, 6, bodyCol);
    const s3   = scene.add.circle(-17,   7, 7, bodyCol);
    const s2   = scene.add.circle(-11,  13, 8, bodyCol);
    const s1   = scene.add.circle( -4,   9, 9, bodyCol);

    const head  = scene.add.ellipse(0, 0, 20, 14, headCol);
    const belly = scene.add.ellipse(0, 1, 12,  7, bellyCol, 0.80);

    const eyeL = scene.add.circle(-5, -4, 2.5, 0xffffff);
    const pupL = scene.add.circle(-5, -4, 1.5, 0x111111);
    const eyeR = scene.add.circle( 4, -4, 2.5, 0xffffff);
    const pupR = scene.add.circle( 4, -4, 1.5, 0x111111);

    const tongue = scene.add.graphics();
    tongue.lineStyle(1.5, 0xee1111);
    tongue.strokeLineShape(new Phaser.Geom.Line( 7,  0, 13,  0));
    tongue.strokeLineShape(new Phaser.Geom.Line(13,  0, 17, -3));
    tongue.strokeLineShape(new Phaser.Geom.Line(13,  0, 17,  3));

    const visual = scene.add.container(0, 0, [
        danger, tail, s4, s3, s2, s1, head, belly,
        eyeL, pupL, eyeR, pupR, tongue,
    ]);
    const outer = scene.add.container(x, y, [visual]);
    outer.setDepth(depth);

    scene.tweens.add({ targets: tongue, alpha: { from: 1, to: 0 }, yoyo: true, repeat: -1, duration: 190 });
    scene.tweens.add({ targets: visual, angle: { from: -7, to: 7 }, yoyo: true, repeat: -1, duration: 1300, ease: 'Sine.easeInOut' });

    return outer;
}

function createFrog(scene: Phaser.Scene, x: number, y: number, depth: number): Phaser.GameObjects.Container {
    const green  = 0x44aa22;
    const dark   = 0x2a7a10;
    const belly  = 0x99cc44;

    const danger = scene.add.circle(0, 0, 32, 0xcc2200, 0);

    const legBL = scene.add.ellipse(-15, 14, 16, 8, dark, 0.85).setAngle(-35);
    const legBR = scene.add.ellipse( 15, 14, 16, 8, dark, 0.85).setAngle( 35);
    const legFL = scene.add.ellipse(-16, -5, 10, 6, dark, 0.8).setAngle(-20);
    const legFR = scene.add.ellipse( 16, -5, 10, 6, dark, 0.8).setAngle( 20);

    const body      = scene.add.circle(0, 4, 18, green);
    const bellySpot = scene.add.ellipse(0, 6, 22, 14, belly, 0.45);
    const head      = scene.add.circle(0, -10, 12, 0x55bb33);
    const mouth     = scene.add.ellipse(0, -4, 20, 5, dark, 0.65);
    const nosL      = scene.add.circle(-4, -12, 2, dark);
    const nosR      = scene.add.circle( 4, -12, 2, dark);

    const eyeL  = scene.add.circle(-14, -12, 8, 0xffffff);
    const eyeR  = scene.add.circle( 14, -12, 8, 0xffffff);
    const irisL = scene.add.circle(-14, -12, 5, 0xcc8800);
    const irisR = scene.add.circle( 14, -12, 5, 0xcc8800);
    const pupL  = scene.add.circle(-14, -12, 2.5, 0x111111);
    const pupR  = scene.add.circle( 14, -12, 2.5, 0x111111);

    const visual = scene.add.container(0, 0, [
        danger, legBL, legBR, legFL, legFR,
        body, bellySpot, head, mouth, nosL, nosR,
        eyeL, eyeR, irisL, irisR, pupL, pupR,
    ]);
    const outer = scene.add.container(x, y, [visual]);
    outer.setDepth(depth);

    scene.tweens.add({ targets: visual, y: { from: 0, to: -5 }, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: [eyeL, eyeR, irisL, irisR], scale: { from: 1, to: 1.12 }, yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.easeInOut' });

    return outer;
}

function createFox(scene: Phaser.Scene, x: number, y: number, depth: number): Phaser.GameObjects.Container {
    const orange = 0xdd5500;
    const light  = 0xee8833;
    const cream  = 0xffd090;
    const dark   = 0x221100;

    const danger = scene.add.circle(0, 0, 32, 0xcc2200, 0);

    const tail    = scene.add.ellipse(0, 17, 18, 14, light, 0.9);
    const tailTip = scene.add.circle(0, 23, 6, cream, 0.9);
    const body    = scene.add.ellipse(0, 3, 18, 22, orange);
    const belly   = scene.add.ellipse(0, 4, 10, 15, cream, 0.5);
    const pawBL   = scene.add.circle(-8, 13, 4, dark, 0.65);
    const pawBR   = scene.add.circle( 8, 13, 4, dark, 0.65);

    const head     = scene.add.ellipse(0, -8, 16, 14, orange);
    const snout    = scene.add.ellipse(0, -17, 8, 10, light);
    const nose     = scene.add.circle(0, -21, 3, dark);
    const muzzleL  = scene.add.ellipse(-6, -16, 7, 6, cream, 0.6);
    const muzzleR  = scene.add.ellipse( 6, -16, 7, 6, cream, 0.6);

    const earL  = scene.add.ellipse(-10, -13, 8, 12, orange);
    const earR  = scene.add.ellipse( 10, -13, 8, 12, orange);
    const earLi = scene.add.ellipse(-10, -13, 4,  7, dark, 0.45);
    const earRi = scene.add.ellipse( 10, -13, 4,  7, dark, 0.45);

    const eyeL = scene.add.circle(-6, -10, 2.5, 0xdd9900);
    const eyeR = scene.add.circle( 6, -10, 2.5, 0xdd9900);
    const pupL = scene.add.circle(-6, -10, 1.5, dark);
    const pupR = scene.add.circle( 6, -10, 1.5, dark);

    const pawFL = scene.add.circle(-7, -1, 3.5, dark, 0.55);
    const pawFR = scene.add.circle( 7, -1, 3.5, dark, 0.55);

    const visual = scene.add.container(0, 0, [
        danger, tail, tailTip,
        body, belly, pawBL, pawBR,
        head, muzzleL, muzzleR, snout, nose,
        earL, earR, earLi, earRi,
        eyeL, eyeR, pupL, pupR,
        pawFL, pawFR,
    ]);
    const outer = scene.add.container(x, y, [visual]);
    outer.setDepth(depth);

    scene.tweens.add({ targets: [tail, tailTip], angle: { from: -13, to: 13 }, yoyo: true, repeat: -1, duration: 1500, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: visual, y: { from: 0, to: -4 }, yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.easeInOut' });

    return outer;
}

function createOwl(scene: Phaser.Scene, x: number, y: number, depth: number): Phaser.GameObjects.Container {
    const brown  = 0x6b4520;
    const light  = 0x9a6840;
    const cream  = 0xe8dcc8;

    const danger = scene.add.circle(0, 0, 32, 0xcc2200, 0);

    const body  = scene.add.circle(0, 5, 18, brown);
    const wingL = scene.add.ellipse(-14, 6, 12, 22, light, 0.75);
    const wingR = scene.add.ellipse( 14, 6, 12, 22, light, 0.75);
    const tail  = scene.add.ellipse(0, 19, 18, 10, light, 0.9);
    const face  = scene.add.circle(0, -4, 13, cream);

    const tuftL = scene.add.ellipse(-8, -18, 7, 13, brown);
    const tuftR = scene.add.ellipse( 8, -18, 7, 13, brown);

    const eyeL   = scene.add.circle(-6, -6, 6, 0xffe060);
    const eyeR   = scene.add.circle( 6, -6, 6, 0xffe060);
    const pupL   = scene.add.circle(-6, -6, 3.5, 0x111111);
    const pupR   = scene.add.circle( 6, -6, 3.5, 0x111111);
    const glintL = scene.add.circle(-5, -7, 1.2, 0xffffff);
    const glintR = scene.add.circle( 7, -7, 1.2, 0xffffff);
    const beak   = scene.add.ellipse(0, -1, 9, 6, 0xcc8800);

    const visual = scene.add.container(0, 0, [
        danger, body, wingL, wingR, tail,
        face, tuftL, tuftR,
        eyeL, eyeR, pupL, pupR, glintL, glintR, beak,
    ]);
    const outer = scene.add.container(x, y, [visual]);
    outer.setDepth(depth);

    scene.tweens.add({ targets: visual, angle: { from: -12, to: 12 }, yoyo: true, repeat: -1, duration: 2600, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: [eyeL, eyeR], alpha: { from: 0.75, to: 1.0 }, yoyo: true, repeat: -1, duration: 1800, ease: 'Sine.easeInOut' });

    return outer;
}

function createWolf(scene: Phaser.Scene, x: number, y: number, depth: number): Phaser.GameObjects.Container {
    const grey   = 0x808898;
    const dark   = 0x404858;
    const light  = 0xb0b8c8;
    const white  = 0xd8dce8;

    const danger = scene.add.circle(0, 0, 32, 0xcc2200, 0);

    const tail    = scene.add.ellipse(0, 20, 12, 16, dark, 0.85);
    const tailTip = scene.add.circle(0, 27, 5, light, 0.9);
    const body    = scene.add.ellipse(0, 5, 22, 24, grey);
    const belly   = scene.add.ellipse(0, 8, 14, 16, white, 0.4);
    const pawBL   = scene.add.circle(-9, 16, 4, dark, 0.7);
    const pawBR   = scene.add.circle( 9, 16, 4, dark, 0.7);

    const head   = scene.add.ellipse(0, -10, 18, 16, grey);
    const snout  = scene.add.ellipse(0, -20, 10, 12, light);
    const nose   = scene.add.circle(0, -25, 3.5, 0x222222);

    const earL  = scene.add.triangle(-10, -22, 0, -10, -6, 0, 6, 0, grey);
    const earR  = scene.add.triangle( 10, -22, 0, -10, -6, 0, 6, 0, grey);
    const earLi = scene.add.triangle(-10, -21, 0, -7, -4, 0, 4, 0, dark, 0.5);
    const earRi = scene.add.triangle( 10, -21, 0, -7, -4, 0, 4, 0, dark, 0.5);

    const eyeL = scene.add.circle(-6, -12, 3, 0xddaa00);
    const eyeR = scene.add.circle( 6, -12, 3, 0xddaa00);
    const pupL = scene.add.circle(-6, -12, 1.8, 0x111111);
    const pupR = scene.add.circle( 6, -12, 1.8, 0x111111);

    const pawFL = scene.add.circle(-8, 0, 4, dark, 0.6);
    const pawFR = scene.add.circle( 8, 0, 4, dark, 0.6);

    const visual = scene.add.container(0, 0, [
        danger, tail, tailTip,
        body, belly, pawBL, pawBR,
        head, snout, nose,
        earL, earR, earLi, earRi,
        eyeL, eyeR, pupL, pupR,
        pawFL, pawFR,
    ]);
    const outer = scene.add.container(x, y, [visual]);
    outer.setDepth(depth);

    scene.tweens.add({ targets: visual, y: { from: 0, to: -5 }, yoyo: true, repeat: -1, duration: 1200, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: [tail, tailTip], angle: { from: -8, to: 8 }, yoyo: true, repeat: -1, duration: 1800, ease: 'Sine.easeInOut' });

    return outer;
}

// ── Year Two bear sprites ───────────────────────────────────────────────────

export function createY2PlayerSprite(
    scene: Phaser.Scene, x: number, y: number, seasonName: string,
): Phaser.GameObjects.Container {
    switch (seasonName) {
        case 'SpringY2':  return createBrownBear(scene, x, y);
        case 'SummerY2':  return createPanda(scene, x, y);
        case 'FallY2':    return createBlackBear(scene, x, y);
        default:          return createPolarBear(scene, x, y); // WinterY2
    }
}

function createPolarBear(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
    const white = 0xf0f4f8, cream = 0xd8dce0;
    const glow  = scene.add.circle(0, 0, 24, 0xaaccff, 0.15);
    const earL  = scene.add.circle(-12, -18, 6, cream);
    const earR  = scene.add.circle( 12, -18, 6, cream);
    const earLi = scene.add.circle(-12, -18, 3, 0x888888, 0.5);
    const earRi = scene.add.circle( 12, -18, 3, 0x888888, 0.5);
    const body  = scene.add.ellipse(0, 5, 26, 22, white);
    const head  = scene.add.circle(0, -8, 12, white);
    const snout = scene.add.ellipse(0, -3, 10, 7, cream);
    const nose  = scene.add.circle(0, -5, 3, 0x222222);
    const eyeL  = scene.add.circle(-5, -11, 2.5, 0x222244);
    const eyeR  = scene.add.circle( 5, -11, 2.5, 0x222244);
    const pawL  = scene.add.circle(-10, 14, 5, cream);
    const pawR  = scene.add.circle( 10, 14, 5, cream);
    const visual = scene.add.container(0, 0, [glow, earL, earR, earLi, earRi, body, head, snout, nose, eyeL, eyeR, pawL, pawR]);
    const outer  = scene.add.container(x, y, [visual]);
    scene.tweens.add({ targets: visual, y: 3, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: glow, alpha: { from: 0.08, to: 0.25 }, yoyo: true, repeat: -1, duration: 1500 });
    return outer;
}

function createBrownBear(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
    const brown = 0x8b5e3c, dark = 0x5a3a20, snoutCol = 0xc8a070;
    const glow  = scene.add.circle(0, 0, 24, 0xcc8844, 0.15);
    const earL  = scene.add.circle(-12, -18, 7, brown);
    const earR  = scene.add.circle( 12, -18, 7, brown);
    const earLi = scene.add.circle(-12, -18, 3.5, dark, 0.6);
    const earRi = scene.add.circle( 12, -18, 3.5, dark, 0.6);
    const body  = scene.add.ellipse(0, 5, 28, 24, brown);
    const belly = scene.add.ellipse(0, 8, 16, 14, snoutCol, 0.35);
    const head  = scene.add.circle(0, -8, 13, brown);
    const snout = scene.add.ellipse(0, -2, 12, 8, snoutCol);
    const nose  = scene.add.circle(0, -4, 3.5, 0x222222);
    const eyeL  = scene.add.circle(-5, -11, 2.5, 0x332211);
    const eyeR  = scene.add.circle( 5, -11, 2.5, 0x332211);
    const pawL  = scene.add.circle(-11, 15, 6, dark);
    const pawR  = scene.add.circle( 11, 15, 6, dark);
    const visual = scene.add.container(0, 0, [glow, earL, earR, earLi, earRi, body, belly, head, snout, nose, eyeL, eyeR, pawL, pawR]);
    const outer  = scene.add.container(x, y, [visual]);
    scene.tweens.add({ targets: visual, y: 3, yoyo: true, repeat: -1, duration: 1000, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: glow, alpha: { from: 0.08, to: 0.22 }, yoyo: true, repeat: -1, duration: 1400 });
    return outer;
}

function createPanda(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
    const white = 0xf0f0f0, black = 0x222222;
    const glow  = scene.add.circle(0, 0, 24, 0x88cc44, 0.15);
    const earL  = scene.add.circle(-13, -17, 7, black);
    const earR  = scene.add.circle( 13, -17, 7, black);
    const body  = scene.add.ellipse(0, 5, 26, 22, white);
    // Black shoulders
    const shoulderL = scene.add.ellipse(-10, 2, 14, 16, black, 0.85);
    const shoulderR = scene.add.ellipse( 10, 2, 14, 16, black, 0.85);
    const head  = scene.add.circle(0, -8, 13, white);
    // Eye patches
    const patchL = scene.add.ellipse(-6, -10, 8, 9, black);
    const patchR = scene.add.ellipse( 6, -10, 8, 9, black);
    const eyeL  = scene.add.circle(-6, -10, 2.5, 0xffffff);
    const eyeR  = scene.add.circle( 6, -10, 2.5, 0xffffff);
    const pupL  = scene.add.circle(-6, -10, 1.5, black);
    const pupR  = scene.add.circle( 6, -10, 1.5, black);
    const nose  = scene.add.circle(0, -4, 3, black);
    const pawL  = scene.add.circle(-10, 14, 5, black);
    const pawR  = scene.add.circle( 10, 14, 5, black);
    const visual = scene.add.container(0, 0, [
        glow, earL, earR, body, shoulderL, shoulderR,
        head, patchL, patchR, eyeL, eyeR, pupL, pupR, nose, pawL, pawR,
    ]);
    const outer = scene.add.container(x, y, [visual]);
    scene.tweens.add({ targets: visual, y: 3, yoyo: true, repeat: -1, duration: 950, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: glow, alpha: { from: 0.08, to: 0.22 }, yoyo: true, repeat: -1, duration: 1300 });
    return outer;
}

function createBlackBear(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
    const black = 0x2a2a30, dark = 0x1a1a20, snoutCol = 0x886644;
    const glow  = scene.add.circle(0, 0, 24, 0xf09838, 0.15);
    const earL  = scene.add.circle(-12, -18, 6, black);
    const earR  = scene.add.circle( 12, -18, 6, black);
    const earLi = scene.add.circle(-12, -18, 3, 0x443322, 0.5);
    const earRi = scene.add.circle( 12, -18, 3, 0x443322, 0.5);
    const body  = scene.add.ellipse(0, 5, 26, 22, black);
    // Tan chest patch (V-shape signature)
    const chest = scene.add.ellipse(0, 1, 10, 8, snoutCol, 0.5);
    const head  = scene.add.circle(0, -8, 12, black);
    const snout = scene.add.ellipse(0, -3, 10, 7, snoutCol);
    const nose  = scene.add.circle(0, -5, 3, 0x111111);
    const eyeL  = scene.add.circle(-5, -11, 2.5, 0xcc9944);
    const eyeR  = scene.add.circle( 5, -11, 2.5, 0xcc9944);
    const pawL  = scene.add.circle(-10, 14, 5, dark);
    const pawR  = scene.add.circle( 10, 14, 5, dark);
    const visual = scene.add.container(0, 0, [glow, earL, earR, earLi, earRi, body, chest, head, snout, nose, eyeL, eyeR, pawL, pawR]);
    const outer  = scene.add.container(x, y, [visual]);
    scene.tweens.add({ targets: visual, y: 3, yoyo: true, repeat: -1, duration: 950, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: glow, alpha: { from: 0.08, to: 0.22 }, yoyo: true, repeat: -1, duration: 1400 });
    return outer;
}

// ── Year Two objective sprites ──────────────────────────────────────────────

export function buildY2ObjectiveSprite(
    scene: Phaser.Scene, cx: number, cy: number, seasonName: string,
): Phaser.GameObjects.Container {
    switch (seasonName) {
        case 'SpringY2':  return buildHoneycombSprite(scene, cx, cy);
        case 'SummerY2':  return buildBambooSprite(scene, cx, cy);
        case 'FallY2':    return buildBerryBushSprite(scene, cx, cy);
        default:          return buildFishSprite(scene, cx, cy); // WinterY2
    }
}

function buildFishSprite(scene: Phaser.Scene, cx: number, cy: number): Phaser.GameObjects.Container {
    const parts: Phaser.GameObjects.GameObject[] = [
        scene.add.circle(0, 0, 22, 0xffffff, 0.60),
        // Body
        scene.add.ellipse(0, 0, 24, 14, 0xff8844),
        // Tail fin
        scene.add.triangle(14, 0, 0, -8, 0, 8, 10, 0, 0xee6622),
        // Eye
        scene.add.circle(-6, -2, 3, 0xffffff),
        scene.add.circle(-6, -2, 1.5, 0x111111),
        // Belly highlight
        scene.add.ellipse(0, 3, 16, 5, 0xffcc88, 0.6),
    ];
    const c = scene.add.container(cx, cy, parts).setDepth(DEPTH.SPRITE);
    scene.tweens.add({ targets: c, y: cy - 5, yoyo: true, repeat: -1, duration: 1200, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: c, angle: { from: -8, to: 8 }, yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.easeInOut' });
    return c;
}

function buildHoneycombSprite(scene: Phaser.Scene, cx: number, cy: number): Phaser.GameObjects.Container {
    const gold = 0xffcc22, dark = 0xcc8800;
    const parts: Phaser.GameObjects.GameObject[] = [
        scene.add.circle(0, 0, 22, 0xffffff, 0.60),
    ];
    // 7 hexagonal cells arranged in a honeycomb
    const offsets = [[0, 0], [-10, -6], [10, -6], [-10, 6], [10, 6], [0, -12], [0, 12]];
    for (const [ox, oy] of offsets) {
        parts.push(scene.add.circle(ox, oy, 6, gold, 0.9));
        parts.push(scene.add.circle(ox, oy, 3.5, dark, 0.5));
    }
    // Drip
    parts.push(scene.add.ellipse(4, 16, 4, 7, 0xffaa00, 0.8));
    const c = scene.add.container(cx, cy, parts).setDepth(DEPTH.SPRITE);
    scene.tweens.add({ targets: c, scaleX: 1.08, scaleY: 1.08, yoyo: true, repeat: -1, duration: 1500, ease: 'Sine.easeInOut' });
    return c;
}

function buildBambooSprite(scene: Phaser.Scene, cx: number, cy: number): Phaser.GameObjects.Container {
    const green = 0x66bb44, dark = 0x448822, light = 0x88dd66;
    const parts: Phaser.GameObjects.GameObject[] = [
        scene.add.circle(0, 0, 22, 0xffffff, 0.60),
        // Two bamboo stalks
        scene.add.rectangle(-5, 0, 6, 28, green),
        scene.add.rectangle( 5, 0, 6, 28, green),
        // Nodes
        scene.add.rectangle(-5, -6, 8, 3, dark, 0.7),
        scene.add.rectangle(-5,  6, 8, 3, dark, 0.7),
        scene.add.rectangle( 5, -3, 8, 3, dark, 0.7),
        scene.add.rectangle( 5,  9, 8, 3, dark, 0.7),
        // Leaves
        scene.add.ellipse(-14, -8, 12, 5, light, 0.8).setAngle(-30),
        scene.add.ellipse( 14, -4, 12, 5, light, 0.8).setAngle(25),
    ];
    const c = scene.add.container(cx, cy, parts).setDepth(DEPTH.SPRITE);
    scene.tweens.add({ targets: c, angle: { from: -4, to: 4 }, yoyo: true, repeat: -1, duration: 1600, ease: 'Sine.easeInOut' });
    return c;
}

function buildBerryBushSprite(scene: Phaser.Scene, cx: number, cy: number): Phaser.GameObjects.Container {
    const berries = [0xcc2244, 0xdd3355, 0xbb1133, 0xee4466];
    const leaf = 0x558822;
    const parts: Phaser.GameObjects.GameObject[] = [
        scene.add.circle(0, 0, 22, 0xffffff, 0.60),
        // Leaves
        scene.add.ellipse(-6, 4, 16, 10, leaf, 0.8).setAngle(-15),
        scene.add.ellipse( 6, 4, 16, 10, leaf, 0.8).setAngle(15),
        scene.add.ellipse( 0, -4, 14, 10, 0x447718, 0.7),
    ];
    // Berries scattered on top
    const berryPos = [[-5, -6], [5, -4], [-2, 2], [7, 1], [-8, -1], [2, -8]];
    for (let i = 0; i < berryPos.length; i++) {
        const [bx, by] = berryPos[i];
        parts.push(scene.add.circle(bx, by, 4, berries[i % berries.length]));
        parts.push(scene.add.circle(bx - 1, by - 1, 1.5, 0xff8899, 0.6));
    }
    const c = scene.add.container(cx, cy, parts).setDepth(DEPTH.SPRITE);
    scene.tweens.add({ targets: c, scaleX: 1.06, scaleY: 1.06, yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.easeInOut' });
    return c;
}

// ── Objective sprites (Year One) ────────────────────────────────────────────

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
