// ── Stats service — collects in-memory, flushes to Firestore ────────────────

import { doc, setDoc, getDoc, increment, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { getUserId, getDisplayName } from './auth';
import { statsEvents, STAT } from './statsEmitter';
import { type UserStats, emptyStats } from './statsModel';

// ── In-memory session ────────────────────────────────────────────────────────
interface MazeSession {
    month:    number;
    gridSize: string;
    hard:     boolean;
    custom:   boolean;
    startTime: number;
    keysCollected:        number;
    gatesOpened:          number;
    objectivesCompleted:  number;
    monstersStunned:      number;
    timesCaught:          number;
    skillUses: Record<string, number>;
}

let session: MazeSession | null = null;

// ── Event listeners (called once at app startup) ────────────────────────────
export function initStats() {
    statsEvents.on(STAT.MAZE_START, (data: { month: number; gridSize: string; hard: boolean; custom: boolean }) => {
        session = {
            ...data,
            startTime:           Date.now(),
            keysCollected:       0,
            gatesOpened:         0,
            objectivesCompleted: 0,
            monstersStunned:     0,
            timesCaught:         0,
            skillUses:           { HOP: 0, STING: 0, GLOW: 0, DASH: 0 },
        };
    });

    statsEvents.on(STAT.KEY_COLLECTED,   () => { if (session) session.keysCollected++; });
    statsEvents.on(STAT.GATE_OPENED,     () => { if (session) session.gatesOpened++; });
    statsEvents.on(STAT.OBJ_COMPLETED,   () => { if (session) session.objectivesCompleted++; });
    statsEvents.on(STAT.MONSTER_STUNNED, () => { if (session) session.monstersStunned++; });
    statsEvents.on(STAT.CAUGHT,          () => { if (session) session.timesCaught++; });

    statsEvents.on(STAT.SKILL_USED, (data: { skill: string }) => {
        if (session && data.skill in session.skillUses) {
            session.skillUses[data.skill]++;
        }
    });

    statsEvents.on(STAT.MAZE_COMPLETE, () => flushComplete());
    statsEvents.on(STAT.DEATH,         () => flushDeath());
}

// ── Flush to Firestore ──────────────────────────────────────────────────────
async function flushComplete() {
    const uid = getUserId();
    if (!uid || !session) return;

    const elapsed = Date.now() - session.startTime;
    const yearMonth = new Date().toISOString().slice(0, 7);

    try {
        const ref = doc(db, 'users', uid);

        const updates: Record<string, unknown> = {
            displayName:              getDisplayName() ?? '',
            lastPlayed:               Timestamp.now(),
            mazesCompleted:           increment(1),
            totalKeysCollected:       increment(session.keysCollected),
            totalGatesOpened:         increment(session.gatesOpened),
            totalObjectivesCompleted: increment(session.objectivesCompleted),
            totalMonstersStunned:     increment(session.monstersStunned),
            totalCaught:              increment(session.timesCaught),
            'skillUses.HOP':          increment(session.skillUses['HOP'] ?? 0),
            'skillUses.STING':        increment(session.skillUses['STING'] ?? 0),
            'skillUses.GLOW':         increment(session.skillUses['GLOW'] ?? 0),
            'skillUses.DASH':         increment(session.skillUses['DASH'] ?? 0),
            [`timeByGrid.${session.gridSize}.totalMs`]: increment(elapsed),
            [`timeByGrid.${session.gridSize}.count`]:   increment(1),
            [`monthly.${yearMonth}.completed`]:         increment(1),
        };

        if (session.hard)   updates['mazesCompletedHard'] = increment(1);
        if (session.custom) updates['customMapsPlayed']   = increment(1);

        await setDoc(ref, updates, { merge: true });

        // Best time — needs read-then-write (increment can't do min)
        const snap = await getDoc(ref);
        const current = snap.data()?.monthly?.[yearMonth]?.bestTimeMs ?? Infinity;
        if (elapsed < current) {
            await setDoc(ref, { [`monthly.${yearMonth}.bestTimeMs`]: elapsed }, { merge: true });
        }
    } catch (e) {
        console.warn('[Stats] flush failed:', e);
    }

    session = null;
}

async function flushDeath() {
    const uid = getUserId();
    if (!uid || !session) return;

    try {
        const ref = doc(db, 'users', uid);
        await setDoc(ref, {
            displayName: getDisplayName() ?? '',
            lastPlayed:  Timestamp.now(),
            totalDeaths: increment(1),
            totalCaught: increment(session.timesCaught),
            totalMonstersStunned:     increment(session.monstersStunned),
            totalKeysCollected:       increment(session.keysCollected),
            totalGatesOpened:         increment(session.gatesOpened),
            totalObjectivesCompleted: increment(session.objectivesCompleted),
            'skillUses.HOP':          increment(session.skillUses['HOP'] ?? 0),
            'skillUses.STING':        increment(session.skillUses['STING'] ?? 0),
            'skillUses.GLOW':         increment(session.skillUses['GLOW'] ?? 0),
            'skillUses.DASH':         increment(session.skillUses['DASH'] ?? 0),
        }, { merge: true });
    } catch (e) {
        console.warn('[Stats] death flush failed:', e);
    }

    session = null;
}

// ── Read stats for display ──────────────────────────────────────────────────
export async function getStats(): Promise<UserStats> {
    const uid = getUserId();
    if (!uid) return emptyStats();

    try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (!snap.exists()) return emptyStats();
        const d = snap.data();
        return {
            displayName:              d.displayName ?? '',
            mazesCompleted:           d.mazesCompleted ?? 0,
            mazesCompletedHard:       d.mazesCompletedHard ?? 0,
            customMapsPlayed:         d.customMapsPlayed ?? 0,
            totalDeaths:              d.totalDeaths ?? 0,
            totalCaught:              d.totalCaught ?? 0,
            totalKeysCollected:       d.totalKeysCollected ?? 0,
            totalGatesOpened:         d.totalGatesOpened ?? 0,
            totalObjectivesCompleted: d.totalObjectivesCompleted ?? 0,
            totalMonstersStunned:     d.totalMonstersStunned ?? 0,
            skillUses: {
                HOP:   d.skillUses?.HOP   ?? 0,
                STING: d.skillUses?.STING ?? 0,
                GLOW:  d.skillUses?.GLOW  ?? 0,
                DASH:  d.skillUses?.DASH  ?? 0,
            },
            timeByGrid: d.timeByGrid ?? {},
            monthly:    d.monthly    ?? {},
        };
    } catch (e) {
        console.warn('[Stats] read failed:', e);
        return emptyStats();
    }
}
