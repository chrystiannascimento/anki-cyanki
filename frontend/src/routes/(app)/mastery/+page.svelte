<script lang="ts">
    import { onMount } from 'svelte';
    import {
        computeAllTagsMastery,
        LEVEL_META,
        circleCircumference,
        ringOffset,
        type TagMastery,
        type MasteryLevel
    } from '$lib/mastery';

    // --- State ---
    let allMastery: TagMastery[] = [];
    let loading = true;
    let selectedLevel: MasteryLevel | 'all' = 'all';
    let searchQuery = '';

    // SVG ring dimensions
    const R = 36;          // circle radius
    const SIZE = 96;       // viewBox size (R*2 + stroke*2)
    const STROKE = 8;
    const C = circleCircumference(R);

    // -------------------------------------------------------------------
    // Derived
    // -------------------------------------------------------------------

    $: filtered = allMastery
        .filter(t => selectedLevel === 'all' || t.level === selectedLevel)
        .filter(t => !searchQuery.trim() || t.tag.toLowerCase().includes(searchQuery.toLowerCase()));

    $: summary = {
        total: allMastery.length,
        mestre:       allMastery.filter(t => t.level === 'Mestre').length,
        proficiente:  allMastery.filter(t => t.level === 'Proficiente').length,
        familiarizado:allMastery.filter(t => t.level === 'Familiarizado').length,
        iniciante:    allMastery.filter(t => t.level === 'Iniciante').length,
        decaying:     allMastery.filter(t => t.isDecaying).length,
    };

    $: avgScore = allMastery.length > 0
        ? Math.round(allMastery.reduce((s, t) => s + t.score, 0) / allMastery.length)
        : 0;

    // -------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------

    function fmtDate(ts: number | null): string {
        if (ts === null) return 'Nunca';
        return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function accuracyColor(pct: number): string {
        if (pct >= 75) return 'text-emerald-600 dark:text-emerald-400';
        if (pct >= 50) return 'text-amber-600 dark:text-amber-400';
        return 'text-rose-600 dark:text-rose-400';
    }

    // -------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------

    onMount(async () => {
        allMastery = await computeAllTagsMastery();
        loading = false;
    });

    const levels: (MasteryLevel | 'all')[] = ['all', 'Mestre', 'Proficiente', 'Familiarizado', 'Iniciante'];
    const levelLabels: Record<string, string> = {
        all: 'Todos',
        Mestre: 'Mestre',
        Proficiente: 'Proficiente',
        Familiarizado: 'Familiarizado',
        Iniciante: 'Iniciante',
    };
</script>

<!-- ================================================================ -->
<!-- Page -->
<!-- ================================================================ -->

<div class="max-w-5xl mx-auto space-y-8">

    <!-- Header -->
    <div>
        <h1 class="text-2xl font-extrabold text-neutral-800 dark:text-neutral-100">Mestria por Tópico</h1>
        <p class="text-sm text-neutral-500 mt-1">
            Acompanhe o domínio de cada tag dos seus flashcards. O nível decai se você parar de revisar.
        </p>
    </div>

    {#if loading}
        <div class="flex items-center justify-center py-24 text-neutral-400 gap-3">
            <svg class="animate-spin h-7 w-7" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span class="font-semibold text-sm">Calculando mestria...</span>
        </div>

    {:else if allMastery.length === 0}
        <div class="bg-white dark:bg-neutral-800 rounded-2xl p-16 text-center shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700">
            <div class="text-5xl mb-4">🏷️</div>
            <h2 class="text-lg font-extrabold text-neutral-700 dark:text-neutral-300">Nenhum tópico encontrado</h2>
            <p class="text-sm text-neutral-500 mt-2 max-w-sm mx-auto">
                Adicione flashcards com tags para começar a rastrear seu nível de mestria por tópico.
            </p>
            <a href="/dashboard" class="mt-6 inline-block px-5 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition text-sm">
                Criar Flashcards
            </a>
        </div>

    {:else}

        <!-- Summary KPIs -->
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
            <!-- Overall avg ring -->
            <div class="col-span-2 md:col-span-1 bg-white dark:bg-neutral-800 rounded-2xl p-4 shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 flex flex-col items-center justify-center gap-1">
                <svg width="80" height="80" viewBox="0 0 {SIZE} {SIZE}" class="-rotate-90">
                    <circle cx={SIZE/2} cy={SIZE/2} r={R} fill="none" stroke="#e5e7eb" stroke-width={STROKE} class="dark:stroke-neutral-700"/>
                    <circle
                        cx={SIZE/2} cy={SIZE/2} r={R} fill="none"
                        stroke="#6366f1"
                        stroke-width={STROKE}
                        stroke-linecap="round"
                        stroke-dasharray={C}
                        stroke-dashoffset={ringOffset(R, avgScore)}
                        class="transition-all duration-700"
                    />
                </svg>
                <span class="text-2xl font-black text-indigo-600 dark:text-indigo-400 -mt-1">{avgScore}</span>
                <span class="text-[10px] font-bold text-neutral-500 uppercase tracking-widest text-center">Média Geral</span>
            </div>

            {#each [
                { label: 'Mestre',        count: summary.mestre,        meta: LEVEL_META['Mestre'] },
                { label: 'Proficiente',   count: summary.proficiente,   meta: LEVEL_META['Proficiente'] },
                { label: 'Familiarizado', count: summary.familiarizado, meta: LEVEL_META['Familiarizado'] },
                { label: 'Iniciante',     count: summary.iniciante,     meta: LEVEL_META['Iniciante'] },
            ] as item}
                <button
                    on:click={() => selectedLevel = selectedLevel === item.label ? 'all' : item.label as MasteryLevel}
                    class="bg-white dark:bg-neutral-800 rounded-2xl p-4 shadow-sm ring-1 transition-all
                        {selectedLevel === item.label
                            ? 'ring-2 ring-indigo-400 dark:ring-indigo-500'
                            : 'ring-neutral-200 dark:ring-neutral-700 hover:shadow-md'}
                        flex flex-col items-center justify-center gap-1 cursor-pointer"
                >
                    <span class="text-3xl font-black {item.meta.color}">{item.count}</span>
                    <span class="text-[10px] font-bold text-neutral-500 uppercase tracking-widest text-center">{item.label}</span>
                </button>
            {/each}
        </div>

        <!-- Decay warning banner -->
        {#if summary.decaying > 0}
            <div class="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl px-4 py-3">
                <svg class="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
                <p class="text-sm text-amber-800 dark:text-amber-300 font-medium">
                    <strong>{summary.decaying} tópico{summary.decaying > 1 ? 's' : ''}</strong> com nível em queda por inatividade.
                    Revise-os para recuperar o domínio.
                </p>
            </div>
        {/if}

        <!-- Filters row -->
        <div class="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <!-- Level filter pills -->
            <div class="flex items-center gap-1 flex-wrap">
                {#each levels as lvl}
                    <button
                        on:click={() => selectedLevel = lvl}
                        class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors
                            {selectedLevel === lvl
                                ? 'bg-indigo-600 text-white shadow'
                                : 'bg-white dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 hover:text-neutral-700 dark:hover:text-neutral-200'}"
                    >
                        {levelLabels[lvl]}
                    </button>
                {/each}
            </div>

            <!-- Search -->
            <div class="sm:ml-auto">
                <input
                    bind:value={searchQuery}
                    type="text"
                    placeholder="Buscar tópico..."
                    class="w-full sm:w-52 px-3 py-1.5 text-sm rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white placeholder-neutral-400 transition"
                />
            </div>
        </div>

        <!-- Empty filtered state -->
        {#if filtered.length === 0}
            <div class="bg-white dark:bg-neutral-800 rounded-2xl p-12 text-center shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700">
                <p class="text-neutral-500 font-medium">Nenhum tópico encontrado para este filtro.</p>
                <button on:click={() => { selectedLevel = 'all'; searchQuery = ''; }}
                    class="mt-3 text-indigo-600 dark:text-indigo-400 font-bold hover:underline text-sm">
                    Limpar filtros
                </button>
            </div>

        {:else}
            <!-- Mastery grid -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {#each filtered as t (t.tag)}
                    {@const meta = LEVEL_META[t.level]}
                    {@const offset = ringOffset(R, t.score)}
                    <div class="bg-white dark:bg-neutral-800 rounded-2xl p-5 shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 hover:shadow-md transition-shadow flex flex-col gap-4">

                        <!-- Top: ring + tag name + level badge -->
                        <div class="flex items-center gap-4">
                            <!-- Progress ring -->
                            <div class="relative shrink-0">
                                <svg width="72" height="72" viewBox="0 0 {SIZE} {SIZE}" class="-rotate-90">
                                    <!-- Track -->
                                    <circle cx={SIZE/2} cy={SIZE/2} r={R} fill="none"
                                        stroke="#e5e7eb" stroke-width={STROKE}
                                        class="dark:stroke-neutral-700"/>
                                    <!-- Progress -->
                                    <circle
                                        cx={SIZE/2} cy={SIZE/2} r={R} fill="none"
                                        stroke={meta.ring}
                                        stroke-width={STROKE}
                                        stroke-linecap="round"
                                        stroke-dasharray={C}
                                        stroke-dashoffset={offset}
                                        class="transition-all duration-700"
                                    />
                                </svg>
                                <!-- Score label inside ring -->
                                <span class="absolute inset-0 flex items-center justify-center text-sm font-black {meta.color}">
                                    {t.score}
                                </span>
                                <!-- Decay indicator -->
                                {#if t.isDecaying}
                                    <span class="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full border-2 border-white dark:border-neutral-800 flex items-center justify-center" title="Nível em queda por inatividade">
                                        <svg class="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                            <path fill-rule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
                                        </svg>
                                    </span>
                                {/if}
                            </div>

                            <div class="min-w-0 flex-1">
                                <h3 class="font-bold text-neutral-800 dark:text-neutral-100 truncate" title={t.tag}>
                                    #{t.tag}
                                </h3>
                                <span class="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider {meta.bg} {meta.text}">
                                    {t.level}
                                </span>
                            </div>
                        </div>

                        <!-- Stats grid -->
                        <div class="grid grid-cols-3 gap-2 text-center">
                            <div class="bg-neutral-50 dark:bg-neutral-900/40 rounded-lg p-2">
                                <div class="text-sm font-black {accuracyColor(t.accuracy)}">{t.accuracy}%</div>
                                <div class="text-[9px] text-neutral-400 font-bold uppercase tracking-wider mt-0.5">Acerto</div>
                            </div>
                            <div class="bg-neutral-50 dark:bg-neutral-900/40 rounded-lg p-2">
                                <div class="text-sm font-black text-neutral-700 dark:text-neutral-300">{t.coverage}%</div>
                                <div class="text-[9px] text-neutral-400 font-bold uppercase tracking-wider mt-0.5">Cobertura</div>
                            </div>
                            <div class="bg-neutral-50 dark:bg-neutral-900/40 rounded-lg p-2">
                                <div class="text-sm font-black text-neutral-700 dark:text-neutral-300">{t.totalCards}</div>
                                <div class="text-[9px] text-neutral-400 font-bold uppercase tracking-wider mt-0.5">Cards</div>
                            </div>
                        </div>

                        <!-- Footer: last review + reviews count -->
                        <div class="pt-3 border-t border-neutral-100 dark:border-neutral-700 flex justify-between items-center text-xs text-neutral-400">
                            <span>
                                {t.totalReviews} revisão{t.totalReviews !== 1 ? 'ões' : ''}
                                {#if t.recentReviews > 0}
                                    <span class="text-indigo-400 dark:text-indigo-500 font-semibold">
                                        · {t.recentReviews} recentes
                                    </span>
                                {/if}
                            </span>
                            <span class="{t.isDecaying ? 'text-amber-500 font-semibold' : ''}">
                                {#if t.daysSinceLast === null}
                                    Nunca revisado
                                {:else if t.daysSinceLast === 0}
                                    Revisado hoje
                                {:else}
                                    {t.daysSinceLast}d atrás
                                {/if}
                            </span>
                        </div>

                        <!-- Decay message -->
                        {#if t.isDecaying}
                            <p class="text-[10px] text-amber-600 dark:text-amber-400 font-medium -mt-2">
                                ⚠️ Nível caindo após {t.daysSinceLast}d sem revisão. Estude para recuperar.
                            </p>
                        {/if}
                    </div>
                {/each}
            </div>

            <!-- Results count -->
            <p class="text-xs text-neutral-400 text-center pb-4">
                Exibindo {filtered.length} de {allMastery.length} tópico{allMastery.length !== 1 ? 's' : ''}
            </p>
        {/if}

    {/if}
</div>
