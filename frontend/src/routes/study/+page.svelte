<script lang="ts">
    import { onMount } from 'svelte';
    import { getDueCards, processReview, Rating } from '$lib/fsrs';
    import type { Flashcard } from '$lib/db';
    
    let dueCards: Flashcard[] = [];
    let currentIndex = 0;
    let showingAnswer = false;
    let streak = 0; // Gamification UI 
    
    onMount(async () => {
        dueCards = await getDueCards(10);
    });

    $: currentCard = dueCards[currentIndex];

    function flipCard() {
        showingAnswer = true;
    }

    async function rateCard(rating: Rating) {
        if (!currentCard) return;

        await processReview(currentCard.id, rating);
        
        streak += 1; // Play confetti or juice here per UC-11 / UC-10!
        showingAnswer = false;
        currentIndex += 1;
    }
</script>

<div class="min-h-screen bg-neutral-900 text-white flex flex-col items-center justify-center p-6">
    <header class="absolute top-0 left-0 w-full p-6 flex justify-between items-center text-neutral-400">
        <a href="/" class="hover:text-white transition">← Home</a>
        <div class="flex items-center gap-2">
            <span class="text-orange-500 text-xl">🔥</span>
            <span class="font-bold text-lg text-white">{streak} Streak</span>
        </div>
    </header>

    {#if !currentCard && dueCards.length === 0}
        <div class="text-center animate-pulse">Loading due cards...</div>
    {:else if currentIndex >= dueCards.length}
        <div class="text-center space-y-6">
            <div class="text-6xl mb-4">🎉</div>
            <h1 class="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500">
                You're all caught up!
            </h1>
            <p class="text-neutral-400">Great job. Your reviews are done for now.</p>
            <a href="/" class="inline-block mt-8 px-8 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-full font-bold transition">Play Mini-Game</a>
        </div>
    {:else}
        <div class="w-full max-w-2xl">
            <!-- Progress Bar -->
            <div class="w-full h-2 bg-neutral-800 rounded-full mb-8 overflow-hidden">
                <div 
                    class="h-full bg-indigo-500 transition-all duration-300" 
                    style="width: {(currentIndex / dueCards.length) * 100}%"
                ></div>
            </div>

            <!-- Card -->
            <div class="bg-neutral-800 rounded-3xl p-10 min-h-[300px] shadow-2xl flex flex-col ring-1 ring-neutral-700 transition transform hover:scale-[1.01]">
                <!-- Front -->
                <div class="flex-1 text-center text-2xl font-medium leading-relaxed mb-8 text-neutral-100 flex items-center justify-center">
                    {currentCard.front}
                </div>

                <!-- Horizontal Divider -->
                {#if showingAnswer}
                    <div class="w-full h-px bg-neutral-700 my-6"></div>
                    
                    <!-- Back -->
                    <div class="flex-1 text-center text-lg text-neutral-400 leading-relaxed mb-8 flex items-center justify-center">
                        {currentCard.back}
                    </div>
                {/if}

                <!-- Actions -->
                <div class="mt-auto">
                    {#if !showingAnswer}
                        <button 
                            on:click={flipCard} 
                            class="w-full py-4 text-xl font-bold bg-indigo-600 hover:bg-indigo-500 rounded-xl transition"
                        >
                            Show Answer
                        </button>
                    {:else}
                        <div class="grid grid-cols-4 gap-4">
                            <button on:click={() => rateCard(Rating.Again)} class="py-4 font-bold bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-xl transition">Again</button>
                            <button on:click={() => rateCard(Rating.Hard)} class="py-4 font-bold bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 rounded-xl transition">Hard</button>
                            <button on:click={() => rateCard(Rating.Good)} class="py-4 font-bold bg-green-500/10 text-green-500 hover:bg-green-500/20 rounded-xl transition">Good</button>
                            <button on:click={() => rateCard(Rating.Easy)} class="py-4 font-bold bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 rounded-xl transition">Easy</button>
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    {/if}
</div>
