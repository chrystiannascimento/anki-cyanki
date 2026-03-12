import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface GamificationState {
    xp: number;
    level: number;
    streak: number;
    lastStudyDate: string | null;
}

const defaultState: GamificationState = {
    xp: 0,
    level: 1,
    streak: 0,
    lastStudyDate: null
};

const getInitialState = (): GamificationState => {
    if (browser) {
        const stored = localStorage.getItem('cyanki_gamification');
        if (stored) {
            try {
                return JSON.parse(stored);
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
        let { xp, level, streak, lastStudyDate } = state;
        xp += amount;
        while (xp >= 100) {
            xp -= 100;
            level += 1;
        }
        return { xp, level, streak, lastStudyDate };
    });
}

export function checkStreak() {
    gamificationStore.update(state => {
        let { xp, level, streak, lastStudyDate } = state;
        const todayStr = new Date().toDateString();

        if (!lastStudyDate) {
            streak = 1;
            lastStudyDate = new Date().toISOString();
            return { xp, level, streak, lastStudyDate };
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
        return { xp, level, streak, lastStudyDate };
    });
}
