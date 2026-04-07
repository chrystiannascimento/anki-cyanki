<script lang="ts">
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';
    import { PUBLIC_API_URL } from '$env/static/public';

    // Token comes from the email link: /reset-password?token=xxx
    $: resetToken = $page.url.searchParams.get('token') ?? '';

    let newPassword = '';
    let confirmPassword = '';
    let status: 'idle' | 'loading' | 'success' | 'error' = 'idle';
    let errorMessage = '';

    $: pwStrength = (() => {
        const p = newPassword;
        if (!p) return null;
        let score = 0;
        if (p.length >= 8) score++;
        if (/[A-Z]/.test(p)) score++;
        if (/[0-9]/.test(p)) score++;
        if (/[^A-Za-z0-9]/.test(p)) score++;
        if (score <= 1) return { label: 'Fraca',    color: 'bg-red-500',     width: '25%' };
        if (score === 2) return { label: 'Razoável', color: 'bg-amber-500',   width: '50%' };
        if (score === 3) return { label: 'Boa',      color: 'bg-indigo-500',  width: '75%' };
        return               { label: 'Forte',    color: 'bg-emerald-500', width: '100%' };
    })();

    async function handleSubmit() {
        if (newPassword !== confirmPassword) {
            errorMessage = 'As senhas não coincidem.';
            status = 'error';
            return;
        }
        if (newPassword.length < 8) {
            errorMessage = 'A senha precisa ter pelo menos 8 caracteres.';
            status = 'error';
            return;
        }
        if (!resetToken) {
            errorMessage = 'Link de recuperação inválido ou expirado.';
            status = 'error';
            return;
        }

        status = 'loading';
        errorMessage = '';

        try {
            const res = await fetch(`${PUBLIC_API_URL}/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: resetToken, new_password: newPassword })
            });

            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.detail ?? `Erro ${res.status}`);
            }

            status = 'success';
        } catch (e: any) {
            errorMessage = e.message ?? 'Erro ao redefinir senha. O link pode ter expirado.';
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

            {#if !resetToken && status !== 'success'}
                <!-- No token in URL -->
                <div class="text-center space-y-4">
                    <div class="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
                        <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                        </svg>
                    </div>
                    <h2 class="text-xl font-extrabold text-neutral-900 dark:text-white">Link inválido</h2>
                    <p class="text-sm text-neutral-500 dark:text-neutral-400">
                        Este link de recuperação é inválido ou expirou. Solicite um novo link.
                    </p>
                    <a href="/forgot-password" class="inline-block mt-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-colors">
                        Solicitar novo link
                    </a>
                </div>

            {:else if status === 'success'}
                <!-- Success -->
                <div class="text-center space-y-4">
                    <div class="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
                        <svg class="w-8 h-8 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                        </svg>
                    </div>
                    <h2 class="text-xl font-extrabold text-neutral-900 dark:text-white">Senha redefinida!</h2>
                    <p class="text-sm text-neutral-500 dark:text-neutral-400">Sua senha foi alterada com sucesso. Faça login com a nova senha.</p>
                    <button
                        on:click={() => goto('/login')}
                        class="mt-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-colors"
                    >
                        Ir para o login
                    </button>
                </div>

            {:else}
                <!-- Form -->
                <div class="mb-6">
                    <h2 class="text-2xl font-extrabold text-neutral-900 dark:text-white mb-1">Nova senha</h2>
                    <p class="text-sm text-neutral-500 dark:text-neutral-400">Escolha uma senha forte para proteger sua conta.</p>
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
                        <label class="block text-sm font-semibold mb-1.5 text-neutral-700 dark:text-neutral-300">Nova senha</label>
                        <input
                            bind:value={newPassword}
                            type="password"
                            required
                            placeholder="Mínimo 8 caracteres"
                            autofocus
                            autocomplete="new-password"
                            class="w-full px-4 py-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm transition-all placeholder-neutral-400"
                        />
                        {#if pwStrength}
                            <div class="mt-2 space-y-1">
                                <div class="h-1.5 w-full bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                                    <div class="h-full {pwStrength.color} rounded-full transition-all duration-300" style="width: {pwStrength.width}"></div>
                                </div>
                                <p class="text-xs text-neutral-500 dark:text-neutral-400">Força: <span class="font-semibold">{pwStrength.label}</span></p>
                            </div>
                        {/if}
                    </div>

                    <div>
                        <label class="block text-sm font-semibold mb-1.5 text-neutral-700 dark:text-neutral-300">Confirmar nova senha</label>
                        <input
                            bind:value={confirmPassword}
                            type="password"
                            required
                            placeholder="Repita a nova senha"
                            autocomplete="new-password"
                            class="w-full px-4 py-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all placeholder-neutral-400
                                {confirmPassword && confirmPassword !== newPassword ? 'border-red-400 dark:border-red-600' : ''}"
                        />
                        {#if confirmPassword && confirmPassword !== newPassword}
                            <p class="mt-1 text-xs text-red-500 dark:text-red-400">As senhas não coincidem.</p>
                        {/if}
                    </div>

                    <button
                        type="submit"
                        disabled={status === 'loading' || !newPassword || !confirmPassword || newPassword !== confirmPassword}
                        class="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md shadow-indigo-500/30 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                    >
                        {#if status === 'loading'}
                            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                            </svg>
                            Redefinindo...
                        {:else}
                            Redefinir senha
                        {/if}
                    </button>
                </form>
            {/if}

            <div class="mt-6 text-center">
                <a href="/login" class="text-sm text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
                    ← Voltar ao login
                </a>
            </div>
        </div>
    </div>
</div>
