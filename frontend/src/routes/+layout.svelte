<script lang="ts">
    import '../app.css';
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';
    import { session } from '$lib/authStore';

    const publicRoutes = ['/login', '/register', '/'];

    onMount(() => {
        const checkAuth = () => {
            const currentRoute = $page.url.pathname;
            const isPublicRoute = publicRoutes.includes(currentRoute);

            if (!$session.token && !isPublicRoute) {
                // If not logged in and trying to access a protected route, go to login
                goto('/login');
            } else if ($session.token && (currentRoute === '/login' || currentRoute === '/register' || currentRoute === '/')) {
                // If logged in and on login/register/root, go to dashboard
                goto('/dashboard');
            }
        };

        // Subscribe to page changes
        const unsubscribePage = page.subscribe(() => {
            checkAuth();
        });

        // Also check on manual trigger/mount
        checkAuth();

        return () => unsubscribePage();
    });
</script>

<slot />
