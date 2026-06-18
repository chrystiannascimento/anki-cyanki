<script lang="ts">
    import { page } from '$app/stores';
    import { onMount, tick } from 'svelte';
    import { db, type Flashcard } from '$lib/db';
    import {
        getValidCardsForGroup,
        saveGroupSession,
        getRecentSessions,
        calculateScore,
        SCORE_COLOR,
        relativeDate,
        type SessionScore,
    } from '$lib/notebookGroups';
    import { goto } from '$app/navigation';
    import { marked } from 'marked';
    import DOMPurify from 'dompurify';

    const notebookId = $page.params.id;
    const groupId = $page.params.groupId;

    marked.setOptions({ breaks: true });

    // ─── State ────────────────────────────────────────────────────────────────
    let isLoading = true;
    let notebookTitle = '';
    let groupIndex = 0;
    let cards: Flashcard[] = [];
    let currentIndex = 0;
    let showingAnswer = false;
    let correctCount = 0;

    // In-memory results per card: true = correct, false = incorrect
    let results: boolean[] = [];

    // Session complete state
    let sessionDone = false;
    let sessionScore: SessionScore = 'E';
    let recentSessions: Awaited<ReturnType<typeof getRecentSessions>> = [];

    function renderMd(text: string): string {
        return DOMPurify.sanitize(marked.parse(text) as string);
    }

    onMount(async () => {
        try {
            const nb = await db.notebooks.get(notebookId);
            if (!nb) { goto('/notebooks'); return; }
            notebookTitle = nb.title;

            const group = await db.notebookGroups.get(groupId);
            if (!group) { goto(`/notebooks/${notebookId}`); return; }
            groupIndex = group.groupIndex;

            cards = await getValidCardsForGroup(group);
            if (cards.length === 0) {
                isLoading = false;
                return;
            }

            recentSessions = await getRecentSessions(groupId);
        } catch (e) {
            console.error(e);
            goto(`/notebooks/${notebookId}`);
        } finally {
            isLoading = false;
        }
    });

    $: currentCard = cards[currentIndex];
    $: progress = cards.length > 0 ? (currentIndex / cards.length) * 100 : 0;

    function flipCard() {
        showingAnswer = true;
    }

    async function answer(correct: boolean) {
        if (!currentCard) return;
        results[currentIndex] = correct;
        if (correct) correctCount++;
        showingAnswer = false;
        await tick();
        currentIndex++;
        if (currentIndex >= cards.length) {
            await finishSession();
        }
    }

    async function finishSession() {
        sessionScore = calculateScore(correctCount, cards.length);
        await saveGroupSession({
            groupId,
            notebookId,
            score: sessionScore,
            accuracy: cards.length > 0 ? correctCount / cards.length : 0,
            totalCards: cards.length,
            correctCards: correctCount,
            studiedAt: Date.now(),
        });
        recentSessions = await getRecentSessions(groupId);
        sessionDone = true;
    }

    function restartSession() {
        currentIndex = 0;
        correctCount = 0;
        results = [];
        showingAnswer = false;
        sessionDone = false;
    }

    function goBack() {
        goto(`/notebooks/${notebookId}`);
    }

    function handleKeydown(e: KeyboardEvent) {
        if (isLoading || sessionDone || currentIndex >= cards.length) return;
        if (e.code === 'Space') {
            e.preventDefault();
            if (!showingAnswer) flipCard();
        } else if (showingAnswer) {
            if (e.code === 'ArrowLeft' || e.key === 'f' || e.key === 'F') answer(false);
            else if (e.code === 'ArrowRight' || e.key === 'j' || e.key === 'J') answer(true);
        }
    }

    // SVG ring for result screen
    function ringDash(pct: number): string {
        const r = 54;
        const circ = 2 * Math.PI * r;
        return `${(pct / 100) * circ} ${circ}`;
    }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="study-shell">

    <!-- Header -->
    <header class="study-header">
        <div class="header-row">
            <button on:click={goBack} class="back-btn">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                </svg>
                Sair
            </button>
            <span class="session-label" title="{notebookTitle} — Grupo {groupIndex}">
                {notebookTitle || '...'} — Grupo {groupIndex}
            </span>
            <span class="w-16"></span>
        </div>

        {#if !isLoading && !sessionDone && cards.length > 0}
            <div class="progress-track">
                <div class="progress-fill" style="width:{progress}%"></div>
            </div>
            <div class="progress-text">{currentIndex} / {cards.length}</div>
        {/if}
    </header>

    <!-- Main content -->
    <main class="study-main">

        {#if isLoading}
            <div class="state-center">
                <div class="spinner"></div>
            </div>

        {:else if cards.length === 0}
            <div class="state-center">
                <div class="state-box">
                    <span class="state-icon">🗑️</span>
                    <h2>Sem cards disponíveis</h2>
                    <p>Todos os cards deste grupo foram removidos do caderno.</p>
                    <button on:click={goBack} class="btn-neutral">Voltar para subgrupos</button>
                </div>
            </div>

        {:else if sessionDone}
            <!-- Result screen -->
            <div class="state-center">
                <div class="result-box">
                    <!-- SVG ring gauge -->
                    <div class="ring-wrap">
                        <svg width="128" height="128" viewBox="0 0 128 128">
                            <circle cx="64" cy="64" r="54" stroke="rgba(255,255,255,.08)" stroke-width="10" fill="none"/>
                            <circle
                                cx="64" cy="64" r="54"
                                stroke={SCORE_COLOR[sessionScore]}
                                stroke-width="10" fill="none"
                                stroke-dasharray={ringDash(cards.length > 0 ? (correctCount / cards.length) * 100 : 0)}
                                stroke-dashoffset="0"
                                stroke-linecap="round"
                                transform="rotate(-90 64 64)"
                                class="ring-fill"
                            />
                            <text x="64" y="58" text-anchor="middle" class="ring-pct" fill="white" font-size="22" font-weight="800" font-family="inherit">
                                {cards.length > 0 ? Math.round(correctCount / cards.length * 100) : 0}%
                            </text>
                            <text x="64" y="76" text-anchor="middle" fill="rgba(255,255,255,.4)" font-size="11" font-family="inherit">acerto</text>
                        </svg>
                    </div>

                    <!-- Score badge -->
                    <div
                        class="score-badge"
                        style="color:{SCORE_COLOR[sessionScore]};background:{SCORE_COLOR[sessionScore]}20;border-color:{SCORE_COLOR[sessionScore]}40"
                    >{sessionScore}</div>

                    <p class="result-count">{correctCount} acertos de {cards.length} cards</p>

                    <!-- Mini history -->
                    {#if recentSessions.length > 0}
                        <div class="history-row">
                            {#each recentSessions as s, i}
                                {#if i > 0}<span class="hist-arrow">→</span>{/if}
                                <span
                                    class="hist-pill"
                                    style="color:{SCORE_COLOR[s.score as SessionScore]};background:{SCORE_COLOR[s.score as SessionScore]}20"
                                >{s.score}</span>
                            {/each}
                        </div>
                    {/if}

                    <div class="result-actions">
                        <button on:click={restartSession} class="btn-primary">Estudar novamente</button>
                        <button on:click={goBack} class="btn-neutral">Voltar para subgrupos</button>
                    </div>
                </div>
            </div>

        {:else}
            <!-- Card study area -->
            <div class="card-shell">
                {#if currentCard.tags && currentCard.tags.length > 0}
                    <div class="tags-row">
                        {#each currentCard.tags as tag}
                            <span class="tag">{tag}</span>
                        {/each}
                    </div>
                {/if}

                <!-- Front -->
                <div class="card-front">
                    {@html renderMd(currentCard.front)}
                </div>

                <!-- Back (hidden until flipped) -->
                {#if showingAnswer}
                    <div class="card-divider"></div>
                    <div class="card-back animate-in">
                        {@html renderMd(currentCard.back)}
                    </div>
                {/if}
            </div>
        {/if}
    </main>

    <!-- Footer actions -->
    {#if !isLoading && !sessionDone && currentCard && currentIndex < cards.length}
        <footer class="study-footer">
            {#if !showingAnswer}
                <button on:click={flipCard} class="flip-btn">
                    Mostrar Resposta
                    <kbd class="key-hint">Espaço</kbd>
                </button>
            {:else}
                <div class="answer-grid">
                    <button on:click={() => answer(false)} class="answer-btn err-btn">
                        <span class="answer-label">Errei</span>
                        <kbd class="answer-key">← F</kbd>
                    </button>
                    <button on:click={() => answer(true)} class="answer-btn ok-btn">
                        <span class="answer-label">Acertei</span>
                        <kbd class="answer-key">J →</kbd>
                    </button>
                </div>
            {/if}
        </footer>
    {/if}

</div>

<style>
    .study-shell {
        position: fixed; inset: 0; left: 0;
        background: #111;
        display: flex; flex-direction: column; align-items: center;
        overflow: hidden; z-index: 20;
    }
    @media (min-width: 768px) { .study-shell { left: 256px; } }

    .study-header {
        width: 100%; max-width: 520px;
        padding: 12px 16px 8px; flex-shrink: 0;
    }
    .header-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }

    .back-btn {
        display: flex; align-items: center; gap: 5px;
        padding: 6px 12px; border-radius: 8px;
        border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.04);
        color: #a3a3a3; font-size: 13px; font-weight: 600;
        cursor: pointer; transition: color .15s, background .15s; flex-shrink: 0;
    }
    .back-btn:hover { color: #fff; background: rgba(255,255,255,.08); }

    .session-label {
        flex: 1; text-align: center;
        font-size: 13px; font-weight: 700; color: #525252;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    .progress-track {
        height: 3px; background: rgba(255,255,255,.08);
        border-radius: 99px; overflow: hidden; margin-bottom: 4px;
    }
    .progress-fill { height: 100%; background: #6366f1; border-radius: 99px; transition: width .4s ease; }
    .progress-text { font-size: 11px; font-weight: 700; color: #525252; text-align: right; }

    .study-main {
        width: 100%; max-width: 520px;
        flex: 1; overflow-y: auto; padding: 8px 16px 16px;
        -webkit-overflow-scrolling: touch;
    }

    .state-center { display: flex; align-items: center; justify-content: center; min-height: 60vh; }
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

    /* Result screen */
    .result-box {
        display: flex; flex-direction: column; align-items: center; gap: 16px;
        padding: 32px 24px;
        background: #1c1c1c; border: 1px solid rgba(255,255,255,.07);
        border-radius: 24px; max-width: 320px; width: 100%;
    }
    .ring-wrap { position: relative; }
    .ring-fill { transition: stroke-dasharray 1s cubic-bezier(.16,1,.3,1); }
    .score-badge {
        font-size: 2.5rem; font-weight: 900;
        width: 72px; height: 72px;
        display: flex; align-items: center; justify-content: center;
        border-radius: 20px; border: 2px solid;
    }
    .result-count { font-size: .9rem; font-weight: 600; color: #737373; }
    .history-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: center; }
    .hist-arrow { font-size: 11px; color: #404040; }
    .hist-pill {
        font-size: 12px; font-weight: 800;
        width: 28px; height: 28px;
        display: flex; align-items: center; justify-content: center;
        border-radius: 8px;
    }
    .result-actions { display: flex; flex-direction: column; gap: 10px; width: 100%; }

    /* Card */
    .card-shell {
        background: #1c1c1c; border: 1px solid rgba(255,255,255,.07);
        border-radius: 16px; padding: 20px;
    }
    @media (min-height: 640px) { .card-shell { padding: 24px; } }

    .tags-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
    .tag {
        font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 99px;
        background: rgba(99,102,241,.15); border: 1px solid rgba(99,102,241,.3); color: #a5b4fc;
    }
    .card-front { color: #e5e5e5; font-size: .975rem; line-height: 1.65; }
    .card-front :global(p) { margin: 0 0 .75em; }
    .card-front :global(code) { background: rgba(255,255,255,.08); padding: 1px 5px; border-radius: 4px; font-size: .875em; }
    .card-divider { height: 1px; background: rgba(255,255,255,.07); margin: 16px 0; }
    .card-back { color: #a3a3a3; font-size: .9rem; line-height: 1.65; }
    .card-back :global(p) { margin: 0 0 .75em; }
    .card-back :global(code) { background: rgba(255,255,255,.08); padding: 1px 5px; border-radius: 4px; font-size: .875em; }
    .animate-in { animation: fadeUp .25s cubic-bezier(.16,1,.3,1) both; }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

    /* Footer */
    .study-footer {
        width: 100%; max-width: 520px;
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
    .answer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .answer-btn {
        min-height: 56px; border-radius: 14px;
        border: 1.5px solid; background: transparent;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 3px; cursor: pointer; font-family: inherit;
        transition: background .15s, transform .1s;
        -webkit-tap-highlight-color: transparent;
    }
    .answer-btn:active { transform: scale(.97); }
    .answer-label { font-size: 16px; font-weight: 700; }
    .answer-key { font-size: 10px; font-weight: 600; font-family: inherit; opacity: .45; background: none; border: none; padding: 0; }
    .err-btn { color: #fb7185; border-color: rgba(251,113,133,.3); }
    .err-btn:hover { background: rgba(251,113,133,.08); }
    .ok-btn  { color: #34d399; border-color: rgba(52,211,153,.3); }
    .ok-btn:hover  { background: rgba(52,211,153,.08); }

    .btn-primary {
        width: 100%; padding: 12px 24px;
        background: #6366f1; color: #fff; font-weight: 700; font-size: .9rem;
        border-radius: 12px; border: none; cursor: pointer; transition: background .15s;
    }
    .btn-primary:hover { background: #4f46e5; }
    .btn-neutral {
        width: 100%; padding: 12px 24px;
        background: rgba(255,255,255,.06); color: #a3a3a3; font-weight: 700; font-size: .9rem;
        border-radius: 12px; border: none; cursor: pointer; transition: background .15s;
    }
    .btn-neutral:hover { background: rgba(255,255,255,.1); }
</style>
