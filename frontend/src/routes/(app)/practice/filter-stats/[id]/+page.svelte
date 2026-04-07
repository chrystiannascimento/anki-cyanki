<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { db, type SavedFilter, type Flashcard, type ReviewLog } from '$lib/db';
    import { goto } from '$app/navigation';

    const filterId = $page.params.id;

    // --- State ---
    let filter: SavedFilter | null = null;
    let loading = true;
    let notFound = false;

    // Raw data
    let matchingCards: Flashcard[] = [];
    let logs: ReviewLog[] = [];

    // Computed metrics
    let totalCards = 0;
    let reviewedCards = 0;
    let neverReviewedCards = 0;
    let totalReviews = 0;
    let correctReviews = 0;   // grade >= 2 (Good or Easy)
    let hardReviews = 0;      // grade === 1 (Hard — attempted but struggled)
    let againReviews = 0;     // grade === 0 (Again — failed)
    let accuracyRate = 0;     // correctReviews / totalReviews * 100

    // Grade distribution for bar chart: [Again, Hard, Good, Easy]
    let gradeCounts = [0, 0, 0, 0];

    // Reviews per day — last 30 days
    interface DayEntry { label: string; count: number; date: Date }
    let dailyData: DayEntry[] = [];
    let dailyMax = 1;

    // Period filter
    let selectedPeriod: '7' | '30' | '90' | 'all' = '30';

    // -------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------

    function startOfDay(date: Date): number {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    }

    function applyPeriodCutoff(): number {
        if (selectedPeriod === 'all') return 0;
        const days = parseInt(selectedPeriod);
        return Date.now() - days * 24 * 60 * 60 * 1000;
    }

    /** Execute the filter criteria query against the local DB (same logic as questions page). */
    async function queryMatchingCards(criteria: SavedFilter['criteria']): Promise<Flashcard[]> {
        const tags = criteria.tags ?? [];
        let results: Flashcard[];

        if (tags.length > 0) {
            const firstTag = tags[0];
            const initial = await db.flashcards.where('tags').equals(firstTag).toArray();
            results = initial.filter(c => tags.every(t => c.tags?.includes(t)));
        } else {
            results = await db.flashcards.toArray();
        }

        if (criteria.keyword?.trim()) {
            const q = criteria.keyword.toLowerCase();
            results = results.filter(c =>
                c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q)
            );
        }

        if (criteria.difficulty && criteria.difficulty !== 'all') {
            results = results.filter(c => c.tags?.includes(criteria.difficulty!));
        }

        return results;
    }

    function computeMetrics() {
        const cutoff = applyPeriodCutoff();
        const cardIds = new Set(matchingCards.map(c => c.id));

        const periodLogs = logs.filter(l =>
            cardIds.has(l.flashcardId) && l.reviewedAt >= cutoff
        );

        totalCards = matchingCards.length;
        totalReviews = periodLogs.length;

        const reviewedCardIds = new Set(periodLogs.map(l => l.flashcardId));
        reviewedCards = reviewedCardIds.size;
        neverReviewedCards = totalCards - [...cardIds].filter(id => reviewedCardIds.has(id)).length;

        gradeCounts = [0, 0, 0, 0];
        periodLogs.forEach(l => {
            const g = Math.min(l.grade, 3);
            if (g >= 0) gradeCounts[g]++;
        });

        againReviews = gradeCounts[0];
        hardReviews  = gradeCounts[1];
        const goodEasy = gradeCounts[2] + gradeCounts[3];
        correctReviews = goodEasy;
        accuracyRate = totalReviews > 0 ? Math.round((correctReviews / totalReviews) * 100) : 0;

        buildDailyData(periodLogs, cutoff);
    }

    function buildDailyData(periodLogs: ReviewLog[], cutoff: number) {
        const days = selectedPeriod === 'all' ? 30 : parseInt(selectedPeriod);
        const now = new Date();
        const map: Map<string, number> = new Map();

        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            d.setHours(0, 0, 0, 0);
            const key = d.toISOString().slice(0, 10);
            map.set(key, 0);
        }

        periodLogs.forEach(l => {
            if (cutoff > 0 && l.reviewedAt < cutoff) return;
            const key = new Date(l.reviewedAt).toISOString().slice(0, 10);
            if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
        });

        dailyData = [...map.entries()].map(([dateStr, count]) => {
            const d = new Date(dateStr + 'T00:00:00');
            return {
                label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
                count,
                date: d
            };
        });

        dailyMax = Math.max(1, ...dailyData.map(d => d.count));
    }

    // -------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------

    onMount(async () => {
        filter = (await db.savedFilters.get(filterId)) ?? null;
        if (!filter) {
            notFound = true;
            loading = false;
            return;
        }

        [matchingCards, logs] = await Promise.all([
            queryMatchingCards(filter.criteria),
            db.reviewLogs.toArray()
        ]);

        computeMetrics();
        loading = false;
    });

    $: if (!loading && filter) computeMetrics();

    // -------------------------------------------------------------------
    // Derived for display
    // -------------------------------------------------------------------

    const gradeLabels = ['Again', 'Hard', 'Good', 'Easy'];
    const gradeColors = [
        'bg-rose-500',
        'bg-amber-500',
        'bg-emerald-500',
        'bg-indigo-500'
    ];
    const gradeTextColors = [
        'text-rose-600 dark:text-rose-400',
        'text-amber-600 dark:text-amber-400',
        'text-emerald-600 dark:text-emerald-400',
        'text-indigo-600 dark:text-indigo-400'
    ];
    const gradeBg = [
        'bg-rose-50 dark:bg-rose-900/20',
        'bg-amber-50 dark:bg-amber-900/20',
        'bg-emerald-50 dark:bg-emerald-900/20',
        'bg-indigo-50 dark:bg-indigo-900/20'
    ];

    function accuracyColor(rate: number): string {
        if (rate >= 75) return 'text-emerald-600 dark:text-emerald-400';
        if (rate >= 50) return 'text-amber-600 dark:text-amber-400';
        return 'text-rose-600 dark:text-rose-400';
    }

    function formatTags(tags: string[]): string {
        return tags.slice(0, 5).map(t => `#${t}`).join('  ');
    }
