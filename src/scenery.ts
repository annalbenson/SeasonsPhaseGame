import Phaser from 'phaser';
import { TILE } from './constants';

// ── Scenery rendering — bush hiding spots and scenic obstacles ────────────────
// Pure rendering functions. Take scene + container + position + season name,
// add Phaser game objects to the container.

export function drawBushAt(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Container,
    col: number, row: number,
    seasonName: string,
): void {
    const cx = col * TILE + TILE / 2;
    const cy = row * TILE + TILE / 2;

    if (seasonName === 'Fall') {
        const leafColors = [0xd04010, 0xe86820, 0xffaa00, 0xf0d020, 0xc06010, 0xa03008, 0xd4a010];
        const leaves = [
            { x: -10, y:  -4, w: 10, h: 16, a: -35 },
            { x:   4, y:  -8, w:  9, h: 15, a:  20 },
            { x:  10, y:   5, w: 11, h: 15, a: -55 },
            { x:  -5, y:   8, w: 10, h: 14, a:  40 },
            { x:  -1, y:  -1, w:  9, h: 14, a:  10 },
            { x:   8, y:  -3, w:  8, h: 13, a: -20 },
            { x:  -8, y:   3, w:  7, h: 12, a:  60 },
        ];
        for (const l of leaves) {
            const c = leafColors[Math.floor(Math.random() * leafColors.length)];
            layer.add(scene.add.ellipse(cx + l.x, cy + l.y, l.w, l.h, c, 0.88).setAngle(l.a));
        }
    } else if (seasonName === 'Winter') {
        layer.add([
            scene.add.circle(cx - 10, cy + 6, 10, 0xddeeff, 0.90),
            scene.add.circle(cx +  9, cy + 7,  9, 0xe8f4ff, 0.85),
            scene.add.circle(cx -  2, cy - 2, 13, 0xffffff, 0.95),
            scene.add.circle(cx +  5, cy - 5,  8, 0xf0f8ff, 0.80),
            scene.add.ellipse(cx, cy + 6, 30, 8, 0x8aaabb, 0.18),
        ]);
    } else if (seasonName === 'Spring') {
        const blades = [
            { x: -9,  h: 22, a: -12 },
            { x: -4,  h: 26, a:   5 },
            { x:  1,  h: 24, a:  -6 },
            { x:  6,  h: 20, a:  14 },
            { x: 11,  h: 23, a:  -3 },
            { x: -6,  h: 18, a:  20 },
            { x:  4,  h: 19, a: -18 },
        ];
        for (const b of blades) {
            const green = Math.random() < 0.5 ? 0x66bb33 : 0x88cc44;
            layer.add(
                scene.add.ellipse(cx + b.x, cy + 2, 5, b.h, green, 0.92).setAngle(b.a)
            );
            layer.add(
                scene.add.circle(
                    cx + b.x + Math.sin((b.a * Math.PI) / 180) * (b.h / 2 - 2),
                    cy + 2   - Math.cos((b.a * Math.PI) / 180) * (b.h / 2 - 2),
                    2.5, 0x558822, 0.85
                )
            );
        }
    } else {
        // Summer bushes
        layer.add([
            scene.add.circle(cx - 9, cy + 5, 11, 0x165a30, 0.92),
            scene.add.circle(cx + 9, cy + 5, 11, 0x165a30, 0.92),
            scene.add.circle(cx,     cy - 3, 13, 0x1a6636, 0.95),
            scene.add.circle(cx - 6, cy - 5, 3, 0xff6688, 0.9),
            scene.add.circle(cx + 7, cy + 2, 2.5, 0xffdd44, 0.9),
            scene.add.circle(cx + 1, cy - 7, 2.5, 0xff88aa, 0.85),
        ]);
    }
}

