<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { getDueCards, processReview, Rating } from '$lib/fsrs';
    import { addXP, addCoins, checkStreak } from '$lib/stores/gamification';
    import { saveSession, clearSession } from '$lib/stores/sessionContext';
    import type { Flashcard } from '$lib/db';
    import { Confetti } from 'svelte-confetti';
    import StudyCard from '$lib/components/StudyCard.svelte';

    let dueCards: Flashcard[] = [];
    let currentIndex = 0;
    let showingAnswer = false;
    let showConfetti = false;
    let isLoading = true;

    let suggestedRating: 'again' | 'hard' | 'good' = 'good';
    let hasChecklist = false;

    let criteriousMode = false;
    if (typeof localStorage !== 'undefined') {
        criteriousMode = localStorage.getItem('cyanki_criterious_global') === 'true';
    }
    function toggleCriteriousMode() {
        criteriousMode = !criteriousMode;
        localStorage.setItem('cyanki_criterious_global', String(criteriousMode));
    }

    onMount(async () => {
        dueCards = await getDueCards(10);
        isLoading = false;
        saveSession({ type: 'global', name: 'Estudo Global', cardIndex: 0, totalCards: dueCards.length, savedAt: Date.now() });
    });

    $: currentCard = dueCards[currentIndex];
    $: progress = dueCards.length > 0 ? (currentIndex / dueCards.length) * 100 : 0;

    function flipCard() { showingAnswer = true; }

    async function rateCard(rating: Rating) {
        if (!currentCard) return;
        await processReview(currentCard.id, rating);
        addXP(10); addCoins(1); checkStreak();
        saveSession({ type: 'global', name: 'Estudo Global', cardIndex: currentIndex + 1, totalCards: dueCards.length, savedAt: Date.now() });
        showConfetti = false;
        await tick();
        showConfetti = true;
        showingAnswer = false;
        currentIndex += 1;
    }

    const ratingConfig = [
        { rating: Rating.Again, label: 'Again', key: '1', color: 'rose' },
        { rating: Rating.Hard,  label: 'Hard',  key: '2', color: 'amber' },
        { rating: Rating.Good,  label: 'Good',  key: '3', color: 'emerald' },
        { rating: Rating.Easy,  label: 'Easy',  key: '4', color: 'blue' },
    ] as const;
</script>

<svelte:window on:keydown={(e) => {
    if (isLoading || currentIndex >= dueCards.length) return;
    if (e.code === 'Space') { e.preventDefault(); if (!showingAnswer) flipCard(); }
    else if (showingAnswer) {
        if (e.code === 'Digit1') rateCard(Rating.Again);
        else if (e.code === 'Digit2') rateCard(Rating.Hard);
        else if (e.code === 'Digit3') rateCard(Rating.Good);
        else if (e.code === 'Digit4') rateCard(Rating.Easy);
    }
}}/>

