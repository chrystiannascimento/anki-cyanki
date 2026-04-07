<script lang="ts">
    import { page } from '$app/stores';
    import { onMount, tick } from 'svelte';
    import { db, type Flashcard } from '$lib/db';
    import { getAllCardStates, processReview, Rating } from '$lib/fsrs';
    import { addXP, addCoins, checkStreak } from '$lib/stores/gamification';
    import { saveSession, clearSession } from '$lib/stores/sessionContext';
    import { goto } from '$app/navigation';
    import { Confetti } from 'svelte-confetti';
    import StudyCard from '$lib/components/StudyCard.svelte';

    const filterId = $page.params.id;

    let isLoading = true;
    let dueCards: Flashcard[] = [];
    let currentIndex = 0;
    let showingAnswer = false;
    let showConfetti = false;
    let filterName = 'Caderno Temporário';

    // US-11: Modo criterioso — persisted per filter in localStorage
    let criteriousMode = false;
    $: if (filterId) {
        criteriousMode = localStorage.getItem(`cyanki_criterious_${filterId}`) === 'true';
    }
    function toggleCriteriousMode() {
        criteriousMode = !criteriousMode;
        localStorage.setItem(`cyanki_criterious_${filterId}`, String(criteriousMode));
    }

    // US-04: bound from StudyCard
    let suggestedRating: 'again' | 'hard' | 'good' = 'good';
    let hasChecklist = false;

    onMount(async () => {
        try {
            await loadDueFilteredCards();
        } catch(e) {
            console.error(e);
            alert("Erro ao carregar caderno de estudos.");
            goto('/practice/questions');
        }
    });

    async function loadDueFilteredCards() {
        if (!filterId) throw new Error("ID não fornecido");

        const sf = await db.savedFilters.get(filterId);
        if (!sf) throw new Error("Caderno não encontrado!");
        filterName = sf.name;

        let pool: Flashcard[] = [];
        const tags = sf.criteria.tags || [];

        if (tags.length > 0) {
            const firstTag = tags[0];
            const initialSet = await db.flashcards.where('tags').equals(firstTag).toArray();
            pool = initialSet.filter(c => tags.every(t => c.tags?.includes(t)));
        } else {
            pool = await db.flashcards.toArray();
        }

        if (sf.criteria.keyword?.trim()) {
            const q = sf.criteria.keyword.toLowerCase();
            pool = pool.filter(c =>
                c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q)
            );
        }

        if (sf.criteria.difficulty && sf.criteria.difficulty !== 'all') {
            pool = pool.filter(card => card.tags?.includes(sf.criteria.difficulty!));
        }

        const cardStates = await getAllCardStates();
        const now = new Date();

        const overdueCards = pool.filter(c => {
            const state = cardStates.get(c.id);
            return state && state.due <= now;
        });

        overdueCards.sort((a, b) => {
            const dateA = cardStates.get(a.id)?.due.getTime() || 0;
            const dateB = cardStates.get(b.id)?.due.getTime() || 0;
            return dateA - dateB;
        });

        dueCards = overdueCards;
        isLoading = false;

        saveSession({
            type: 'practice',
            id: filterId,
            name: filterName,
            cardIndex: 0,
            totalCards: dueCards.length,
            savedAt: Date.now()
        });
    }

    $: currentCard = dueCards[currentIndex];

    function flipCard() { showingAnswer = true; }

    async function rateCard(rating: Rating) {
        if (!currentCard) return;

        await processReview(currentCard.id, rating);
        addXP(10);
        addCoins(1);
        checkStreak();

        saveSession({
            type: 'practice',
            id: filterId,
            name: filterName,
            cardIndex: currentIndex + 1,
            totalCards: dueCards.length,
            savedAt: Date.now()
        });

        showConfetti = false;
        await tick();
        showConfetti = true;

        showingAnswer = false;
        currentIndex += 1;
    }

    function finishSession() {
        clearSession();
        goto('/practice/questions');
    }


</script>

