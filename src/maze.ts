// ── Shared primitives ─────────────────────────────────────────────────────────

export const WALLS = { TOP: 1, RIGHT: 2, BOTTOM: 4, LEFT: 8 } as const;

const ALL_WALLS = WALLS.TOP | WALLS.RIGHT | WALLS.BOTTOM | WALLS.LEFT;

export const OPPOSITE: Record<number, number> = {
    [WALLS.TOP]:    WALLS.BOTTOM,
    [WALLS.RIGHT]:  WALLS.LEFT,
    [WALLS.BOTTOM]: WALLS.TOP,
    [WALLS.LEFT]:   WALLS.RIGHT,
};

const DIRS = [
    { dc:  0, dr: -1, wall: WALLS.TOP    },
    { dc:  1, dr:  0, wall: WALLS.RIGHT  },
    { dc:  0, dr:  1, wall: WALLS.BOTTOM },
    { dc: -1, dr:  0, wall: WALLS.LEFT   },
];

function blank(cols: number, rows: number) {
    return Array.from({ length: rows }, () => Array(cols).fill(ALL_WALLS)) as number[][];
}

function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ── Algorithm 1: Recursive Backtracker (DFS) ──────────────────────────────────
// A single explorer carves a path until stuck, then backtracks.
// Result: long winding corridors, relatively few dead ends.
function generateDFS(cols: number, rows: number): number[][] {
    const cells   = blank(cols, rows);
    const visited = blank(cols, rows).map(r => r.map(() => false));

    function carve(col: number, row: number) {
        visited[row][col] = true;
        for (const { dc, dr, wall } of shuffle(DIRS)) {
            const nc = col + dc, nr = row + dr;
            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
            if (visited[nr][nc]) continue;
            cells[row][col] &= ~wall;
            cells[nr][nc]   &= ~OPPOSITE[wall];
            carve(nc, nr);          // recurse — the call stack IS the backtracker
        }
    }

    carve(0, 0);
    return cells;
}

// ── Algorithm 2: Randomized Prim's ────────────────────────────────────────────
// Grows the maze outward from a seed cell using a random frontier list.
// Result: lots of short dead ends, more "bushy" branching than DFS.
function generatePrims(cols: number, rows: number): number[][] {
    const cells  = blank(cols, rows);
    const inMaze = Array.from({ length: rows }, () => Array(cols).fill(false)) as boolean[][];

    type F = { col: number; row: number; fromCol: number; fromRow: number; wall: number };
    const frontier: F[] = [];

    function visit(col: number, row: number) {
        inMaze[row][col] = true;
        for (const { dc, dr, wall } of DIRS) {
            const nc = col + dc, nr = row + dr;
            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
            if (!inMaze[nr][nc]) frontier.push({ col: nc, row: nr, fromCol: col, fromRow: row, wall });
        }
    }

    visit(0, 0);

    while (frontier.length > 0) {
        // Pull a random candidate — this is what makes it Prim's instead of BFS
        const idx = Math.floor(Math.random() * frontier.length);
        const { col, row, fromCol, fromRow, wall } = frontier.splice(idx, 1)[0];

        if (inMaze[row][col]) continue; // already absorbed while in the frontier list

        cells[fromRow][fromCol] &= ~wall;
        cells[row][col]         &= ~OPPOSITE[wall];
        visit(col, row);
    }

    return cells;
}

// ── Algorithm 3: Binary Tree ──────────────────────────────────────────────────
// For every cell: randomly carve north OR east. No backtracking, no bookkeeping.
// Result: trivially simple code, but a strong structural bias — the top row and
// rightmost column always become unbroken corridors. Notice it when you play.
function generateBinaryTree(cols: number, rows: number): number[][] {
    const cells = blank(cols, rows);

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const canNorth = row > 0;
            const canEast  = col < cols - 1;

            if (canNorth && canEast) {
                if (Math.random() < 0.5) {
                    cells[row][col]     &= ~WALLS.TOP;
                    cells[row - 1][col] &= ~WALLS.BOTTOM;
                } else {
                    cells[row][col]     &= ~WALLS.RIGHT;
                    cells[row][col + 1] &= ~WALLS.LEFT;
                }
            } else if (canNorth) {
                cells[row][col]     &= ~WALLS.TOP;
                cells[row - 1][col] &= ~WALLS.BOTTOM;
            } else if (canEast) {
                cells[row][col]     &= ~WALLS.RIGHT;
                cells[row][col + 1] &= ~WALLS.LEFT;
            }
            // top-right corner: neither direction available — the bias "sink"
        }
    }

    return cells;
}

