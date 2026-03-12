import { describe, it, expect, beforeEach } from 'vitest';
import { gamificationStore, addXP, checkStreak } from '$lib/stores/gamification';
import { get } from 'svelte/store';

describe('Gamification Store', () => {
    beforeEach(() => {
        gamificationStore.set({
            xp: 0,
            level: 1,
            streak: 0,
            lastStudyDate: null
        });
    });

    it('should initialize with default values', () => {
        const state = get(gamificationStore);
        expect(state.xp).toBe(0);
        expect(state.level).toBe(1);
        expect(state.streak).toBe(0);
    });

    it('should add XP and level up', () => {
        addXP(150);
        const state = get(gamificationStore);
        expect(state.xp).toBe(50); // 150 - 100 for level 2
        expect(state.level).toBe(2);
    });

    it('should increment streak on consecutive days', () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        gamificationStore.update(s => ({ ...s, lastStudyDate: yesterday.toISOString(), streak: 1 }));
        checkStreak();

        const state = get(gamificationStore);
        expect(state.streak).toBe(2);

        const today = new Date().toDateString();
        expect(new Date(state.lastStudyDate!).toDateString()).toBe(today);
    });

    it('should start streak if no previous study date', () => {
        let state = get(gamificationStore);
        expect(state.streak).toBe(0);
        expect(state.lastStudyDate).toBeNull();

        checkStreak();

        state = get(gamificationStore);
        expect(state.streak).toBe(1);
        expect(state.lastStudyDate).not.toBeNull();
    });

    it('should reset streak if missed a day', () => {
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

        gamificationStore.update(s => ({ ...s, lastStudyDate: twoDaysAgo.toISOString(), streak: 5 }));
        checkStreak();

        const state = get(gamificationStore);
        expect(state.streak).toBe(1);
    });

    it('should not increment if already studied today', () => {
        const today = new Date().toISOString();
        gamificationStore.update(s => ({ ...s, lastStudyDate: today, streak: 2 }));
        checkStreak();

        const state = get(gamificationStore);
        expect(state.streak).toBe(2);
    });
});