<div class="min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-4">
    {#if showConfetti}
        <div class="fixed inset-0 flex items-center justify-center pointer-events-none z-[100]">
            <Confetti x={[-2, 2]} y={[0.5, 2.5]} amount={50} delay={[0, 100]} rounded />
        </div>
    {/if}

    <!-- Header -->
    <div class="fixed top-0 left-0 right-0 p-4 md:p-6 flex justify-between items-center z-10 bg-gradient-to-b from-neutral-900 to-transparent">
        <button on:click={() => goto('/practice/questions')} class="flex items-center gap-2 text-neutral-400 hover:text-white transition group border border-neutral-700 bg-neutral-800/50 px-4 py-2 rounded-xl backdrop-blur">
            <svg class="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            Sair
        </button>

        <div class="flex items-center gap-2">
            <!-- US-11: Modo criterioso toggle -->
            <button
                on:click={toggleCriteriousMode}
                title="US-11: Modo criterioso — critérios primeiro, resposta colapsada"
                class="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition {criteriousMode ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'border-neutral-700 text-neutral-500 hover:border-neutral-500 hover:text-neutral-300'}"
            >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
                Modo criterioso
            </button>

            <div class="flex items-center gap-4 bg-neutral-800/70 border border-neutral-700 backdrop-blur rounded-2xl p-1 shadow-lg">
                <div class="px-3 py-1 bg-neutral-900 rounded-xl text-neutral-300 font-bold text-sm tracking-widest hidden md:block">
                    {filterName}
                </div>
                <div class="flex gap-2 text-sm font-bold items-center px-2">
                    <span class="text-white bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded">FSRS</span>
                    <span class="text-neutral-500 mx-1">/</span>
                    <span class="text-white bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded">
                        {#if !isLoading && dueCards.length > 0}
                            {currentIndex + 1} de {dueCards.length}
                        {:else}
                            ...
                        {/if}
                    </span>
                </div>
            </div>
        </div>
    </div>

    <!-- Main Content -->
    <main class="w-full max-w-2xl flex flex-col items-center justify-center mt-16 z-0">

        {#if isLoading}
            <div class="w-16 h-16 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
            <p class="mt-4 font-bold text-indigo-400 tracking-widest uppercase text-sm animate-pulse">Calculando Repetições...</p>

        {:else if !currentCard && dueCards.length === 0}
            <div class="bg-neutral-800/60 backdrop-blur-md p-10 rounded-3xl w-full text-center border border-neutral-700 shadow-2xl">
                <div class="text-6xl mb-6">🏆</div>
                <h1 class="text-3xl font-extrabold text-white tracking-tight mb-2">Caderno Limpo!</h1>
                <p class="text-neutral-400 mb-8 max-w-sm mx-auto">Nenhuma revisão pendente para este filtro.</p>
                <button on:click={finishSession} class="px-8 py-3.5 bg-neutral-700 hover:bg-neutral-600 text-white font-bold rounded-xl shadow border border-neutral-600 transition-all text-sm uppercase tracking-wider hover:-translate-y-1">
                    Voltar para Prática
                </button>
            </div>

        {:else if currentIndex >= dueCards.length}
            <div class="bg-neutral-800/60 backdrop-blur-md p-10 rounded-3xl w-full text-center border border-neutral-700 shadow-2xl relative overflow-hidden">
                <div class="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent pointer-events-none"></div>
                <div class="text-7xl mb-6">🎉</div>
                <h1 class="text-3xl font-extrabold text-white tracking-tight mb-2">Estudo Concluído!</h1>
                <p class="text-neutral-400 mb-8 max-w-sm mx-auto">Todas as revisões FSRS foram processadas.</p>
                <button on:click={finishSession} class="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/25 transition-all text-sm uppercase tracking-wider hover:-translate-y-1">
                    Voltar para Filtros
                </button>
            </div>

        {:else}
            <!-- Progress bar -->
            <div class="w-full h-1.5 bg-neutral-800 rounded-full mb-6 overflow-hidden">
                <div class="h-full bg-indigo-500 transition-all duration-300" style="width: {(currentIndex / dueCards.length) * 100}%"></div>
            </div>

            <!-- US-11 mobile toggle -->
            <div class="w-full flex justify-end mb-2 md:hidden">
                <button
                    on:click={toggleCriteriousMode}
                    class="text-xs px-3 py-1.5 rounded-xl border transition {criteriousMode ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'border-neutral-700 text-neutral-500'}"
                >
                    {criteriousMode ? 'Modo criterioso ✓' : 'Modo criterioso'}
                </button>
            </div>

            <!-- StudyCard component (US-01–04, US-09, US-11) -->
            <div class="w-full relative perspective-1000">
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

            <!-- Actions -->
            <div class="mt-8 md:mt-12 w-full max-w-lg">
                {#if !showingAnswer}
                    <button on:click={flipCard} class="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl shadow-xl shadow-indigo-500/20 transition-all active:scale-95 text-lg flex items-center justify-center gap-2 group border border-indigo-400/30">
                        Mostrar Resposta
                        <svg class="w-5 h-5 group-hover:translate-y-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7-7-7-7"/></svg>
                    </button>
                    <p class="text-center text-neutral-500 text-xs mt-4 font-bold"><kbd class="bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded border border-neutral-700">Espaço</kbd> Revelar</p>
                {:else}
                    <div class="space-y-3">
                        {#if hasChecklist}
                            <div class="text-center text-xs text-neutral-500 font-medium">
                                Sugestão automática:
                                <span class="{suggestedRating === 'good' ? 'text-emerald-400' : suggestedRating === 'hard' ? 'text-amber-400' : 'text-rose-400'} font-bold uppercase">
                                    {suggestedRating === 'good' ? 'Good' : suggestedRating === 'hard' ? 'Hard' : 'Again'}
                                </span>
                                <span class="text-neutral-600 ml-1">(pode sobrescrever)</span>
                            </div>
                        {/if}

                        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in-up">
                            <button on:click={() => rateCard(Rating.Again)} class="py-4 font-bold bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl transition active:scale-95 shadow-sm {suggestedRating === 'again' && hasChecklist ? 'ring-2 ring-rose-500/50' : ''}">Again (1)</button>
                            <button on:click={() => rateCard(Rating.Hard)} class="py-4 font-bold bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition active:scale-95 shadow-sm {suggestedRating === 'hard' && hasChecklist ? 'ring-2 ring-amber-500/50' : ''}">Hard (2)</button>
                            <button on:click={() => rateCard(Rating.Good)} class="py-4 font-bold bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl transition active:scale-95 shadow-sm {suggestedRating === 'good' && hasChecklist ? 'ring-2 ring-emerald-500/50' : ''}">Good (3)</button>
                            <button on:click={() => rateCard(Rating.Easy)} class="py-4 font-bold bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border border-blue-500/30 rounded-xl transition active:scale-95 shadow-sm">Easy (4)</button>
                        </div>
                    </div>
                {/if}
            </div>
        {/if}
    </main>
</div>

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

<style>
    .perspective-1000 { perspective: 1000px; }
    .animate-fade-in-up { animation: fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
    @keyframes fadeInUp { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }
</style>
