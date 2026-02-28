<script lang="ts">
    import '../app.css';
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';
    import { session } from '$lib/authStore';
    import { browser } from '$app/environment';

    const publicRoutes = ['/login', '/register', '/'];

    $: if (browser) {
        const currentRoute = $page.url.pathname;
        const isPublicRoute = publicRoutes.includes(currentRoute);
        const hasToken = !!$session.token;

        if (!hasToken && !isPublicRoute) {
            // If not logged in and trying to access a protected route, go to login
            goto('/login');
        } else if (hasToken && (currentRoute === '/login' || currentRoute === '/register' || currentRoute === '/')) {
            // If logged in and on login/register/root, go to dashboard
            goto('/dashboard');
        }
    }
</script>

<slot />
