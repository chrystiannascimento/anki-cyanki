<script lang="ts">
    import '../app.css';
    import { onMount, onDestroy } from 'svelte';
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';
    import { session, sessionExpired } from '$lib/authStore';
    import { syncEngine, isSyncingStore, lastSyncedAt, syncPendingCount } from '$lib/sync';
    import { themeStore, toggleTheme } from '$lib/theme';

    let mounted = false;
    let isOnline = true;
    let periodicSyncInterval: ReturnType<typeof setInterval> | null = null;

    // UC-24: public routes that don't require authentication
    const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password'];

    function updateOnlineStatus() {
        isOnline = navigator.onLine;
    }

    function syncIfAuthed() {
        if ($session.token) syncEngine.triggerSync();
    }

    function onVisibilityChange() {
        if (document.visibilityState === 'visible') syncIfAuthed();
    }

    onMount(() => {
        mounted = true;
        isOnline = navigator.onLine;
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        document.addEventListener('visibilitychange', onVisibilityChange);

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
        syncIfAuthed();

        // Periodic sync every 5 minutes to pick up remote deletions from other devices
        periodicSyncInterval = setInterval(syncIfAuthed, 5 * 60 * 1000);
    });

    onDestroy(() => {
        if (typeof window !== 'undefined') {
            window.removeEventListener('online', updateOnlineStatus);
            window.removeEventListener('offline', updateOnlineStatus);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        }
        if (periodicSyncInterval) clearInterval(periodicSyncInterval);
    });

    $: if (mounted) {
        const currentRoute = $page.url.pathname;
        const isPublicRoute = PUBLIC_ROUTES.some(r => currentRoute.startsWith(r));
        const hasToken = !!$session.token;

        if (!hasToken && !isPublicRoute && currentRoute !== '/') {
            // If not logged in and trying to access a protected route, go to login
            goto('/login');
        } else if (hasToken && !$sessionExpired && (currentRoute === '/login' || currentRoute === '/register')) {
            // If logged in (and session is valid) and on login/register, go to dashboard
            goto('/dashboard');
        }
    }
</script>

<slot />

<!-- UC-24: Offline banner -->
{#if mounted && !isOnline}
    <div class="fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-2 bg-amber-500 text-white text-xs font-semibold px-4 py-2 shadow-lg pointer-events-none">
        <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M12 12h.01M8.464 15.536a5 5 0 010-7.072M5.636 18.364a9 9 0 010-12.728"/>
        </svg>
        Modo offline — dados locais disponíveis, sincronização desativada
    </div>
{/if}

<!-- UC-24: Session expired banner -->
{#if mounted && $sessionExpired && $session.token}
    <div class="fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-3 bg-rose-600 text-white text-xs font-semibold px-4 py-2 shadow-lg">
        <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        </svg>
        Sessão expirada — dados locais disponíveis, mas a sincronização está pausada.
        <a href="/login" class="underline underline-offset-2 hover:text-rose-200 transition-colors">Fazer login novamente</a>
    </div>
{/if}

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
{#if mounted && $session.token && !$sessionExpired}
    <div class="fixed bottom-20 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg border transition-all duration-300
        {$isSyncingStore
            ? 'bg-neutral-900 dark:bg-neutral-800 border-neutral-700 text-indigo-300'
            : $syncPendingCount > 0
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-500 dark:text-amber-400'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'}"
    >
        {#if $isSyncingStore}
            <svg class="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Sincronizando...
        {:else if $syncPendingCount > 0}
            <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            {$syncPendingCount} pendente{$syncPendingCount > 1 ? 's' : ''}
        {:else}
            <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
            </svg>
            Sincronizado
        {/if}
    </div>
{/if}
