<script lang="ts">
    import { browser } from '$app/environment';
    import { onMount } from 'svelte';
    import { session } from '$lib/authStore';
    import { PUBLIC_API_URL } from '$env/static/public';

    // ─── Avatar color presets ──────────────────────────────────────────────────
    const AVATAR_COLORS = [
        { id: 'indigo',  bg: 'bg-indigo-500',  text: 'text-white' },
        { id: 'violet',  bg: 'bg-violet-500',   text: 'text-white' },
        { id: 'sky',     bg: 'bg-sky-500',      text: 'text-white' },
        { id: 'emerald', bg: 'bg-emerald-500',  text: 'text-white' },
        { id: 'amber',   bg: 'bg-amber-500',    text: 'text-white' },
        { id: 'rose',    bg: 'bg-rose-500',     text: 'text-white' },
        { id: 'slate',   bg: 'bg-slate-500',    text: 'text-white' },
        { id: 'pink',    bg: 'bg-pink-500',     text: 'text-white' },
    ];

    // ─── Disciplines (same list as onboarding) ─────────────────────────────────
    const availableSubjects = [
        { id: 'math',        label: 'Matemática',       icon: '📐' },
        { id: 'programming', label: 'Programação / TI',  icon: '💻' },
        { id: 'law',         label: 'Direito',           icon: '⚖️' },
        { id: 'biology',     label: 'Biologia',          icon: '🧬' },
        { id: 'history',     label: 'História',          icon: '📜' },
        { id: 'languages',   label: 'Idiomas',           icon: '🌍' },
        { id: 'medicine',    label: 'Medicina',          icon: '🩺' },
        { id: 'physics',     label: 'Física',            icon: '⚛️' },
        { id: 'chemistry',   label: 'Química',           icon: '🧪' },
        { id: 'geography',   label: 'Geografia',         icon: '🗺️' },
        { id: 'philosophy',  label: 'Filosofia',         icon: '🤔' },
        { id: 'other',       label: 'Outras',            icon: '📚' },
    ];

    // ─── State ─────────────────────────────────────────────────────────────────
    let displayName = '';
    let avatarColorId = 'indigo';
    let goal = '';
    let retentionRate = 90;
    let isDark = false;
    let selectedSubjects: string[] = [];
    let notifPermission: NotificationPermission = 'default';

    // Password change
    let currentPassword = '';
    let newPassword = '';
    let confirmPassword = '';
    let pwStatus: 'idle' | 'loading' | 'success' | 'error' = 'idle';
    let pwErrorMsg = '';

    // Save feedback
    let saveStatus: 'idle' | 'saved' = 'idle';
    let saveTimer: ReturnType<typeof setTimeout>;

    // ─── Derived ───────────────────────────────────────────────────────────────
    $: avatarColor = AVATAR_COLORS.find(c => c.id === avatarColorId) ?? AVATAR_COLORS[0];
    $: initials = (() => {
        const name = displayName.trim() || $session.email || '';
        const parts = name.split(/[\s@]+/).filter(Boolean);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return name.slice(0, 2).toUpperCase();
    })();

    $: retentionHint = (() => {
        if (retentionRate <= 74) return 'Revisões mais espaçadas — estudo exploratório.';
        if (retentionRate <= 84) return 'Equilíbrio entre espaçamento e reforço.';
        if (retentionRate <= 92) return 'Recomendado para a maioria dos estudantes.';
        if (retentionRate <= 97) return 'Alta retenção — mais revisões, memorização sólida.';
        return 'Máxima retenção — volume de revisões muito alto.';
    })();

    $: pwStrength = (() => {
        const p = newPassword;
        if (!p) return null;
        let score = 0;
        if (p.length >= 8) score++;
        if (/[A-Z]/.test(p)) score++;
        if (/[0-9]/.test(p)) score++;
        if (/[^A-Za-z0-9]/.test(p)) score++;
        if (score <= 1) return { label: 'Fraca', color: 'bg-red-500', width: '25%' };
        if (score === 2) return { label: 'Razoável', color: 'bg-amber-500', width: '50%' };
        if (score === 3) return { label: 'Boa', color: 'bg-indigo-500', width: '75%' };
        return { label: 'Forte', color: 'bg-emerald-500', width: '100%' };
    })();

    // ─── Init ──────────────────────────────────────────────────────────────────
    onMount(() => {
        if (!browser) return;
        displayName    = localStorage.getItem('cyanki_display_name') ?? '';
        avatarColorId  = localStorage.getItem('cyanki_avatar_color') ?? 'indigo';
        goal           = localStorage.getItem('cyanki_goal') ?? '';
        retentionRate  = Number(localStorage.getItem('cyanki_retention') ?? '90');
        isDark         = document.documentElement.classList.contains('dark');
        try {
            selectedSubjects = JSON.parse(localStorage.getItem('cyanki_subjects') ?? '[]');
        } catch { selectedSubjects = []; }
        if ('Notification' in window) {
            notifPermission = Notification.permission;
        }
    });

    // ─── Helpers ───────────────────────────────────────────────────────────────
    function toggleSubject(id: string) {
        selectedSubjects = selectedSubjects.includes(id)
            ? selectedSubjects.filter(s => s !== id)
            : [...selectedSubjects, id];
    }

    function savePreferences() {
        if (!browser) return;
        localStorage.setItem('cyanki_display_name', displayName.trim());
        localStorage.setItem('cyanki_avatar_color', avatarColorId);
        localStorage.setItem('cyanki_goal', goal);
        localStorage.setItem('cyanki_retention', String(retentionRate));
        localStorage.setItem('cyanki_subjects', JSON.stringify(selectedSubjects));

        if (isDark) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }

        clearTimeout(saveTimer);
        saveStatus = 'saved';
        saveTimer = setTimeout(() => { saveStatus = 'idle'; }, 2500);
    }

    async function requestNotifications() {
        if (!browser || !('Notification' in window)) return;
        const perm = await Notification.requestPermission();
        notifPermission = perm;
        localStorage.setItem('cyanki_notifications', perm === 'granted' ? 'true' : 'false');
    }

    async function changePassword() {
        if (newPassword !== confirmPassword) {
            pwErrorMsg = 'As senhas não coincidem.';
            pwStatus = 'error';
            return;
        }
        if (newPassword.length < 8) {
            pwErrorMsg = 'A nova senha precisa ter pelo menos 8 caracteres.';
            pwStatus = 'error';
            return;
        }
        if (!currentPassword) {
            pwErrorMsg = 'Informe sua senha atual.';
            pwStatus = 'error';
            return;
        }

        pwStatus = 'loading';
        pwErrorMsg = '';

        try {
            const res = await fetch(`${PUBLIC_API_URL}/auth/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${$session.token}`
                },
                body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
            });

            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.detail ?? `Erro ${res.status}`);
            }

            pwStatus = 'success';
            currentPassword = '';
            newPassword = '';
            confirmPassword = '';
        } catch (e: any) {
            pwErrorMsg = e.message ?? 'Erro ao alterar senha. Tente novamente.';
            pwStatus = 'error';
        }
    }
