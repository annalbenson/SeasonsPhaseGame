import Phaser from 'phaser';
import { TILE, MAX_COLS, MAX_ROWS, HEADER } from './constants';

const W      = MAX_COLS * TILE + 260; // full canvas width including panel
const MAZE_H = MAX_ROWS * TILE;

// ── Texture helpers ───────────────────────────────────────────────────────────

function makeTexture(
    scene: Phaser.Scene,
    key: string,
    w: number,
    h: number,
    draw: (g: Phaser.GameObjects.Graphics) => void,
) {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ add: false });
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
}

function ensureTextures(scene: Phaser.Scene) {
    // Snowflake — soft white circle
    makeTexture(scene, 'snow', 6, 6, g => {
        g.fillStyle(0xffffff, 1);
        g.fillCircle(3, 3, 3);
    });

    // Raindrop — tall thin rectangle, slight alpha
    makeTexture(scene, 'raindrop', 2, 16, g => {
        g.fillStyle(0xffffff, 0.75);
        g.fillRect(0, 0, 2, 16);
    });

    // Heat particle — soft glow circle (tinted in emitter)
    makeTexture(scene, 'heatdot', 10, 10, g => {
        // Radial-ish gradient: bright centre, fades to transparent edge
        g.fillStyle(0xffffff, 0.9); g.fillCircle(5, 5, 2);
        g.fillStyle(0xffffff, 0.4); g.fillCircle(5, 5, 4);
        g.fillStyle(0xffffff, 0.1); g.fillCircle(5, 5, 5);
    });

    // Leaf — simple rounded-oval silhouette (tinted per particle)
    makeTexture(scene, 'leaf', 14, 18, g => {
        g.fillStyle(0xffffff, 1);
        g.fillEllipse(7, 9, 10, 16);
        // Little stem at base
        g.fillStyle(0xffffff, 0.6);
        g.fillRect(6, 15, 2, 4);
    });
}

// ── Snow (Winter) ─────────────────────────────────────────────────────────────

function addSnow(scene: Phaser.Scene) {
    // Distant layer — tiny, slow, drifts gently
    scene.add.particles(0, HEADER, 'snow', {
        x:         { min: 0,   max: W   },
        speedY:    { min: 25,  max: 55  },
        speedX:    { min: -10, max: 10  },
        scale:     { min: 0.1, max: 0.3 },
        alpha:     { min: 0.2, max: 0.5 },
        lifespan:  { min: 8000, max: 14000 },
        frequency: 200,
        quantity:  2,
    }).setDepth(1.5).setScrollFactor(0);

    // Near layer — larger, faster, falls over the player
    scene.add.particles(0, HEADER, 'snow', {
        x:         { min: 0,   max: W   },
        speedY:    { min: 60,  max: 105 },
        speedX:    { min: -20, max: 20  },
        scale:     { min: 0.3, max: 0.7 },
        alpha:     { min: 0.4, max: 0.85 },
        lifespan:  { min: 4000, max: 7000 },
        frequency: 350,
        quantity:  1,
    }).setDepth(2.5).setScrollFactor(0);
}

// ── Rain (Spring) ─────────────────────────────────────────────────────────────

function addRain(scene: Phaser.Scene) {
    // Main rain — fast diagonal drops
    scene.add.particles(0, HEADER, 'raindrop', {
        x:         { min: -40, max: W + 40 },
        speedY:    { min: 380, max: 520  },
        speedX:    { min: -30, max: -12  },   // blown slightly left
        rotate:    { min: 165, max: 175  },   // near-vertical tilt
        scale:     { min: 0.6, max: 1.3  },
        alpha:     { min: 0.2, max: 0.45 },
        lifespan:  { min: 1500, max: 2100 },
        frequency: 18,
        quantity:  3,
    }).setDepth(1.5).setScrollFactor(0);

    // Lighter mist layer — smaller, slower, more diffuse
    scene.add.particles(0, HEADER, 'raindrop', {
        x:         { min: 0,  max: W   },
        speedY:    { min: 200, max: 310 },
        speedX:    { min: -15, max: 0  },
        scale:     { min: 0.2, max: 0.5 },
        alpha:     { min: 0.1, max: 0.25 },
        lifespan:  { min: 2200, max: 3000 },
        frequency: 40,
        quantity:  2,
    }).setDepth(1.4).setScrollFactor(0);
}

