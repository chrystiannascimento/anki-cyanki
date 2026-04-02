<script lang="ts">
    import { page } from '$app/stores';
    import { onMount, tick } from 'svelte';
    import { db, type Flashcard } from '$lib/db';
    import { parseAndInjectNotebookFlashcards } from '$lib/notebookParser';
    import { getAllCardStates, processReview, Rating } from '$lib/fsrs';
    import { addXP, checkStreak } from '$lib/stores/gamification';
    import { goto } from '$app/navigation';
    import snarkdown from 'snarkdown';
    import { Confetti } from 'svelte-confetti';

    const notebookId = $page.params.id;

    let isLoading = true;
    let dueCards: Flashcard[] = [];
    let currentIndex = 0;
    
    // Session State
    let showingAnswer = false;
    let showConfetti = false;

    let notebookTitle = 'Caderno Temporário';

    onMount(async () => {
        try {
            await loadDueFilteredCards();
        } catch(e) {
            console.error(e);
            alert("Erro ao carregar caderno de estudos.");
            goto('/notebooks');
        }
    });

    async function loadDueFilteredCards() {
        if (!notebookId) throw new Error("ID não fornecido");
        
        const nb = await db.notebooks.get(notebookId);
        if (!nb) throw new Error("Caderno não encontrado!");
        notebookTitle = nb.title;
        
        const { extractedCards } = await parseAndInjectNotebookFlashcards(nb.content);
        const ids = extractedCards.map((c: any) => c.id);
        const pool = await db.flashcards.where('id').anyOf(ids).toArray();

        // 3. FSRS Integration
        const cardStates = await getAllCardStates();
        const now = new Date();

        // Extract Due Cards
        const overdueCards = pool.filter(c => {
            const state = cardStates.get(c.id);
            return state && state.due <= now;
        });

        // Sort by age (most overdue first as standard practice)
        overdueCards.sort((a, b) => {
            const dateA = cardStates.get(a.id)?.due.getTime() || 0;
            const dateB = cardStates.get(b.id)?.due.getTime() || 0;
            return dateA - dateB;
        });

        dueCards = overdueCards;
        isLoading = false;
    }

    $: currentCard = dueCards[currentIndex];

    function flipCard() { showingAnswer = true; }

    async function rateCard(rating: Rating) {
        if (!currentCard) return;

        await processReview(currentCard.id, rating);
        addXP(10);
        checkStreak();
        
        showConfetti = false;
        await tick();
        showConfetti = true;

        showingAnswer = false;
        currentIndex += 1;
    }

    function finishSession() { goto('/notebooks'); }

</script>

