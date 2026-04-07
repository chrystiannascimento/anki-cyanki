<script lang="ts">
    /**
     * UC-10 — Desafio Cronometrado
     * Answer as many flashcards as possible in 60 seconds.
     * Costs 30 coins to play; grants 1 coin per correct answer as refund.
     */
    import { onMount, onDestroy } from 'svelte';
    import { goto } from '$app/navigation';
    import { db, type Flashcard } from '$lib/db';
    import { gamificationStore, spendCoins, addCoins } from '$lib/stores/gamification';

    const COST = 30;
    const DURATION_SECS = 60;

    // --- State machine ---
    type Phase = 'checking' | 'locked' | 'ready' | 'playing' | 'finished';
    let phase: Phase = 'checking';

    let cards: Flashcard[] = [];
    let queue: Flashcard[] = [];
    let currentIndex = 0;
    let showAnswer = false;

    let correct = 0;
    let wrong = 0;
    let timeLeft = DURATION_SECS;
    let timerInterval: ReturnType<typeof setInterval> | null = null;

    // --- Lifecycle ---
    onMount(async () => {
        const balance = $gamificationStore.coins;
        if (balance < COST) {
            phase = 'locked';
            return;
        }

        cards = await db.flashcards.toArray();
        if (cards.length === 0) {
            phase = 'locked'; // reuse locked screen with custom message
            return;
        }

        phase = 'ready';
    });

    onDestroy(() => {
        if (timerInterval) clearInterval(timerInterval);
    });

    // --- Helpers ---
    function shuffle<T>(arr: T[]): T[] {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function startGame() {
        const spent = spendCoins(COST);
        if (!spent) { phase = 'locked'; return; }

        queue = shuffle(cards);
        currentIndex = 0;
        correct = 0;
        wrong = 0;
        timeLeft = DURATION_SECS;
        showAnswer = false;
        phase = 'playing';

        timerInterval = setInterval(() => {
            timeLeft -= 1;
            if (timeLeft <= 0) endGame();
        }, 1000);
    }

    function answer(isCorrect: boolean) {
        if (phase !== 'playing') return;
        if (isCorrect) {
            correct++;
            addCoins(1); // 1 coin refund per correct answer
        } else {
            wrong++;
        }
        showAnswer = false;
        currentIndex++;

        // Wrap queue if exhausted (infinite loop until time runs out)
        if (currentIndex >= queue.length) {
            queue = shuffle(cards);
            currentIndex = 0;
        }
    }

    function endGame() {
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        phase = 'finished';
    }

    $: currentCard = queue[currentIndex] ?? null;
    $: total = correct + wrong;
    $: accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    $: timerPct = (timeLeft / DURATION_SECS) * 100;
    $: timerColor = timeLeft > 20 ? 'bg-emerald-500' : timeLeft > 10 ? 'bg-amber-500' : 'bg-rose-500';
    $: coinsRefunded = correct; // 1 per correct
</script>

<!-- ================================================================ -->

{#if phase === 'checking'}
    <div class="flex items-center justify-center min-h-[60vh] text-neutral-400">
        <svg class="animate-spin h-7 w-7 mr-3" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        Carregando...
    </div>

{:else if phase === 'locked'}
    <div class="max-w-md mx-auto mt-16 text-center space-y-5">
        <div class="text-6xl">🔒</div>
        <h2 class="text-xl font-extrabold text-neutral-800 dark:text-neutral-100">
            {$gamificationStore.coins < COST ? 'Moedas insuficientes' : 'Sem flashcards disponíveis'}
        </h2>
        {#if $gamificationStore.coins < COST}
            <p class="text-sm text-neutral-500">
                Você tem <strong>{$gamificationStore.coins}</strong> moeda{$gamificationStore.coins !== 1 ? 's' : ''}.
                Faltam <strong>{COST - $gamificationStore.coins}</strong> para jogar.
            </p>
            <a href="/study" class="inline-block px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition text-sm">
                Ganhar moedas estudando
            </a>
        {:else}
            <p class="text-sm text-neutral-500">Crie flashcards primeiro para jogar este desafio.</p>
            <a href="/dashboard" class="inline-block px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition text-sm">
                Criar flashcards
            </a>
        {/if}
        <div><a href="/games" class="text-sm text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 underline">Voltar aos jogos</a></div>
    </div>

{:else if phase === 'ready'}
    <div class="max-w-lg mx-auto mt-12 text-center space-y-6">
        <div class="text-6xl">⏱️</div>
        <h1 class="text-2xl font-extrabold text-neutral-800 dark:text-neutral-100">Desafio Cronometrado</h1>
        <p class="text-neutral-500 text-sm max-w-sm mx-auto">
            Você tem <strong>60 segundos</strong> para responder o máximo de flashcards possível.
            Cada resposta correta devolve <strong>1 moeda</strong>.
        </p>
        <div class="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 rounded-xl p-4 text-sm text-rose-800 dark:text-rose-300 font-medium">
            🪙 Custo: <strong>{COST} moedas</strong> · Seu saldo: <strong>{$gamificationStore.coins} moedas</strong>
        </div>
        <div class="flex gap-3 justify-center">
            <button on:click={startGame}
                class="px-8 py-3.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-lg shadow-rose-500/30 transition active:scale-95">
                Iniciar Desafio
            </button>
            <a href="/games"
                class="px-6 py-3.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 font-bold rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-700 transition text-sm">
                Voltar
            </a>
        </div>
    </div>

{:else if phase === 'playing' && currentCard}
    <div class="max-w-xl mx-auto space-y-6">

        <!-- HUD -->
        <div class="flex items-center justify-between gap-4">
            <!-- Timer bar -->
            <div class="flex-1 flex flex-col gap-1">
                <div class="flex justify-between text-xs font-bold">
                    <span class="text-neutral-500">Tempo</span>
                    <span class="{timeLeft <= 10 ? 'text-rose-600 dark:text-rose-400 animate-pulse' : 'text-neutral-700 dark:text-neutral-300'} font-mono">
                        {timeLeft}s
                    </span>
                </div>
                <div class="w-full bg-neutral-100 dark:bg-neutral-700 rounded-full h-2.5 overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-1000 {timerColor}" style="width: {timerPct}%"></div>
                </div>
            </div>

            <!-- Score pills -->
            <div class="flex items-center gap-2 shrink-0">
                <span class="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-sm font-black rounded-full">✓ {correct}</span>
                <span class="px-3 py-1 bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 text-sm font-black rounded-full">✗ {wrong}</span>
            </div>
        </div>

        <!-- Card -->
        <div class="bg-white dark:bg-neutral-800 rounded-3xl p-8 shadow-xl ring-1 ring-neutral-200 dark:ring-neutral-700 min-h-[200px] flex flex-col justify-center text-center gap-6">
            <p class="text-lg font-semibold text-neutral-800 dark:text-neutral-100 leading-relaxed">
                {currentCard.front}
            </p>

            {#if showAnswer}
                <div class="border-t border-neutral-100 dark:border-neutral-700 pt-5">
                    <p class="text-neutral-600 dark:text-neutral-300 leading-relaxed">{currentCard.back}</p>
                </div>
            {/if}
        </div>

        <!-- Actions -->
        {#if !showAnswer}
            <button on:click={() => showAnswer = true}
                class="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl shadow-lg transition active:scale-95 text-lg">
                Ver Resposta
            </button>
        {:else}
            <div class="grid grid-cols-2 gap-4">
                <button on:click={() => answer(false)}
                    class="py-4 font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 border border-rose-300 dark:border-rose-700 rounded-2xl transition active:scale-95 text-lg">
                    ✗ Errei
                </button>
                <button on:click={() => answer(true)}
                    class="py-4 font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-700 rounded-2xl transition active:scale-95 text-lg">
                    ✓ Acertei
                </button>
            </div>
        {/if}
    </div>

{:else if phase === 'finished'}
    <div class="max-w-lg mx-auto mt-8 text-center space-y-6">
        <div class="text-6xl">{accuracy >= 70 ? '🏆' : accuracy >= 40 ? '👍' : '💪'}</div>
        <h1 class="text-2xl font-extrabold text-neutral-800 dark:text-neutral-100">Desafio Concluído!</h1>

        <!-- Result grid -->
        <div class="grid grid-cols-3 gap-4">
            <div class="bg-white dark:bg-neutral-800 rounded-2xl p-4 shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700">
                <div class="text-3xl font-black text-emerald-600 dark:text-emerald-400">{correct}</div>
                <div class="text-xs text-neutral-500 font-bold uppercase mt-1">Acertos</div>
            </div>
            <div class="bg-white dark:bg-neutral-800 rounded-2xl p-4 shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700">
                <div class="text-3xl font-black text-rose-600 dark:text-rose-400">{wrong}</div>
                <div class="text-xs text-neutral-500 font-bold uppercase mt-1">Erros</div>
            </div>
            <div class="bg-white dark:bg-neutral-800 rounded-2xl p-4 shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700">
                <div class="text-3xl font-black text-indigo-600 dark:text-indigo-400">{accuracy}%</div>
                <div class="text-xs text-neutral-500 font-bold uppercase mt-1">Precisão</div>
            </div>
        </div>

        <!-- Coins earned -->
        <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl px-5 py-4 flex items-center justify-center gap-3">
            <span class="text-2xl">🪙</span>
            <div class="text-left">
                <div class="font-black text-amber-700 dark:text-amber-400 text-lg">+{coinsRefunded} moedas recuperadas</div>
                <div class="text-xs text-amber-600/70 dark:text-amber-500">1 moeda por acerto · Saldo: {$gamificationStore.coins}</div>
            </div>
        </div>

        <div class="flex gap-3 justify-center pt-2">
            <button on:click={() => { phase = 'ready'; }}
                class="px-6 py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl transition shadow text-sm
                       {$gamificationStore.coins >= COST ? '' : 'opacity-50 cursor-not-allowed'}"
                disabled={$gamificationStore.coins < COST}>
                Jogar Novamente {$gamificationStore.coins < COST ? `(${COST - $gamificationStore.coins}🪙 faltam)` : ''}
            </button>
            <a href="/games"
                class="px-6 py-3 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 font-bold rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-700 transition text-sm">
                Lobby
            </a>
        </div>
    </div>
{/if}

<svelte:window on:keydown={(e) => {
    if (phase !== 'playing') return;
    if (e.code === 'Space') { e.preventDefault(); if (!showAnswer) showAnswer = true; }
    else if (showAnswer) {
        if (e.code === 'ArrowLeft' || e.code === 'KeyF') answer(false);
        else if (e.code === 'ArrowRight' || e.code === 'KeyJ') answer(true);
    }
}}/>
