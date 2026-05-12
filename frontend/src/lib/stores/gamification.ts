import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { db } from '$lib/db';

export interface GamificationState {
    xp: number;
    level: number;
    streak: number;
    lastStudyDate: string | null;
    /** UC-10: Coins are the mini-game currency. Earned alongside XP on every FSRS review. */
    coins: number;
}

const defaultState: GamificationState = {
    xp: 0,
    level: 1,
    streak: 0,
    lastStudyDate: null,
    coins: 0
};

const getInitialState = (): GamificationState => {
    if (browser) {
        const stored = localStorage.getItem('cyanki_gamification');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                // Backfill coins for existing users who didn't have the field
                if (typeof parsed.coins !== 'number') parsed.coins = 0;
                return parsed;
            } catch (e) {
                console.error("Failed to parse gamification state", e);
            }
        }
    }
    return defaultState;
};

export const gamificationStore = writable<GamificationState>(getInitialState());

gamificationStore.subscribe(value => {
    if (browser) {
        localStorage.setItem('cyanki_gamification', JSON.stringify(value));
    }
});

export function addXP(amount: number) {
    gamificationStore.update(state => {
        let { xp, level, streak, lastStudyDate, coins } = state;
        xp += amount;
        while (xp >= 100) {
            xp -= 100;
            level += 1;
        }
        return { xp, level, streak, lastStudyDate, coins };
    });
}

/** UC-10: Award coins from FSRS study sessions. 1 coin per review. */
export function addCoins(amount: number) {
    gamificationStore.update(state => ({ ...state, coins: state.coins + amount }));
}

/**
 * UC-10: Spend coins to unlock a mini-game.
 * Returns true and deducts if balance is sufficient, false otherwise.
 */
export function spendCoins(amount: number): boolean {
    let success = false;
    gamificationStore.update(state => {
        if (state.coins >= amount) {
            success = true;
            return { ...state, coins: state.coins - amount };
        }
        return state;
    });
    return success;
}

export function checkStreak() {
    gamificationStore.update(state => {
        let { xp, level, streak, lastStudyDate, coins } = state;
        const todayStr = new Date().toDateString();

        if (!lastStudyDate) {
            streak = 1;
            lastStudyDate = new Date().toISOString();
            return { xp, level, streak, lastStudyDate, coins };
        }

        const lastDate = new Date(lastStudyDate);
        const lastDateStr = lastDate.toDateString();

        if (todayStr === lastDateStr) {
            return state; // Already studied today
        }

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        if (lastDateStr === yesterday.toDateString()) {
            streak += 1;
        } else {
            streak = 1; // broken
        }

        lastStudyDate = new Date().toISOString();
        return { xp, level, streak, lastStudyDate, coins };
    });
}

/**
 * Recomputes XP and level from the total number of review logs (10 XP per review).
 * Called after a sync pull so both devices converge to the same XP/level.
 * Only increases — never resets XP earned above what logs can explain.
 */
export async function recomputeXPFromLogs() {
    if (!browser) return;
    const count = await db.reviewLogs.count();
    if (count === 0) return;

    const totalXP = count * 10;
    const computedLevel = Math.floor(totalXP / 100) + 1;
    const computedXP = totalXP % 100;

    gamificationStore.update(state => {
        const currentTotalXP = (state.level - 1) * 100 + state.xp;
        if (totalXP > currentTotalXP) {
            return { ...state, xp: computedXP, level: computedLevel };
        }
        return state;
    });
}

/**
 * Recomputes streak from all local review logs.
 * Called after a sync pull to reconcile streak across devices.
 * A day only counts toward the streak if it has ≥10 reviews.
 */
export async function recomputeStreakFromLogs() {
    if (!browser) return;

    const logs = await db.reviewLogs.toArray();
    if (logs.length === 0) return;

    const dayCount = new Map<string, number>();
    for (const log of logs) {
        const key = new Date(log.reviewedAt).toDateString();
        dayCount.set(key, (dayCount.get(key) || 0) + 1);
    }

    const today = new Date();
    const cursor = new Date(today);

    // If today hasn't reached 10 reviews yet, start from yesterday
    if ((dayCount.get(today.toDateString()) || 0) < 10) {
        cursor.setDate(cursor.getDate() - 1);
    }

    let streak = 0;
    let lastStreakDay: Date | null = null;
    while ((dayCount.get(cursor.toDateString()) || 0) >= 10) {
        streak++;
        if (!lastStreakDay) lastStreakDay = new Date(cursor);
        cursor.setDate(cursor.getDate() - 1);
    }

    if (streak === 0) return;

    gamificationStore.update(state => {
        if (streak >= state.streak) {
            return { ...state, streak, lastStudyDate: lastStreakDay!.toISOString() };
        }
        return state;
    });
}
