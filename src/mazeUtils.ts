import { WALLS, MOVE_DIRS } from './maze';

export { MOVE_DIRS };

export type Cell = { col: number; row: number };

export function solvePath(
    cells: number[][], cols: number, rows: number,
    startCol = 0, startRow = 0, endCol = cols - 1, endRow = rows - 1,
    blocked?: Set<string>,
): Cell[] {
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    const prev: (Cell | null)[][] = Array.from({ length: rows }, () => Array(cols).fill(null));
    const queue: Cell[] = [{ col: startCol, row: startRow }];
    visited[startRow][startCol] = true;

    while (queue.length > 0) {
        const { col, row } = queue.shift()!;
        if (col === endCol && row === endRow) break;
        for (const { dc, dr, wall } of MOVE_DIRS) {
            const nc = col + dc, nr = row + dr;
            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
            if (visited[nr][nc] || (cells[row][col] & wall)) continue;
            if (blocked?.has(`${nc},${nr}`)) continue;
            visited[nr][nc] = true;
            prev[nr][nc] = { col, row };
            queue.push({ col: nc, row: nr });
        }
    }

    if (!visited[endRow][endCol]) return [];   // unreachable
    const path: Cell[] = [];
    let cur: Cell | null = { col: endCol, row: endRow };
    while (cur) { path.unshift(cur); cur = prev[cur.row][cur.col]; }
    return path;
}

/**
 * Multi-source BFS: returns distance from each reachable cell to the nearest source.
 * Sources are given as "col,row" strings. Respects walls and optional blocked set.
 */
export function bfsDistanceMap(
    cells: number[][], cols: number, rows: number,
    sources: Set<string>, blocked?: Set<string>,
): Map<string, number> {
    const dist = new Map<string, number>();
    const queue: Cell[] = [];
    for (const src of sources) {
        dist.set(src, 0);
        const [c, r] = src.split(',').map(Number);
        queue.push({ col: c, row: r });
    }
    while (queue.length > 0) {
        const { col, row } = queue.shift()!;
        const d = dist.get(`${col},${row}`)!;
        for (const { dc, dr, wall } of MOVE_DIRS) {
            const nc = col + dc, nr = row + dr;
            const key = `${nc},${nr}`;
            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
            if (dist.has(key) || (cells[row][col] & wall)) continue;
            if (blocked?.has(key)) continue;
            dist.set(key, d + 1);
            queue.push({ col: nc, row: nr });
        }
    }
    return dist;
}

export function floodFill(
    cells: number[][], cols: number, rows: number,
    startCol: number, startRow: number, blocked?: Set<string>,
): Set<string> {
    const visited = new Set<string>();
    const queue: Cell[] = [{ col: startCol, row: startRow }];
    visited.add(`${startCol},${startRow}`);
    while (queue.length > 0) {
        const { col, row } = queue.shift()!;
        for (const { dc, dr, wall } of MOVE_DIRS) {
            const nc = col + dc, nr = row + dr;
            const key = `${nc},${nr}`;
            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
            if (visited.has(key) || (cells[row][col] & wall)) continue;
            if (blocked?.has(key)) continue;
            visited.add(key);
            queue.push({ col: nc, row: nr });
        }
    }
    return visited;
}
