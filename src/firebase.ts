// ── Firebase app initialization ──────────────────────────────────────────────

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const app = initializeApp({
    apiKey:            'AIzaSyAJ17VvDFcV-wQysRgHiUgdR4_rtiNR0V0',
    authDomain:        'seasons-phase-game.firebaseapp.com',
    projectId:         'seasons-phase-game',
    storageBucket:     'seasons-phase-game.firebasestorage.app',
    messagingSenderId: '717658431190',
    appId:             '1:717658431190:web:5a7db65c7cc639e69bb377',
});

export const auth = getAuth(app);
export const db   = getFirestore(app);
