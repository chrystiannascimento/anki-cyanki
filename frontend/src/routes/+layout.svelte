<script lang="ts">
    import '../app.css';
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';
    import { session } from '$lib/authStore';
    import { syncEngine, isSyncingStore } from '$lib/sync';
    import { themeStore, toggleTheme } from '$lib/theme';

    let mounted = false;

    onMount(() => {
        mounted = true;
        
        // Hydrate Theme State securely
        const storedTheme = localStorage.getItem('theme');
        if (storedTheme === 'dark' || (!storedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            themeStore.set('dark');
            document.documentElement.classList.add('dark');
        } else {
            themeStore.set('light');
            document.documentElement.classList.remove('dark');
        }

        // Trigger a pull/push sync block as soon as the authenticated user opens the App
        if ($session.token) {
            syncEngine.triggerSync();
        }
    });

    $: if (mounted) {
        const currentRoute = $page.url.pathname;
        const isPublicRoute = ['/login', '/register'].includes(currentRoute);
        const hasToken = !!$session.token;

        if (!hasToken && !isPublicRoute && currentRoute !== '/') {
            // If not logged in and trying to access a protected route, go to login
            goto('/login');
        } else if (hasToken && isPublicRoute) {
            // If logged in and on login/register, go to dashboard
            goto('/dashboard');
        }
    }
</script>

<slot />

<!-- Global Theme Toggle -->
<button 
    on:click={toggleTheme} 
    class="fixed bottom-4 left-4 z-50 p-3 rounded-full bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 shadow-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition"
    aria-label="Toggle Theme"
>
    {#if $themeStore === 'dark'}
        <!-- Sun Icon -->
        <svg class="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4.22 2.364a1 1 0 011.415 0l.707.707a1 1 0 01-1.414 1.415l-.707-.707a1 1 0 010-1.415zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zm-3.07 4.343a1 1 0 010 1.415l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM10 16a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zm-4.22-2.364a1 1 0 01-1.415 0l-.707-.707a1 1 0 011.414-1.415l.707.707a1 1 0 010 1.415zM4 10a1 1 0 01-1 1H2a1 1 0 110-2h1a1 1 0 011 1zm3.07-4.343a1 1 0 010-1.415l.707-.707a1 1 0 111.414 1.414l-.707.707a1 1 0 01-1.414 0zM10 5a5 5 0 100 10 5 5 0 000-10z" clip-rule="evenodd"></path></svg>
    {:else}
        <!-- Moon Icon -->
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path></svg>
    {/if}
</button>

<!-- Global Sync Indicator -->
{#if $isSyncingStore}
    <div class="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-neutral-900 dark:bg-neutral-800 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg border border-neutral-700 pointer-events-none transition-all duration-300 transform translate-y-0 opacity-100">
        <svg class="animate-spin h-3.5 w-3.5 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Syncing...
    </div>
{/if}
