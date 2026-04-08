<script lang="ts">
    /**
     * Shared study card component — renders card content only (no outer shell).
     * The parent page provides the card container, sticky header and footer.
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
    export let criteriousMode: boolean = false;

    // Exported reactive state
    export let suggestedRating: 'again' | 'hard' | 'good' = 'good';
    export let hasChecklist: boolean = false;

    // ─── Internal state ───────────────────────────────────────────────────────
    let checklistItems: ChecklistItem[] = [];
    let answerText = '';
    let answerExpanded = false;

    $: if (!showingAnswer) {
        checklistItems = [];
        answerText = '';
        answerExpanded = false;
    }

    $: if (showingAnswer && checklistItems.length === 0) {
        const split = splitContentAndChecklist(back);
        answerText = split.answerText;
        checklistItems = split.checklistItems.map(i => ({ ...i }));
        answerExpanded = !criteriousMode;
    }

    $: checkCount = countChecklist(checklistItems);
    $: checkProgress = checkCount.total > 0 ? (checkCount.checked / checkCount.total) * 100 : 0;
    $: progressColor = checkProgress >= 100 ? '#10b981' : checkProgress >= 50 ? '#f59e0b' : '#f43f5e';

    $: suggestedRating = scoreToRating(checkCount.checked, checkCount.total);
    $: hasChecklist = checklistItems.length > 0;

    function toggleItem(index: number) {
        checklistItems = checklistItems.map((item, i) =>
            i === index ? { ...item, checked: !item.checked } : item
        );
    }

    function typeBadgeClass(type?: string) {
        if (type === 'CONCEITO') return 'badge-conceito';
        if (type === 'FATO') return 'badge-fato';
        if (type === 'PROCEDIMENTO') return 'badge-proc';
        return '';
    }

    function typeLabel(type?: string) {
        if (type === 'CONCEITO') return 'Conceito';
        if (type === 'FATO') return 'Fato';
        if (type === 'PROCEDIMENTO') return 'Procedimento';
        return '';
    }
</script>

<div class="card-content">

    <!-- Badge row -->
    {#if cardType || (criteriousMode && showingAnswer)}
        <div class="badge-row">
            {#if cardType}
                <span class="badge {typeBadgeClass(cardType)}">{typeLabel(cardType)}</span>
            {/if}
            {#if criteriousMode && showingAnswer}
                <span class="badge badge-criterious">● Criterioso</span>
            {/if}
        </div>
    {/if}

    <!-- Front -->
    <div class="prose dark:prose-invert max-w-none question">
        {@html snarkdown(front)}
    </div>

    <!-- Back -->
    {#if showingAnswer}
        <div class="divider"></div>

        {#if criteriousMode && checklistItems.length > 0}
            <!-- Criterious mode: criteria first -->
            <div class="animate-in">
                <p class="criteria-hint">Avalie pelos critérios antes de ver a resposta completa</p>

                <div class="criteria-header">
                    <span class="criteria-label">Critérios</span>
                    <span class="criteria-counter {checkCount.checked === checkCount.total ? 'done' : ''}">
                        {checkCount.checked} / {checkCount.total}
                        {#if checkCount.checked === checkCount.total}✓{/if}
                    </span>
                </div>

                <div class="progress-bar">
                    <div class="progress-fill" style="width:{checkProgress}%; background:{progressColor}"></div>
                </div>

                <div class="checklist">
                    {#each checklistItems as item, i}
                        <label class="check-item {item.checked ? 'checked' : ''}">
                            <input
                                type="checkbox"
                                checked={item.checked}
                                on:change={() => toggleItem(i)}
                                class="check-input"
                            />
                            <span class="check-text">{item.text}</span>
                        </label>
                    {/each}
                </div>

                <!-- Collapsible full answer -->
                <button class="expand-btn" on:click={() => answerExpanded = !answerExpanded}>
                    <svg class="chevron {answerExpanded ? 'open' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                    {answerExpanded ? 'Ocultar referência' : 'Ver referência completa'}
                </button>

                {#if answerExpanded && answerText}
                    <div class="prose dark:prose-invert max-w-none answer animate-in">
                        {@html snarkdown(answerText)}
                    </div>
                {/if}
            </div>

        {:else}
            <!-- Normal mode: answer then criteria -->
            {#if answerText}
                <div class="prose dark:prose-invert max-w-none answer animate-in">
                    {@html snarkdown(answerText)}
                </div>
            {/if}

            {#if checklistItems.length > 0}
                <div class="animate-in {answerText ? 'mt-5' : ''}">
                    <div class="criteria-header">
                        <span class="criteria-label">Critérios</span>
                        <span class="criteria-counter {checkCount.checked === checkCount.total ? 'done' : ''}">
                            {checkCount.checked} / {checkCount.total}
                            {#if checkCount.checked === checkCount.total}✓{/if}
                        </span>
                    </div>

                    <div class="progress-bar">
                        <div class="progress-fill" style="width:{checkProgress}%; background:{progressColor}"></div>
                    </div>

                    <div class="checklist">
                        {#each checklistItems as item, i}
                            <label class="check-item {item.checked ? 'checked' : ''}">
                                <input
                                    type="checkbox"
                                    checked={item.checked}
                                    on:change={() => toggleItem(i)}
                                    class="check-input"
                                />
                                <span class="check-text">{item.text}</span>
                            </label>
                        {/each}
                    </div>
                </div>
            {/if}
        {/if}
    {/if}
</div>

<style>
    .card-content { width: 100%; }

    /* Badges */
    .badge-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
    .badge {
        font-size: 10px; font-weight: 700; letter-spacing: .04em;
        padding: 3px 9px; border-radius: 99px; border: 1px solid;
    }
    .badge-conceito  { background: rgba(139,92,246,.12); color: #a78bfa; border-color: rgba(139,92,246,.25); }
    .badge-fato      { background: rgba(245,158,11,.12); color: #fbbf24; border-color: rgba(245,158,11,.25); }
    .badge-proc      { background: rgba(16,185,129,.12);  color: #34d399; border-color: rgba(16,185,129,.25); }
    .badge-criterious{ background: rgba(99,102,241,.12);  color: #818cf8; border-color: rgba(99,102,241,.25); }

    /* Question */
    .question { font-size: 1.05rem; line-height: 1.6; }

    /* Divider */
    .divider { height: 1px; background: rgba(255,255,255,.08); margin: 20px 0; }

    /* Answer */
    .answer { font-size: .95rem; line-height: 1.65; color: #d4d4d4; }

    /* Criteria */
    .criteria-hint {
        font-size: 11px; font-weight: 700; color: #818cf8;
        text-transform: uppercase; letter-spacing: .07em; margin-bottom: 14px;
    }
    .criteria-header {
        display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;
    }
    .criteria-label { font-size: 11px; font-weight: 700; color: #737373; text-transform: uppercase; letter-spacing: .07em; }
    .criteria-counter { font-size: 13px; font-weight: 700; color: #a3a3a3; }
    .criteria-counter.done { color: #10b981; }

    .progress-bar { height: 4px; background: rgba(255,255,255,.08); border-radius: 99px; overflow: hidden; margin-bottom: 12px; }
    .progress-fill { height: 100%; border-radius: 99px; transition: width .3s ease; }

    /* Checklist items */
    .checklist { display: flex; flex-direction: column; gap: 8px; }
    .check-item {
        display: flex; align-items: flex-start; gap: 10px;
        padding: 11px 13px; border-radius: 10px; cursor: pointer;
        border: 1px solid rgba(255,255,255,.08);
        background: rgba(255,255,255,.03);
        transition: background .15s, border-color .15s;
        -webkit-tap-highlight-color: transparent;
    }
    .check-item:active { background: rgba(255,255,255,.07); }
    .check-item.checked {
        background: rgba(16,185,129,.08);
        border-color: rgba(16,185,129,.2);
    }
    .check-input {
        margin-top: 2px; width: 16px; height: 16px;
        flex-shrink: 0; accent-color: #10b981; cursor: pointer;
    }
    .check-text { font-size: .875rem; line-height: 1.5; color: #e5e5e5; }
    .check-item.checked .check-text { text-decoration: line-through; color: #737373; }

    /* Expand button */
    .expand-btn {
        display: flex; align-items: center; gap: 6px;
        margin-top: 14px; padding: 6px 0;
        font-size: 12px; font-weight: 600; color: #737373;
        background: none; border: none; cursor: pointer;
        transition: color .15s;
    }
    .expand-btn:hover { color: #a3a3a3; }
    .chevron { width: 14px; height: 14px; transition: transform .2s; flex-shrink: 0; }
    .chevron.open { transform: rotate(180deg); }

    /* Animation */
    .animate-in { animation: fadeUp .25s cubic-bezier(.16,1,.3,1) both; }
    @keyframes fadeUp {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
    }
</style>