</script>

<div class="min-h-screen bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 p-6 md:p-10">
    <div class="max-w-2xl mx-auto space-y-8">

        <!-- Header -->
        <div class="flex items-start justify-between gap-4">
            <div>
                <h1 class="text-3xl font-extrabold tracking-tight">Perfil & Preferências</h1>
                <p class="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Gerencie suas informações pessoais e configurações de estudo.</p>
            </div>
            <button
                on:click={savePreferences}
                class="shrink-0 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-md shadow-indigo-500/30 transition-all active:scale-[0.98] flex items-center gap-2"
            >
                {#if saveStatus === 'saved'}
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                    </svg>
                    Salvo!
                {:else}
                    Salvar
                {/if}
            </button>
        </div>

        <!-- ── Identidade ────────────────────────────────────────────────────── -->
        <section class="p-6 bg-white dark:bg-neutral-800 rounded-2xl shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 space-y-6">
            <h2 class="text-base font-bold border-b border-neutral-100 dark:border-neutral-700 pb-3">Identidade</h2>

            <!-- Avatar + name row -->
            <div class="flex items-start gap-5">
                <!-- Avatar preview -->
                <div class="shrink-0 w-20 h-20 rounded-2xl {avatarColor.bg} {avatarColor.text} flex items-center justify-center text-2xl font-black shadow-lg select-none">
                    {initials || '?'}
                </div>

                <div class="flex-1 space-y-4">
                    <!-- Display name -->
                    <div>
                        <label class="block text-sm font-semibold mb-1.5 text-neutral-700 dark:text-neutral-300">
                            Nome de exibição
                        </label>
                        <input
                            bind:value={displayName}
                            type="text"
                            placeholder="Como você quer ser chamado..."
                            maxlength="40"
                            class="w-full px-4 py-3 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm transition-all placeholder-neutral-400 dark:placeholder-neutral-600"
                        />
                        <p class="mt-1 text-xs text-neutral-400 dark:text-neutral-600">Aparece no ranking e nas estatísticas.</p>
                    </div>

                    <!-- Avatar color -->
                    <div>
                        <label class="block text-sm font-semibold mb-2 text-neutral-700 dark:text-neutral-300">Cor do avatar</label>
                        <div class="flex gap-2 flex-wrap">
                            {#each AVATAR_COLORS as color}
                                <button
                                    on:click={() => avatarColorId = color.id}
                                    class="w-8 h-8 rounded-full {color.bg} transition-all {avatarColorId === color.id ? 'ring-2 ring-offset-2 ring-indigo-500 dark:ring-offset-neutral-800 scale-110' : 'hover:scale-105'}"
                                    aria-label="Cor {color.id}"
                                    title={color.id}
                                ></button>
                            {/each}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Email (read-only) -->
            <div>
                <label class="block text-sm font-semibold mb-1.5 text-neutral-700 dark:text-neutral-300">E-mail da conta</label>
                <div class="flex items-center gap-3 px-4 py-3 rounded-xl bg-neutral-100 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700">
                    <svg class="w-4 h-4 text-neutral-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"/>
                    </svg>
                    <span class="text-sm text-neutral-700 dark:text-neutral-300 font-medium">{$session.email ?? '—'}</span>
                    <span class="ml-auto text-xs text-neutral-400 dark:text-neutral-600 italic">Não editável</span>
                </div>
                <p class="mt-1 text-xs text-neutral-400 dark:text-neutral-600">Para alterar o e-mail, entre em contato com o suporte.</p>
            </div>
        </section>

        <!-- ── Alterar senha ─────────────────────────────────────────────────── -->
        <section class="p-6 bg-white dark:bg-neutral-800 rounded-2xl shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 space-y-5">
            <h2 class="text-base font-bold border-b border-neutral-100 dark:border-neutral-700 pb-3">Alterar senha</h2>

            {#if pwStatus === 'success'}
                <div class="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400">
                    <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                    </svg>
                    <span class="text-sm font-semibold">Senha alterada com sucesso!</span>
                </div>
            {/if}

            {#if pwStatus === 'error'}
                <div class="flex items-center gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400">
                    <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                    <span class="text-sm font-medium">{pwErrorMsg}</span>
                </div>
            {/if}

            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-semibold mb-1.5 text-neutral-700 dark:text-neutral-300">Senha atual</label>
                    <input
                        bind:value={currentPassword}
                        type="password"
                        placeholder="••••••••"
                        autocomplete="current-password"
                        class="w-full px-4 py-3 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm transition-all placeholder-neutral-400"
                    />
                </div>

                <div>
                    <label class="block text-sm font-semibold mb-1.5 text-neutral-700 dark:text-neutral-300">Nova senha</label>
                    <input
                        bind:value={newPassword}
                        type="password"
                        placeholder="Mínimo 8 caracteres"
                        autocomplete="new-password"
                        class="w-full px-4 py-3 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm transition-all placeholder-neutral-400"
                    />
                    <!-- Strength meter -->
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
                        placeholder="Repita a nova senha"
                        autocomplete="new-password"
                        class="w-full px-4 py-3 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all placeholder-neutral-400
                            {confirmPassword && confirmPassword !== newPassword ? 'border-red-400 dark:border-red-600 focus:ring-red-400' : ''}"
                    />
                    {#if confirmPassword && confirmPassword !== newPassword}
                        <p class="mt-1 text-xs text-red-500 dark:text-red-400">As senhas não coincidem.</p>
                    {/if}
                </div>
            </div>

            <button
                on:click={changePassword}
                disabled={pwStatus === 'loading' || !currentPassword || !newPassword || newPassword !== confirmPassword}
                class="px-5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-900 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-white text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none flex items-center gap-2"
            >
                {#if pwStatus === 'loading'}
                    <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Alterando...
                {:else}
                    Alterar senha
                {/if}
            </button>
        </section>

        <!-- ── Parâmetros de estudo ───────────────────────────────────────────── -->
        <section class="p-6 bg-white dark:bg-neutral-800 rounded-2xl shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 space-y-6">
            <h2 class="text-base font-bold border-b border-neutral-100 dark:border-neutral-700 pb-3">Parâmetros de estudo</h2>

            <!-- Goal -->
            <div>
                <label class="block text-sm font-semibold mb-1.5 text-neutral-700 dark:text-neutral-300">Objetivo principal</label>
                <input
                    bind:value={goal}
                    type="text"
                    placeholder="Ex: Passar na OAB, aprender inglês..."
                    class="w-full px-4 py-3 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm transition-all placeholder-neutral-400 dark:placeholder-neutral-600"
                />
            </div>

            <!-- FSRS Retention -->
            <div class="space-y-3">
                <div class="flex items-center justify-between">
                    <div>
                        <label class="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Taxa de retenção FSRS</label>
                        <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Percentual de cards que você quer lembrar.</p>
                    </div>
                    <span class="text-xl font-black text-indigo-600 dark:text-indigo-400 tabular-nums">{retentionRate}%</span>
                </div>
                <input
                    type="range"
                    min="70"
                    max="99"
                    step="1"
                    bind:value={retentionRate}
                    class="w-full h-2 rounded-lg appearance-none cursor-pointer accent-indigo-600 bg-neutral-200 dark:bg-neutral-700"
                />
                <div class="flex justify-between text-[10px] text-neutral-400">
                    <span>70% — Espaçado</span>
                    <span>99% — Máxima retenção</span>
                </div>
                <p class="text-xs text-indigo-600 dark:text-indigo-400 font-medium bg-indigo-50 dark:bg-indigo-900/30 px-3 py-2 rounded-lg">{retentionHint}</p>
            </div>
        </section>

        <!-- ── Disciplinas ───────────────────────────────────────────────────── -->
        <section class="p-6 bg-white dark:bg-neutral-800 rounded-2xl shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 space-y-4">
            <div class="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-700 pb-3">
                <h2 class="text-base font-bold">Disciplinas ativas</h2>
                {#if selectedSubjects.length > 0}
                    <span class="text-xs font-semibold text-indigo-500 dark:text-indigo-400">
                        {selectedSubjects.length} selecionada{selectedSubjects.length !== 1 ? 's' : ''}
                    </span>
                {/if}
            </div>

            <p class="text-sm text-neutral-500 dark:text-neutral-400">Áreas de interesse que organizam seus cadernos e recomendações.</p>

            <div class="flex flex-wrap gap-2">
                {#each availableSubjects as subject}
                    <button
                        on:click={() => toggleSubject(subject.id)}
                        class="flex items-center gap-1.5 px-3.5 py-2 rounded-full border-2 text-sm font-semibold transition-all
                            {selectedSubjects.includes(subject.id)
                                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-500 dark:text-indigo-300'
                                : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-600'}"
                    >
                        <span class="text-base leading-none">{subject.icon}</span>
                        {subject.label}
                    </button>
                {/each}
            </div>
        </section>

        <!-- ── Preferências do app ───────────────────────────────────────────── -->
        <section class="p-6 bg-white dark:bg-neutral-800 rounded-2xl shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 space-y-5">
            <h2 class="text-base font-bold border-b border-neutral-100 dark:border-neutral-700 pb-3">Preferências do app</h2>

            <!-- Dark mode -->
            <div class="flex items-center justify-between">
                <div>
                    <span class="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Modo escuro</span>
                    <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Alterna entre tema claro e escuro.</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" bind:checked={isDark} on:change={savePreferences} class="sr-only peer">
                    <div class="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-neutral-600 peer-checked:bg-indigo-600"></div>
                </label>
            </div>

            <!-- Notifications -->
            <div class="flex items-center justify-between pt-4 border-t border-neutral-100 dark:border-neutral-700">
                <div>
                    <span class="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Lembretes de estudo</span>
                    <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Notificações para revisões e metas de estudo.</p>
                </div>
                <div class="shrink-0 ml-4">
                    {#if notifPermission === 'granted'}
                        <span class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold rounded-full">
                            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                            Ativas
                        </span>
                    {:else if notifPermission === 'denied'}
                        <span class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-semibold rounded-full">Bloqueadas</span>
                    {:else}
                        <button
                            on:click={requestNotifications}
                            class="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
                        >Ativar</button>
                    {/if}
                </div>
            </div>
        </section>

        <!-- ── Link privacidade ──────────────────────────────────────────────── -->
        <div class="flex items-center justify-between p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700">
            <div>
                <p class="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Privacidade & Dados</p>
                <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Exporte seus dados, apague o histórico ou exclua sua conta (LGPD).</p>
            </div>
            <a href="/privacy" class="shrink-0 px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-sm font-semibold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors">
                Gerenciar →
            </a>
        </div>

        <!-- ── Salvar (bottom) ────────────────────────────────────────────────── -->
        <div class="flex justify-end">
            <button
                on:click={savePreferences}
                class="px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md shadow-indigo-500/30 transition-all active:scale-[0.98] flex items-center gap-2"
            >
                {#if saveStatus === 'saved'}
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                    </svg>
                    Preferências salvas!
                {:else}
                    Salvar preferências
                {/if}
            </button>
        </div>

    </div>
</div>
