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
    $: step2 = accuracyTrend.length > 14 ? Math.ceil(accuracyTrend.length / 7) : 1;

    // ─── US-12: Stats per card type ───────────────────────────────────────────
    type CardTypeStat = {
        label: string;
        type: 'CONCEITO' | 'FATO' | 'PROCEDIMENTO';
        color: string;
        badgeClass: string;
        reviews: number;
        accuracy: number;
        activeCards: number;
        dueCards: number;
        trend: (number | null)[]; // accuracy per day (last 30)
    };

    $: typeStats = (() => {
        const types = [
            { type: 'CONCEITO' as const,     label: 'Conceito',     color: '#8b5cf6', badgeClass: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
            { type: 'FATO' as const,          label: 'Fato',         color: '#f59e0b', badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
            { type: 'PROCEDIMENTO' as const,  label: 'Procedimento', color: '#10b981', badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
        ];

        return types.map(t => {
            const typeLogs = filteredLogs.filter(l => cardMap.get(l.flashcardId)?.type === t.type);
            const typeCardIds = new Set(typeLogs.map(l => l.flashcardId));
            const acc = typeLogs.length
                ? Math.round((typeLogs.filter(l => l.grade >= 3).length / typeLogs.length) * 100)
                : 0;

            // 30-day accuracy trend
            const trendDays = 30;
            const trend = Array.from({ length: trendDays }, (_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - (trendDays - 1 - i));
                d.setHours(0, 0, 0, 0);
                const key = d.toDateString();
                const dayLogs = typeLogs.filter(l => new Date(l.reviewedAt).toDateString() === key);
                return dayLogs.length
                    ? Math.round((dayLogs.filter(l => l.grade >= 3).length / dayLogs.length) * 100)
                    : null;
            });

            return {
                ...t,
                reviews: typeLogs.length,
                accuracy: acc,
                activeCards: typeCardIds.size,
                dueCards: 0, // computed separately if needed
                trend
            } satisfies CardTypeStat;
        });
    })();

    // Tab state for US-12
    let typeTab: 'all' | 'CONCEITO' | 'FATO' | 'PROCEDIMENTO' = 'all';

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

    // ─── PDF export (UC-25) ───────────────────────────────────────────────────
    let isGeneratingPdf = false;

    const GRADE_NAMES: Record<number, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };
    const STATE_NAMES: Record<number, string> = { 0: 'New', 1: 'Learning', 2: 'Review', 3: 'Relearning' };
    const GRADE_COLORS: Record<number, string> = {
        1: '#ef4444', 2: '#f59e0b', 3: '#10b981', 4: '#3b82f6'
    };

    async function downloadPDF() {
        if (!filteredLogs.length || isGeneratingPdf) return;
        isGeneratingPdf = true;

        // Yield to the browser so the spinner renders before heavy work
        await new Promise(r => setTimeout(r, 60));

        try {
            const periodLabel: Record<string, string> = { '1': 'Hoje', '7': 'Últimos 7 dias', '30': 'Últimos 30 dias', 'all': 'Todo o período' };
            const now = new Date().toLocaleString('pt-BR');
            const tagLabel = selectedTag === 'all' ? 'Todas as disciplinas' : selectedTag;

            // Build grade distribution rows
            const gradeRows = [
                { label: 'Again', count: gradeCounts.again, color: '#ef4444' },
                { label: 'Hard',  count: gradeCounts.hard,  color: '#f59e0b' },
                { label: 'Good',  count: gradeCounts.good,  color: '#10b981' },
                { label: 'Easy',  count: gradeCounts.easy,  color: '#3b82f6' },
            ].map(g => {
                const pct = gradeTotal ? Math.round((g.count / gradeTotal) * 100) : 0;
                return `<tr>
                    <td style="padding:6px 12px;font-weight:600;color:${g.color}">${g.label}</td>
                    <td style="padding:6px 12px">${g.count}</td>
                    <td style="padding:6px 12px">
                        <div style="display:flex;align-items:center;gap:8px">
                            <div style="flex:1;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden">
                                <div style="height:100%;width:${pct}%;background:${g.color};border-radius:4px"></div>
                            </div>
                            <span style="min-width:36px;font-size:12px">${pct}%</span>
                        </div>
                    </td>
                </tr>`;
            }).join('');

            // Build log table rows (all logs, no pagination in PDF)
            const logRows = filteredLogs.map(log => {
                const card = cardMap.get(log.flashcardId);
                const front = card ? card.front.replace(/</g, '&lt;').replace(/>/g, '&gt;') : `<code style="font-size:11px;color:#9ca3af">${log.flashcardId.substring(0, 10)}…</code>`;
                const tags = card?.tags?.filter(Boolean).join(', ') || '—';
                const gradeColor = GRADE_COLORS[log.grade] ?? '#6b7280';
                const gradeLabel = GRADE_NAMES[log.grade] ?? log.grade;
                const stateLabel = STATE_NAMES[log.state] ?? log.state;
                const dateStr = new Date(log.reviewedAt).toLocaleString('pt-BR', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                });
                return `<tr>
                    <td style="padding:6px 10px;white-space:nowrap;color:#6b7280;font-size:12px">${dateStr}</td>
                    <td style="padding:6px 10px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${front}</td>
                    <td style="padding:6px 10px;font-size:12px;color:#6b7280">${tags}</td>
                    <td style="padding:6px 10px;text-align:center">
                        <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:${gradeColor}22;color:${gradeColor}">${gradeLabel}</span>
                    </td>
                    <td style="padding:6px 10px;text-align:center;font-size:12px;color:#6b7280">${stateLabel}</td>
                </tr>`;
            }).join('');

            const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Cyanki — Histórico de Estudo</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #111827; background: #fff; padding: 32px; }
  h1 { font-size: 22px; font-weight: 900; color: #4f46e5; letter-spacing: -0.5px; }
  h2 { font-size: 11px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #9ca3af; margin: 24px 0 10px; }
  .meta { font-size: 12px; color: #6b7280; margin-top: 4px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0; }
  .kpi { border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px; text-align: center; }
  .kpi-val { font-size: 26px; font-weight: 900; color: #4f46e5; }
  .kpi-lbl { font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #9ca3af; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  thead th { background: #f9fafb; padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #6b7280; border-bottom: 1px solid #e5e7eb; }
  tbody tr { border-bottom: 1px solid #f3f4f6; }
  tbody tr:hover { background: #f9fafb; }
  .section { border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; margin-bottom: 20px; }
  footer { margin-top: 32px; font-size: 11px; color: #d1d5db; text-align: center; }
  @media print {
    body { padding: 16px; }
    @page { margin: 1cm; }
    thead { display: table-header-group; }
  }
</style>
</head>
<body>
<h1>Cyanki — Histórico de Estudo</h1>
<p class="meta">Período: <strong>${periodLabel[selectedPeriod]}</strong> · Disciplina: <strong>${tagLabel}</strong> · Gerado em ${now}</p>

<h2>Resumo</h2>
<div class="kpis">
  <div class="kpi"><div class="kpi-val">${totalReviews}</div><div class="kpi-lbl">Revisões</div></div>
  <div class="kpi"><div class="kpi-val">${uniqueCards}</div><div class="kpi-lbl">Cards únicos</div></div>
  <div class="kpi"><div class="kpi-val" style="color:${accuracy>=70?'#10b981':accuracy>=50?'#f59e0b':'#ef4444'}">${accuracy}%</div><div class="kpi-lbl">Acerto (Good+Easy)</div></div>
  <div class="kpi"><div class="kpi-val" style="color:#f97316">🔥 ${streak}</div><div class="kpi-lbl">Sequência (dias)</div></div>
</div>

<h2>Distribuição de Avaliações</h2>
<div class="section">
<table>
  <thead><tr><th>Avaliação</th><th>Quantidade</th><th style="width:200px">Proporção</th></tr></thead>
  <tbody>${gradeRows}</tbody>
</table>
</div>

<h2>Registro Detalhado (${filteredLogs.length} entradas)</h2>
<div class="section">
<table>
  <thead><tr><th>Data / Hora</th><th>Flashcard</th><th>Disciplina</th><th style="text-align:center">Avaliação</th><th style="text-align:center">Estado</th></tr></thead>
  <tbody>${logRows}</tbody>
</table>
</div>

<footer>Exportado pelo Cyanki — Plataforma de Estudos Adaptativa</footer>
<script>window.onload=function(){window.print();}<\/script>
</body>
</html>`;

            const win = window.open('', '_blank');
            if (!win) {
                alert('Permita pop-ups para exportar o PDF.');
                return;
            }
            win.document.write(html);
            win.document.close();
        } finally {
            isGeneratingPdf = false;
        }
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
        <div class="flex gap-2 shrink-0">
            <button on:click={downloadCSV} disabled={!filteredLogs.length} class="inline-flex items-center gap-2 px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-200 font-bold rounded-xl text-sm transition disabled:opacity-50 disabled:cursor-not-allowed border border-neutral-200 dark:border-neutral-600">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                CSV
            </button>
            <!-- UC-25: PDF export -->
            <button
                on:click={downloadPDF}
                disabled={!filteredLogs.length || isGeneratingPdf}
                class="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-500/20"
                title="Exportar relatório em PDF (abre diálogo de impressão)"
            >
                {#if isGeneratingPdf}
                    <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Gerando...
                {:else}
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                    </svg>
                    PDF
                {/if}
            </button>
        </div>
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

    <!-- ── US-12: Desempenho por tipo ────────────────────────────────────── -->
    {#if typeStats.some(t => t.reviews > 0)}
        <div class="bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-neutral-200 dark:ring-neutral-700 p-6">
            <h2 class="text-sm font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-4">Desempenho por Tipo (Ultralearning)</h2>

            <!-- Tabs -->
            <div class="flex gap-1 p-1 bg-neutral-100 dark:bg-neutral-900 rounded-xl mb-6 w-fit">
                <button
                    on:click={() => typeTab = 'all'}
                    class="px-4 py-1.5 rounded-lg text-sm font-bold transition {typeTab === 'all' ? 'bg-white dark:bg-neutral-700 shadow text-neutral-800 dark:text-white' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}"
                >Geral</button>
                {#each typeStats as t}
                    <button
                        on:click={() => typeTab = t.type}
                        class="px-4 py-1.5 rounded-lg text-sm font-bold transition {typeTab === t.type ? 'bg-white dark:bg-neutral-700 shadow text-neutral-800 dark:text-white' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}"
                    >{t.label}</button>
                {/each}
            </div>

            {#if typeTab === 'all'}
                <!-- Summary grid: all 3 types side by side -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {#each typeStats as t}
                        {@const isWorst = t.reviews > 0 && t.accuracy === Math.min(...typeStats.filter(x => x.reviews > 0).map(x => x.accuracy))}
                        <div class="p-4 rounded-2xl border {t.reviews === 0 ? 'border-neutral-700/50 opacity-50' : isWorst ? 'border-rose-500/30 bg-rose-500/5' : 'border-neutral-700/60'} space-y-3">
                            <div class="flex items-center justify-between">
                                <span class="text-xs font-bold px-2.5 py-1 rounded-full border {t.badgeClass}">{t.label}</span>
                                {#if isWorst && t.reviews > 0}
                                    <span class="text-xs text-rose-400 font-semibold">⚠ Mais fraco</span>
                                {/if}
                            </div>
                            <div class="flex justify-between items-end">
                                <div>
                                    <p class="text-2xl font-black {t.accuracy >= 70 ? 'text-emerald-400' : t.accuracy >= 50 ? 'text-amber-400' : 'text-rose-400'}">{t.accuracy}%</p>
                                    <p class="text-xs text-neutral-500 mt-0.5">taxa de acerto</p>
                                </div>
                                <div class="text-right">
                                    <p class="text-lg font-bold text-neutral-300">{t.reviews}</p>
                                    <p class="text-xs text-neutral-500">revisões</p>
                                </div>
                            </div>
                            <!-- Mini trend bar (last 30 days) -->
                            <div class="flex items-end gap-0.5 h-8">
                                {#each t.trend as val}
                                    <div class="flex-1 rounded-sm {val === null ? 'bg-neutral-800' : val >= 70 ? 'bg-emerald-500/60' : val >= 50 ? 'bg-amber-500/60' : 'bg-rose-500/60'}" style="height: {val !== null ? Math.max(val, 8) : 4}%"></div>
                                {/each}
                            </div>
                            <p class="text-[10px] text-neutral-600">Evolução 30 dias</p>
                        </div>
                    {/each}
                </div>

            {:else}
                <!-- Detail view for selected type -->
                {@const t = typeStats.find(x => x.type === typeTab)!}
                <div class="space-y-5">
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div class="p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-2xl text-center">
                            <p class="text-2xl font-black {t.accuracy >= 70 ? 'text-emerald-400' : t.accuracy >= 50 ? 'text-amber-400' : 'text-rose-400'}">{t.accuracy}%</p>
                            <p class="text-xs text-neutral-500 mt-1">Taxa de acerto</p>
                        </div>
                        <div class="p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-2xl text-center">
                            <p class="text-2xl font-black text-indigo-400">{t.reviews}</p>
                            <p class="text-xs text-neutral-500 mt-1">Revisões</p>
                        </div>
                        <div class="p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-2xl text-center col-span-2 md:col-span-1">
                            <p class="text-2xl font-black text-neutral-300">{t.activeCards}</p>
                            <p class="text-xs text-neutral-500 mt-1">Cards revisados</p>
                        </div>
                    </div>

                    <!-- 30-day accuracy trend for this type -->
                    {#if t.trend.some(v => v !== null)}
                        <div>
                            <p class="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3">Evolução da taxa de acerto — 30 dias</p>
                            <div class="flex items-end gap-1 h-24">
                                {#each t.trend as val, i}
                                    <div class="flex-1 min-w-[6px] group relative flex flex-col items-center justify-end h-full">
                                        {#if val !== null}
                                            <div class="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 pointer-events-none">
                                                <div class="bg-neutral-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap shadow">{val}%</div>
                                            </div>
                                            <div class="w-full rounded-t {val >= 70 ? 'bg-emerald-400' : val >= 50 ? 'bg-amber-400' : 'bg-rose-400'}" style="height: {val}%"></div>
                                        {:else}
                                            <div class="w-full rounded-t bg-neutral-800" style="height: 4px"></div>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {:else}
                        <p class="text-sm text-neutral-500 italic text-center py-4">Nenhuma revisão de tipo {t.label} no período selecionado.</p>
                    {/if}
                </div>
            {/if}
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
