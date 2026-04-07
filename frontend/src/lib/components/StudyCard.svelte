<script lang="ts">
    /**
     * Shared study card component used by both practice/study and notebooks/study.
     *
     * US-01/02/03: Interactive checklist with progress counter
     * US-04: Suggested FSRS rating based on checklist score (exported via bind:)
     * US-09: Type badge (CONCEITO / FATO / PROCEDIMENTO)
     * US-11: Modo criterioso — criteria shown first, full answer collapsible
     */
    import snarkdown from 'snarkdown';
    import {
        splitContentAndChecklist,
        countChecklist,
        scoreToRating,
        type ChecklistItem
    } from '$lib/checklistRenderer';

    // ─── Props ────────────────────────────────────────────────────────────────
    export let front: string = '';
    export let back: string = '';
    export let cardType: string | undefined = undefined;
    export let showingAnswer: boolean = false;
    /** US-11: when true, criteria appear first; full answer is collapsed */
    export let criteriousMode: boolean = false;

    // Exported reactive state (parent can bind: to these)
    /** US-04: suggested FSRS rating based on checklist ratio */
    export let suggestedRating: 'again' | 'hard' | 'good' = 'good';
    /** Whether this card's back contains a checklist */
    export let hasChecklist: boolean = false;

    // ─── Internal state ───────────────────────────────────────────────────────
    let checklistItems: ChecklistItem[] = [];
    let answerText = '';
    let answerExpanded = false;

    // Reset checklist whenever we flip to a new card or hide the answer
    $: if (!showingAnswer) {
        checklistItems = [];
        answerText = '';
        answerExpanded = false;
    }

    // Parse when answer is revealed (only on the initial flip)
    $: if (showingAnswer && checklistItems.length === 0) {
        const split = splitContentAndChecklist(back);
        answerText = split.answerText;
        checklistItems = split.checklistItems.map(i => ({ ...i }));
        answerExpanded = !criteriousMode;
    }

    // US-03: live counter
    $: checkCount = countChecklist(checklistItems);
    $: checkProgress = checkCount.total > 0 ? (checkCount.checked / checkCount.total) * 100 : 0;
    $: progressColor = checkProgress >= 100 ? 'bg-emerald-500' : checkProgress >= 50 ? 'bg-amber-500' : 'bg-rose-500';

    // Export derived state upward (US-04)
    $: suggestedRating = scoreToRating(checkCount.checked, checkCount.total);
    $: hasChecklist = checklistItems.length > 0;

    function toggleItem(index: number) {
        checklistItems = checklistItems.map((item, i) =>
            i === index ? { ...item, checked: !item.checked } : item
        );
    }

    // US-09
    function typeBadgeClass(type?: string) {
        if (type === 'CONCEITO') return 'bg-violet-500/20 text-violet-300 border-violet-500/30';
        if (type === 'FATO') return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
        if (type === 'PROCEDIMENTO') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
        return '';
    }

    function typeLabel(type?: string) {
        if (type === 'CONCEITO') return 'Conceito';
        if (type === 'FATO') return 'Fato';
        if (type === 'PROCEDIMENTO') return 'Procedimento';
        return '';
    }
</script>