export function drawScenery(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Container,
    col: number, row: number,
    seasonName: string,
): void {
    const cx = col * TILE + TILE / 2;
    const cy = row * TILE + TILE / 2;
    const variant = Math.floor(Math.random() * 3);

    if (seasonName === 'Spring') {
        if (variant === 0) {
            layer.add(scene.add.ellipse(cx, cy + 4, 44, 32, 0x778877, 0.85));
            layer.add(scene.add.ellipse(cx - 2, cy - 2, 36, 26, 0x99aa99, 0.8));
            layer.add(scene.add.ellipse(cx + 8, cy - 8, 14, 8, 0x66aa44, 0.6));
            layer.add(scene.add.ellipse(cx - 10, cy - 6, 10, 6, 0x77bb55, 0.5));
        } else if (variant === 1) {
            layer.add(scene.add.ellipse(cx, cy, 46, 36, 0x4477aa, 0.5));
            layer.add(scene.add.ellipse(cx - 4, cy - 3, 30, 20, 0x5599cc, 0.4));
            layer.add(scene.add.ellipse(cx + 10, cy + 6, 8, 5, 0x77bbee, 0.3));
            layer.add(scene.add.circle(cx - 8, cy + 4, 5, 0x44aa44, 0.6));
        } else {
            const colors = [0xff88bb, 0xffaa44, 0xcc77ff, 0xff6688, 0xffdd55];
            for (let i = 0; i < 8; i++) {
                const fx = (Math.random() - 0.5) * 40;
                const fy = (Math.random() - 0.5) * 40;
                const c = colors[Math.floor(Math.random() * colors.length)];
                layer.add(scene.add.circle(cx + fx, cy + fy, 5, c, 0.8));
                layer.add(scene.add.circle(cx + fx, cy + fy, 2, 0xffee88, 0.9));
            }
        }
    } else if (seasonName === 'Summer') {
        if (variant === 0) {
            layer.add(scene.add.ellipse(cx + 6, cy + 6, 36, 28, 0x445544, 0.8));
            layer.add(scene.add.ellipse(cx - 6, cy - 2, 30, 24, 0x556655, 0.75));
            layer.add(scene.add.ellipse(cx, cy - 8, 20, 14, 0x668866, 0.7));
            layer.add(scene.add.ellipse(cx + 10, cy - 4, 12, 8, 0x448844, 0.6));
        } else if (variant === 1) {
            layer.add(scene.add.ellipse(cx, cy, 48, 16, 0x5a3a1a, 0.75).setAngle(Math.random() * 30 - 15));
            layer.add(scene.add.circle(cx - 20, cy, 8, 0x6a4a2a, 0.7));
            layer.add(scene.add.circle(cx + 20, cy, 7, 0x4a2a0a, 0.65));
            layer.add(scene.add.ellipse(cx + 4, cy - 6, 16, 6, 0x448844, 0.5));
        } else {
            for (let i = 0; i < 6; i++) {
                const a = (i * 60) + Math.random() * 20;
                const r = 6 + Math.random() * 6;
                layer.add(
                    scene.add.ellipse(cx + Math.cos(a * 0.017) * r, cy + Math.sin(a * 0.017) * r,
                        6, 24, 0x2a7a3a, 0.65).setAngle(a)
                );
            }
            layer.add(scene.add.circle(cx, cy, 6, 0x1a5a2a, 0.7));
        }
    } else if (seasonName === 'Fall') {
        if (variant === 0) {
            layer.add(scene.add.ellipse(cx - 10, cy + 8, 8, 18, 0xeeddcc, 0.8));
            layer.add(scene.add.ellipse(cx - 10, cy - 4, 22, 14, 0xcc3322, 0.8));
            layer.add(scene.add.circle(cx - 14, cy - 6, 2.5, 0xffeecc, 0.7));
            layer.add(scene.add.circle(cx - 6, cy - 8, 2, 0xffeecc, 0.7));
            layer.add(scene.add.ellipse(cx + 10, cy + 10, 6, 14, 0xeeddcc, 0.75));
            layer.add(scene.add.ellipse(cx + 10, cy + 2, 16, 10, 0xdd5533, 0.75));
            layer.add(scene.add.circle(cx + 8, cy + 1, 1.5, 0xffeecc, 0.6));
        } else if (variant === 1) {
            layer.add(scene.add.ellipse(cx, cy + 4, 40, 32, 0x5a3a1a, 0.8));
            layer.add(scene.add.ellipse(cx, cy - 4, 34, 26, 0x7a5a3a, 0.75));
            layer.add(scene.add.circle(cx, cy - 4, 10, 0x8a6a4a, 0.6));
            layer.add(scene.add.circle(cx, cy - 4, 5, 0x9a7a5a, 0.5));
        } else {
            layer.add(scene.add.ellipse(cx - 6, cy + 2, 28, 24, 0xdd7722, 0.8));
            layer.add(scene.add.ellipse(cx + 12, cy + 6, 20, 18, 0xcc6611, 0.75));
            layer.add(scene.add.ellipse(cx - 6, cy - 2, 4, 8, 0x338822, 0.7));
            layer.add(scene.add.ellipse(cx + 12, cy + 2, 3, 6, 0x338822, 0.65));
        }
    } else {
        // Winter
        if (variant === 0) {
            layer.add(scene.add.ellipse(cx + 2, cy + 4, 42, 30, 0x556666, 0.8));
            layer.add(scene.add.ellipse(cx - 2, cy - 2, 34, 24, 0x6a7a7a, 0.75));
            layer.add(scene.add.ellipse(cx + 6, cy - 8, 16, 10, 0x7a8a8a, 0.6));
            layer.add(scene.add.ellipse(cx - 4, cy - 10, 18, 5, 0xddeeff, 0.4));
        } else if (variant === 1) {
            layer.add(scene.add.ellipse(cx - 8, cy + 4, 26, 22, 0x4a5a5a, 0.8));
            layer.add(scene.add.ellipse(cx + 10, cy + 2, 22, 18, 0x5a6a6a, 0.75));
            layer.add(scene.add.ellipse(cx + 2, cy - 6, 18, 16, 0x6a7a7a, 0.7));
            layer.add(scene.add.ellipse(cx, cy + 8, 14, 4, 0xddeeff, 0.35));
        } else {
            layer.add(scene.add.ellipse(cx, cy + 2, 44, 24, 0x4a5858, 0.8));
            layer.add(scene.add.ellipse(cx - 2, cy - 2, 36, 18, 0x5a6868, 0.7));
            layer.add(scene.add.ellipse(cx - 6, cy, 16, 1.5, 0x3a4a4a, 0.5).setAngle(15));
            layer.add(scene.add.ellipse(cx + 8, cy + 2, 10, 1.5, 0x3a4a4a, 0.45).setAngle(-25));
            layer.add(scene.add.ellipse(cx + 4, cy - 6, 14, 4, 0xddeeff, 0.35));
        }
    }
}
