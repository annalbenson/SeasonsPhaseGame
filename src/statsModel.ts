// ── Firestore document shape for per-user stats ─────────────────────────────

export interface GridTimeEntry {
    totalMs: number;
    count:   number;
}

export interface MonthlyEntry {
    completed:  number;
    bestTimeMs: number;
}

export interface UserStats {
    displayName: string;

    // Lifetime totals
    mazesCompleted:          number;
    mazesCompletedHard:      number;
    customMapsPlayed:        number;
    totalDeaths:             number;
    totalCaught:             number;
    totalKeysCollected:      number;
    totalGatesOpened:        number;
    totalObjectivesCompleted:number;
    totalMonstersStunned:    number;
    skillUses: { BURROW: number; STING: number; GLOW: number; DASH: number };

    // Average time by grid size (sum + count for incremental updates)
    timeByGrid: Record<string, GridTimeEntry>;

    // Monthly best times
    monthly: Record<string, MonthlyEntry>;
}

/** Empty stats for first-time users / display fallback. */
export function emptyStats(): UserStats {
    return {
        displayName:              '',
        mazesCompleted:           0,
        mazesCompletedHard:       0,
        customMapsPlayed:         0,
        totalDeaths:              0,
        totalCaught:              0,
        totalKeysCollected:       0,
        totalGatesOpened:         0,
        totalObjectivesCompleted: 0,
        totalMonstersStunned:     0,
        skillUses: { BURROW: 0, STING: 0, GLOW: 0, DASH: 0 },
        timeByGrid: {},
        monthly:    {},
    };
}
