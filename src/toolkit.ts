// ── Custom map data — passed from ToolkitScene to GameScene ──────────────────

import { Cell } from './mazeUtils';

export interface CustomMapData {
    cols: number;
    rows: number;
    seasonName: 'Winter' | 'Spring' | 'Summer' | 'Fall' | 'Tutorial';
    cells: number[][];                      // wall bitmask grid
    start: Cell;
    goal: Cell;
    enemies: Cell[];
    bushes: Cell[];
    scenery: Cell[];                        // scenic obstacles
    objectives: Cell[];
    gates: { from: Cell; to: Cell }[];
    keys: Cell[];
}
