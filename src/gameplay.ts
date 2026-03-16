// ── Gameplay parameters ──────────────────────────────────────────────────────
// Central source of truth for tuning constants used across multiple files.

// ── Hazard behaviour ─────────────────────────────────────────────────────────
export const HUNT_DISTANCE      = 5;     // Manhattan distance to trigger hunting
export const PASSING_DISTANCE   = 6;     // Manhattan distance to trigger passing (hidden player nearby)
export const STUN_DURATION      = 5_000; // ms enemies are stunned by STING

// ── Hazard movement timing ──────────────────────────────────────────────────
export const HAZARD_HUNT_DELAY  = 900;   // ms between hunting moves
export const HAZARD_WANDER_MIN  = 1_500; // ms minimum between wander moves
export const HAZARD_WANDER_RAND = 600;   // ms random extra added to wander delay
export const HAZARD_HUNT_ANIM   = 820;   // ms hunting move animation
export const HAZARD_WANDER_ANIM = 1_400; // ms wandering move animation

// ── Player movement ─────────────────────────────────────────────────────────
export const PLAYER_MOVE_DURATION = 120; // ms per step animation

// ── Skill system ────────────────────────────────────────────────────────────
export const SKILL_COOLDOWN     = 15_000; // ms shared cooldown for all skills
export const GLOW_RADIUS        = 4;      // cells revealed by Summer GLOW
export const DASH_DISTANCE      = 3;      // cells moved by Fall DASH
export const SWIM_DURATION      = 10_000; // ms swimming buff lasts (Y2)

// ── Fog of war ──────────────────────────────────────────────────────────────
export const FOG_DECAY_START         = 30_000; // ms before fog returns (normal)
export const FOG_DECAY_DURATION      = 15_000; // ms to fade back to hidden (normal)
export const FOG_DECAY_START_HARD    = 10_000; // ms before fog returns (hard)
export const FOG_DECAY_DURATION_HARD =  8_000; // ms to fade back to hidden (hard)

// ── Depth layers ────────────────────────────────────────────────────────────
// Higher values render on top. Use these instead of magic numbers in setDepth().
export const DEPTH = {
    SCENERY:    1.2,   // snow caves, scenery blocks
    BUSH:       1.4,   // hiding spots (bushes, leaf piles)
    GOAL_LOCK:  1.6,   // lock overlay on goal tile
    SPRITE:     1.8,   // fish, player creatures (via sprites.ts)
    TRAIL:      1.9,   // player particle trail
    PLAYER:     2.0,   // player container
    FOG:        2.5,   // fog tiles
    WEATHER:    2.5,   // weather particles
    SKILL_FX:   2.8,   // skill visual effects (glow circle, swim aura)
    HAZARD:     3.0,   // enemy sprites (render above fog)
    PANEL_BG:   2.9,   // side panel / header background
    PANEL:      3.0,   // side panel text and graphics
    UI:       100.0,   // persistent HUD (UIScene overlay)
} as const;
