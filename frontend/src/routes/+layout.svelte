<script lang="ts">
    import '../app.css';
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';
    import { session } from '$lib/authStore';

    let mounted = false;

    onMount(() => {
        mounted = true;
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
