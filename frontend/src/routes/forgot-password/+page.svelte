<script lang="ts">
    import { PUBLIC_API_URL } from '$env/static/public';

    let email = '';
    let status: 'idle' | 'loading' | 'sent' | 'error' = 'idle';
    let errorMessage = '';

    async function handleSubmit() {
        if (!email.trim()) return;
        status = 'loading';
        errorMessage = '';

        try {
            const res = await fetch(`${PUBLIC_API_URL}/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim() })
            });

            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.detail ?? `Erro ${res.status}`);
            }

            status = 'sent';
        } catch (e: any) {
            errorMessage = e.message ?? 'Erro ao enviar. Tente novamente.';
            status = 'error';
        }
    }
</script>

<div class="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center p-6">
    <div class="w-full max-w-md">

        <!-- Logo -->
        <div class="flex items-center justify-center gap-3 mb-8">
            <div class="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                <span class="text-white font-extrabold text-xl">C</span>
            </div>
            <h1 class="text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-white">Cyanki</h1>
        </div>

        <div class="bg-white dark:bg-neutral-800 p-8 rounded-3xl shadow-xl ring-1 ring-neutral-200 dark:ring-neutral-700">

            {#if status === 'sent'}
                <!-- Success state -->
                <div class="text-center space-y-4">
                    <div class="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
                        <svg class="w-8 h-8 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                        </svg>
                    </div>
                    <h2 class="text-xl font-extrabold text-neutral-900 dark:text-white">Verifique seu e-mail</h2>
                    <p class="text-sm text-neutral-500 dark:text-neutral-400">
                        Se uma conta com o e-mail <strong class="text-neutral-700 dark:text-neutral-300">{email}</strong> existir, você receberá um link de recuperação em breve.
                    </p>
                    <p class="text-xs text-neutral-400 dark:text-neutral-600">O link expira em 30 minutos. Verifique também sua pasta de spam.</p>
                </div>
            {:else}
                <!-- Form state -->
                <div class="mb-6">
                    <h2 class="text-2xl font-extrabold text-neutral-900 dark:text-white mb-1">Recuperar senha</h2>
                    <p class="text-sm text-neutral-500 dark:text-neutral-400">Informe seu e-mail para receber um link de redefinição.</p>
                </div>

                {#if status === 'error'}
                    <div class="flex items-center gap-2 p-3 mb-5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
                        <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                        {errorMessage}
                    </div>
                {/if}

                <form on:submit|preventDefault={handleSubmit} class="space-y-5">
                    <div>
                        <label class="block text-sm font-semibold mb-1.5 text-neutral-700 dark:text-neutral-300">E-mail da conta</label>
                        <input
                            bind:value={email}
                            type="email"
                            required
                            placeholder="you@example.com"
                            autofocus
                            class="w-full px-4 py-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm transition-all placeholder-neutral-400 dark:placeholder-neutral-600 dark:text-white"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={status === 'loading'}
                        class="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md shadow-indigo-500/30 transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2"
                    >
                        {#if status === 'loading'}
                            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                            </svg>
                            Enviando...
                        {:else}
                            Enviar link de recuperação
                        {/if}
                    </button>
                </form>
            {/if}

            <div class="mt-6 text-center">
                <a href="/login" class="text-sm text-indigo-600 dark:text-indigo-400 font-medium hover:underline transition-colors">
                    ← Voltar ao login
                </a>
            </div>
        </div>
    </div>
</div>
