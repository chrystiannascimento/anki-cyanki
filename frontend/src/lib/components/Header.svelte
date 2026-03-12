<script lang="ts">
    import { session } from '$lib/authStore';
    import { gamificationStore } from '$lib/stores/gamification';
    import { createEventDispatcher } from 'svelte';
    import { syncEngine } from '$lib/sync';

    const dispatch = createEventDispatcher();

    $: username = $session.email ? $session.email.split('@')[0] : 'Student';
    
    function toggleSidebar() {
        dispatch('toggleSidebar');
    }
    
    async function triggerSync() {
        await syncEngine.triggerSync();
    }
</script>

<header class="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 h-16 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800 shadow-sm transition-colors duration-300">
    <div class="flex items-center gap-3">
        <!-- Hamburger Menu (Mobile Only) -->
        <button on:click={toggleSidebar} class="md:hidden p-2 -ml-2 rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
        </button>
        
        <h2 class="text-lg font-bold text-neutral-800 dark:text-neutral-100 hidden sm:block">
            Olá, <span class="text-indigo-600 dark:text-indigo-400 capitalize">{username}</span>!
        </h2>
    </div>

    <div class="flex items-center gap-3">
        <!-- Sync Button -->
        <button on:click={triggerSync} class="p-2 text-neutral-500 dark:text-neutral-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-full transition-colors hidden sm:block cursor-pointer" title="Sync now">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
        </button>

        <!-- Streak Badge -->
        <div class="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-full border border-orange-200 dark:border-orange-800/50 shadow-sm" title="Current Daily Streak">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clip-rule="evenodd"></path></svg>
            <span class="font-bold text-sm">{$gamificationStore.streak}</span>
        </div>
        
        <!-- XP Badge -->
        <div class="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-full border border-emerald-200 dark:border-emerald-800/50 shadow-sm" title="Total XP">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            <span class="font-bold text-sm">{$gamificationStore.xp} XP</span>
        </div>
    </div>
</header>