<div class="min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-4">
    {#if showConfetti}
        <div class="fixed inset-0 flex items-center justify-center pointer-events-none z-[100]">
            <Confetti x={[-2, 2]} y={[0.5, 2.5]} amount={50} delay={[0, 100]} rounded />
        </div>
    {/if}

    <!-- Header / Stats -->
    <div class="fixed top-0 left-0 right-0 p-4 md:p-6 flex justify-between items-center z-10 bg-gradient-to-b from-neutral-900 to-transparent">
        <button on:click={() => goto('/notebooks')} class="flex items-center gap-2 text-neutral-400 hover:text-white transition group border border-neutral-700 bg-neutral-800/50 px-4 py-2 rounded-xl backdrop-blur">
            <svg class="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
            Sair
        </button>

        <div class="flex items-center gap-4 bg-neutral-800/70 border border-neutral-700 backdrop-blur rounded-2xl p-1 shadow-lg">
            <div class="px-3 py-1 bg-neutral-900 rounded-xl text-neutral-300 font-bold text-sm tracking-widest hidden md:block">
                Caderno: {notebookTitle}
            </div>
            <div class="flex gap-2 text-sm font-bold items-center px-2">
                <span class="text-white bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded relative overflow-hidden group">
                    FSRS
                </span>
                <span class="text-neutral-500 mx-1">/</span>
                <span class="text-white bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded relative overflow-hidden group">
                    {#if !isLoading && dueCards.length > 0}
                        {currentIndex + 1} de {dueCards.length}
                    {:else}
                        ... 
                    {/if}
                </span>
            </div>
        </div>
    </div>

    <!-- Main Content -->
    <main class="w-full max-w-2xl flex flex-col items-center justify-center mt-16 z-0">
        {#if isLoading}
            <div class="w-16 h-16 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
            <p class="mt-4 font-bold text-indigo-400 tracking-widest uppercase text-sm animate-pulse">Calculando Repetições do Caderno...</p>
        
        {:else if !currentCard && dueCards.length === 0}
            <div class="bg-neutral-800/60 backdrop-blur-md p-10 rounded-3xl w-full text-center border border-neutral-700 shadow-2xl relative overflow-hidden">
                <div class="text-6xl mb-6 transform hover:scale-110 transition-transform cursor-default">🏆</div>
                <h1 class="text-3xl font-extrabold text-white tracking-tight mb-2">Caderno Limpo!</h1>
                <p class="text-neutral-400 mb-8 max-w-sm mx-auto">Você não tem questões programadas ou atrasadas para o algoritmo FSRS neste momento para este caderno.</p>
                <div class="flex justify-center">
                    <button on:click={finishSession} class="px-8 py-3.5 bg-neutral-700 hover:bg-neutral-600 text-white font-bold rounded-xl shadow border border-neutral-600 transition-all text-sm uppercase tracking-wider hover:-translate-y-1">Voltar para Notebooks</button>
                </div>
            </div>
            
        {:else if currentIndex >= dueCards.length}
            <div class="bg-neutral-800/60 backdrop-blur-md p-10 rounded-3xl w-full text-center border border-neutral-700 shadow-2xl relative overflow-hidden">
                <div class="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent pointer-events-none"></div>
                <div class="text-7xl mb-6 transform hover:scale-110 transition-transform cursor-default">🎉</div>
                <h1 class="text-3xl font-extrabold text-white tracking-tight mb-2">Estudo Concluído!</h1>
                <p class="text-neutral-400 mb-8 max-w-sm mx-auto">Sua meta foi batida. Todas as revisões programadas FSRS para as questões deste Caderno foram processadas orgânicamente.</p>
                <div class="flex flex-col md:flex-row gap-4 justify-center">
                    <button on:click={finishSession} class="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/25 transition-all text-sm uppercase tracking-wider hover:-translate-y-1">Voltar para Notebooks</button>
                </div>
            </div>

        {:else}
            <div class="w-full h-1.5 bg-neutral-800 rounded-full mb-6 overflow-hidden">
                <div class="h-full bg-indigo-500 transition-all duration-300" style="width: {(currentIndex / dueCards.length) * 100}%"></div>
            </div>

            <div class="w-full relative perspective-1000">
                <div class="bg-white dark:bg-[#1a1a1a] min-h-[400px] w-full rounded-3xl p-8 md:p-12 shadow-2xl flex flex-col justify-center border border-neutral-200 dark:border-neutral-800 transition-all duration-500 transform-style-3d {showingAnswer ? 'rotate-x-2' : ''}">
                    <!-- Front -->
                    <div class="prose prose-lg dark:prose-invert max-w-none w-full text-center prose-p:leading-relaxed prose-code:bg-neutral-100 dark:prose-code:bg-neutral-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-indigo-600 dark:prose-code:text-indigo-400">
                        {@html snarkdown(currentCard.front)}
                    </div>
                    <!-- Back -->
                    {#if showingAnswer}
                        <div class="w-full h-px bg-neutral-200 dark:bg-neutral-800 my-8"></div>
                        <div class="prose prose-lg dark:prose-invert max-w-none w-full text-center animate-fade-in-up">
                            {@html snarkdown(currentCard.back)}
                        </div>
                    {/if}
                </div>
            </div>

            <div class="mt-8 md:mt-12 w-full max-w-lg">
                {#if !showingAnswer}
                     <button on:click={flipCard} class="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl shadow-xl shadow-indigo-500/20 transition-all active:scale-95 text-lg flex items-center justify-center gap-2 group border border-indigo-400/30">
                        Mostrar Resposta
                        <svg class="w-5 h-5 group-hover:translate-y-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7-7-7-7"></path></svg>
                    </button>
                    <p class="text-center text-neutral-500 text-xs mt-4 font-bold"><kbd class="bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded border border-neutral-700">Espaço</kbd> Revelar</p>
                {:else}
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in-up">
                        <button on:click={() => rateCard(Rating.Again)} class="py-4 font-bold bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl transition active:scale-95 shadow-sm">Again (1)</button>
                        <button on:click={() => rateCard(Rating.Hard)} class="py-4 font-bold bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition active:scale-95 shadow-sm">Hard (2)</button>
                        <button on:click={() => rateCard(Rating.Good)} class="py-4 font-bold bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl transition active:scale-95 shadow-sm">Good (3)</button>
                        <button on:click={() => rateCard(Rating.Easy)} class="py-4 font-bold bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border border-blue-500/30 rounded-xl transition active:scale-95 shadow-sm">Easy (4)</button>
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
    .transform-style-3d { transform-style: preserve-3d; }
    .rotate-x-2 { transform: rotateX(2deg); }
    .animate-fade-in-up { animation: fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
    @keyframes fadeInUp { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }
</style>
