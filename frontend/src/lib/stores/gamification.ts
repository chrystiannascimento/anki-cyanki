export const gamificationState = {
    xp: 0,
    level: 1,
    streak: 0,
    lastStudyDate: null as string | null
};

export function addXP(amount: number) {
    gamificationState.xp += amount;
    // Simple level up logic: 100 XP per level
    while (gamificationState.xp >= 100) {
        gamificationState.xp -= 100;
        gamificationState.level += 1;
    }
}

export function checkStreak() {
    const todayStr = new Date().toDateString();

    if (!gamificationState.lastStudyDate) {
        gamificationState.streak = 1;
        gamificationState.lastStudyDate = new Date().toISOString();
        return;
    }

    const lastDate = new Date(gamificationState.lastStudyDate);
    const lastDateStr = lastDate.toDateString();

    if (todayStr === lastDateStr) {
        // Already studied today
        return;
    }

    // Check if yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (lastDateStr === yesterday.toDateString()) {
        gamificationState.streak += 1;
    } else {
        // Streak broken
        gamificationState.streak = 1;
    }

    gamificationState.lastStudyDate = new Date().toISOString();
}
