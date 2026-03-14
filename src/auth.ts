// ── Authentication service (email/password) ─────────────────────────────────

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut as fbSignOut,
    onAuthStateChanged,
    updateProfile,
    type User,
} from 'firebase/auth';
import { auth } from './firebase';

export async function signUp(email: string, password: string, displayName: string): Promise<void> {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });
}

export async function signIn(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(auth, email, password);
}

export function signOut(): Promise<void> {
    return fbSignOut(auth);
}

export function onAuthChange(cb: (user: User | null) => void): () => void {
    return onAuthStateChanged(auth, cb);
}

export function isSignedIn(): boolean {
    return auth.currentUser !== null;
}

export function getDisplayName(): string | null {
    return auth.currentUser?.displayName ?? null;
}

export function getUserId(): string | null {
    return auth.currentUser?.uid ?? null;
}
