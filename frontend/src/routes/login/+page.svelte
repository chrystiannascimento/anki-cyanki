<script lang="ts">
    import { goto } from '$app/navigation';
    import { session } from '$lib/authStore';
    import { PUBLIC_API_URL } from '$env/static/public';

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

            // In local/docker dev, point to real backend or localhost
            const response = await fetch(`${PUBLIC_API_URL}/auth/login`, {
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

            goto('/dashboard');
        } catch (e: any) {
            errorMessage = e.message;
        } finally {
            isLoading = false;
        }
    }
</script>

<div class="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex flex-col lg:flex-row">
    <!-- LEFT PANEL: Landing Page / Features -->
    <div class="lg:w-[55%] xl:w-3/5 bg-gradient-to-br from-indigo-900 via-indigo-800 to-violet-900 p-8 lg:p-16 flex flex-col justify-between text-white relative overflow-hidden">
        
        <!-- Decorative blobs -->
        <div class="absolute top-0 left-0 w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 -translate-x-1/2 -translate-y-1/2 animate-blob"></div>
        <div class="absolute bottom-0 right-0 w-96 h-96 bg-violet-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 translate-x-1/2 translate-y-1/2 animate-blob animation-delay-2000"></div>

        <div class="relative z-10">
            <div class="flex items-center gap-3 mb-12">
                <div class="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg">
                    <span class="text-indigo-600 font-extrabold text-xl">C</span>
                </div>
                <h1 class="text-3xl font-extrabold tracking-tight">Cyanki</h1>
            </div>

            <h2 class="text-4xl lg:text-5xl font-black leading-tight mb-6">
                Master any subject with <br/>
                <span class="text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-violet-300">Continuous Learning.</span>
            </h2>
            <p class="text-lg text-indigo-100/80 max-w-xl mb-12 leading-relaxed">
                A modern, offline-first study platform designed to supercharge your memory retention using cognitive science.
            </p>

            <!-- Feature Cards Grid -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 auto-rows-fr">
                <div class="bg-white/10 backdrop-blur-md border border-white/20 p-5 rounded-2xl hover:bg-white/15 transition-all">
                    <div class="w-10 h-10 rounded-lg bg-indigo-500/30 flex items-center justify-center mb-4 text-xl border border-indigo-400/50 shadow-inner">⚡</div>
                    <h3 class="font-bold text-lg mb-1 text-white">Offline-First</h3>
                    <p class="text-sm text-indigo-100/70">Study perfectly without internet. We auto-sync via conflict-free queues instantly when you re-connect.</p>
                </div>
                
                <div class="bg-white/10 backdrop-blur-md border border-white/20 p-5 rounded-2xl hover:bg-white/15 transition-all">
                    <div class="w-10 h-10 rounded-lg bg-emerald-500/30 flex items-center justify-center mb-4 text-xl border border-emerald-400/50 shadow-inner">🧠</div>
                    <h3 class="font-bold text-lg mb-1 text-white">FSRS Algorithm</h3>
                    <p class="text-sm text-indigo-100/70">Powered by Free Spaced Repetition Scheduler. Forget manual scheduling, memorize naturally.</p>
                </div>

                <div class="bg-white/10 backdrop-blur-md border border-white/20 p-5 rounded-2xl hover:bg-white/15 transition-all">
                    <div class="w-10 h-10 rounded-lg bg-orange-500/30 flex items-center justify-center mb-4 text-xl border border-orange-400/50 shadow-inner">🔥</div>
                    <h3 class="font-bold text-lg mb-1 text-white">Gamification</h3>
                    <p class="text-sm text-indigo-100/70">Build consistent study habits with daily streaks, XP gains, and visual rewards that keep you hooked.</p>
                </div>

                <div class="bg-white/10 backdrop-blur-md border border-white/20 p-5 rounded-2xl hover:bg-white/15 transition-all">
                    <div class="w-10 h-10 rounded-lg bg-pink-500/30 flex items-center justify-center mb-4 text-xl border border-pink-400/50 shadow-inner">🌍</div>
                    <h3 class="font-bold text-lg mb-1 text-white">Cross-Device</h3>
                    <p class="text-sm text-indigo-100/70">Progress is fully synced across Web and Desktop giving you a unified ecosystem.</p>
                </div>
            </div>
        </div>
        
        <div class="relative z-10 mt-12 text-sm text-indigo-200/50 font-medium">
            &copy; {new Date().getFullYear()} Cyanki Ecosystem. Open Source Learning.
        </div>
    </div>

    <!-- RIGHT PANEL: Login Form -->
    <div class="lg:w-[45%] xl:w-2/5 flex items-center justify-center p-8 bg-neutral-50 dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800">
        <div class="w-full max-w-sm">
            
            <div class="mb-10 lg:hidden">
                <div class="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg mb-4">
                    <span class="text-white font-extrabold text-2xl">C</span>
                </div>
                <h1 class="text-3xl font-extrabold text-neutral-900 dark:text-white">Cyanki</h1>
                <p class="text-neutral-500">Welcome back. Please sign in.</p>
            </div>

            <div class="hidden lg:block mb-10">
                <h2 class="text-3xl font-extrabold text-neutral-900 dark:text-white mb-2">Welcome back</h2>
                <p class="text-neutral-500">Sign in to your account.</p>
            </div>

            {#if errorMessage}
                <div class="bg-red-50 text-red-600 p-3 rounded-xl text-sm mb-6 border border-red-100 dark:bg-red-900/20 dark:border-red-800/50 flex items-center gap-2">
                    <span class="font-bold">&times;</span> {errorMessage}
                </div>
            {/if}

            <form on:submit|preventDefault={handleLogin} class="space-y-5">
                <div>
                    <label class="block text-sm font-semibold mb-1.5 text-neutral-700 dark:text-neutral-300">Email Address</label>
                    <input bind:value={email} type="email" required placeholder="you@example.com" class="w-full p-3.5 rounded-xl bg-white dark:bg-neutral-800 border items-center border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:border-indigo-500 focus:ring-indigo-500/20 transition-all outline-none placeholder:text-neutral-400 dark:text-white" />
                </div>
                
                <div>
                    <label class="block text-sm font-semibold mb-1.5 text-neutral-700 dark:text-neutral-300 flex justify-between">
                        Password
                        <a href="#" class="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">Forgot?</a>
                    </label>
                    <input bind:value={password} type="password" required placeholder="••••••••" class="w-full p-3.5 rounded-xl bg-white dark:bg-neutral-800 border items-center border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:border-indigo-500 focus:ring-indigo-500/20 transition-all outline-none placeholder:text-neutral-400 dark:text-white" />
                </div>

                <button type="submit" disabled={isLoading} class="w-full py-3.5 mt-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-[0_4px_14px_0_rgba(79,70,229,0.39)] hover:shadow-[0_6px_20px_rgba(79,70,229,0.23)] transition-all transform active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 flex justify-center cursor-pointer">
                    {#if isLoading}
                        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Signing in...
                    {:else}
                        Sign In
                    {/if}
                </button>
            </form>

            <div class="mt-8 text-center">
                <p class="text-sm text-neutral-500 dark:text-neutral-400">
                    New to Cyanki? 
                    <a href="/register" class="text-indigo-600 dark:text-indigo-400 font-bold hover:underline transition-colors">Create an account</a>
                </p>
            </div>
        </div>
    </div>
</div>

<style>
    .animate-blob {
        animation: blob 7s infinite;
    }
    .animation-delay-2000 {
        animation-delay: 2s;
    }
    @keyframes blob {
        0% { transform: translate(-50%, -50%) scale(1); }
        33% { transform: translate(-50%, -50%) scale(1.1) rotate(15deg); }
        66% { transform: translate(-50%, -50%) scale(0.9) rotate(-15deg); }
        100% { transform: translate(-50%, -50%) scale(1); }
    }
</style>
