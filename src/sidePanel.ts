import Phaser from 'phaser';
import { TILE, HEADER, PANEL } from './constants';
import { SeasonTheme, MonthConfig } from './seasons';
import { SkillManager } from './skills';
import { DEPTH } from './gameplay';

// ── Side panel and header — pure UI construction ─────────────────────────────

function spaced(text: string): string {
    return text.toUpperCase().split('').join(' ');
}

export interface SidePanelRefs {
    objText:       Phaser.GameObjects.Text;
    livesText:     Phaser.GameObjects.Text;
    inventoryText: Phaser.GameObjects.Text;
}

export function buildHeader(
    scene: Phaser.Scene,
    month: MonthConfig,
    offsetX: number,
    offsetY: number,
    mazeW: number,
): void {
    const hx = offsetX + mazeW / 2;
    const season = month.season;
    const accentHex = season.accentHex;

    scene.add.rectangle(hx, HEADER + offsetY - 1, mazeW, 1, season.uiAccent, 0.25).setDepth(DEPTH.PANEL);

    scene.add.text(hx, offsetY + 32, spaced(month.name), {
        fontSize:  '26px',
        fontStyle: 'bold',
        color:     accentHex,
    }).setOrigin(0.5).setDepth(DEPTH.PANEL);

    scene.add.text(hx, offsetY + 66, season.name, {
        fontSize: '15px',
        color:    `${accentHex}99`,
    }).setOrigin(0.5).setDepth(DEPTH.PANEL);

    scene.add.text(hx, offsetY + 94, `"${month.quote}" — ${month.author}`, {
        fontSize:  '14px',
        fontStyle: 'italic',
        color:     `${accentHex}66`,
    }).setOrigin(0.5).setDepth(DEPTH.PANEL);
}

