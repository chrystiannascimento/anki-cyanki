import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface StudySessionContext {
    type: 'practice' | 'notebook' | 'global';
    /** SavedFilter ID or Notebook ID (undefined for global /study) */
    id?: string;
    /** Display name shown in the resume widget */
    name: string;
    /** Card index at the moment of saving */
    cardIndex: number;
    /** Total due cards at session start */
    totalCards: number;
    savedAt: number;
}

const STORAGE_KEY = 'cyanki_last_session';

function getInitial(): StudySessionContext | null {
    if (!browser) return null;
    try {
        const s = localStorage.getItem(STORAGE_KEY);
        return s ? JSON.parse(s) : null;
    } catch {
        return null;
    }
}

export const lastSession = writable<StudySessionContext | null>(getInitial());

lastSession.subscribe(value => {
    if (!browser) return;
    if (value) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } else {
        localStorage.removeItem(STORAGE_KEY);
    }
});

export function saveSession(ctx: StudySessionContext) {
    lastSession.set(ctx);
}

export function clearSession() {
    lastSession.set(null);
}

export function getResumeUrl(ctx: StudySessionContext): string {
    if (ctx.type === 'practice' && ctx.id) return `/practice/study/${ctx.id}`;
    if (ctx.type === 'notebook' && ctx.id) return `/notebooks/study/${ctx.id}`;
    return '/study';
}

/** Returns a human-readable relative time (e.g. "há 3 horas") */
export function timeAgo(timestamp: number): string {
    const diffMs = Date.now() - timestamp;
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return 'agora mesmo';
    if (diffMin < 60) return `há ${diffMin} min`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `há ${diffHr}h`;
    const diffDays = Math.floor(diffHr / 24);
    return `há ${diffDays} dia${diffDays > 1 ? 's' : ''}`;
}
