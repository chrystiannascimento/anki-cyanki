<script lang="ts">
    import { browser } from '$app/environment';
    import { session } from '$lib/authStore';
    
    // Preferences state mimicking UC-23 (Profile & Configs)
    let goal = browser ? localStorage.getItem('cyanki_goal') || '' : '';
    let retentionRate = browser ? localStorage.getItem('cyanki_retention') || '90' : '90';
    let isDark = browser ? document.documentElement.classList.contains('dark') : false;
    
    // Load FSRS retention default parameter
    function savePreferences() {
        if (!browser) return;
        localStorage.setItem('cyanki_goal', goal);
        localStorage.setItem('cyanki_retention', retentionRate);
        
        // Handle theme switch physically
        if (isDark) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }
</script>

<div class="min-h-screen bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 p-8">
    <div class="max-w-2xl mx-auto space-y-8">
        
        <header class="flex items-center gap-4">
            <a href="/" class="p-2 bg-neutral-200 dark:bg-neutral-800 rounded-full hover:bg-neutral-300 transition">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
            </a>
            <h1 class="text-3xl font-extrabold tracking-tight">Profile & Preferences</h1>
        </header>

        {#if $session.email}
            <section class="p-6 bg-white dark:bg-neutral-800 rounded-2xl shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 flex items-center gap-4">
                <div class="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-xl font-black text-indigo-600 dark:text-indigo-400">
                    {$session.email[0].toUpperCase()}
                </div>
                <div>
                    <h2 class="text-xl font-bold">{$session.email}</h2>
                    <span class="px-2 py-0.5 mt-1 inline-block text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full">Pro Member</span>
                </div>
            </section>
        {/if}

        <section class="space-y-6 p-6 bg-white dark:bg-neutral-800 rounded-2xl shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700">
            <h3 class="text-lg font-bold border-b border-neutral-100 dark:border-neutral-700 pb-2">Study Parameters</h3>
            
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium mb-1 text-neutral-600 dark:text-neutral-400">Current Goal</label>
                    <input bind:value={goal} on:blur={savePreferences} type="text" class="w-full p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                
                <div>
                    <label class="block text-sm font-medium mb-1 text-neutral-600 dark:text-neutral-400">FSRS Target Retention Rate (%)</label>
                    <div class="flex items-center gap-4">
                        <input type="range" min="70" max="99" bind:value={retentionRate} on:change={savePreferences} class="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer dark:bg-neutral-700 accent-indigo-600">
                        <span class="font-bold text-indigo-600 dark:text-indigo-400 w-12 text-right">{retentionRate}%</span>
                    </div>
                </div>
            </div>
        </section>

        <section class="space-y-6 p-6 bg-white dark:bg-neutral-800 rounded-2xl shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700">
            <h3 class="text-lg font-bold border-b border-neutral-100 dark:border-neutral-700 pb-2">App Preferences</h3>
            
            <div class="flex items-center justify-between">
                <div>
                    <span class="font-medium">Dark Theme</span>
                    <p class="text-sm text-neutral-500">Toggle dark mode interface</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" bind:checked={isDark} on:change={savePreferences} class="sr-only peer">
                    <div class="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-neutral-600 peer-checked:bg-indigo-600"></div>
                </label>
            </div>
            
            <div class="pt-4 mt-4 border-t border-neutral-100 dark:border-neutral-700 text-right">
                <button class="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 rounded-lg transition-colors">
                    Delete Account & Data
                </button>
            </div>
        </section>
        
    </div>
</div>
