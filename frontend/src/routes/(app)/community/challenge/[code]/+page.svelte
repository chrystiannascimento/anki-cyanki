<script lang="ts">
    import { page } from '$app/stores';
    import { onMount } from 'svelte';
    import { db, type Challenge, type Flashcard } from '$lib/db';
    import { goto } from '$app/navigation';
    import snarkdown from 'snarkdown';

    const code = $page.params.code.toUpperCase();

    // ─── State machine ────────────────────────────────────────────────────────
    type State = 'loading' | 'not_found' | 'ready' | 'playing' | 'finished';
    let state: State = 'loading';

    let challenge: Challenge | null = null;
    let cards: Flashcard[] = [];

    // ─── Session state ────────────────────────────────────────────────────────
    let currentIndex = 0;
    let showingAnswer = false;
    let correct = 0;
    let wrong = 0;
    let answers: ('correct' | 'wrong')[] = [];

    $: currentCard = cards[currentIndex];
    $: progress = cards.length > 0 ? (currentIndex / cards.length) * 100 : 0;
    $: accuracy = (correct + wrong) > 0 ? Math.round((correct / (correct + wrong)) * 100) : 0;

    onMount(async () => {
        const ch = await db.challenges.where('code').equals(code).first();
        if (!ch) {
            state = 'not_found';
            return;
        }
        challenge = ch;

        // Load the immutable card snapshot
        const loaded = await db.flashcards.where('id').anyOf(ch.cardIds).toArray();
        // Preserve original creation order (cardIds order)
        const idOrder = new Map(ch.cardIds.map((id, i) => [id, i]));
        cards = loaded.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));

        state = 'ready';
    });

    function startChallenge() {
        state = 'playing';
    }

    function flipCard() {
        showingAnswer = true;
    }

    async function answer(result: 'correct' | 'wrong') {
        answers.push(result);
        if (result === 'correct') correct++;
        else wrong++;

        showingAnswer = false;
        currentIndex++;

        if (currentIndex >= cards.length) {
            // Increment attempt counter
            if (challenge) {
                await db.challenges.update(challenge.id, { attempts: challenge.attempts + 1 });
            }
            state = 'finished';
        }
    }

    function restart() {
        currentIndex = 0;
        correct = 0;
        wrong = 0;
        answers = [];
        showingAnswer = false;
        state = 'playing';
    }

    function getGradeLabel(pct: number) {
        if (pct >= 90) return { label: 'Excelente!', color: 'text-emerald-500' };
        if (pct >= 70) return { label: 'Muito Bom!', color: 'text-blue-500' };
        if (pct >= 50) return { label: 'Razoável', color: 'text-amber-500' };
        return { label: 'Precisa melhorar', color: 'text-rose-500' };
    }
</script>

