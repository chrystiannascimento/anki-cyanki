<script lang="ts">
    import { goto } from '$app/navigation';
    import { session } from '$lib/authStore';

    let email = '';
    let password = '';
    let isLoading = false;
    let errorMessage = '';

    async function handleLogin() {
        isLoading = true;
        errorMessage = '';
        
        try {
            const formData = new URLSearchParams();
            formData.append('username', email);
            formData.append('password', password);

            const response = await fetch('http://localhost:8000/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData
            });

            if (!response.ok) {
                throw new Error('Invalid credentials');
            }

            const data = await response.json();
            
            session.set({
                token: data.access_token,
                email: email
            });

            goto('/');
        } catch (e: any) {
            errorMessage = e.message;
        } finally {
            isLoading = false;
        }
    }
</script>

<div class="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center p-6">
    <div class="bg-white dark:bg-neutral-800 p-8 rounded-3xl shadow-xl w-full max-w-md ring-1 ring-neutral-200 dark:ring-neutral-700">
        <h1 class="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 mb-2">Welcome back</h1>
        <p class="text-neutral-500 mb-8">Sign in to sync your studying progress.</p>

        {#if errorMessage}
            <div class="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 border border-red-100 dark:bg-red-900/20 dark:border-red-800/50">
                {errorMessage}
            </div>
        {/if}

        <form on:submit|preventDefault={handleLogin} class="space-y-4">
            <div>
                <label class="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">Email</label>
                <input bind:value={email} type="email" required class="w-full p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 transition-shadow outline-none" />
            </div>
            
            <div>
                <label class="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">Password</label>
                <input bind:value={password} type="password" required class="w-full p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 transition-shadow outline-none" />
            </div>

            <button type="submit" disabled={isLoading} class="w-full py-3 mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md transition-all active:scale-[0.98] disabled:opacity-70">
                {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
        </form>

        <p class="text-center text-sm text-neutral-500 mt-8">
            Don't have an account? <a href="/register" class="text-indigo-600 font-semibold hover:underline">Register</a>
        </p>
    </div>
</div>
