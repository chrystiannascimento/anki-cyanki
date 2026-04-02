<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { getDueCards, processReview, Rating } from '$lib/fsrs';
    import { addXP, addCoins, checkStreak } from '$lib/stores/gamification';
    import { saveSession, clearSession } from '$lib/stores/sessionContext';
    import type { Flashcard } from '$lib/db';
    import { Confetti } from 'svelte-confetti';

    let dueCards: Flashcard[] = [];
    let currentIndex = 0;
    let showingAnswer = false;
    let showConfetti = false;

    onMount(async () => {
        dueCards = await getDueCards(10);
        // UC-11: Save global study session context
        saveSession({
            type: 'global',
            name: 'Estudo Global',
            cardIndex: 0,
            totalCards: dueCards.length,
            savedAt: Date.now()
        });
    });

    $: currentCard = dueCards[currentIndex];

    function flipCard() {
        showingAnswer = true;
    }

    async function rateCard(rating: Rating) {
        if (!currentCard) return;

        await processReview(currentCard.id, rating);

        addXP(10);
        addCoins(1); // UC-10: 1 coin per FSRS review for mini-game economy
        checkStreak();

        // UC-11: Update persisted card index for resume widget
        saveSession({
            type: 'global',
            name: 'Estudo Global',
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
</script>

<div class="min-h-screen bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-white flex flex-col items-center justify-center p-6 relative overflow-hidden transition-colors">
    {#if showConfetti}
        <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
            <Confetti x={[-2, 2]} y={[0.5, 2.5]} amount={50} delay={[0, 100]} rounded />
        </div>
    {/if}

    <div class="h-10 w-full mb-4"></div>

    {#if !currentCard && dueCards.length === 0}
        <div class="text-center animate-pulse text-neutral-500 dark:text-neutral-400">Loading due cards...</div>
    {:else if currentIndex >= dueCards.length}
        <div class="text-center space-y-6 z-10">
            <div class="text-6xl mb-4">🎉</div>
            <h1 class="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-purple-600 dark:from-indigo-400 dark:to-purple-500">
                You're all caught up!
            </h1>
            <p class="text-neutral-600 dark:text-neutral-400">Great job. Your reviews are done for now.</p>
            <a href="/" class="inline-block mt-8 px-8 py-3 bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-white hover:bg-neutral-300 dark:hover:bg-neutral-700 rounded-full font-bold transition">Back to Dashboard</a>
        </div>
    {:else}
        <div class="w-full max-w-2xl z-10">
            <!-- Progress Bar -->
            <div class="w-full h-2 bg-neutral-200 dark:bg-neutral-800 rounded-full mb-8 overflow-hidden">
                <div 
                    class="h-full bg-indigo-500 transition-all duration-300" 
                    style="width: {(currentIndex / dueCards.length) * 100}%"
                ></div>
            </div>

            <!-- Card -->
            <div class="bg-white dark:bg-neutral-800 rounded-3xl p-10 min-h-[300px] shadow-2xl flex flex-col ring-1 ring-neutral-200 dark:ring-neutral-700 transition transform hover:scale-[1.01]">
                <!-- Front -->
                <div class="flex-1 text-center text-2xl font-medium leading-relaxed mb-8 text-neutral-900 dark:text-neutral-100 flex items-center justify-center">
                    {currentCard.front}
                </div>

                <!-- Horizontal Divider -->
                {#if showingAnswer}
                    <div class="w-full h-px bg-neutral-200 dark:bg-neutral-700 my-6"></div>
                    
                    <!-- Back -->
                    <div class="flex-1 text-center text-lg text-neutral-600 dark:text-neutral-400 leading-relaxed mb-8 flex items-center justify-center whitespace-pre-wrap">
                        {currentCard.back}
                    </div>
                {/if}

                <!-- Actions -->
                <div class="mt-auto">
                    {#if !showingAnswer}
                        <button 
                            on:click={flipCard} 
                            class="w-full py-4 text-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition"
                        >
                            Show Answer
                        </button>
                    {:else}
                        <div class="grid grid-cols-4 gap-4">
                            <button on:click={() => rateCard(Rating.Again)} class="py-4 font-bold bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-500/10 dark:text-red-500 dark:hover:bg-red-500/20 rounded-xl transition">Again</button>
                            <button on:click={() => rateCard(Rating.Hard)} class="py-4 font-bold bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-500/10 dark:text-orange-500 dark:hover:bg-orange-500/20 rounded-xl transition">Hard</button>
                            <button on:click={() => rateCard(Rating.Good)} class="py-4 font-bold bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-500/10 dark:text-green-500 dark:hover:bg-green-500/20 rounded-xl transition">Good</button>
                            <button on:click={() => rateCard(Rating.Easy)} class="py-4 font-bold bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-500/10 dark:text-blue-500 dark:hover:bg-blue-500/20 rounded-xl transition">Easy</button>
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    {/if}
</div>
