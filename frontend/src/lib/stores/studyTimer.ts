import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TimerState {
    isRunning: boolean;
    /** Seconds elapsed in the current (unfinished) session segment */
    segmentSeconds: number;
    /** Total seconds accumulated today across all segments */
    totalSecondsToday: number;
    /** ISO date key YYYY-MM-DD for daily rollover detection */
    todayKey: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STORAGE_KEY = 'cyanki_study_timer';

function getInitial(): TimerState {
    const defaultState: TimerState = {
        isRunning: false,
        segmentSeconds: 0,
        totalSecondsToday: 0,
        todayKey: todayKey()
    };
    if (!browser) return defaultState;
    try {
        const s = localStorage.getItem(STORAGE_KEY);
        if (!s) return defaultState;
        const parsed: TimerState = JSON.parse(s);
        // Roll over if it's a new day
        if (parsed.todayKey !== todayKey()) {
            return { ...defaultState, todayKey: todayKey() };
        }
        // Always start paused — never auto-resume a running timer from storage
        return { ...parsed, isRunning: false, segmentSeconds: 0 };
    } catch {
        return defaultState;
    }
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const timerStore = writable<TimerState>(getInitial());

timerStore.subscribe(value => {
    if (browser) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    }
});

/** Total minutes studied today (derived, reactive) */
export const minutesToday = derived(timerStore, $t =>
    Math.floor(($t.totalSecondsToday + $t.segmentSeconds) / 60)
);

// ─── Internal tick interval ───────────────────────────────────────────────────

let tickInterval: ReturnType<typeof setInterval> | null = null;

function startTick() {
    if (tickInterval) return;
    tickInterval = setInterval(() => {
        timerStore.update(s => {
            if (!s.isRunning) return s;
            // Roll over if day changed mid-session
            const key = todayKey();
            if (key !== s.todayKey) {
                return { ...s, segmentSeconds: 1, totalSecondsToday: 0, todayKey: key };
            }
            return { ...s, segmentSeconds: s.segmentSeconds + 1 };
        });
    }, 1000);
}

function stopTick() {
    if (tickInterval) {
        clearInterval(tickInterval);
        tickInterval = null;
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Start or resume the timer */
export function startTimer() {
    timerStore.update(s => {
        // Rollover guard
        const key = todayKey();
        if (key !== s.todayKey) {
            return { isRunning: true, segmentSeconds: 0, totalSecondsToday: 0, todayKey: key };
        }
        return { ...s, isRunning: true };
    });
    startTick();
}

/**
 * Pause the timer — commits segment seconds into totalSecondsToday.
 * Called automatically on inactivity timeout (from the component).
 */
export function pauseTimer() {
    timerStore.update(s => ({
        ...s,
        isRunning: false,
        totalSecondsToday: s.totalSecondsToday + s.segmentSeconds,
        segmentSeconds: 0
    }));
    stopTick();
}

/** Reset today's total (e.g., manual reset from UI) */
export function resetTimer() {
    stopTick();
    timerStore.set({
        isRunning: false,
        segmentSeconds: 0,
        totalSecondsToday: 0,
        todayKey: todayKey()
    });
}

/** Read current total minutes synchronously (for goal progress checks) */
export function getTotalMinutesToday(): number {
    const s = get(timerStore);
    const key = todayKey();
    if (s.todayKey !== key) return 0;
    return Math.floor((s.totalSecondsToday + (s.isRunning ? s.segmentSeconds : 0)) / 60);
}

// ─── Notification helper ──────────────────────────────────────────────────────

/** Request notification permission (idempotent) */
export async function requestNotificationPermission(): Promise<boolean> {
    if (!browser || !('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
}

/** Fire a local browser notification (only if permission granted) */
export function notify(title: string, body: string) {
    if (!browser || Notification.permission !== 'granted') return;
    new Notification(title, { body, icon: '/favicon.png' });
}
