import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { gamificationState, addXP, checkStreak } from '$lib/stores/gamification';

describe('Gamification Store', () => {
    beforeEach(() => {
        // Reset state before each test
        gamificationState.xp = 0;
        gamificationState.level = 1;
        gamificationState.streak = 0;
        gamificationState.lastStudyDate = null;
    });

    it('should initialize with default values', () => {
        expect(gamificationState.xp).toBe(0);
        expect(gamificationState.level).toBe(1);
        expect(gamificationState.streak).toBe(0);
    });

    it('should add XP and level up', () => {
        addXP(150);
        expect(gamificationState.xp).toBe(50); // 150 - 100 for level 2
        expect(gamificationState.level).toBe(2);
    });

    it('should increment streak on consecutive days', () => {
        // Mock yesterday
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        gamificationState.lastStudyDate = yesterday.toISOString();
        gamificationState.streak = 1;

        checkStreak();

        expect(gamificationState.streak).toBe(2);

        // Ensure lastStudyDate is updated to today
        const today = new Date().toDateString();
        expect(new Date(gamificationState.lastStudyDate!).toDateString()).toBe(today);
    });

    it('should start streak if no previous study date', () => {
        expect(gamificationState.streak).toBe(0);
        expect(gamificationState.lastStudyDate).toBeNull();

        checkStreak();

        expect(gamificationState.streak).toBe(1);
        expect(gamificationState.lastStudyDate).not.toBeNull();
    });

    it('should reset streak if missed a day', () => {
        // Mock two days ago
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

        gamificationState.lastStudyDate = twoDaysAgo.toISOString();
        gamificationState.streak = 5;

        checkStreak();

        // Since it's been more than 1 day, streak resets to 1 (for today)
        expect(gamificationState.streak).toBe(1);
    });

    it('should not increment if already studied today', () => {
        const today = new Date().toISOString();
        gamificationState.lastStudyDate = today;
        gamificationState.streak = 2;

        checkStreak();

        // Streak remains the same since it's the same day
        expect(gamificationState.streak).toBe(2);
    });
});
