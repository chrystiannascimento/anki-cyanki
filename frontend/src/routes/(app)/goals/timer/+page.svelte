<script lang="ts">
    import { onDestroy } from 'svelte';
    import { timerStore, minutesToday, startTimer, pauseTimer, resetTimer, notify } from '$lib/stores/studyTimer';
    import { db } from '$lib/db';
    import { liveQuery } from 'dexie';

    // ─── Inactivity detection ─────────────────────────────────────────────────
    /** Auto-pause after 2 minutes of no keyboard/mouse activity */
    const INACTIVITY_LIMIT_MS = 2 * 60 * 1000;
    let lastActivityAt = Date.now();
    let inactivityCheckInterval: ReturnType<typeof setInterval> | null = null;

    function onActivity() {
        lastActivityAt = Date.now();
        // Resume if paused due to inactivity (user came back)
        if (!$timerStore.isRunning && autoPausedByInactivity) {
            autoPausedByInactivity = false;
            startTimer();
        }
    }

    let autoPausedByInactivity = false;

    function startInactivityWatch() {
        if (inactivityCheckInterval) return;
        inactivityCheckInterval = setInterval(() => {
            if (!$timerStore.isRunning) return;
            if (Date.now() - lastActivityAt > INACTIVITY_LIMIT_MS) {
                autoPausedByInactivity = true;
                pauseTimer();
                notify('⏸ Timer pausado', 'Pausa automática por 2 minutos de inatividade.');
            }
        }, 10_000); // check every 10s
    }

    function stopInactivityWatch() {
        if (inactivityCheckInterval) {
            clearInterval(inactivityCheckInterval);
            inactivityCheckInterval = null;
        }
    }

    onDestroy(() => {
        stopInactivityWatch();
        // Commit any running segment on navigation away
        if ($timerStore.isRunning) pauseTimer();
    });

    // ─── Countdown mode ───────────────────────────────────────────────────────
    let countdownMode = false;
    let countdownTarget = 25; // minutes
    let countdownFinished = false;

    $: {
        if (countdownMode && $timerStore.isRunning) {
            const elapsed = Math.floor(($timerStore.totalSecondsToday + $timerStore.segmentSeconds) / 60);
            // Compare segment seconds to target
            const segMin = Math.floor($timerStore.segmentSeconds / 60);
            if (segMin >= countdownTarget && !countdownFinished) {
                countdownFinished = true;
                pauseTimer();
                notify('✅ Sessão concluída!', `Você completou ${countdownTarget} minutos de foco!`);
            }
        }
    }

    $: remainingSeconds = countdownMode
        ? Math.max(0, countdownTarget * 60 - $timerStore.segmentSeconds)
        : null;

    // ─── Timer controls ───────────────────────────────────────────────────────
    function handleStart() {
        countdownFinished = false;
        lastActivityAt = Date.now();
        startTimer();
        startInactivityWatch();
    }

    function handlePause() {
        pauseTimer();
        stopInactivityWatch();
    }

    function handleReset() {
        stopInactivityWatch();
        resetTimer();
        countdownFinished = false;
    }

    // ─── Goals progress ───────────────────────────────────────────────────────
    let timeGoals: import('$lib/db').StudyGoal[] = [];

    const goalSub = liveQuery(() =>
        db.studyGoals.where('type').equals('time').toArray()
    ).subscribe(rows => { timeGoals = rows; });

    onDestroy(() => goalSub.unsubscribe());

    // ─── Format helpers ───────────────────────────────────────────────────────
    function pad(n: number) { return String(n).padStart(2, '0'); }

    function formatSeconds(s: number) {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${pad(m)}:${pad(sec)}`;
    }

    function formatSessionTime(s: number) {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        if (h > 0) return `${h}h ${pad(m)}m`;
        return `${pad(m)}m ${pad(sec)}s`;
    }

    // SVG ring for countdown
    const R = 80;
    const CIRCUMFERENCE = 2 * Math.PI * R;

    $: ringOffset = countdownMode && remainingSeconds !== null
        ? CIRCUMFERENCE * (remainingSeconds / (countdownTarget * 60))
        : $timerStore.isRunning
        ? CIRCUMFERENCE * (1 - (($timerStore.segmentSeconds % 3600) / 3600))
        : CIRCUMFERENCE;

    $: isRunning = $timerStore.isRunning;
    $: segmentSeconds = $timerStore.segmentSeconds;
    $: totalSecondsToday = $timerStore.totalSecondsToday + (isRunning ? segmentSeconds : 0);
</script>

<!-- Activity event listeners for inactivity detection -->
<svelte:window
    on:mousemove={onActivity}
    on:keydown={onActivity}
    on:touchstart={onActivity}
    on:visibilitychange={() => { if (document.hidden && isRunning) { autoPausedByInactivity = true; pauseTimer(); } }}
/>

<div class="max-w-xl mx-auto py-8 space-y-6">

    <!-- Back nav -->
    <a href="/goals" class="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-white transition">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
        Metas
    </a>

    <div>
        <h1 class="text-2xl font-extrabold text-neutral-900 dark:text-white">Timer de Foco</h1>
        <p class="text-neutral-500 dark:text-neutral-400 mt-1">Pausa automática após 2 minutos de inatividade.</p>
    </div>

    <!-- ── Inactivity notice ──────────────────────────────────────────────── -->
    {#if autoPausedByInactivity && !isRunning}
        <div class="flex items-center gap-3 px-5 py-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl">
            <span class="text-xl">⏸</span>
            <div class="flex-1">
                <p class="text-sm font-bold text-amber-800 dark:text-amber-300">Timer pausado automaticamente</p>
                <p class="text-xs text-amber-600/80 dark:text-amber-400/70">Você ficou inativo por 2 minutos. Mova o mouse ou pressione uma tecla para retomar.</p>
            </div>
        </div>
    {/if}

    <!-- ── Countdown finished notice ─────────────────────────────────────── -->
    {#if countdownFinished}
        <div class="flex items-center gap-3 px-5 py-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl">
            <span class="text-xl">✅</span>
            <p class="text-sm font-bold text-emerald-800 dark:text-emerald-300">Sessão de {countdownTarget} min concluída!</p>
        </div>
    {/if}

    <!-- ── Main timer card ────────────────────────────────────────────────── -->
    <div class="bg-white dark:bg-neutral-800 rounded-3xl ring-1 ring-neutral-200 dark:ring-neutral-700 shadow-xl p-8 flex flex-col items-center gap-6">

        <!-- Mode toggle -->
        <div class="flex gap-1 p-1 bg-neutral-100 dark:bg-neutral-700 rounded-xl">
            <button
                on:click={() => { countdownMode = false; countdownFinished = false; }}
                disabled={isRunning}
                class="px-4 py-1.5 rounded-lg text-sm font-bold transition {!countdownMode ? 'bg-white dark:bg-neutral-600 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'} disabled:opacity-50"
            >
                Cronômetro
            </button>
            <button
                on:click={() => { countdownMode = true; countdownFinished = false; }}
                disabled={isRunning}
                class="px-4 py-1.5 rounded-lg text-sm font-bold transition {countdownMode ? 'bg-white dark:bg-neutral-600 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'} disabled:opacity-50"
            >
                Contagem Regressiva
            </button>
        </div>

        <!-- Countdown duration selector -->
        {#if countdownMode && !isRunning}
            <div class="flex gap-2 flex-wrap justify-center">
                {#each [15, 25, 45, 60, 90] as t}
                    <button
                        on:click={() => { countdownTarget = t; countdownFinished = false; }}
                        class="px-3 py-1.5 rounded-full text-sm font-bold border-2 transition {countdownTarget === t ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'border-neutral-200 dark:border-neutral-600 text-neutral-500 hover:border-indigo-400'}"
                    >
                        {t}min
                    </button>
                {/each}
            </div>
        {/if}

        <!-- SVG ring + time display -->
        <div class="relative">
            <svg width="200" height="200" viewBox="0 0 200 200">
                <!-- Background ring -->
                <circle cx="100" cy="100" r={R} fill="none" stroke="#e5e7eb" class="dark:stroke-neutral-700" stroke-width="12"/>
                <!-- Progress ring -->
                <circle
                    cx="100" cy="100" r={R} fill="none"
                    stroke={isRunning ? '#6366f1' : '#9ca3af'}
                    stroke-width="12"
                    stroke-dasharray={CIRCUMFERENCE}
                    stroke-dashoffset={ringOffset}
                    stroke-linecap="round"
                    transform="rotate(-90 100 100)"
                    class="transition-all duration-1000"
                />
            </svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center">
                {#if countdownMode && remainingSeconds !== null}
                    <span class="text-4xl font-black font-mono text-neutral-800 dark:text-white tabular-nums">
                        {formatSeconds(remainingSeconds)}
                    </span>
                    <span class="text-xs text-neutral-400 font-bold mt-1">restantes</span>
                {:else}
                    <span class="text-4xl font-black font-mono text-neutral-800 dark:text-white tabular-nums">
                        {formatSeconds(segmentSeconds)}
                    </span>
                    <span class="text-xs text-neutral-400 font-bold mt-1">esta sessão</span>
                {/if}
            </div>
        </div>

        <!-- Status indicator -->
        <div class="flex items-center gap-2 text-sm font-bold">
            <div class="w-2 h-2 rounded-full {isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-300 dark:bg-neutral-600'}"></div>
            <span class="text-neutral-500 dark:text-neutral-400">
                {#if isRunning}
                    Em foco
                {:else if autoPausedByInactivity}
                    Pausado — inatividade
                {:else}
                    Pausado
                {/if}
            </span>
        </div>

        <!-- Controls -->
        <div class="flex gap-3">
            {#if !isRunning}
                <button
                    on:click={handleStart}
                    disabled={countdownFinished}
                    class="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl shadow-lg shadow-indigo-500/20 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                    {segmentSeconds > 0 || autoPausedByInactivity ? 'Retomar' : 'Iniciar'}
                </button>
            {:else}
                <button
                    on:click={handlePause}
                    class="px-8 py-3 bg-amber-500 hover:bg-amber-400 text-white font-black rounded-xl shadow-lg shadow-amber-500/20 transition active:scale-95 text-sm"
                >
                    Pausar
                </button>
            {/if}
            <button
                on:click={handleReset}
                class="px-5 py-3 border-2 border-neutral-200 dark:border-neutral-600 text-neutral-500 dark:text-neutral-400 font-bold rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-700 transition text-sm"
            >
                Resetar
            </button>
        </div>

    </div>

    <!-- ── Today's summary ────────────────────────────────────────────────── -->
    <div class="grid grid-cols-2 gap-4">
        <div class="p-5 bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-neutral-200 dark:ring-neutral-700 text-center">
            <div class="text-3xl font-black text-indigo-500">{$minutesToday}</div>
            <div class="text-xs text-neutral-400 font-black uppercase tracking-wider mt-1">Min. focados hoje</div>
        </div>
        <div class="p-5 bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-neutral-200 dark:ring-neutral-700 text-center">
            <div class="text-3xl font-black text-emerald-500">{formatSessionTime(totalSecondsToday)}</div>
            <div class="text-xs text-neutral-400 font-black uppercase tracking-wider mt-1">Total acumulado</div>
        </div>
    </div>

    <!-- ── Time goals progress ────────────────────────────────────────────── -->
    {#if timeGoals.length > 0}
        <div class="space-y-3">
            <h2 class="text-sm font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Metas de Tempo</h2>
            {#each timeGoals as goal (goal.id)}
                {@const pct = Math.min(Math.round(($minutesToday / goal.target) * 100), 100)}
                {@const done = $minutesToday >= goal.target}
                <div class="p-4 bg-white dark:bg-neutral-800 rounded-2xl ring-1 {done ? 'ring-emerald-300 dark:ring-emerald-700' : 'ring-neutral-200 dark:ring-neutral-700'}">
                    <div class="flex justify-between items-center mb-2">
                        <span class="font-bold text-sm text-neutral-800 dark:text-neutral-200 {done ? 'line-through text-neutral-400 dark:text-neutral-500' : ''}">{goal.label}</span>
                        {#if done}<span class="text-xs font-black text-emerald-500">✓ Concluída!</span>{/if}
                    </div>
                    <div class="w-full h-2 bg-neutral-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                        <div class="h-full rounded-full transition-all duration-500 {done ? 'bg-emerald-500' : 'bg-indigo-500'}" style="width: {pct}%"></div>
                    </div>
                    <div class="flex justify-between text-xs text-neutral-400 mt-1.5 font-medium">
                        <span>{$minutesToday} min</span>
                        <span>{pct}% · meta: {goal.target} min</span>
                    </div>
                </div>
            {/each}
        </div>
    {:else}
        <div class="text-center py-4">
            <a href="/goals" class="text-sm text-indigo-500 hover:underline font-semibold">+ Criar meta de tempo de foco</a>
        </div>
    {/if}

</div>
