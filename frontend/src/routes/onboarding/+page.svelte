<script lang="ts">
    import { goto } from '$app/navigation';
    import { browser } from '$app/environment';
    import { onMount } from 'svelte';
    import { session } from '$lib/authStore';

    // ─── Guards ────────────────────────────────────────────────────────────────
    onMount(() => {
        if (!$session.token) {
            goto('/login');
            return;
        }
        if (browser && localStorage.getItem('cyanki_profile_setup') === 'true') {
            goto('/dashboard');
        }
        // Seed FSRS retention from any previous visit
        const saved = browser ? localStorage.getItem('cyanki_retention') : null;
        if (saved) retentionRate = Number(saved);

        // Check notification permission state
        if (browser && 'Notification' in window) {
            notifPermission = Notification.permission;
            notificationsEnabled = notifPermission === 'granted';
        }
    });

    // ─── Step state ────────────────────────────────────────────────────────────
    let step = 1;
    const TOTAL_STEPS = 4;

    // ─── Step 1: Objetivo ──────────────────────────────────────────────────────
    let goal = '';

    // ─── Step 2: Disciplinas ───────────────────────────────────────────────────
    const availableSubjects = [
        { id: 'math',        label: 'Matemática',      icon: '📐' },
        { id: 'programming', label: 'Programação / TI', icon: '💻' },
        { id: 'law',         label: 'Direito',          icon: '⚖️' },
        { id: 'biology',     label: 'Biologia',         icon: '🧬' },
        { id: 'history',     label: 'História',         icon: '📜' },
        { id: 'languages',   label: 'Idiomas',          icon: '🌍' },
        { id: 'medicine',    label: 'Medicina',         icon: '🩺' },
        { id: 'physics',     label: 'Física',           icon: '⚛️' },
        { id: 'chemistry',   label: 'Química',          icon: '🧪' },
        { id: 'geography',   label: 'Geografia',        icon: '🗺️' },
        { id: 'philosophy',  label: 'Filosofia',        icon: '🤔' },
        { id: 'other',       label: 'Outras',           icon: '📚' },
    ];
    let selectedSubjects: string[] = [];

    function toggleSubject(id: string) {
        selectedSubjects = selectedSubjects.includes(id)
            ? selectedSubjects.filter(s => s !== id)
            : [...selectedSubjects, id];
    }

    // ─── Step 3: FSRS + Notificações ──────────────────────────────────────────
    let retentionRate = 90;
    let notificationsEnabled = false;
    let notifPermission: NotificationPermission = 'default';

    const retentionHints: Record<number, string> = {
        70: 'Revisões mais espaçadas — ideal para estudo exploratório.',
        80: 'Equilíbrio entre espaçamento e reforço.',
        90: 'Configuração recomendada para a maioria dos estudantes.',
        95: 'Alta retenção — mais revisões, memorização sólida.',
        99: 'Máxima retenção — volume de revisões muito alto.',
    };

    $: retentionHint = (() => {
        const keys = [70, 80, 90, 95, 99];
        const closest = keys.reduce((prev, curr) =>
            Math.abs(curr - retentionRate) < Math.abs(prev - retentionRate) ? curr : prev
        );
        return retentionHints[closest];
    })();

    async function requestNotifications() {
        if (!browser || !('Notification' in window)) return;
        const perm = await Notification.requestPermission();
        notifPermission = perm;
        notificationsEnabled = perm === 'granted';
    }

    // ─── Navigation ────────────────────────────────────────────────────────────
    function next() { step = Math.min(TOTAL_STEPS, step + 1); }
    function back() { step = Math.max(1, step - 1); }

    function completeOnboarding() {
        if (!browser) return;
        localStorage.setItem('cyanki_profile_setup', 'true');
        localStorage.setItem('cyanki_goal', goal.trim());
        localStorage.setItem('cyanki_subjects', JSON.stringify(selectedSubjects));
        localStorage.setItem('cyanki_retention', String(retentionRate));
        localStorage.setItem('cyanki_notifications', notificationsEnabled ? 'true' : 'false');
        goto('/dashboard');
    }

    // ─── Step labels ───────────────────────────────────────────────────────────
    const stepLabels = ['Objetivo', 'Disciplinas', 'Configuração', 'Pronto'];
</script>

