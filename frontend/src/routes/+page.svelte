<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { session } from '$lib/authStore';

    onMount(() => {
        let hasToken = false;
        // Unsubscribe immediately as we only need the snapshot
        const unsub = session.subscribe(value => hasToken = !!value.token);
        unsub();

        goto(hasToken ? '/dashboard' : '/login');
    });
</script>

<div class="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center">
    <div class="animate-pulse w-8 h-8 rounded-full bg-indigo-500"></div>
</div>