// ── Algorithm 4: Kruskal's ────────────────────────────────────────────────────
// Treats every cell as its own component. Shuffles all internal walls, then
// removes each wall only if it joins two different components (union-find).
// Result: uniform texture, no directional bias, visually balanced.
function generateKruskals(cols: number, rows: number): number[][] {
    const cells = blank(cols, rows);

    // Union-Find with path compression
    const parent = Array.from({ length: rows * cols }, (_, i) => i);
    function find(x: number): number {
        if (parent[x] !== x) parent[x] = find(parent[x]);
        return parent[x];
    }
    function union(a: number, b: number): boolean {
        const pa = find(a), pb = find(b);
        if (pa === pb) return false; // same set — removing this wall would create a loop
        parent[pa] = pb;
        return true;
    }
    const id = (col: number, row: number) => row * cols + col;

    // Build every internal wall as an edge (RIGHT and BOTTOM covers each edge once)
    type Edge = { col: number; row: number; wall: number; nc: number; nr: number };
    const edges: Edge[] = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            if (col < cols - 1) edges.push({ col, row, wall: WALLS.RIGHT,  nc: col + 1, nr: row     });
            if (row < rows - 1) edges.push({ col, row, wall: WALLS.BOTTOM, nc: col,     nr: row + 1 });
        }
    }

    // Shuffle then greedily remove walls that connect separate components
    for (let i = edges.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [edges[i], edges[j]] = [edges[j], edges[i]];
    }
    for (const { col, row, wall, nc, nr } of edges) {
        if (union(id(col, row), id(nc, nr))) {
            cells[row][col] &= ~wall;
            cells[nr][nc]   &= ~OPPOSITE[wall];
        }
    }

    return cells;
}

// ── Corridor widener ──────────────────────────────────────────────────────────
// Post-process pass: finds pairs of adjacent parallel passages and occasionally
// removes the wall between them, creating 2-tile-wide sections.
// Only ever removes walls, so the maze stays fully connected and solvable.
//
// How it works:
//   Horizontal wide: cell (col, row) and (col, row+1) both have a RIGHT passage
//     → remove the BOTTOM/TOP wall between them → a 2-high horizontal corridor
//   Vertical wide: cell (col, row) and (col+1, row) both have a BOTTOM passage
//     → remove the RIGHT/LEFT wall between them → a 2-wide vertical corridor
//
// `chance` (0–1): fraction of qualifying wall pairs that become openings.
// ~0.13 gives roughly 6–10 wide spots on a 10×10 grid — enough to feel organic.

export function widenCorridors(
    cells:  number[][],
    cols:   number,
    rows:   number,
    chance: number = 0.13,
): Set<string> {
    // Returns "col,row" keys for every cell that gained an extra opening —
    // GameScene uses these to decide where to place bushes.
    const widened = new Set<string>();

    // Horizontal 2-wide sections (remove vertical wall between two rows)
    for (let row = 0; row < rows - 1; row++) {
        for (let col = 0; col < cols; col++) {
            if (
                !(cells[row][col]     & WALLS.RIGHT) &&
                !(cells[row + 1][col] & WALLS.RIGHT) &&
                Math.random() < chance
            ) {
                cells[row][col]     &= ~WALLS.BOTTOM;
                cells[row + 1][col] &= ~WALLS.TOP;
                widened.add(`${col},${row}`);
                widened.add(`${col},${row + 1}`);
            }
        }
    }

    // Vertical 2-wide sections (remove horizontal wall between two columns)
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols - 1; col++) {
            if (
                !(cells[row][col]     & WALLS.BOTTOM) &&
                !(cells[row][col + 1] & WALLS.BOTTOM) &&
                Math.random() < chance
            ) {
                cells[row][col]     &= ~WALLS.RIGHT;
                cells[row][col + 1] &= ~WALLS.LEFT;
                widened.add(`${col},${row}`);
                widened.add(`${col + 1},${row}`);
            }
        }
    }

    return widened;
}

// ── Algorithm registry ────────────────────────────────────────────────────────
// To add a new algorithm: add one entry here. The menu picks it up automatically.

export type AlgorithmKey = 'dfs' | 'prims' | 'binary' | 'kruskals';

export const ALGORITHMS: Record<AlgorithmKey, {
    name: string;
    description: string;
    color: number;
    generate: (cols: number, rows: number) => number[][];
}> = {
    dfs:      { name: 'Recursive Backtracker', description: 'Long winding corridors, few dead ends',  color: 0x6b9e8a, generate: generateDFS        },
    prims:    { name: "Prim's Algorithm",      description: 'Bushy — many short dead ends',           color: 0x7a9ebb, generate: generatePrims      },
    binary:   { name: 'Binary Tree',           description: 'Fastest, but notice the top-row bias',   color: 0xc07850, generate: generateBinaryTree  },
    kruskals: { name: "Kruskal's Algorithm",   description: 'Uniform feel, no directional bias',      color: 0x9e7abb, generate: generateKruskals    },
};
