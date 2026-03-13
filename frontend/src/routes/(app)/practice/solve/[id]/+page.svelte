<script lang="ts">
    import { page } from '$app/stores';
    import { onMount } from 'svelte';
    import { db, type Flashcard, type SavedFilter } from '$lib/db';
    import { goto } from '$app/navigation';
    import snarkdown from 'snarkdown';

    const filterId = $page.params.id;

    let isLoading = true;
    let flashcards: Flashcard[] = [];
    let currentCardIndex = 0;
    
    // Session State
    let isFlipped = false;
    let correctCount = 0;
    let wrongCount = 0;
    let isFinished = false;

    // Filter Metadata for Header
    let filterName = 'Sessão Temporária';

    onMount(async () => {
        try {
            await loadSessionData();
        } catch(e) {
            console.error(e);
            alert("Erro ao carregar sessão de prática.");
            goto('/practice/questions');
        }
    });

    async function loadSessionData() {
        if (!filterId) throw new Error("ID não fornecido");
        
        // Se for um ID de SavedFilter real
        const sf = await db.savedFilters.get(filterId);
        if (!sf) {
             throw new Error("Filtro não encontrado!");
        }

        filterName = sf.name;
        
        // Run Two-step Algorithm
        let baseQuery = db.flashcards;
        let results: Flashcard[] = [];
        const tags = sf.criteria.tags || [];

        if (tags.length > 0) {
            const firstTag = tags[0];
            const initialSet = await baseQuery.where('tags').equals(firstTag).toArray();
            results = initialSet.filter(c => tags.every(t => c.tags?.includes(t)));
        } else {
            results = await baseQuery.toArray();
        }

        if (sf.criteria.keyword && sf.criteria.keyword.trim()) {
            const q = sf.criteria.keyword.toLowerCase();
            results = results.filter(c => 
                c.front.toLowerCase().includes(q) || 
                c.back.toLowerCase().includes(q)
            );
        }

        if (sf.criteria.difficulty && sf.criteria.difficulty !== 'all') {
            results = results.filter(card => card.tags?.includes(sf.criteria.difficulty!));
        }

        // Shuffle deck for practice 
        // We use a simple Fisher-Yates shuffle
        for (let i = results.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [results[i], results[j]] = [results[j], results[i]];
        }

        flashcards = results;
        isLoading = false;

        if (flashcards.length === 0) {
            isFinished = true;
        }
    }

    function flipCard() {
        isFlipped = true;
    }

    function recordAnswer(correct: boolean) {
        if (correct) correctCount++;
        else wrongCount++;

        nextCard();
    }

    function nextCard() {
        if (currentCardIndex < flashcards.length - 1) {
            currentCardIndex++;
            isFlipped = false;
        } else {
            isFinished = true;
        }
    }

    function finishSession() {
        goto('/practice/questions');
    }

</script>