<div class="min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-4">

    <!-- ── LOADING ─────────────────────────────────────────────────────────── -->
    {#if state === 'loading'}
        <div class="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>

    <!-- ── NOT FOUND ──────────────────────────────────────────────────────── -->
    {:else if state === 'not_found'}
        <div class="bg-neutral-800/60 backdrop-blur-md p-10 rounded-3xl w-full max-w-md text-center border border-neutral-700">
            <div class="text-5xl mb-4">🔍</div>
            <h1 class="text-2xl font-extrabold text-white mb-2">Desafio não encontrado</h1>
            <p class="text-neutral-400 mb-6">
                O código <span class="font-mono font-black text-indigo-400 tracking-widest">{code}</span> não existe localmente.
                Peça ao criador para compartilhar o link diretamente.
            </p>
            <a href="/community" class="px-6 py-3 bg-neutral-700 hover:bg-neutral-600 text-white font-bold rounded-xl text-sm transition">
                Voltar para Comunidade
            </a>
        </div>

    <!-- ── READY ──────────────────────────────────────────────────────────── -->
    {:else if state === 'ready' && challenge}
        <!-- Top bar -->
        <div class="fixed top-0 left-0 right-0 p-4 flex justify-start z-10">
            <a href="/community" class="flex items-center gap-2 text-neutral-400 hover:text-white transition border border-neutral-700 bg-neutral-800/50 px-4 py-2 rounded-xl backdrop-blur text-sm">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                Voltar
            </a>
        </div>

        <div class="bg-neutral-800/60 backdrop-blur-md rounded-3xl w-full max-w-lg border border-neutral-700 shadow-2xl overflow-hidden">
            <!-- Banner gradient -->
            <div class="h-2 bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-500"></div>
            <div class="p-8 text-center space-y-5">
                <div class="text-5xl">🏆</div>
                <div>
                    <h1 class="text-2xl font-extrabold text-white">{challenge.title}</h1>
                    {#if challenge.description}
                        <p class="text-neutral-400 mt-2 text-sm">{challenge.description}</p>
                    {/if}
                </div>

                <div class="grid grid-cols-2 gap-3 text-sm">
                    <div class="p-3 bg-neutral-900/60 rounded-xl">
                        <div class="font-black text-xl text-indigo-400">{cards.length}</div>
                        <div class="text-neutral-400 text-xs font-bold uppercase tracking-wider mt-0.5">Questões</div>
                    </div>
                    <div class="p-3 bg-neutral-900/60 rounded-xl">
                        <div class="font-black text-xl text-indigo-400">{challenge.attempts}</div>
                        <div class="text-neutral-400 text-xs font-bold uppercase tracking-wider mt-0.5">Tentativas</div>
                    </div>
                </div>

                <!-- Criteria pills -->
                {#if challenge.criteria.tags.length > 0 || challenge.criteria.keyword}
                    <div class="flex flex-wrap gap-2 justify-center">
                        {#each challenge.criteria.tags as tag}
                            <span class="px-2.5 py-1 bg-indigo-900/50 text-indigo-300 text-xs font-semibold rounded-full border border-indigo-700/50">🏷 {tag}</span>
                        {/each}
                        {#if challenge.criteria.keyword}
                            <span class="px-2.5 py-1 bg-violet-900/50 text-violet-300 text-xs font-semibold rounded-full border border-violet-700/50">🔍 {challenge.criteria.keyword}</span>
                        {/if}
                    </div>
                {/if}

                <!-- Code -->
                <div class="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900/60 rounded-xl border border-neutral-700">
                    <span class="text-xs text-neutral-400">Código:</span>
                    <span class="font-mono font-black text-indigo-400 tracking-widest">{challenge.code}</span>
                </div>

                <button on:click={startChallenge} class="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl shadow-xl shadow-indigo-500/20 transition-all active:scale-95 text-lg">
                    Iniciar Desafio →
                </button>
            </div>
        </div>

    <!-- ── PLAYING ────────────────────────────────────────────────────────── -->
    {:else if state === 'playing' && currentCard}
        <!-- Header -->
        <div class="fixed top-0 left-0 right-0 p-4 md:p-6 flex justify-between items-center z-10 bg-gradient-to-b from-neutral-900 to-transparent">
            <button on:click={() => goto('/community')} class="flex items-center gap-2 text-neutral-400 hover:text-white transition border border-neutral-700 bg-neutral-800/50 px-4 py-2 rounded-xl backdrop-blur text-sm">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                Sair
            </button>
            <div class="flex items-center gap-3 bg-neutral-800/70 border border-neutral-700 backdrop-blur rounded-2xl px-4 py-2">
                <span class="text-emerald-400 font-black text-sm">{correct} ✓</span>
                <span class="text-neutral-600">|</span>
                <span class="text-rose-400 font-black text-sm">{wrong} ✗</span>
                <span class="text-neutral-600">|</span>
                <span class="text-neutral-300 font-bold text-sm">{currentIndex + 1}/{cards.length}</span>
            </div>
        </div>

        <main class="w-full max-w-2xl flex flex-col items-center justify-center mt-16">
            <!-- Progress bar -->
            <div class="w-full h-1.5 bg-neutral-800 rounded-full mb-6 overflow-hidden">
                <div class="h-full bg-indigo-500 transition-all duration-300" style="width: {progress}%"></div>
            </div>

            <!-- Card -->
            <div class="w-full bg-white dark:bg-[#1a1a1a] min-h-[380px] rounded-3xl p-8 md:p-12 shadow-2xl flex flex-col justify-center border border-neutral-800">
                <div class="prose prose-lg dark:prose-invert max-w-none text-center">
                    {@html snarkdown(currentCard.front)}
                </div>
                {#if showingAnswer}
                    <div class="w-full h-px bg-neutral-800 my-8"></div>
                    <div class="prose prose-lg dark:prose-invert max-w-none text-center animate-fade-in">
                        {@html snarkdown(currentCard.back)}
                    </div>
                {/if}
            </div>

            <!-- Actions -->
            <div class="mt-8 w-full max-w-lg">
                {#if !showingAnswer}
                    <button on:click={flipCard} class="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl shadow-xl shadow-indigo-500/20 transition-all active:scale-95 text-lg">
                        Mostrar Resposta
                    </button>
                    <p class="text-center text-neutral-500 text-xs mt-3 font-bold">
                        <kbd class="bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded border border-neutral-700">Espaço</kbd> Revelar
                    </p>
                {:else}
                    <div class="grid grid-cols-2 gap-4 animate-fade-in">
                        <button on:click={() => answer('wrong')} class="py-4 font-bold bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl transition active:scale-95 text-sm">
                            ✗ Errei
                        </button>
                        <button on:click={() => answer('correct')} class="py-4 font-bold bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl transition active:scale-95 text-sm">
                            ✓ Acertei
                        </button>
                    </div>
                    <p class="text-center text-neutral-500 text-xs mt-3 font-bold">
                        <kbd class="bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded border border-neutral-700">←</kbd> Errei &nbsp;
                        <kbd class="bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded border border-neutral-700">→</kbd> Acertei
                    </p>
                {/if}
            </div>
        </main>

    <!-- ── FINISHED ───────────────────────────────────────────────────────── -->
    {:else if state === 'finished'}
        {@const grade = getGradeLabel(accuracy)}
        <div class="bg-neutral-800/60 backdrop-blur-md p-10 rounded-3xl w-full max-w-md border border-neutral-700 shadow-2xl text-center space-y-6 relative overflow-hidden">
            <div class="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent pointer-events-none"></div>
            <div class="text-6xl">
                {#if accuracy >= 90}🏆{:else if accuracy >= 70}🎯{:else if accuracy >= 50}💪{:else}📚{/if}
            </div>

            <div>
                <h1 class="text-2xl font-extrabold text-white">Desafio Concluído!</h1>
                {#if challenge}<p class="text-neutral-400 text-sm mt-1">{challenge.title}</p>{/if}
            </div>

            <!-- Score ring area -->
            <div class="flex justify-center">
                <div class="relative w-28 h-28">
                    <svg class="w-28 h-28 -rotate-90" viewBox="0 0 112 112">
                        <circle cx="56" cy="56" r="44" fill="none" stroke="#262626" stroke-width="10"/>
                        <circle cx="56" cy="56" r="44" fill="none" stroke={accuracy >= 70 ? '#10b981' : accuracy >= 50 ? '#f59e0b' : '#f43f5e'} stroke-width="10"
                            stroke-dasharray={2 * Math.PI * 44}
                            stroke-dashoffset={2 * Math.PI * 44 * (1 - accuracy / 100)}
                            stroke-linecap="round"
                            class="transition-all duration-700"
                        />
                    </svg>
                    <div class="absolute inset-0 flex flex-col items-center justify-center">
                        <span class="text-2xl font-black text-white">{accuracy}%</span>
                        <span class="text-xs text-neutral-400 font-bold">acerto</span>
                    </div>
                </div>
            </div>

            <p class="text-lg font-black {grade.color}">{grade.label}</p>

            <!-- Stat grid -->
            <div class="grid grid-cols-3 gap-3">
                <div class="p-3 bg-neutral-900/60 rounded-xl">
                    <div class="text-xl font-black text-emerald-400">{correct}</div>
                    <div class="text-xs text-neutral-400 font-bold uppercase tracking-wider">Acertos</div>
                </div>
                <div class="p-3 bg-neutral-900/60 rounded-xl">
                    <div class="text-xl font-black text-rose-400">{wrong}</div>
                    <div class="text-xs text-neutral-400 font-bold uppercase tracking-wider">Erros</div>
                </div>
                <div class="p-3 bg-neutral-900/60 rounded-xl">
                    <div class="text-xl font-black text-indigo-400">{cards.length}</div>
                    <div class="text-xs text-neutral-400 font-bold uppercase tracking-wider">Total</div>
                </div>
            </div>

            <div class="flex flex-col sm:flex-row gap-3">
                <button on:click={restart} class="flex-1 py-3 bg-neutral-700 hover:bg-neutral-600 text-white font-bold rounded-xl text-sm transition">
                    🔄 Tentar novamente
                </button>
                <a href="/community" class="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition text-center">
                    Ver Desafios
                </a>
            </div>
        </div>
    {/if}

</div>

<svelte:window on:keydown={(e) => {
    if (state !== 'playing') return;
    if (e.code === 'Space') { e.preventDefault(); if (!showingAnswer) flipCard(); }
    else if (showingAnswer) {
        if (e.code === 'ArrowLeft' || e.code === 'KeyF') answer('wrong');
        else if (e.code === 'ArrowRight' || e.code === 'KeyJ') answer('correct');
    }
}} />

<style>
    .animate-fade-in {
        animation: fadeIn 0.25s ease forwards;
    }
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
    }
</style>
