<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { db, type LeaderboardEntry } from '$lib/db';
    import { liveQuery } from 'dexie';
    import { session } from '$lib/authStore';
    import { syncEngine, isSyncingStore } from '$lib/sync';
    import { gamificationStore } from '$lib/stores/gamification';
    
    let isOffline = !navigator.onLine;
    let leaderboard: LeaderboardEntry[] = [];
    let projectedLeaderboard: LeaderboardEntry[] = [];
    let pendingXP = 0;
    
    $: username = $session.email ? $session.email.split('@')[0] : 'You';
    $: isProjected = isOffline || pendingXP > 0;

    const handleOnline = () => { isOffline = false; syncEngine.triggerSync(); };
    const handleOffline = () => { isOffline = true; };

    onMount(() => {
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Subscribe to leaderboard changes
        const lbObservable = liveQuery(() => db.leaderboard.orderBy('position').toArray());
        const lbSub = lbObservable.subscribe(data => {
            leaderboard = data;
            calculateProjection();
        });

        // Subscribe to unsynced reviews to calculate Pending XP (10 XP per review)
        const pendingObservable = liveQuery(() => db.reviewLogs.where('synced').equals(0).toArray());
        const pendingSub = pendingObservable.subscribe(logs => {
            pendingXP = logs.length * 10;
            calculateProjection();
        });

        // Whenever gamification changes
        const unsubGamification = gamificationStore.subscribe(() => {
            calculateProjection();
        });

        // Seed mock data if empty (for testing purposes)
        seedMockLeaderboard();

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            lbSub.unsubscribe();
            pendingSub.unsubscribe();
            unsubGamification();
        };
    });

    async function seedMockLeaderboard() {
        const count = await db.leaderboard.count();
        if (count === 0) {
            await db.leaderboard.bulkAdd([
                { id: 'user_1', name: 'alice', xp: 5000, position: 1, updatedAt: Date.now() },
                { id: 'user_2', name: 'bob_studies', xp: 4200, position: 2, updatedAt: Date.now() },
                { id: 'user_3', name: 'charlie99', xp: 3100, position: 3, updatedAt: Date.now() },
                { id: 'user_4', name: 'david_med', xp: 2800, position: 4, updatedAt: Date.now() },
                { id: 'user_5', name: 'eve_law', xp: 1500, position: 5, updatedAt: Date.now() },
            ]);
        }
    }

    function calculateProjection() {
        if (!leaderboard.length) return;

        // Clone the leaderboard
        let projected = [...leaderboard];
        
        // Find or inject current user
        let currentUserIndex = projected.findIndex(u => u.name === username);
        let currentXP = $gamificationStore.xp; // The store already contains base + pending if we just earned it locally, but wait: the store has the total local XP. Submitting logs syncs them.
        
        // Actually, gamificationStore.xp contains the total XP including the ones earned offline.
        // So we just use that directly as the user's projected XP.
        
        if (currentUserIndex !== -1) {
            projected[currentUserIndex].xp = currentXP;
        } else {
            projected.push({
                id: 'current_user',
                name: username,
                xp: currentXP,
                position: 999,
                updatedAt: Date.now()
            });
        }

        // Re-sort by XP descending
        projected.sort((a, b) => b.xp - a.xp);

        // Re-assign positions
        projected.forEach((user, index) => {
            user.position = index + 1;
        });

        projectedLeaderboard = projected;
    }
</script>

<div class="max-w-4xl mx-auto space-y-8 py-8 px-4">
    <div class="mb-6">
        <h1 class="text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white flex items-center gap-3">
            Global Ranking
            {#if isProjected}
                <span class="text-xs font-bold px-2 py-1 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-lg whitespace-nowrap animate-pulse border border-amber-200 dark:border-amber-800/50">
                    Offline Projection
                </span>
            {:else if $isSyncingStore}
                <span class="text-xs font-bold px-2 py-1 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 rounded-lg whitespace-nowrap border border-indigo-200 dark:border-indigo-800/50">
                    Syncing...
                </span>
            {/if}
        </h1>
        <p class="text-neutral-500 mt-1">See how you measure up against other learners.</p>
    </div>

    <section class="bg-white dark:bg-neutral-800 rounded-2xl shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 overflow-hidden">
        <table class="w-full text-left border-collapse">
            <thead>
                <tr class="bg-neutral-50 dark:bg-neutral-900/50 text-neutral-500 text-sm font-semibold uppercase tracking-wider">
                    <th class="p-4 border-b border-neutral-200 dark:border-neutral-700 text-center w-24">Rank</th>
                    <th class="p-4 border-b border-neutral-200 dark:border-neutral-700">Student</th>
                    <th class="p-4 border-b border-neutral-200 dark:border-neutral-700 text-right">Total XP</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-neutral-100 dark:divide-neutral-700/50">
                {#each projectedLeaderboard as user (user.id)}
                    <tr class="transition-colors {user.name === username ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/80'}">
                        <td class="p-4 text-center">
                            {#if user.position === 1}
                                <span class="text-2xl" title="1st Place">🥇</span>
                            {:else if user.position === 2}
                                <span class="text-2xl" title="2nd Place">🥈</span>
                            {:else if user.position === 3}
                                <span class="text-2xl" title="3rd Place">🥉</span>
                            {:else}
                                <span class="font-bold text-neutral-500 dark:text-neutral-400">#{user.position}</span>
                            {/if}
                        </td>
                        <td class="p-4">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-full {user.name === username ? 'bg-indigo-600 text-white' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300'} flex items-center justify-center font-bold">
                                    {user.name[0].toUpperCase()}
                                </div>
                                <div>
                                    <span class="font-bold text-neutral-900 dark:text-white {user.name === username ? 'text-indigo-700 dark:text-indigo-400' : ''}">
                                        {user.name === username ? username + ' (You)' : user.name}
                                    </span>
                                </div>
                            </div>
                        </td>
                        <td class="p-4 text-right">
                            <span class="font-black text-lg {user.name === username ? 'text-indigo-600 dark:text-indigo-400' : 'text-emerald-600 dark:text-emerald-400'}">
                                {user.xp.toLocaleString()} XP
                            </span>
                            {#if user.name === username && isProjected && pendingXP > 0}
                                <div class="text-xs font-bold text-amber-600 dark:text-amber-400 mt-1">
                                    +{pendingXP} pending sync
                                </div>
                            {/if}
                        </td>
                    </tr>
                {/each}
                
                {#if projectedLeaderboard.length === 0}
                    <tr>
                        <td colspan="3" class="p-8 text-center text-neutral-500">
                            Loading leaderboard...
                        </td>
                    </tr>
                {/if}
            </tbody>
        </table>
    </section>
</div>
