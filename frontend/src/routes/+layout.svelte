<script lang="ts">
    import '../app.css';
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';
    import { session } from '$lib/authStore';
    import { syncEngine, isSyncingStore } from '$lib/sync';

    let mounted = false;

    onMount(() => {
        mounted = true;
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
