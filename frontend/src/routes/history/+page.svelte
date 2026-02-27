<script lang="ts">
    import { onMount } from 'svelte';
    import { db, type ReviewLog } from '$lib/db';
    import { liveQuery } from 'dexie';
    
    let logs: ReviewLog[] = [];
    
    // Derived Analytics Let statements
    $: totalReviews = logs.length;
    $: uniqueCards = new Set(logs.map(l => l.flashcardId)).size;
    $: todayReviews = logs.filter(l => {
        const d = new Date();
        d.setHours(0,0,0,0);
        return l.reviewedAt >= d.getTime();
    }).length;
    
    onMount(() => {
        const observable = liveQuery(() => db.reviewLogs.orderBy('reviewedAt').reverse().toArray());
        const sub = observable.subscribe(result => logs = result);
        return () => sub.unsubscribe();
    });
    
    function downloadCSV() {
        if (!logs.length) return;
        
        let headerRow = 'Log ID, Flashcard ID, FSRS Grade, State, Reviewed At\n';
        let csvContent = headerRow;
        
        logs.forEach(log => {
            const dateStr = new Date(log.reviewedAt).toISOString();
            csvContent += `${log.id},${log.flashcardId},${log.grade},${log.state},${dateStr}\n`;
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `cyanki_study_history_${Date.now()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
</script>

<div class="min-h-screen bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 p-8">
    <div class="max-w-5xl mx-auto space-y-8">
        
        <header class="flex items-center justify-between">
            <div class="flex items-center gap-4">
                <a href="/" class="p-2 bg-neutral-200 dark:bg-neutral-800 rounded-full hover:bg-neutral-300 transition">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                </a>
                <h1 class="text-3xl font-extrabold tracking-tight">Study History</h1>
            </div>
            
            <button on:click={downloadCSV} class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow font-medium flex gap-2 items-center transition">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                Export CSV
            </button>
        </header>
        
        <section class="grid grid-cols-1 md:grid-cols-3 gap-6">
		    <div class="p-6 bg-white dark:bg-neutral-800 rounded-2xl shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 flex flex-col items-center justify-center">
		        <span class="text-3xl font-black text-indigo-600 dark:text-indigo-400 mb-1">{totalReviews}</span>
		        <span class="text-xs text-neutral-500 font-bold uppercase">Total Interactions</span>
		    </div>
		    <div class="p-6 bg-white dark:bg-neutral-800 rounded-2xl shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 flex flex-col items-center justify-center">
		        <span class="text-3xl font-black text-orange-600 dark:text-orange-400 mb-1">{uniqueCards}</span>
		        <span class="text-xs text-neutral-500 font-bold uppercase">Unique Cards Seen</span>
		    </div>
		    <div class="p-6 bg-white dark:bg-neutral-800 rounded-2xl shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 flex flex-col items-center justify-center">
		        <span class="text-3xl font-black text-emerald-600 dark:text-emerald-400 mb-1">{todayReviews}</span>
		        <span class="text-xs text-neutral-500 font-bold uppercase">Actions Today</span>
		    </div>
		</section>

        <section class="bg-white dark:bg-neutral-800 rounded-2xl shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-neutral-50 dark:bg-neutral-900/50 text-neutral-500 text-sm font-semibold uppercase tracking-wider">
                            <th class="p-4 border-b border-neutral-200 dark:border-neutral-700">Timestamp</th>
                            <th class="p-4 border-b border-neutral-200 dark:border-neutral-700">Flashcard Entity</th>
                            <th class="p-4 border-b border-neutral-200 dark:border-neutral-700 text-center">FSRS Grade</th>
                            <th class="p-4 border-b border-neutral-200 dark:border-neutral-700 text-center">FSRS State</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-neutral-100 dark:divide-neutral-700/50">
                        {#each logs as log}
                            <tr class="hover:bg-neutral-50 dark:hover:bg-neutral-800/80 transition-colors">
                                <td class="p-4 text-sm whitespace-nowrap">{new Date(log.reviewedAt).toLocaleString()}</td>
                                <td class="p-4">
                                    <span class="font-mono text-xs bg-neutral-100 dark:bg-neutral-900 px-2 py-1 rounded text-neutral-500 border border-neutral-200 dark:border-neutral-700">
                                        {log.flashcardId.substring(0,8)}...
                                    </span>
                                </td>
                                <td class="p-4 text-center">
                                    {#if log.grade === 1}
                                        <span class="w-6 h-6 inline-flex items-center justify-center rounded-full bg-red-100 text-red-600 text-xs font-bold">1</span>
                                    {:else if log.grade === 2}
                                        <span class="w-6 h-6 inline-flex items-center justify-center rounded-full bg-orange-100 text-orange-600 text-xs font-bold">2</span>
                                    {:else if log.grade === 3}
                                        <span class="w-6 h-6 inline-flex items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-xs font-bold">3</span>
                                    {:else if log.grade === 4}
                                        <span class="w-6 h-6 inline-flex items-center justify-center rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold">4</span>
                                    {/if}
                                </td>
                                <td class="p-4 text-center">
                                    {#if log.state === 0}
                                        <span class="text-xs px-2 py-1 rounded font-semibold bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400">New</span>
                                    {:else if log.state === 1}
                                        <span class="text-xs px-2 py-1 rounded font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">Learning</span>
                                    {:else if log.state === 2}
                                        <span class="text-xs px-2 py-1 rounded font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Review</span>
                                    {:else}
                                        <span class="text-xs px-2 py-1 rounded font-semibold bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">Relearning</span>
                                    {/if}
                                </td>
                            </tr>
                        {/each}
                        
                        {#if logs.length === 0}
                            <tr>
                                <td colspan="4" class="p-8 text-center text-neutral-500">
                                    No reviews yet. Head to "Study Now" to start learning!
                                </td>
                            </tr>
                        {/if}
                    </tbody>
                </table>
            </div>
        </section>
        
    </div>
</div>
