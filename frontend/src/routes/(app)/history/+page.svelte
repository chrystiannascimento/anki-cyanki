<script lang="ts">
    import { onMount } from 'svelte';
    import { db, type ReviewLog, type Flashcard } from '$lib/db';
    import { liveQuery } from 'dexie';

    // ─── Raw data ─────────────────────────────────────────────────────────────
    let allLogs: ReviewLog[] = [];
    let cardMap = new Map<string, Flashcard>(); // id → Flashcard

    // ─── Filters ──────────────────────────────────────────────────────────────
    let selectedPeriod: '1' | '7' | '30' | 'all' = '7';
    let selectedTag = 'all';

    // ─── Table pagination ─────────────────────────────────────────────────────
    let tablePage = 1;
    const TABLE_PAGE_SIZE = 20;

    onMount(() => {
        const logSub = liveQuery(() =>
            db.reviewLogs.orderBy('reviewedAt').reverse().toArray()
        ).subscribe(rows => { allLogs = rows; });

        const cardSub = liveQuery(() =>
            db.flashcards.toArray()
        ).subscribe(cards => {
            cardMap = new Map(cards.map(c => [c.id, c]));
        });

        return () => { logSub.unsubscribe(); cardSub.unsubscribe(); };
    });

    // ─── Period boundary ──────────────────────────────────────────────────────
    function periodCutoff(): number {
        if (selectedPeriod === 'all') return 0;
        const d = new Date();
        if (selectedPeriod === '1') { d.setHours(0, 0, 0, 0); return d.getTime(); }
        d.setDate(d.getDate() - Number(selectedPeriod));
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    }

    // ─── Derived: logs in period ───────────────────────────────────────────────
    $: periodLogs = (() => {
        const cutoff = periodCutoff();
        return allLogs.filter(l => l.reviewedAt >= cutoff);
    })();

    // ─── Available tags from period logs ──────────────────────────────────────
    $: availableTags = (() => {
        const tagSet = new Set<string>();
        for (const log of periodLogs) {
            const card = cardMap.get(log.flashcardId);
            if (card) for (const t of card.tags ?? []) { if (t) tagSet.add(t); }
        }
        return [...tagSet].sort();
    })();

    // Reset tag selection when period changes and tag is no longer available
    $: if (selectedTag !== 'all' && !availableTags.includes(selectedTag)) {
        selectedTag = 'all';
    }

    // ─── Derived: filtered logs (period + tag) ────────────────────────────────
    $: filteredLogs = (() => {
        if (selectedTag === 'all') return periodLogs;
        return periodLogs.filter(l => {
            const card = cardMap.get(l.flashcardId);
            return card?.tags?.includes(selectedTag);
        });
    })();

    // ─── KPI metrics ──────────────────────────────────────────────────────────
    $: totalReviews = filteredLogs.length;
    $: uniqueCards = new Set(filteredLogs.map(l => l.flashcardId)).size;
    $: accuracy = (() => {
        if (!totalReviews) return 0;
        const good = filteredLogs.filter(l => l.grade >= 3).length;
        return Math.round((good / totalReviews) * 100);
    })();
    $: streak = (() => {
        // Count consecutive days with at least 1 review going backwards from today
        const days = new Set(
            allLogs.map(l => new Date(l.reviewedAt).toDateString())
        );
        let count = 0;
        const d = new Date();
        while (days.has(d.toDateString())) {
            count++;
            d.setDate(d.getDate() - 1);
        }
        return count;
    })();

    // ─── Grade distribution ───────────────────────────────────────────────────
    $: gradeCounts = (() => {
        const counts = { again: 0, hard: 0, good: 0, easy: 0 };
        for (const l of filteredLogs) {
            if (l.grade === 1) counts.again++;
            else if (l.grade === 2) counts.hard++;
            else if (l.grade === 3) counts.good++;
            else if (l.grade === 4) counts.easy++;
        }
        return counts;
    })();

    $: gradeTotal = gradeCounts.again + gradeCounts.hard + gradeCounts.good + gradeCounts.easy;
    function gradePct(n: number) { return gradeTotal ? Math.round((n / gradeTotal) * 100) : 0; }

    // ─── Daily bar chart ──────────────────────────────────────────────────────
    $: dailyData = (() => {
        const days = selectedPeriod === '1' ? 1 : selectedPeriod === '7' ? 7 : selectedPeriod === '30' ? 30 : 30;
        const buckets: { label: string; date: Date; count: number; goodCount: number }[] = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            d.setHours(0, 0, 0, 0);
            const key = d.toDateString();
            const dayLogs = filteredLogs.filter(l => new Date(l.reviewedAt).toDateString() === key);
            buckets.push({
                label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
                date: d,
                count: dayLogs.length,
                goodCount: dayLogs.filter(l => l.grade >= 3).length
            });
        }
        return buckets;
    })();

    $: maxDayCount = Math.max(...dailyData.map(d => d.count), 1);

    // ─── Accuracy trend (7-day rolling in 'all'/'30' modes) ───────────────────
    $: accuracyTrend = (() => {
        if (selectedPeriod === '1') return [];
        const days = selectedPeriod === '7' ? 7 : 30;
        return Array.from({ length: days }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (days - 1 - i));
            d.setHours(0, 0, 0, 0);
            const key = d.toDateString();
            const dayLogs = filteredLogs.filter(l => new Date(l.reviewedAt).toDateString() === key);
            const acc = dayLogs.length
                ? Math.round((dayLogs.filter(l => l.grade >= 3).length / dayLogs.length) * 100)
                : null;
            return { label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }), acc };
        });
    })();

    // ─── Table (paginated, most-recent first) ─────────────────────────────────
    $: tableLogs = filteredLogs; // already sorted desc by reviewedAt
    $: totalTablePages = Math.ceil(tableLogs.length / TABLE_PAGE_SIZE);
    $: pagedLogs = tableLogs.slice((tablePage - 1) * TABLE_PAGE_SIZE, tablePage * TABLE_PAGE_SIZE);

    // Reset page when filters change
    $: { selectedPeriod; selectedTag; tablePage = 1; }

    // ─── CSV export ───────────────────────────────────────────────────────────
    function downloadCSV() {
        if (!filteredLogs.length) return;
        let csv = 'Log ID,Flashcard ID,Front,Tags,FSRS Grade,State,Reviewed At\n';
        for (const log of filteredLogs) {
            const card = cardMap.get(log.flashcardId);
            const front = card ? `"${card.front.replace(/"/g, '""')}"` : '';
            const tags = card ? `"${(card.tags ?? []).join(', ')}"` : '';
            csv += `${log.id},${log.flashcardId},${front},${tags},${log.grade},${log.state},${new Date(log.reviewedAt).toISOString()}\n`;
        }
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cyanki_history_${selectedPeriod}_${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────
    const GRADE_LABELS: Record<number, { label: string; classes: string }> = {
        1: { label: 'Again', classes: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
        2: { label: 'Hard',  classes: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
        3: { label: 'Good',  classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
        4: { label: 'Easy',  classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    };
    const STATE_LABELS: Record<number, { label: string; classes: string }> = {
        0: { label: 'New',        classes: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400' },
        1: { label: 'Learning',   classes: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
        2: { label: 'Review',     classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
        3: { label: 'Relearning', classes: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
    };
</script>

<div class="max-w-5xl mx-auto py-8 space-y-6 px-4">

    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
            <h1 class="text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white">Histórico de Estudo</h1>
            <p class="text-neutral-500 dark:text-neutral-400 mt-1">Evolução e desempenho das suas revisões FSRS.</p>
        </div>
        <button on:click={downloadCSV} disabled={!filteredLogs.length} class="inline-flex items-center gap-2 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-white font-bold rounded-xl text-sm transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            Exportar CSV
        </button>
    </div>

    <!-- ── Filters ─────────────────────────────────────────────────────────── -->
    <div class="flex flex-wrap gap-3 items-center">
        <!-- Period pills -->
        <div class="flex gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-xl">
            {#each [['1','Hoje'], ['7','7 dias'], ['30','30 dias'], ['all','Sempre']] as [v, label]}
                <button
                    on:click={() => selectedPeriod = v as typeof selectedPeriod}
                    class="px-4 py-1.5 rounded-lg text-sm font-bold transition {selectedPeriod === v ? 'bg-white dark:bg-neutral-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}"
                >
                    {label}
                </button>
            {/each}
        </div>

        <!-- Tag filter -->
        {#if availableTags.length > 0}
            <select bind:value={selectedTag} class="p-2 rounded-xl text-sm font-semibold bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white">
                <option value="all">🏷 Todas as disciplinas</option>
                {#each availableTags as tag}
                    <option value={tag}>{tag}</option>
                {/each}
            </select>
        {/if}
    </div>

    <!-- ── KPI cards ───────────────────────────────────────────────────────── -->
    <section class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="p-5 bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-neutral-200 dark:ring-neutral-700 flex flex-col items-center justify-center text-center">
            <span class="text-3xl font-black text-indigo-600 dark:text-indigo-400">{totalReviews}</span>
            <span class="text-xs text-neutral-500 dark:text-neutral-400 font-bold uppercase tracking-wider mt-1">Revisões</span>
        </div>
        <div class="p-5 bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-neutral-200 dark:ring-neutral-700 flex flex-col items-center justify-center text-center">
            <span class="text-3xl font-black text-amber-600 dark:text-amber-400">{uniqueCards}</span>
            <span class="text-xs text-neutral-500 dark:text-neutral-400 font-bold uppercase tracking-wider mt-1">Cards únicos</span>
        </div>
        <div class="p-5 bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-neutral-200 dark:ring-neutral-700 flex flex-col items-center justify-center text-center">
            <span class="text-3xl font-black {accuracy >= 70 ? 'text-emerald-600 dark:text-emerald-400' : accuracy >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}">{accuracy}%</span>
            <span class="text-xs text-neutral-500 dark:text-neutral-400 font-bold uppercase tracking-wider mt-1">Acerto (Good+Easy)</span>
        </div>
        <div class="p-5 bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-neutral-200 dark:ring-neutral-700 flex flex-col items-center justify-center text-center">
            <span class="text-3xl font-black text-orange-500 dark:text-orange-400">🔥 {streak}</span>
            <span class="text-xs text-neutral-500 dark:text-neutral-400 font-bold uppercase tracking-wider mt-1">Sequência (dias)</span>
        </div>
    </section>

    <!-- ── Daily activity chart ────────────────────────────────────────────── -->
    {#if dailyData.length > 1}
        <div class="bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-neutral-200 dark:ring-neutral-700 p-6">
            <h2 class="text-sm font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-4">Atividade Diária</h2>

            {#if totalReviews === 0}
                <p class="text-sm text-neutral-400 italic text-center py-6">Nenhuma revisão no período.</p>
            {:else}
                <!-- Bar chart -->
                <div class="flex items-end gap-1 h-32 overflow-x-auto pb-2">
                    {#each dailyData as day}
                        {@const heightPct = (day.count / maxDayCount) * 100}
                        {@const goodPct = day.count ? (day.goodCount / day.count) * 100 : 0}
                        <div class="flex flex-col items-center gap-1 min-w-[28px] flex-1 group relative">
                            <!-- Tooltip -->
                            <div class="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                                <div class="bg-neutral-900 text-white text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg">
                                    <div class="font-bold">{day.label}</div>
                                    <div>{day.count} revisões</div>
                                    <div class="text-emerald-400">{day.goodCount} acertos</div>
                                </div>
                                <div class="w-2 h-2 bg-neutral-900 rotate-45 -mt-1"></div>
                            </div>
                            <!-- Bar -->
                            <div class="w-full rounded-t-md overflow-hidden flex flex-col-reverse" style="height: {Math.max(heightPct, 2)}%">
                                <div class="w-full bg-indigo-200 dark:bg-indigo-900/50" style="height: {100 - goodPct}%"></div>
                                <div class="w-full bg-indigo-500" style="height: {goodPct}%"></div>
                            </div>
                        </div>
                    {/each}
                </div>
                <!-- X-axis labels (only show every N to avoid crowding) -->
                {@const step = dailyData.length > 14 ? Math.ceil(dailyData.length / 7) : 1}
                <div class="flex gap-1 mt-1">
                    {#each dailyData as day, i}
                        <div class="flex-1 min-w-[28px] text-center text-[10px] text-neutral-400 overflow-hidden">
                            {#if i % step === 0}{day.label}{:else}&nbsp;{/if}
                        </div>
                    {/each}
                </div>
                <div class="flex gap-3 mt-3 text-xs text-neutral-500">
                    <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded-sm bg-indigo-500"></span>Good/Easy</span>
                    <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded-sm bg-indigo-200 dark:bg-indigo-900/50"></span>Again/Hard</span>
                </div>
            {/if}
        </div>
    {/if}

    <!-- ── Accuracy trend chart ────────────────────────────────────────────── -->
    {#if accuracyTrend.length > 1 && accuracyTrend.some(d => d.acc !== null)}
        <div class="bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-neutral-200 dark:ring-neutral-700 p-6">
            <h2 class="text-sm font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-4">Evolução da Taxa de Acerto</h2>
            <div class="flex items-end gap-1 h-24 overflow-x-auto pb-2">
                {#each accuracyTrend as point}
                    {@const h = point.acc !== null ? point.acc : 0}
                    <div class="flex flex-col items-center gap-1 min-w-[28px] flex-1 group relative">
                        {#if point.acc !== null}
                            <div class="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 pointer-events-none">
                                <div class="bg-neutral-900 text-white text-xs rounded-lg px-2 py-1 whitespace-nowrap shadow-lg">{point.label}: {point.acc}%</div>
                            </div>
                            <div class="w-full rounded-t-md transition-all {h >= 70 ? 'bg-emerald-400' : h >= 50 ? 'bg-amber-400' : 'bg-rose-400'}" style="height: {h}%"></div>
                        {:else}
                            <!-- No data that day -->
                            <div class="w-full rounded-t-md bg-neutral-100 dark:bg-neutral-700" style="height: 4px"></div>
                        {/if}
                    </div>
                {/each}
            </div>
            {@const step2 = accuracyTrend.length > 14 ? Math.ceil(accuracyTrend.length / 7) : 1}
            <div class="flex gap-1 mt-1">
                {#each accuracyTrend as point, i}
                    <div class="flex-1 min-w-[28px] text-center text-[10px] text-neutral-400 overflow-hidden">
                        {#if i % step2 === 0}{point.label}{:else}&nbsp;{/if}
                    </div>
                {/each}
            </div>
        </div>
    {/if}

    <!-- ── Grade distribution ─────────────────────────────────────────────── -->
    {#if totalReviews > 0}
        <div class="bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-neutral-200 dark:ring-neutral-700 p-6">
            <h2 class="text-sm font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-4">Distribuição de Avaliações FSRS</h2>
            <div class="space-y-2.5">
                {#each [
                    { key: 'again', label: 'Again', color: 'bg-rose-500', count: gradeCounts.again },
                    { key: 'hard',  label: 'Hard',  color: 'bg-amber-500', count: gradeCounts.hard },
                    { key: 'good',  label: 'Good',  color: 'bg-emerald-500', count: gradeCounts.good },
                    { key: 'easy',  label: 'Easy',  color: 'bg-blue-500',   count: gradeCounts.easy },
                ] as g}
                    <div class="flex items-center gap-3">
                        <span class="w-14 text-xs font-bold text-right text-neutral-500 dark:text-neutral-400">{g.label}</span>
                        <div class="flex-1 h-3 bg-neutral-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                            <div class="h-full {g.color} rounded-full transition-all duration-500" style="width: {gradePct(g.count)}%"></div>
                        </div>
                        <span class="w-16 text-xs font-bold text-neutral-500 dark:text-neutral-400">{g.count} ({gradePct(g.count)}%)</span>
                    </div>
                {/each}
            </div>
        </div>
    {/if}

    <!-- ── Log table ──────────────────────────────────────────────────────── -->
    <div class="bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-neutral-200 dark:ring-neutral-700 overflow-hidden">
        <div class="px-6 py-4 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
            <h2 class="text-sm font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                Registro Detalhado
                {#if totalReviews > 0}<span class="text-neutral-300 dark:text-neutral-600 font-normal">· {totalReviews} entradas</span>{/if}
            </h2>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="bg-neutral-50 dark:bg-neutral-900/50 text-neutral-500 text-xs font-black uppercase tracking-wider">
                        <th class="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">Data / Hora</th>
                        <th class="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">Flashcard</th>
                        <th class="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">Disciplina</th>
                        <th class="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 text-center">Avaliação</th>
                        <th class="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 text-center">Estado</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-neutral-100 dark:divide-neutral-700/50">
                    {#each pagedLogs as log (log.id)}
                        {@const card = cardMap.get(log.flashcardId)}
                        {@const grade = GRADE_LABELS[log.grade]}
                        {@const stateInfo = STATE_LABELS[log.state]}
                        <tr class="hover:bg-neutral-50 dark:hover:bg-neutral-800/80 transition-colors">
                            <td class="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                                {new Date(log.reviewedAt).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td class="px-4 py-3 max-w-[220px]">
                                {#if card}
                                    <p class="text-sm font-semibold text-neutral-800 dark:text-neutral-100 truncate" title={card.front}>{card.front}</p>
                                {:else}
                                    <span class="font-mono text-xs bg-neutral-100 dark:bg-neutral-900 px-2 py-0.5 rounded text-neutral-400 border border-neutral-200 dark:border-neutral-700">{log.flashcardId.substring(0, 8)}…</span>
                                {/if}
                            </td>
                            <td class="px-4 py-3">
                                {#if card && card.tags?.length}
                                    <div class="flex flex-wrap gap-1">
                                        {#each (card.tags ?? []).slice(0, 2) as tag}
                                            {#if tag}
                                                <span class="text-[10px] font-semibold px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full">{tag}</span>
                                            {/if}
                                        {/each}
                                    </div>
                                {:else}
                                    <span class="text-neutral-300 dark:text-neutral-600 text-xs">—</span>
                                {/if}
                            </td>
                            <td class="px-4 py-3 text-center">
                                {#if grade}
                                    <span class="text-xs font-bold px-2 py-0.5 rounded-full {grade.classes}">{grade.label}</span>
                                {/if}
                            </td>
                            <td class="px-4 py-3 text-center">
                                {#if stateInfo}
                                    <span class="text-xs font-semibold px-2 py-0.5 rounded {stateInfo.classes}">{stateInfo.label}</span>
                                {/if}
                            </td>
                        </tr>
                    {/each}
                    {#if filteredLogs.length === 0}
                        <tr>
                            <td colspan="5" class="px-4 py-12 text-center text-neutral-400 dark:text-neutral-500">
                                {allLogs.length === 0 ? 'Nenhuma revisão ainda. Comece a estudar!' : 'Nenhuma revisão no período/filtro selecionado.'}
                            </td>
                        </tr>
                    {/if}
                </tbody>
            </table>
        </div>

        <!-- Pagination -->
        {#if totalTablePages > 1}
            <div class="flex items-center justify-between px-6 py-4 border-t border-neutral-200 dark:border-neutral-700">
                <button
                    on:click={() => tablePage = Math.max(1, tablePage - 1)}
                    disabled={tablePage === 1}
                    class="px-4 py-2 rounded-xl text-sm font-bold bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >← Anterior</button>
                <span class="text-sm text-neutral-500 dark:text-neutral-400 font-semibold">Página {tablePage} de {totalTablePages}</span>
                <button
                    on:click={() => tablePage = Math.min(totalTablePages, tablePage + 1)}
                    disabled={tablePage === totalTablePages}
                    class="px-4 py-2 rounded-xl text-sm font-bold bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >Próxima →</button>
            </div>
        {/if}
    </div>

</div>