// ── Heat shimmer (Summer) ─────────────────────────────────────────────────────

function addHeat(scene: Phaser.Scene) {
    // Rising shimmer particles from the maze floor
    scene.add.particles(0, MAZE_H + HEADER, 'heatdot', {
        x:         { min: 0,   max: W   },
        speedY:    { min: -15, max: -55 },
        speedX:    { min: -12, max: 12  },
        scale:     { start: 0.5, end: 0  },
        alpha:     { start: 0.4, end: 0  },
        lifespan:  { min: 2500, max: 5500 },
        frequency: 90,
        quantity:  2,
        tint:      [0xffee88, 0xffcc44, 0xffddaa, 0xffffff],
        blendMode: Phaser.BlendModes.ADD,
    }).setDepth(1.5).setScrollFactor(0);

    // Occasional bright sun-glint particles scattered mid-maze
    scene.add.particles(0, HEADER + MAZE_H * 0.5, 'heatdot', {
        x:         { min: 0,   max: W   },
        y:         { min: -MAZE_H * 0.45, max: MAZE_H * 0.45 },
        speedY:    { min: -8,  max: -20 },
        speedX:    { min: -5,  max: 5   },
        scale:     { start: 0.8, end: 0  },
        alpha:     { start: 0.55, end: 0 },
        lifespan:  { min: 800, max: 1600 },
        frequency: 280,
        quantity:  1,
        tint:      [0xffffff, 0xffffcc, 0xffee88],
        blendMode: Phaser.BlendModes.ADD,
    }).setDepth(1.5).setScrollFactor(0);
}

// ── Falling leaves (Fall) ─────────────────────────────────────────────────────

function addLeaves(scene: Phaser.Scene) {
    // Main leaf fall — tumbling, warm colours, irregular drift
    scene.add.particles(0, HEADER - 8, 'leaf', {
        x:         { min: -20, max: W + 20 },
        speedY:    { min: 35,  max: 85   },
        speedX:    { min: -45, max: 45   },
        rotate:    { min: 0,   max: 360  },     // random initial angle
        scale:     { min: 0.45, max: 1.0 },
        alpha:     { min: 0.65, max: 0.95 },
        tint:      [0xf09838, 0xc06818, 0xe84010, 0xd4b020, 0xb83808, 0xe86820],
        lifespan:  { min: 5000, max: 9000 },
        frequency: 420,
        quantity:  1,
    }).setDepth(1.5).setScrollFactor(0);

    // Lighter scattered wisp — smaller leaves, faster horizontal movement
    scene.add.particles(0, HEADER - 5, 'leaf', {
        x:         { min: 0,   max: W   },
        speedY:    { min: 20,  max: 50  },
        speedX:    { min: -70, max: 70  },
        rotate:    { min: 0,   max: 360 },
        scale:     { min: 0.2, max: 0.45 },
        alpha:     { min: 0.35, max: 0.65 },
        tint:      [0xf09838, 0xe08030, 0xd4a020],
        lifespan:  { min: 4000, max: 7000 },
        frequency: 600,
        quantity:  1,
    }).setDepth(1.5).setScrollFactor(0);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function addWeather(scene: Phaser.Scene, seasonName: string) {
    ensureTextures(scene);

    switch (seasonName) {
        case 'Winter':   addSnow(scene);   break;
        case 'WinterY2': addSnow(scene);   break;
        case 'Spring':   addRain(scene);   break;
        case 'SpringY2': addRain(scene);   break;
        case 'Summer':   addHeat(scene);   break;
        case 'SummerY2': addHeat(scene);   break;
        case 'Fall':     addLeaves(scene); break;
        case 'FallY2':   addLeaves(scene); break;
    }
}