</script>

<!-- ============================================================ -->
<!-- Page -->
<!-- ============================================================ -->

{#if loading}
    <div class="flex items-center justify-center min-h-[60vh] text-neutral-400">
        <svg class="animate-spin h-8 w-8 mr-3" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        Calculando métricas...
    </div>

{:else if notFound}
    <div class="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <div class="text-5xl">🔍</div>
        <h2 class="text-xl font-extrabold text-neutral-700 dark:text-neutral-300">Filtro não encontrado</h2>
        <p class="text-sm text-neutral-500">Este filtro salvo não existe ou foi excluído.</p>
        <button on:click={() => goto('/practice/questions')} class="px-5 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition">
            Voltar aos Filtros
        </button>
    </div>

{:else if filter}
<div class="max-w-5xl mx-auto space-y-8">

    <!-- Header -->
    <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div class="flex items-center gap-3">
            <button on:click={() => goto('/practice/questions')}
                class="p-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition text-neutral-500">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                </svg>
            </button>
            <div>
                <p class="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-0.5">Desempenho do Caderno Virtual</p>
                <h1 class="text-2xl font-extrabold text-neutral-800 dark:text-neutral-100">{filter.name}</h1>
                {#if filter.criteria.tags?.length}
                    <p class="text-xs text-indigo-500 dark:text-indigo-400 font-mono mt-0.5">{formatTags(filter.criteria.tags)}</p>
                {/if}
            </div>
        </div>

        <!-- Period selector -->
        <div class="flex items-center gap-1 bg-white dark:bg-neutral-800 p-1 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-sm">
            {#each [['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias'], ['all', 'Sempre']] as [val, label]}
                <button
                    on:click={() => { selectedPeriod = val as typeof selectedPeriod; }}
                    class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors
                        {selectedPeriod === val
                            ? 'bg-indigo-600 text-white shadow'
                            : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}"
                >
                    {label}
                </button>
            {/each}
        </div>
    </div>

    <!-- KPI Row -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <!-- Taxa de Acerto -->
        <div class="bg-white dark:bg-neutral-800 rounded-2xl p-5 shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 flex flex-col items-center justify-center gap-1 col-span-2 md:col-span-1">
            <span class="text-4xl font-black {accuracyColor(accuracyRate)}">{accuracyRate}%</span>
            <span class="text-xs font-bold text-neutral-500 uppercase tracking-widest text-center">Taxa de Acerto</span>
            {#if totalReviews > 0}
                <div class="w-full bg-neutral-100 dark:bg-neutral-700 rounded-full h-1.5 mt-1 overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-700
                        {accuracyRate >= 75 ? 'bg-emerald-500' : accuracyRate >= 50 ? 'bg-amber-500' : 'bg-rose-500'}"
                        style="width: {accuracyRate}%">
                    </div>
                </div>
            {/if}
        </div>

        <div class="bg-white dark:bg-neutral-800 rounded-2xl p-5 shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 flex flex-col items-center justify-center gap-1">
            <span class="text-3xl font-black text-neutral-800 dark:text-neutral-100">{totalReviews}</span>
            <span class="text-xs font-bold text-neutral-500 uppercase tracking-widest text-center">Revisões</span>
        </div>

        <div class="bg-white dark:bg-neutral-800 rounded-2xl p-5 shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 flex flex-col items-center justify-center gap-1">
            <span class="text-3xl font-black text-indigo-600 dark:text-indigo-400">{reviewedCards}</span>
            <span class="text-xs font-bold text-neutral-500 uppercase tracking-widest text-center">Cards Revistos</span>
            <span class="text-[10px] text-neutral-400">de {totalCards} no filtro</span>
        </div>

        <div class="bg-white dark:bg-neutral-800 rounded-2xl p-5 shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 flex flex-col items-center justify-center gap-1">
            <span class="text-3xl font-black text-amber-600 dark:text-amber-400">{neverReviewedCards}</span>
            <span class="text-xs font-bold text-neutral-500 uppercase tracking-widest text-center">Nunca Revistos</span>
        </div>
    </div>

    <!-- Charts Row -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">

        <!-- Daily activity bar chart (spans 2 cols) -->
        <div class="md:col-span-2 bg-white dark:bg-neutral-800 rounded-2xl p-6 shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700">
            <h3 class="text-sm font-extrabold text-neutral-700 dark:text-neutral-300 uppercase tracking-widest mb-5">
                Atividade Diária
            </h3>

            {#if totalReviews === 0}
                <div class="flex flex-col items-center justify-center h-32 text-neutral-400 gap-2">
                    <svg class="w-8 h-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                    </svg>
                    <span class="text-sm font-medium">Nenhuma revisão no período</span>
                </div>
            {:else}
                <!-- Bar chart using CSS flex -->
                <div class="flex items-end gap-px h-32 overflow-hidden" aria-label="Gráfico de atividade diária">
                    {#each dailyData as day}
                        {@const heightPct = dailyMax > 0 ? Math.round((day.count / dailyMax) * 100) : 0}
                        <div class="flex-1 flex flex-col items-center justify-end gap-0.5 group relative" title="{day.label}: {day.count} revisões">
                            <div
                                class="w-full rounded-t transition-all duration-500 {day.count > 0 ? 'bg-indigo-500 dark:bg-indigo-400' : 'bg-neutral-100 dark:bg-neutral-700'}"
                                style="height: {Math.max(heightPct, day.count > 0 ? 4 : 0)}%"
                            ></div>
                            <!-- Tooltip on hover -->
                            {#if day.count > 0}
                                <div class="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                                    <div class="bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900 text-[10px] font-bold px-2 py-1 rounded whitespace-nowrap shadow-lg">
                                        {day.count} rev.
                                    </div>
                                    <div class="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-neutral-800 dark:border-t-neutral-200"></div>
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>

                <!-- X-axis labels: show every N days to avoid overlap -->
                <div class="flex items-start gap-px mt-1 overflow-hidden">
                    {#each dailyData as day, i}
                        {@const step = dailyData.length <= 14 ? 1 : dailyData.length <= 30 ? 3 : 7}
                        <div class="flex-1 text-center">
                            {#if i % step === 0}
                                <span class="text-[8px] text-neutral-400 font-mono leading-none block truncate">{day.label}</span>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- Grade Distribution -->
        <div class="bg-white dark:bg-neutral-800 rounded-2xl p-6 shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700">
            <h3 class="text-sm font-extrabold text-neutral-700 dark:text-neutral-300 uppercase tracking-widest mb-5">
                Distribuição de Avaliações
            </h3>

            {#if totalReviews === 0}
                <div class="flex flex-col items-center justify-center h-32 text-neutral-400 gap-2">
                    <span class="text-sm font-medium text-center">Nenhuma revisão ainda</span>
                </div>
            {:else}
                <div class="space-y-3">
                    {#each gradeLabels as label, i}
                        {@const count = gradeCounts[i] ?? 0}
                        {@const pct = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0}
                        <div class="space-y-1">
                            <div class="flex justify-between text-xs font-bold">
                                <span class="{gradeTextColors[i]}">{label}</span>
                                <span class="text-neutral-500">{count} <span class="text-neutral-400 font-normal">({pct}%)</span></span>
                            </div>
                            <div class="w-full bg-neutral-100 dark:bg-neutral-700 rounded-full h-2 overflow-hidden">
                                <div
                                    class="h-full rounded-full transition-all duration-700 {gradeColors[i]}"
                                    style="width: {pct}%"
                                ></div>
                            </div>
                        </div>
                    {/each}
                </div>

                <!-- Accuracy summary at bottom -->
                <div class="mt-5 pt-4 border-t border-neutral-100 dark:border-neutral-700 flex justify-between text-xs">
                    <div class="text-center">
                        <div class="font-black text-emerald-600 dark:text-emerald-400 text-base">{correctReviews}</div>
                        <div class="text-neutral-400 font-medium">Acertos</div>
                    </div>
                    <div class="text-center">
                        <div class="font-black text-amber-600 dark:text-amber-400 text-base">{hardReviews}</div>
                        <div class="text-neutral-400 font-medium">Difícil</div>
                    </div>
                    <div class="text-center">
                        <div class="font-black text-rose-600 dark:text-rose-400 text-base">{againReviews}</div>
                        <div class="text-neutral-400 font-medium">Erros</div>
                    </div>
                </div>
            {/if}
        </div>
    </div>

    <!-- Coverage -->
    <div class="bg-white dark:bg-neutral-800 rounded-2xl p-6 shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <h3 class="text-sm font-extrabold text-neutral-700 dark:text-neutral-300 uppercase tracking-widest">
                Cobertura do Caderno
            </h3>
            <div class="text-xs text-neutral-500">
                {reviewedCards} de {totalCards} cards tiveram pelo menos uma revisão no período
            </div>
        </div>

        {#if totalCards === 0}
            <div class="text-sm text-neutral-500 text-center py-4">
                Nenhum flashcard corresponde aos critérios deste filtro.
            </div>
        {:else}
            {@const coveragePct = totalCards > 0 ? Math.round((reviewedCards / totalCards) * 100) : 0}
            <div class="flex items-center gap-4">
                <div class="flex-1 bg-neutral-100 dark:bg-neutral-700 rounded-full h-3 overflow-hidden">
                    <div
                        class="h-full rounded-full transition-all duration-700
                            {coveragePct >= 75 ? 'bg-emerald-500' : coveragePct >= 40 ? 'bg-amber-500' : 'bg-rose-500'}"
                        style="width: {coveragePct}%"
                    ></div>
                </div>
                <span class="text-sm font-black w-12 text-right
                    {coveragePct >= 75 ? 'text-emerald-600 dark:text-emerald-400' : coveragePct >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}">
                    {coveragePct}%
                </span>
            </div>
            {#if neverReviewedCards > 0}
                <p class="text-xs text-amber-600 dark:text-amber-400 mt-2 font-medium">
                    ⚠️ {neverReviewedCards} {neverReviewedCards === 1 ? 'card ainda não foi revisado' : 'cards ainda não foram revisados'} neste período.
                    Inicie uma sessão de estudo para cobrir todos.
                </p>
            {:else if totalCards > 0}
                <p class="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-medium">
                    ✓ Todos os cards do filtro foram revisados no período.
                </p>
            {/if}
        {/if}
    </div>

    <!-- CTA buttons -->
    <div class="flex flex-col sm:flex-row gap-3 justify-end pb-8">
        <a href="/practice/solve/{filterId}"
            class="px-6 py-3 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700
                   text-neutral-700 dark:text-neutral-300 font-bold rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-700
                   transition text-center text-sm shadow-sm">
            Praticar (Simples)
        </a>
        <a href="/practice/study/{filterId}"
            class="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl
                   shadow-lg shadow-indigo-500/30 transition text-center text-sm flex items-center justify-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            Estudar com FSRS
        </a>
    </div>

</div>
{/if}
