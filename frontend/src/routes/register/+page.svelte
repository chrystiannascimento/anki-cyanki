<script lang="ts">
    import { goto } from '$app/navigation';
    import { session } from '$lib/authStore';
    import { PUBLIC_API_URL } from '$env/static/public';
    import { syncEngine } from '$lib/sync';

    let email = '';
    let password = '';
    let confirmPassword = '';
    let isLoading = false;
    let errorMessage = '';

    async function handleRegister() {
        if (password !== confirmPassword) {
            errorMessage = 'Passwords do not match';
            return;
        }

        isLoading = true;
        errorMessage = '';
        
        try {
            const response = await fetch(`${PUBLIC_API_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Registration failed');
            }

            // Immediately login after registration
            const loginForm = new URLSearchParams();
            loginForm.append('username', email);
            loginForm.append('password', password);

            const loginRes = await fetch(`${PUBLIC_API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: loginForm
            });

            if (loginRes.ok) {
                const data = await loginRes.json();
                session.set({
                    token: data.access_token,
                    email: email
                });
                
                // Immediately pull remote server data
                syncEngine.triggerSync();

                // Route to onboarding flow automatically
                goto('/onboarding');
            }

        } catch (e: any) {
            errorMessage = e.message;
        } finally {
            isLoading = false;
        }
    }
</script>

<div class="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center p-6">
    <div class="bg-white dark:bg-neutral-800 p-8 rounded-3xl shadow-xl w-full max-w-md ring-1 ring-neutral-200 dark:ring-neutral-700">
        <h1 class="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 mb-2">Create Account</h1>
        <p class="text-neutral-500 mb-8">Start your continuous learning journey.</p>

        {#if errorMessage}
            <div class="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 border border-red-100 dark:bg-red-900/20 dark:border-red-800/50">
                {errorMessage}
            </div>
        {/if}

        <form on:submit|preventDefault={handleRegister} class="space-y-4">
            <div>
                <label class="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">Email</label>
                <input bind:value={email} type="email" required class="w-full p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 transition-shadow outline-none" />
            </div>
            
            <div>
                <label class="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">Password</label>
                <input bind:value={password} type="password" required class="w-full p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 transition-shadow outline-none" />
            </div>

            <div>
                <label class="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">Confirm Password</label>
                <input bind:value={confirmPassword} type="password" required class="w-full p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 transition-shadow outline-none" />
            </div>

            <button type="submit" disabled={isLoading} class="w-full py-3 mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md transition-all active:scale-[0.98] disabled:opacity-70">
                {isLoading ? 'Creating account...' : 'Sign Up'}
            </button>
        </form>

        <p class="text-center text-sm text-neutral-500 mt-8">
            Already have an account? <a href="/login" class="text-indigo-600 font-semibold hover:underline">Log in</a>
        </p>
    </div>
</div>
