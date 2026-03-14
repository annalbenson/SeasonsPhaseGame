// ── Lightweight event bus for stats collection ──────────────────────────────
// GameScene and skills emit events here; the stats service listens.

import Phaser from 'phaser';

export const statsEvents = new Phaser.Events.EventEmitter();

export const STAT = {
    MAZE_START:      'maze:start',
    MAZE_COMPLETE:   'maze:complete',
    DEATH:           'death',
    CAUGHT:          'caught',
    KEY_COLLECTED:   'key:collected',
    GATE_OPENED:     'gate:opened',
    OBJ_COMPLETED:   'obj:completed',
    MONSTER_STUNNED: 'monster:stunned',
    SKILL_USED:      'skill:used',
} as const;