export function buildSidePanel(
    scene: Phaser.Scene,
    season: SeasonTheme,
    cols: number,
    rows: number,
    offsetX: number,
    offsetY: number,
    skill: SkillManager,
): SidePanelRefs {
    const px    = offsetX + cols * TILE;
    const pw    = PANEL;
    const ph    = rows * TILE + HEADER;
    const py    = offsetY;
    const cx    = px + pw / 2;
    const depth = DEPTH.PANEL;

    const accent  = season.uiAccent;
    const accentH = season.accentHex;
    const dimH    = season.panelDimHex;

    const panelBg = (season.bgColor & 0xfefefe) + 0x0a0a0a;
    scene.add.rectangle(px + pw / 2, py + ph / 2, pw, ph, panelBg).setDepth(depth - 1);
    scene.add.rectangle(px + 1, py + ph / 2, 1, ph, accent, 0.2).setDepth(depth);

    // ── OBJECTIVES ──────────────────────────────────────────────────────────
    let y = py + HEADER + 22;

    scene.add.text(cx, y, 'OBJECTIVES', {
        fontSize: '14px', color: dimH, letterSpacing: 4,
    }).setOrigin(0.5).setDepth(depth);

    y += 26;
    const objText = scene.add.text(cx, y, '', {
        fontSize: '18px', color: accentH, align: 'center',
    }).setOrigin(0.5, 0).setDepth(depth);

    y += 44;
    // ── LIVES ───────────────────────────────────────────────────────────────
    scene.add.text(cx, y, 'LIVES', {
        fontSize: '14px', color: dimH, letterSpacing: 4,
    }).setOrigin(0.5).setDepth(depth);

    y += 24;
    const livesText = scene.add.text(cx, y, '', {
        fontSize: '20px', color: '#ff5577',
    }).setOrigin(0.5, 0).setDepth(depth);

    y += 40;
    // ── KEYS ────────────────────────────────────────────────────────────────
    scene.add.text(cx, y, 'KEYS', {
        fontSize: '14px', color: dimH, letterSpacing: 4,
    }).setOrigin(0.5).setDepth(depth);

    y += 24;
    const inventoryText = scene.add.text(cx, y, '', {
        fontSize: '20px', color: `#${season.keyColor.toString(16).padStart(6, '0')}`,
    }).setOrigin(0.5, 0).setDepth(depth);

    y += 40;
    // ── SKILL ───────────────────────────────────────────────────────────────
    scene.add.text(cx, y, 'SKILL', {
        fontSize: '14px', color: dimH, letterSpacing: 4,
    }).setOrigin(0.5).setDepth(depth);

    y += 24;
    skill.text = scene.add.text(cx, y, '', {
        fontSize: '16px', color: accentH, align: 'center',
    }).setOrigin(0.5, 0).setDepth(depth);
    skill.updateText(scene.time.now);

    // ── Divider ─────────────────────────────────────────────────────────────
    y += 44;
    scene.add.rectangle(cx, y, pw - 32, 1, accent, 0.2).setDepth(depth);

    // ── LEGEND ──────────────────────────────────────────────────────────────
    y += 20;
    scene.add.text(cx, y, 'LEGEND', {
        fontSize: '14px', color: dimH, letterSpacing: 4,
    }).setOrigin(0.5).setDepth(depth);

    y += 22;
    const lx = px + 20;
    const tx = px + 40;

    const enemyMap: Record<string, { color: number; label: string }> = {
        Spring: { color: 0x44aa22, label: 'frog — run!' },
        Summer: { color: 0xcc5500, label: 'snake — run!' },
        Fall:   { color: 0xdd5500, label: 'fox — run!' },
        Winter: { color: 0x6b4520, label: 'owl — run!' },
    };
    const enemy = enemyMap[season.name] ?? enemyMap.Summer;

    const hideMap: Record<string, { label: string; draw: (g: Phaser.GameObjects.Graphics, ly: number) => void }> = {
        Spring: {
            label: 'tall grass — hide!',
            draw: (g, ly) => {
                g.fillStyle(0x66bb33, 0.9); g.fillEllipse(lx + 4, ly - 2, 4, 10);
                g.fillStyle(0x88cc44, 0.9); g.fillEllipse(lx + 8, ly - 4, 4, 12);
                g.fillStyle(0x66bb33, 0.9); g.fillEllipse(lx + 12, ly - 1, 4, 9);
            },
        },
        Summer: {
            label: 'bush — hide!',
            draw: (g, ly) => {
                g.fillStyle(0x228844, 0.85); g.fillCircle(lx + 3, ly + 1, 5);
                g.fillStyle(0x228844, 0.85); g.fillCircle(lx + 11, ly + 1, 5);
                g.fillStyle(0x228844, 0.90); g.fillCircle(lx + 7, ly - 3, 6);
            },
        },
        Fall: {
            label: 'leaf pile — hide!',
            draw: (g, ly) => {
                g.fillStyle(0xd04010, 0.88); g.fillEllipse(lx + 3, ly, 6, 4);
                g.fillStyle(0xffaa00, 0.88); g.fillEllipse(lx + 8, ly - 2, 5, 4);
                g.fillStyle(0xe86820, 0.88); g.fillEllipse(lx + 12, ly + 1, 6, 4);
            },
        },
        Winter: {
            label: 'snow pile — hide!',
            draw: (g, ly) => {
                g.fillStyle(0xddeeff, 0.9); g.fillCircle(lx + 3, ly + 1, 5);
                g.fillStyle(0xe8f4ff, 0.85); g.fillCircle(lx + 11, ly + 1, 4);
                g.fillStyle(0xffffff, 0.95); g.fillCircle(lx + 7, ly - 2, 6);
            },
        },
    };
    const hide = hideMap[season.name] ?? hideMap.Summer;

    const objMap: Record<string, { color: number; label: string; draw: (g: Phaser.GameObjects.Graphics, ly: number) => void }> = {
        Spring: {
            color: 0xff88aa, label: 'flower — collect!',
            draw: (g, ly) => { g.fillStyle(0xff88aa, 0.9); g.fillCircle(lx + 7, ly, 5); g.fillStyle(0xffee44, 0.9); g.fillCircle(lx + 7, ly, 2); },
        },
        Summer: {
            color: 0xdd2244, label: 'berries — pick!',
            draw: (g, ly) => { g.fillStyle(0xdd2244, 0.9); g.fillCircle(lx + 5, ly, 4); g.fillCircle(lx + 11, ly, 4); },
        },
        Fall: {
            color: 0xc07030, label: 'acorn — plant!',
            draw: (g, ly) => { g.fillStyle(0xc07030, 0.9); g.fillCircle(lx + 7, ly, 5); },
        },
        Winter: {
            color: 0xddeeff, label: 'snowflake — collect!',
            draw: (g, ly) => { g.fillStyle(0xddeeff, 0.9); g.fillCircle(lx + 7, ly, 5); },
        },
    };
    const obj = objMap[season.name] ?? objMap.Spring;

    type LI = { label: string; draw: (g: Phaser.GameObjects.Graphics, ly: number) => void };
    const sceneryMap: Record<string, LI[]> = {
        Spring: [
            { label: 'boulder — go around!', draw: (g, ly) => { g.fillStyle(0x778877, 0.85); g.fillEllipse(lx + 7, ly, 12, 8); g.fillStyle(0x99aa99, 0.7); g.fillEllipse(lx + 6, ly - 1, 8, 5); } },
            { label: 'pond — go around!', draw: (g, ly) => { g.fillStyle(0x4477aa, 0.5); g.fillEllipse(lx + 7, ly, 14, 8); g.fillStyle(0x5599cc, 0.4); g.fillEllipse(lx + 5, ly - 1, 8, 5); } },
            { label: 'flowers — go around!', draw: (g, ly) => { g.fillStyle(0xff88bb, 0.8); g.fillCircle(lx + 3, ly, 3); g.fillStyle(0xffaa44, 0.8); g.fillCircle(lx + 9, ly - 2, 3); g.fillStyle(0xcc77ff, 0.8); g.fillCircle(lx + 6, ly + 2, 3); } },
        ],
        Summer: [
            { label: 'rock — go around!', draw: (g, ly) => { g.fillStyle(0x445544, 0.8); g.fillEllipse(lx + 7, ly, 12, 8); g.fillStyle(0x556655, 0.7); g.fillEllipse(lx + 5, ly - 1, 8, 5); } },
            { label: 'log — go around!', draw: (g, ly) => { g.fillStyle(0x5a3a1a, 0.75); g.fillEllipse(lx + 7, ly, 14, 5); g.fillStyle(0x6a4a2a, 0.7); g.fillCircle(lx + 1, ly, 2.5); } },
            { label: 'ferns — go around!', draw: (g, ly) => { g.fillStyle(0x2a7a3a, 0.65); g.fillEllipse(lx + 3, ly, 3, 8); g.fillEllipse(lx + 7, ly - 1, 3, 8); g.fillEllipse(lx + 11, ly, 3, 8); } },
        ],
        Fall: [
            { label: 'mushrooms — go around!', draw: (g, ly) => { g.fillStyle(0xeeddcc, 0.8); g.fillEllipse(lx + 5, ly + 2, 4, 8); g.fillStyle(0xcc3322, 0.8); g.fillEllipse(lx + 5, ly - 3, 10, 6); } },
            { label: 'stump — go around!', draw: (g, ly) => { g.fillStyle(0x5a3a1a, 0.8); g.fillEllipse(lx + 7, ly + 1, 12, 9); g.fillStyle(0x7a5a3a, 0.7); g.fillEllipse(lx + 7, ly - 1, 8, 6); } },
            { label: 'pumpkins — go around!', draw: (g, ly) => { g.fillStyle(0xdd7722, 0.8); g.fillEllipse(lx + 5, ly, 10, 8); g.fillStyle(0xcc6611, 0.75); g.fillEllipse(lx + 11, ly + 1, 7, 6); } },
        ],
        Winter: [
            { label: 'boulder — go around!', draw: (g, ly) => { g.fillStyle(0x556666, 0.8); g.fillEllipse(lx + 7, ly + 1, 14, 8); g.fillStyle(0x6a7a7a, 0.7); g.fillEllipse(lx + 5, ly - 1, 9, 5); } },
            { label: 'rocks — go around!', draw: (g, ly) => { g.fillStyle(0x4a5a5a, 0.8); g.fillEllipse(lx + 4, ly, 8, 6); g.fillStyle(0x5a6a6a, 0.75); g.fillEllipse(lx + 10, ly - 1, 7, 5); } },
            { label: 'stone slab — go around!', draw: (g, ly) => { g.fillStyle(0x4a5858, 0.8); g.fillEllipse(lx + 7, ly, 14, 6); g.fillStyle(0x5a6868, 0.7); g.fillEllipse(lx + 5, ly - 1, 10, 4); } },
        ],
    };
    const sceneryItems = sceneryMap[season.name] ?? sceneryMap.Summer;

    const skillMap: Record<string, { label: string; draw: (g: Phaser.GameObjects.Graphics, ly: number) => void }> = {
        Winter: {
            label: 'burrow — hide in place!',
            draw: (g, ly) => { g.fillStyle(0x8a7050, 0.9); g.fillEllipse(lx + 7, ly + 2, 14, 8); g.fillStyle(0xc8e4f4, 0.7); g.fillCircle(lx + 7, ly - 2, 4); },
        },
        Spring: {
            label: 'sting — stun enemy!',
            draw: (g, ly) => { g.fillStyle(0xffee22, 0.9); g.fillTriangle(lx + 3, ly - 6, lx + 7, ly + 6, lx + 11, ly - 6); },
        },
        Summer: {
            label: 'glow — reveal fog!',
            draw: (g, ly) => { g.fillStyle(0xaaffaa, 0.7); g.fillCircle(lx + 7, ly, 8); g.fillStyle(0xffffcc, 0.9); g.fillCircle(lx + 7, ly, 4); },
        },
        Fall: {
            label: 'dash — sprint 3!',
            draw: (g, ly) => { g.fillStyle(0xffcc88, 0.9); g.fillRect(lx, ly - 2, 4, 4); g.fillRect(lx + 5, ly - 2, 4, 4); g.fillRect(lx + 10, ly - 2, 4, 4); },
        },
    };
    const skillLegend = skillMap[season.name] ?? skillMap.Summer;

    const legendItems: { draw: (g: Phaser.GameObjects.Graphics, ly: number) => void; label: string }[] = [
        {
            label: 'you',
            draw: (g, ly) => { g.fillStyle(accent, 0.9); g.fillCircle(lx + 7, ly, 6); },
        },
        {
            label: enemy.label,
            draw: (g, ly) => { g.fillStyle(enemy.color, 0.9); g.fillCircle(lx + 7, ly, 6); },
        },
        hide,
        ...sceneryItems,
        obj,
        skillLegend,
        {
            label: 'key — collect!',
            draw: (g, ly) => {
                g.fillStyle(season.keyColor, 1);
                g.fillRect(lx + 2, ly - 5, 10, 10);
            },
        },
        {
            label: 'gate — unlock!',
            draw: (g, ly) => { g.fillStyle(season.gateColor, 1); g.fillRect(lx + 1, ly - 2, 13, 4); },
        },
        {
            label: 'goal — reach it!',
            draw: (g, ly) => { g.fillStyle(season.goalColor, 0.9); g.fillCircle(lx + 7, ly, 6); },
        },
    ];

    const gfx = scene.add.graphics().setDepth(depth);
    for (const item of legendItems) {
        item.draw(gfx, y + 7);
        scene.add.text(tx, y, item.label, {
            fontSize: '15px', color: dimH,
        }).setOrigin(0, 0).setDepth(depth);
        y += 24;
    }

    // ── Divider ─────────────────────────────────────────────────────────────
    y += 6;
    scene.add.rectangle(cx, y, pw - 32, 1, accent, 0.2).setDepth(depth);

    // ── Controls hint ───────────────────────────────────────────────────────
    y += 18;
    for (const line of ['SPACE  skill', 'R  new maze', 'M  menu', '↑↓←→  move', 'hold  slide']) {
        scene.add.text(cx, y, line, {
            fontSize: '14px', color: `#ffffff55`,
        }).setOrigin(0.5, 0).setDepth(depth);
        y += 17;
    }

    return { objText, livesText, inventoryText };
}