<div class="min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-4">

    <!-- Header / Stats -->
    <div class="fixed top-0 left-0 right-0 p-4 md:p-6 flex justify-between items-center z-10 bg-gradient-to-b from-neutral-900 to-transparent">
        <button on:click={() => goto('/practice/questions')} class="flex items-center gap-2 text-neutral-400 hover:text-white transition group border border-neutral-700 bg-neutral-800/50 px-4 py-2 rounded-xl backdrop-blur">
            <svg class="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
            Sair
        </button>

        <div class="flex items-center gap-4 bg-neutral-800/70 border border-neutral-700 backdrop-blur rounded-2xl p-1 shadow-lg">
            <div class="px-3 py-1 bg-neutral-900 rounded-xl text-neutral-300 font-bold text-sm tracking-widest hidden md:block">
                {filterName}
            </div>
            <div class="flex gap-2 text-sm font-bold items-center px-2">
                <span class="text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded flex items-center gap-1">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                    {correctCount}
                </span>
                <span class="text-rose-400 bg-rose-400/10 px-2 py-0.5 rounded flex items-center gap-1">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    {wrongCount}
                </span>
                <span class="text-neutral-500 mx-1">/</span>
                <span class="text-white bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded relative overflow-hidden group">
                    {#if !isLoading && flashcards.length > 0}
                        {currentCardIndex + 1} de {flashcards.length}
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
            <p class="mt-4 font-bold text-indigo-400 tracking-widest uppercase text-sm animate-pulse">Preparando Sessão...</p>
        
        {:else if isFinished}
            <div class="bg-neutral-800/60 backdrop-blur-md p-10 rounded-3xl w-full text-center border border-neutral-700 shadow-2xl relative overflow-hidden">
                <div class="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent pointer-events-none"></div>
                <div class="text-7xl mb-6 transform hover:scale-110 transition-transform cursor-default">🎯</div>
                <h1 class="text-3xl font-extrabold text-white tracking-tight mb-2">Treino Concluído!</h1>
                <p class="text-neutral-400 mb-8 max-w-sm mx-auto">Você esgotou todas as questões deste filtro. Retorne para a tela principal para revisar as estatísticas no Dashboard ou tentar uma nova combinação de filtros.</p>
                
                <div class="flex flex-col md:flex-row gap-4 justify-center">
                    <button on:click={finishSession} class="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/25 transition-all text-sm uppercase tracking-wider hover:-translate-y-1">
                        Encerrar Sessão
                    </button>
                    <button on:click={async () => { isFinished = false; isLoading = true; correctCount = 0; wrongCount = 0; currentCardIndex = 0; await loadSessionData(); }} class="px-8 py-3.5 bg-neutral-700 hover:bg-neutral-600 text-white font-bold rounded-xl shadow border border-neutral-600 transition-all text-sm uppercase tracking-wider hover:-translate-y-1">
                        Refazer Conjunto
                    </button>
                </div>
            </div>

        {:else}
            <!-- Flashcard Frame -->
            <div class="w-full relative perspective-1000">
                
                <div class="bg-white dark:bg-[#1a1a1a] min-h-[400px] w-full rounded-3xl p-8 md:p-12 shadow-2xl flex flex-col justify-center border border-neutral-200 dark:border-neutral-800 transition-all duration-500 transform-style-3d {isFlipped ? 'rotate-x-2' : ''}">
                    
                    <!-- Front -->
                    <div class="prose prose-lg dark:prose-invert max-w-none w-full text-center prose-p:leading-relaxed prose-code:bg-neutral-100 dark:prose-code:bg-neutral-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-indigo-600 dark:prose-code:text-indigo-400">
                        {@html snarkdown(flashcards[currentCardIndex].front)}
                    </div>
                    
                    <!-- HR Divider smoothly appearing -->
                    <div class="w-full h-px bg-neutral-200 dark:bg-neutral-800 my-8 transition-opacity duration-500 {isFlipped ? 'opacity-100' : 'opacity-0'}"></div>
                    
                    <!-- Back (Hidden initially) -->
                    <div class="prose prose-lg dark:prose-invert max-w-none w-full text-center transition-all duration-500 ease-out {isFlipped ? 'opacity-100 translate-y-0 filter-none' : 'opacity-0 translate-y-4 blur-sm pointer-events-none absolute bottom-12 left-0 right-0'}">
                        {@html snarkdown(flashcards[currentCardIndex].back)}
                    </div>
                    
                </div>
            </div>

            <!-- Action Controls -->
            <div class="mt-8 md:mt-12 w-full max-w-md">
                {#if !isFlipped}
                    <button on:click={flipCard} class="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl shadow-xl shadow-indigo-500/20 hover:shadow-indigo-500/40 transition-all active:scale-95 text-lg flex items-center justify-center gap-2 group border border-indigo-400/30">
                        Mostrar Resposta
                        <svg class="w-5 h-5 group-hover:translate-y-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    </button>
                    <p class="text-center text-neutral-500 text-xs mt-4 font-bold flex items-center justify-center gap-1.5 opacity-80"><kbd class="bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded border border-neutral-700">Espaço</kbd> Revelar</p>
                {:else}
                    <div class="grid grid-cols-2 gap-4 animate-fade-in-up">
                        <button on:click={() => recordAnswer(false)} class="py-4 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 font-extrabold rounded-2xl transition-all active:scale-95 text-lg shadow-lg hover:shadow-rose-500/20">
                            Errei
                        </button>
                        <button on:click={() => recordAnswer(true)} class="py-4 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 font-extrabold rounded-2xl transition-all active:scale-95 text-lg shadow-lg hover:shadow-emerald-500/20">
                            Acertei
                        </button>
                    </div>
                    <div class="flex justify-between items-center text-center text-neutral-500 text-xs mt-4 font-bold opacity-80 px-2">
                        <span class="flex items-center gap-1.5"><kbd class="bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded border border-neutral-700">1</kbd> Errei</span>
                        <span class="flex items-center gap-1.5">Acertei <kbd class="bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded border border-neutral-700">2</kbd></span>
                    </div>
                {/if}
            </div>
        {/if}

    </main>
</div>

<svelte:window on:keydown={(e) => {
    if (isLoading || isFinished) return;
    
    if (e.code === 'Space') {
        e.preventDefault();
        if (!isFlipped) flipCard();
    } else if (e.code === 'Digit1' && isFlipped) {
        recordAnswer(false);
    } else if (e.code === 'Digit2' && isFlipped) {
        recordAnswer(true);
    }
}}/>

<style>
    .perspective-1000 { perspective: 1000px; }
    .transform-style-3d { transform-style: preserve-3d; }
    .rotate-x-2 { transform: rotateX(2deg); }
    
    .animate-fade-in-up {
        animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    
    @keyframes fadeInUp {
        0% { opacity: 0; transform: translateY(15px); }
        100% { opacity: 1; transform: translateY(0); }
    }
</style>
