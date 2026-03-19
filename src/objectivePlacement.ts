import { Terrain, TerrainMap } from './terrain';

// ── Objective candidate finding ─────────────────────────────────────────────
// Pure functions extracted from GameY2Scene.spawnObjectives().
// No Phaser dependency — just terrain logic.

/** Adjacency helper — true if any neighbour is the given terrain type. */
function adjTo(grid: Terrain[][], col: number, row: number, cols: number, rows: number, t: Terrain): boolean {
    return [[0,-1],[0,1],[-1,0],[1,0]].some(([dc, dr]) => {
        const nc = col + dc!, nr = row + dr!;
        return nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === t;
    });
}

/** Find season-appropriate objective candidate cells. */
export function findObjectiveCandidates(
    terrain: TerrainMap,
    seasonName: string,
    startCol: number, startRow: number,
    goalCol: number, goalRow: number,
): { col: number; row: number }[] {
    const { grid, cols, rows, zones, landCells } = terrain;
    const notStartGoal = (c: { col: number; row: number }) =>
        !(c.col === startCol && c.row === startRow) &&
        !(c.col === goalCol  && c.row === goalRow);

    switch (seasonName) {
        case 'WinterY2': {
            // Fish spawn on WATER cells in water zones
            const candidates: { col: number; row: number }[] = [];
            for (const zone of zones) {
                if (zone.type !== 'water') continue;
                for (let r = zone.startRow; r < zone.startRow + zone.height; r++) {
                    for (let c = 0; c < cols; c++) {
                        if (grid[r][c] === Terrain.WATER) candidates.push({ col: c, row: r });
                    }
                }
            }
            return candidates;
        }
        case 'SpringY2':
            // Honey spawns on OPEN cells adjacent to TREE cells
            return landCells.filter(c =>
                notStartGoal(c) && grid[c.row][c.col] === Terrain.OPEN && adjTo(grid, c.col, c.row, cols, rows, Terrain.TREE),
            );
        case 'SummerY2':
            // Bamboo shoots spawn on OPEN cells adjacent to BAMBOO cells
            return landCells.filter(c =>
                notStartGoal(c) && grid[c.row][c.col] === Terrain.OPEN && adjTo(grid, c.col, c.row, cols, rows, Terrain.BAMBOO),
            );
        case 'FallY2': {
            // Berries spawn on OPEN cells in forest zones
            const candidates: { col: number; row: number }[] = [];
            for (const zone of zones) {
                if (zone.type !== 'forest') continue;
                for (const lc of landCells) {
                    if (lc.row >= zone.startRow && lc.row < zone.startRow + zone.height &&
                        grid[lc.row][lc.col] === Terrain.OPEN && notStartGoal(lc)) {
                        candidates.push(lc);
                    }
                }
            }
            return candidates;
        }
        default:
            return landCells.filter(c =>
                notStartGoal(c) && grid[c.row][c.col] === Terrain.OPEN,
            );
    }
}

/** Pick objectives spread across zones, then fill remaining from all candidates. */
export function pickObjectivePositions(
    candidates: { col: number; row: number }[],
    zones: { startRow: number; height: number }[],
    count: number,
): { col: number; row: number }[] {
    const picked: { col: number; row: number }[] = [];

    // One per zone that has candidates
    for (const zone of zones) {
        if (picked.length >= count) break;
        const inZone = candidates.filter(c =>
            c.row >= zone.startRow && c.row < zone.startRow + zone.height &&
            !picked.some(p => p.col === c.col && p.row === c.row),
        );
        if (inZone.length > 0) {
            picked.push(inZone[Math.floor(Math.random() * inZone.length)]);
        }
    }

    // Fill remaining
    const remaining = candidates.filter(c => !picked.some(p => p.col === c.col && p.row === c.row));
    while (picked.length < count && remaining.length > 0) {
        const idx = Math.floor(Math.random() * remaining.length);
        picked.push(remaining[idx]);
        remaining.splice(idx, 1);
    }

    return picked;
}

/** Pick bonus positions from unused candidates. */
export function pickBonusPositions(
    candidates: { col: number; row: number }[],
    usedPositions: { col: number; row: number }[],
    startCol: number, startRow: number,
    goalCol: number, goalRow: number,
    count: number,
): { col: number; row: number }[] {
    const usedKeys = new Set(usedPositions.map(p => `${p.col},${p.row}`));
    usedKeys.add(`${startCol},${startRow}`);
    usedKeys.add(`${goalCol},${goalRow}`);
    const bonusCandidates = candidates.filter(c => !usedKeys.has(`${c.col},${c.row}`));
    const shuffled = bonusCandidates.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
}