{#if showConfetti}
    <div class="confetti-wrap">
        <Confetti x={[-2, 2]} y={[0.5, 2.5]} amount={50} delay={[0, 100]} rounded />
    </div>
{/if}

<div class="study-shell">

    <!-- ── Header ─────────────────────────────────────────────────────────── -->
    <header class="study-header">
        <div class="header-row">
            <a href="/dashboard" class="back-btn" aria-label="Sair">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                </svg>
                Sair
            </a>

            <span class="session-label">Estudo Global</span>

            <button
                on:click={toggleCriteriousMode}
                title="Modo criterioso"
                class="criterious-toggle {criteriousMode ? 'active' : ''}"
            >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                </svg>
                <span class="hidden sm:inline">Criterioso</span>
            </button>
        </div>

        <!-- Progress bar -->
        {#if !isLoading && dueCards.length > 0}
            <div class="progress-track">
                <div class="progress-fill" style="width:{progress}%"></div>
            </div>
            <div class="progress-text">{currentIndex} / {dueCards.length}</div>
        {/if}
    </header>

    <!-- ── Scrollable content ──────────────────────────────────────────────── -->
    <main class="study-main">
        {#if isLoading}
            <div class="state-center">
                <div class="spinner"></div>
            </div>

        {:else if dueCards.length === 0}
            <div class="state-center">
                <div class="state-box">
                    <span class="state-icon">🏆</span>
                    <h2>Tudo em dia!</h2>
                    <p>Sem revisões pendentes no momento.</p>
                    <a href="/dashboard" class="btn-neutral">Voltar ao Dashboard</a>
                </div>
            </div>

        {:else if currentIndex >= dueCards.length}
            <div class="state-center">
                <div class="state-box">
                    <span class="state-icon">🎉</span>
                    <h2>Sessão concluída!</h2>
                    <p>Todas as revisões processadas.</p>
                    <a href="/dashboard" class="btn-primary">Voltar ao Dashboard</a>
                </div>
            </div>

        {:else}
            <div class="card-shell">
                {#if currentCard.tags && currentCard.tags.length > 0}
                    <div class="tags-row">
                        {#each currentCard.tags as tag}
                            <span class="tag">{tag}</span>
                        {/each}
                    </div>
                {/if}
                <StudyCard
                    front={currentCard.front}
                    back={currentCard.back}
                    cardType={currentCard.type}
                    {showingAnswer}
                    {criteriousMode}
                    bind:suggestedRating
                    bind:hasChecklist
                />
            </div>
        {/if}
    </main>

    <!-- ── Sticky footer ───────────────────────────────────────────────────── -->
    {#if !isLoading && currentCard && currentIndex < dueCards.length}
        <footer class="study-footer">
            {#if !showingAnswer}
                <button on:click={flipCard} class="flip-btn">
                    Mostrar Resposta
                    <kbd class="key-hint">Espaço</kbd>
                </button>
            {:else}
                {#if hasChecklist}
                    <p class="suggestion-hint">
                        Sugestão:
                        <span class="suggestion-{suggestedRating}">{suggestedRating === 'good' ? 'Good' : suggestedRating === 'hard' ? 'Hard' : 'Again'}</span>
                    </p>
                {/if}
                <div class="rating-grid">
                    {#each ratingConfig as { rating, label, key, color }}
                        <button
                            on:click={() => rateCard(rating)}
                            class="rating-btn color-{color} {suggestedRating === label.toLowerCase() && hasChecklist ? 'suggested' : ''}"
                        >
                            <span class="rating-label">{label}</span>
                            <kbd class="rating-key">{key}</kbd>
                        </button>
                    {/each}
                </div>
            {/if}
        </footer>
    {/if}

</div>

<style>
    /* ── Shell ─────────────────────────────────────────────────────────────── */
    .study-shell {
        position: fixed;
        inset: 0;
        left: 0;
        background: #111;
        display: flex;
        flex-direction: column;
        align-items: center;
        overflow: hidden;
        z-index: 20;
    }
    @media (min-width: 768px) {
        .study-shell { left: 256px; }
    }

    .confetti-wrap {
        position: fixed; inset: 0; display: flex;
        align-items: center; justify-content: center;
        pointer-events: none; z-index: 100;
    }

    /* ── Header ────────────────────────────────────────────────────────────── */
    .study-header {
        width: 100%; max-width: 480px;
        padding: 12px 16px 8px;
        flex-shrink: 0;
    }
    .header-row {
        display: flex; align-items: center; gap: 8px; margin-bottom: 10px;
    }
    .back-btn {
        display: flex; align-items: center; gap: 5px;
        padding: 6px 12px; border-radius: 8px;
        border: 1px solid rgba(255,255,255,.1);
        background: rgba(255,255,255,.04);
        color: #a3a3a3; font-size: 13px; font-weight: 600;
        text-decoration: none; transition: color .15s, background .15s;
        flex-shrink: 0;
    }
    .back-btn:hover { color: #fff; background: rgba(255,255,255,.08); }
    .session-label {
        flex: 1; text-align: center;
        font-size: 13px; font-weight: 700; color: #525252;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .criterious-toggle {
        display: flex; align-items: center; gap: 5px;
        padding: 6px 10px; border-radius: 8px;
        border: 1px solid rgba(255,255,255,.1);
        background: rgba(255,255,255,.04);
        color: #525252; font-size: 12px; font-weight: 600;
        cursor: pointer; transition: all .15s; flex-shrink: 0;
    }
    .criterious-toggle.active {
        background: rgba(99,102,241,.15); border-color: rgba(99,102,241,.4); color: #a5b4fc;
    }
    .progress-track {
        height: 3px; background: rgba(255,255,255,.08);
        border-radius: 99px; overflow: hidden; margin-bottom: 4px;
    }
    .progress-fill {
        height: 100%; background: #6366f1; border-radius: 99px; transition: width .4s ease;
    }
    .progress-text {
        font-size: 11px; font-weight: 700; color: #525252; text-align: right;
    }

    /* ── Main ──────────────────────────────────────────────────────────────── */
    .study-main {
        width: 100%; max-width: 480px;
        flex: 1; overflow-y: auto;
        padding: 8px 16px 16px;
        -webkit-overflow-scrolling: touch;
    }
    .card-shell {
        background: #1c1c1c;
        border: 1px solid rgba(255,255,255,.07);
        border-radius: 16px;
        padding: 20px;
    }
    @media (min-height: 640px) {
        .card-shell { padding: 24px; }
    }
    .tags-row {
        display: flex; flex-wrap: wrap; gap: 6px;
        margin-bottom: 14px;
    }
    .tag {
        font-size: 11px; font-weight: 600;
        padding: 3px 9px; border-radius: 99px;
        background: rgba(99,102,241,.15);
        border: 1px solid rgba(99,102,241,.3);
        color: #a5b4fc;
        white-space: nowrap;
    }

    /* ── State screens ─────────────────────────────────────────────────────── */
    .state-center {
        display: flex; align-items: center; justify-content: center; min-height: 60vh;
    }
    .state-box {
        text-align: center; padding: 32px 24px;
        background: #1c1c1c; border: 1px solid rgba(255,255,255,.07);
        border-radius: 20px; max-width: 320px;
    }
    .state-icon { font-size: 48px; display: block; margin-bottom: 12px; }
    .state-box h2 { font-size: 1.4rem; font-weight: 800; color: #fff; margin-bottom: 6px; }
    .state-box p { font-size: .875rem; color: #737373; margin-bottom: 20px; }
    .spinner {
        width: 36px; height: 36px;
        border: 3px solid rgba(99,102,241,.2); border-top-color: #6366f1;
        border-radius: 50%; animation: spin .7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Footer ────────────────────────────────────────────────────────────── */
    .study-footer {
        width: 100%; max-width: 480px;
        padding: 10px 16px;
        padding-bottom: max(10px, env(safe-area-inset-bottom));
        background: linear-gradient(to top, #111 80%, transparent);
        flex-shrink: 0;
    }
    .flip-btn {
        width: 100%; min-height: 56px;
        background: #6366f1; color: #fff;
        font-size: 1rem; font-weight: 800;
        border: none; border-radius: 14px; cursor: pointer;
        display: flex; align-items: center; justify-content: center; gap: 10px;
        transition: background .15s, transform .1s;
        -webkit-tap-highlight-color: transparent;
    }
    .flip-btn:active { background: #4f46e5; transform: scale(.98); }
    .key-hint {
        font-size: 11px; font-weight: 600;
        background: rgba(255,255,255,.15); padding: 2px 7px;
        border-radius: 5px; font-family: inherit;
    }

    .suggestion-hint {
        font-size: 12px; font-weight: 600; color: #525252;
        text-align: center; margin-bottom: 8px;
    }
    .suggestion-good    { color: #10b981; font-weight: 700; }
    .suggestion-hard    { color: #f59e0b; font-weight: 700; }
    .suggestion-again   { color: #f43f5e; font-weight: 700; }

    .rating-grid {
        display: grid; grid-template-columns: 1fr 1fr;
        gap: 8px;
    }
    .rating-btn {
        min-height: 56px; border-radius: 12px;
        border: 1.5px solid; background: transparent;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 3px; cursor: pointer; font-family: inherit;
        transition: background .15s, transform .1s;
        -webkit-tap-highlight-color: transparent;
    }
    .rating-btn:active { transform: scale(.97); }
    .rating-btn.suggested { box-shadow: 0 0 0 2px currentColor; }

    .rating-label { font-size: 15px; font-weight: 700; }
    .rating-key {
        font-size: 10px; font-weight: 600; font-family: inherit;
        opacity: .45; background: none; border: none; padding: 0;
    }

    .color-rose    { color: #fb7185; border-color: rgba(251,113,133,.3); }
    .color-rose:hover    { background: rgba(251,113,133,.08); }
    .color-amber   { color: #fbbf24; border-color: rgba(251,191,36,.3); }
    .color-amber:hover   { background: rgba(251,191,36,.08); }
    .color-emerald { color: #34d399; border-color: rgba(52,211,153,.3); }
    .color-emerald:hover { background: rgba(52,211,153,.08); }
    .color-blue    { color: #60a5fa; border-color: rgba(96,165,250,.3); }
    .color-blue:hover    { background: rgba(96,165,250,.08); }

    /* ── Shared buttons ────────────────────────────────────────────────────── */
    .btn-primary {
        display: inline-block; padding: 10px 24px;
        background: #6366f1; color: #fff; font-weight: 700; font-size: .875rem;
        border-radius: 10px; text-decoration: none; transition: background .15s;
    }
    .btn-primary:hover { background: #4f46e5; }
    .btn-neutral {
        display: inline-block; padding: 10px 24px;
        background: rgba(255,255,255,.08); color: #a3a3a3; font-weight: 700; font-size: .875rem;
        border-radius: 10px; text-decoration: none; transition: background .15s;
    }
    .btn-neutral:hover { background: rgba(255,255,255,.12); }
</style>
