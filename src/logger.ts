// ── Lightweight logger ──────────────────────────────────────────────────────
//
// Usage:  import { log } from './logger';
//         log.info('terrain', 'map generated', { cols: 14, rows: 45 });
//         log.warn('scene', 'BFS failed, using fallback');
//         log.error('scene', 'unexpected state', err);
//         log.debug('fog', 'reveal', { col: 3, row: 7 });
//
// Debug logs only appear when ?debug is in the URL or localStorage has 'debug'.
// All other levels always log.

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const STYLE: Record<Level, string> = {
    debug: 'color:#888',
    info:  'color:#4aa8d8',
    warn:  'color:#d4a017',
    error: 'color:#d44',
};

function isDebugEnabled(): boolean {
    try {
        if (typeof window !== 'undefined') {
            if (window.location.search.includes('debug')) return true;
            if (localStorage.getItem('debug')) return true;
        }
    } catch { /* SSR / restricted context */ }
    return false;
}

const minLevel: Level = isDebugEnabled() ? 'debug' : 'info';

function emit(level: Level, tag: string, msg: string, data?: unknown) {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel]) return;

    const prefix = `%c[${tag}]`;
    const style  = STYLE[level];
    const fn     = level === 'error' ? console.error
                 : level === 'warn'  ? console.warn
                 : console.log;

    if (data !== undefined) {
        fn(prefix, style, msg, data);
    } else {
        fn(prefix, style, msg);
    }
}

export const log = {
    debug: (tag: string, msg: string, data?: unknown) => emit('debug', tag, msg, data),
    info:  (tag: string, msg: string, data?: unknown) => emit('info',  tag, msg, data),
    warn:  (tag: string, msg: string, data?: unknown) => emit('warn',  tag, msg, data),
    error: (tag: string, msg: string, data?: unknown) => emit('error', tag, msg, data),
};