<div class="bg-white dark:bg-[#1a1a1a] min-h-[400px] w-full rounded-3xl p-8 md:p-12 shadow-2xl flex flex-col justify-center border border-neutral-200 dark:border-neutral-800 transition-all duration-500 relative {showingAnswer ? 'rotate-x-2' : ''}">

    <!-- US-09: Type badge -->
    {#if cardType}
        <div class="absolute top-4 right-4">
            <span class="text-xs font-bold px-2.5 py-1 rounded-full border {typeBadgeClass(cardType)}">
                {typeLabel(cardType)}
            </span>
        </div>
    {/if}

    <!-- US-11: Modo criterioso indicator -->
    {#if criteriousMode && showingAnswer}
        <div class="absolute top-4 left-4">
            <span class="text-xs font-bold px-2 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Modo criterioso
            </span>
        </div>
    {/if}

    <!-- Front -->
    <div class="prose prose-lg dark:prose-invert max-w-none w-full text-center prose-p:leading-relaxed prose-code:bg-neutral-100 dark:prose-code:bg-neutral-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-indigo-600 dark:prose-code:text-indigo-400 {showingAnswer && criteriousMode ? 'mt-8' : ''}">
        {@html snarkdown(front)}
    </div>

    <!-- Back (after flip) -->
    {#if showingAnswer}
        <div class="w-full h-px bg-neutral-200 dark:bg-neutral-800 my-8"></div>

        <!-- US-11: Critérios first in criterious mode -->
        {#if criteriousMode && checklistItems.length > 0}
            <div class="mb-6 animate-fade-in-up">
                <p class="text-xs font-bold text-center text-indigo-400 uppercase tracking-widest mb-4">
                    Avalie pelos critérios antes de ver a resposta completa
                </p>

                <div class="flex items-center justify-between mb-3">
                    <span class="text-xs font-bold text-neutral-400 uppercase tracking-widest">Critérios</span>
                    <span class="text-sm font-bold {checkCount.checked === checkCount.total ? 'text-emerald-400' : 'text-neutral-300'}">
                        {checkCount.checked} de {checkCount.total}
                        {#if checkCount.checked === checkCount.total} ✓{/if}
                    </span>
                </div>

                <div class="w-full h-1.5 bg-neutral-800 rounded-full mb-4 overflow-hidden">
                    <div class="h-full {progressColor} transition-all duration-300" style="width: {checkProgress}%"></div>
                </div>

                <div class="space-y-2">
                    {#each checklistItems as item, i}
                        <label class="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors {item.checked ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-neutral-800/60 border border-neutral-700/60'} hover:border-neutral-500">
                            <input
                                type="checkbox"
                                checked={item.checked}
                                on:change={() => toggleItem(i)}
                                class="mt-0.5 w-4 h-4 rounded accent-emerald-500 cursor-pointer flex-shrink-0"
                            />
                            <span class="text-sm {item.checked ? 'line-through text-neutral-500' : 'text-neutral-200'}">
                                {item.text}
                            </span>
                        </label>
                    {/each}
                </div>

                {#if checkCount.checked === checkCount.total && checkCount.total > 0}
                    <div class="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                        <span class="text-emerald-400 font-bold text-sm">Todos os critérios atingidos!</span>
                    </div>
                {/if}

                <!-- US-11: Collapsible full answer -->
                <div class="mt-4">
                    <button
                        on:click={() => answerExpanded = !answerExpanded}
                        class="w-full py-2 text-xs text-neutral-500 hover:text-neutral-300 transition font-medium flex items-center justify-center gap-2"
                    >
                        <svg class="w-3.5 h-3.5 transition-transform {answerExpanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                        {answerExpanded ? 'Ocultar referência completa' : 'Ver referência completa'}
                    </button>

                    {#if answerExpanded && answerText}
                        <div class="mt-3 pt-3 border-t border-neutral-800 prose prose-sm dark:prose-invert max-w-none animate-fade-in-up">
                            {@html snarkdown(answerText)}
                        </div>
                    {/if}
                </div>
            </div>

        {:else}
            <!-- Normal mode: answer text first, then checklist -->
            {#if answerText}
                <div class="prose prose-lg dark:prose-invert max-w-none w-full text-center animate-fade-in-up">
                    {@html snarkdown(answerText)}
                </div>
            {/if}

            {#if checklistItems.length > 0}
                <div class="mt-6 animate-fade-in-up">
                    <div class="flex items-center justify-between mb-3">
                        <span class="text-xs font-bold text-neutral-400 uppercase tracking-widest">Critérios</span>
                        <span class="text-sm font-bold {checkCount.checked === checkCount.total ? 'text-emerald-400' : 'text-neutral-300'}">
                            {checkCount.checked} de {checkCount.total}
                            {#if checkCount.checked === checkCount.total} ✓{/if}
                        </span>
                    </div>

                    <div class="w-full h-1.5 bg-neutral-800 rounded-full mb-4 overflow-hidden">
                        <div class="h-full {progressColor} transition-all duration-300" style="width: {checkProgress}%"></div>
                    </div>

                    <div class="space-y-2">
                        {#each checklistItems as item, i}
                            <label class="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors {item.checked ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-neutral-800/60 border border-neutral-700/60'} hover:border-neutral-500">
                                <input
                                    type="checkbox"
                                    checked={item.checked}
                                    on:change={() => toggleItem(i)}
                                    class="mt-0.5 w-4 h-4 rounded accent-emerald-500 cursor-pointer flex-shrink-0"
                                />
                                <span class="text-sm {item.checked ? 'line-through text-neutral-500' : 'text-neutral-200'}">
                                    {item.text}
                                </span>
                            </label>
                        {/each}
                    </div>

                    {#if checkCount.checked === checkCount.total && checkCount.total > 0}
                        <div class="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                            <span class="text-emerald-400 font-bold text-sm">Todos os critérios atingidos!</span>
                        </div>
                    {/if}
                </div>
            {/if}
        {/if}
    {/if}
</div>

<style>
    .rotate-x-2 { transform: rotateX(2deg); }
    .animate-fade-in-up { animation: fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
    @keyframes fadeInUp { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }
</style>