<div class="min-h-screen bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-950 flex flex-col items-center justify-center p-4 sm:p-8">

    <!-- Card wrapper -->
    <div class="w-full max-w-lg">

        <!-- Logo -->
        <div class="flex items-center justify-center gap-3 mb-8">
            <div class="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-900/50">
                <span class="text-indigo-600 font-extrabold text-xl">C</span>
            </div>
            <h1 class="text-2xl font-extrabold tracking-tight text-white">Cyanki</h1>
        </div>

        <!-- Step progress bar -->
        <div class="flex items-center mb-8 px-2">
            {#each stepLabels as label, i}
                {@const n = i + 1}
                <div class="flex items-center {i < stepLabels.length - 1 ? 'flex-1' : ''}">
                    <!-- Circle -->
                    <div class="flex flex-col items-center">
                        <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all duration-300
                            {step > n
                                ? 'bg-indigo-500 border-indigo-500 text-white'
                                : step === n
                                    ? 'bg-white border-white text-indigo-700'
                                    : 'bg-transparent border-white/30 text-white/40'
                            }">
                            {#if step > n}
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                                </svg>
                            {:else}
                                {n}
                            {/if}
                        </div>
                        <span class="mt-1 text-[10px] font-semibold tracking-wide
                            {step === n ? 'text-white' : 'text-white/30'}">{label}</span>
                    </div>
                    <!-- Connector line -->
                    {#if i < stepLabels.length - 1}
                        <div class="flex-1 h-0.5 mx-1 mt-[-10px] transition-all duration-500
                            {step > n ? 'bg-indigo-500' : 'bg-white/15'}"></div>
                    {/if}
                </div>
            {/each}
        </div>

        <!-- Card -->
        <div class="bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl shadow-indigo-900/40 ring-1 ring-white/10 p-8 space-y-6">

            <!-- ── Step 1: Objetivo ──────────────────────────────────────────── -->
            {#if step === 1}
                <div>
                    <h2 class="text-2xl font-extrabold text-neutral-900 dark:text-white mb-1">Qual é seu objetivo?</h2>
                    <p class="text-sm text-neutral-500 dark:text-neutral-400">Defina uma meta clara para que o Cyanki possa personalizar sua experiência.</p>
                </div>

                <div class="space-y-3">
                    <label class="block text-sm font-semibold text-neutral-700 dark:text-neutral-300">Meu objetivo principal</label>
                    <input
                        bind:value={goal}
                        type="text"
                        placeholder="Ex: Passar na OAB, aprender inglês, concurso ENEM..."
                        class="w-full px-4 py-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-600 transition-all"
                        autofocus
                    />
                    <p class="text-xs text-neutral-400 dark:text-neutral-600">Você pode alterar isso depois em Perfil → Parâmetros de estudo.</p>
                </div>

                <div class="grid grid-cols-2 gap-3 pt-1">
                    {#each ['Passar em concurso público', 'Estudar para faculdade', 'Aprender um idioma', 'Aprender programação'] as preset}
                        <button
                            on:click={() => goal = preset}
                            class="text-left px-3 py-2.5 rounded-xl border text-xs font-medium transition-all
                                {goal === preset
                                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-600'
                                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-600'}"
                        >{preset}</button>
                    {/each}
                </div>
            {/if}

            <!-- ── Step 2: Disciplinas ───────────────────────────────────────── -->
            {#if step === 2}
                <div>
                    <h2 class="text-2xl font-extrabold text-neutral-900 dark:text-white mb-1">Áreas de interesse</h2>
                    <p class="text-sm text-neutral-500 dark:text-neutral-400">Selecione as disciplinas que você pretende estudar. Isso ajuda na organização dos seus cadernos.</p>
                </div>

                <div class="flex flex-wrap gap-2">
                    {#each availableSubjects as subject}
                        <button
                            on:click={() => toggleSubject(subject.id)}
                            class="flex items-center gap-1.5 px-3.5 py-2 rounded-full border-2 font-semibold text-sm transition-all
                                {selectedSubjects.includes(subject.id)
                                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-500 dark:text-indigo-300'
                                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-600'}"
                        >
                            <span class="text-base leading-none">{subject.icon}</span>
                            {subject.label}
                        </button>
                    {/each}
                </div>

                {#if selectedSubjects.length > 0}
                    <p class="text-xs text-indigo-500 dark:text-indigo-400 font-medium">
                        {selectedSubjects.length} disciplina{selectedSubjects.length !== 1 ? 's' : ''} selecionada{selectedSubjects.length !== 1 ? 's' : ''}
                    </p>
                {:else}
                    <p class="text-xs text-neutral-400 dark:text-neutral-600">Seleção opcional — você pode continuar sem escolher.</p>
                {/if}
            {/if}

            <!-- ── Step 3: FSRS + Notificações ───────────────────────────────── -->
            {#if step === 3}
                <div>
                    <h2 class="text-2xl font-extrabold text-neutral-900 dark:text-white mb-1">Configuração do algoritmo</h2>
                    <p class="text-sm text-neutral-500 dark:text-neutral-400">Ajuste como o FSRS vai agendar suas revisões.</p>
                </div>

                <!-- FSRS Retention -->
                <div class="space-y-3 p-5 rounded-2xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                    <div class="flex items-center justify-between">
                        <div>
                            <span class="text-sm font-bold text-neutral-800 dark:text-neutral-200">Taxa de retenção FSRS</span>
                            <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Percentual de cards que você quer lembrar nas revisões.</p>
                        </div>
                        <span class="text-2xl font-black text-indigo-600 dark:text-indigo-400 tabular-nums">{retentionRate}%</span>
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
                        <span>70% — Mais espaçado</span>
                        <span>99% — Máxima retenção</span>
                    </div>

                    <p class="text-xs text-indigo-600 dark:text-indigo-400 font-medium bg-indigo-50 dark:bg-indigo-900/30 px-3 py-2 rounded-lg">
                        {retentionHint}
                    </p>
                </div>

                <!-- Notificações -->
                <div class="p-5 rounded-2xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 space-y-3">
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <span class="text-sm font-bold text-neutral-800 dark:text-neutral-200">Lembretes de estudo</span>
                            <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Receba notificações quando houver cards para revisar ou ao atingir uma meta.</p>
                        </div>
                        {#if notifPermission === 'granted'}
                            <span class="shrink-0 px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold rounded-full">Ativado</span>
                        {:else if notifPermission === 'denied'}
                            <span class="shrink-0 px-2.5 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-semibold rounded-full">Bloqueado</span>
                        {/if}
                    </div>

                    {#if notifPermission === 'default'}
                        <button
                            on:click={requestNotifications}
                            class="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
                        >
                            Permitir notificações
                        </button>
                    {:else if notifPermission === 'denied'}
                        <p class="text-xs text-neutral-400 dark:text-neutral-600">Para ativar, habilite permissões de notificação nas configurações do navegador.</p>
                    {:else}
                        <p class="text-xs text-emerald-600 dark:text-emerald-400">Tudo certo! Você receberá lembretes quando tiver cards para revisar.</p>
                    {/if}
                </div>
            {/if}

            <!-- ── Step 4: Pronto ─────────────────────────────────────────────── -->
            {#if step === 4}
                <div class="text-center space-y-3">
                    <div class="w-20 h-20 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center mx-auto mb-2">
                        <svg class="w-10 h-10 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                        </svg>
                    </div>
                    <h2 class="text-2xl font-extrabold text-neutral-900 dark:text-white">Tudo pronto!</h2>
                    <p class="text-sm text-neutral-500 dark:text-neutral-400">Seu perfil foi configurado. O Cyanki já vai personalizar as revisões para você.</p>
                </div>

                <!-- Summary -->
                <div class="space-y-3">
                    {#if goal.trim()}
                        <div class="flex items-start gap-3 p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                            <span class="text-lg mt-0.5">🎯</span>
                            <div>
                                <p class="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Objetivo</p>
                                <p class="text-sm font-medium text-neutral-800 dark:text-neutral-200">{goal.trim()}</p>
                            </div>
                        </div>
                    {/if}

                    {#if selectedSubjects.length > 0}
                        <div class="flex items-start gap-3 p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                            <span class="text-lg mt-0.5">📚</span>
                            <div>
                                <p class="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Disciplinas</p>
                                <p class="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                                    {availableSubjects.filter(s => selectedSubjects.includes(s.id)).map(s => s.label).join(', ')}
                                </p>
                            </div>
                        </div>
                    {/if}

                    <div class="flex items-start gap-3 p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                        <span class="text-lg mt-0.5">🧠</span>
                        <div>
                            <p class="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">FSRS — Retenção</p>
                            <p class="text-sm font-medium text-neutral-800 dark:text-neutral-200">{retentionRate}% · {retentionHint}</p>
                        </div>
                    </div>

                    <div class="flex items-start gap-3 p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                        <span class="text-lg mt-0.5">🔔</span>
                        <div>
                            <p class="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Notificações</p>
                            <p class="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                                {notifPermission === 'granted' ? 'Ativadas' : notifPermission === 'denied' ? 'Bloqueadas pelo navegador' : 'Não configuradas'}
                            </p>
                        </div>
                    </div>
                </div>
            {/if}

            <!-- ── Navigation buttons ──────────────────────────────────────────── -->
            <div class="flex items-center justify-between pt-2">
                {#if step > 1}
                    <button
                        on:click={back}
                        class="px-5 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-sm font-semibold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                    >
                        ← Voltar
                    </button>
                {:else}
                    <div></div>
                {/if}

                {#if step < TOTAL_STEPS}
                    <button
                        on:click={next}
                        class="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-lg shadow-indigo-500/30 transition-all active:scale-[0.98]"
                    >
                        {step === 1 && !goal.trim() ? 'Pular →' : 'Próximo →'}
                    </button>
                {:else}
                    <button
                        on:click={completeOnboarding}
                        class="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-lg shadow-indigo-500/30 transition-all active:scale-[0.98]"
                    >
                        Começar a estudar →
                    </button>
                {/if}
            </div>

            <!-- Skip link -->
            {#if step < TOTAL_STEPS}
                <p class="text-center text-xs text-neutral-400 dark:text-neutral-600 -mt-2">
                    <button on:click={completeOnboarding} class="hover:text-neutral-600 dark:hover:text-neutral-400 underline underline-offset-2 transition-colors">
                        Pular configuração e ir direto ao app
                    </button>
                </p>
            {/if}
        </div>

        <!-- Bottom note -->
        <p class="text-center text-xs text-indigo-300/40 mt-6">
            Você pode alterar todas as configurações depois em <strong>Perfil</strong>.
        </p>
    </div>
</div>
