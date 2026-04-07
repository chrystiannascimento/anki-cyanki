<script lang="ts">
    /**
     * UC-10 — Jogo da Memória
     * Match flashcard fronts to their corresponding backs.
     * 4 pairs (8 tiles) arranged in a 4×2 grid.
     * Costs 50 coins to play; completing the board refunds 20 coins.
     */
    import { onMount } from 'svelte';
    import { db, type Flashcard } from '$lib/db';
    import { gamificationStore, spendCoins, addCoins } from '$lib/stores/gamification';

    const COST = 50;
    const PAIR_COUNT = 4;
    const REFUND = 20;

    type Phase = 'checking' | 'locked' | 'ready' | 'playing' | 'finished';
    let phase: Phase = 'checking';

    interface Tile {
        id: string;       // unique tile id
        cardId: string;   // flashcard id — links pair
        side: 'front' | 'back';
        text: string;
        flipped: boolean;
        matched: boolean;
    }

    let tiles: Tile[] = [];
    let flippedIds: string[] = [];   // up to 2 at a time
    let checking = false;            // lock during mismatch animation

    let moves = 0;
    let matchedPairs = 0;
    let startedAt = 0;
    let elapsed = 0;  // seconds

    let sourceCards: Flashcard[] = [];
    let errorMsg = '';

    // --- Lifecycle ---
    onMount(async () => {
        const balance = $gamificationStore.coins;
        if (balance < COST) { phase = 'locked'; return; }

        sourceCards = await db.flashcards.toArray();
        if (sourceCards.length < PAIR_COUNT) {
            errorMsg = `Você precisa de pelo menos ${PAIR_COUNT} flashcards para jogar.`;
            phase = 'locked';
            return;
        }
        phase = 'ready';
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

    function buildBoard() {
        const sample = shuffle(sourceCards).slice(0, PAIR_COUNT);
        const raw: Tile[] = [];
        sample.forEach(card => {
            raw.push({
                id: `${card.id}-front`,
                cardId: card.id,
                side: 'front',
                text: card.front.length > 120 ? card.front.slice(0, 120) + '…' : card.front,
                flipped: false,
                matched: false
            });
            raw.push({
                id: `${card.id}-back`,
                cardId: card.id,
                side: 'back',
                text: card.back.length > 120 ? card.back.slice(0, 120) + '…' : card.back,
                flipped: false,
                matched: false
            });
        });
        tiles = shuffle(raw);
    }

    function startGame() {
        const spent = spendCoins(COST);
        if (!spent) { phase = 'locked'; return; }

        buildBoard();
        flippedIds = [];
        moves = 0;
        matchedPairs = 0;
        checking = false;
        startedAt = Date.now();
        elapsed = 0;
        phase = 'playing';
    }

    async function flipTile(tile: Tile) {
        if (checking || tile.flipped || tile.matched || phase !== 'playing') return;

        // Flip
        tile.flipped = true;
        tiles = tiles;
        flippedIds = [...flippedIds, tile.id];

        if (flippedIds.length < 2) return;

        // Two tiles flipped — evaluate
        moves++;
        checking = true;

        const [idA, idB] = flippedIds;
        const tA = tiles.find(t => t.id === idA)!;
        const tB = tiles.find(t => t.id === idB)!;

        await delay(600);

        if (tA.cardId === tB.cardId && tA.side !== tB.side) {
            // Match!
            tA.matched = true;
            tB.matched = true;
            matchedPairs++;

            if (matchedPairs === PAIR_COUNT) {
                elapsed = Math.round((Date.now() - startedAt) / 1000);
                addCoins(REFUND);
                tiles = tiles;
                phase = 'finished';
            }
        } else {
            // No match — flip back
            await delay(500);
            tA.flipped = false;
            tB.flipped = false;
        }

        tiles = tiles;
        flippedIds = [];
        checking = false;
    }

    function delay(ms: number) {
        return new Promise(res => setTimeout(res, ms));
    }

    function fmtTime(s: number): string {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
    }
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
            {errorMsg || 'Moedas insuficientes'}
        </h2>
        {#if !errorMsg}
            <p class="text-sm text-neutral-500">
                Você tem <strong>{$gamificationStore.coins}</strong> moedas.
                Faltam <strong>{COST - $gamificationStore.coins}</strong> para jogar.
            </p>
            <a href="/study" class="inline-block px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition text-sm">
                Ganhar moedas estudando
            </a>
        {:else}
            <p class="text-sm text-neutral-500">{errorMsg}</p>
            <a href="/dashboard" class="inline-block px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition text-sm">
                Criar flashcards
            </a>
        {/if}
        <div><a href="/games" class="text-sm text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 underline">Voltar aos jogos</a></div>
    </div>

{:else if phase === 'ready'}
    <div class="max-w-lg mx-auto mt-12 text-center space-y-6">
        <div class="text-6xl">🃏</div>
        <h1 class="text-2xl font-extrabold text-neutral-800 dark:text-neutral-100">Jogo da Memória</h1>
        <p class="text-neutral-500 text-sm max-w-sm mx-auto">
            Encontre os <strong>{PAIR_COUNT} pares</strong> de Pergunta + Resposta.
            Complete o tabuleiro para recuperar <strong>{REFUND} moedas</strong>.
        </p>
        <div class="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/50 rounded-xl p-4 text-sm text-violet-800 dark:text-violet-300 font-medium">
            🪙 Custo: <strong>{COST} moedas</strong> · Recompensa: <strong>+{REFUND} moedas</strong> ao concluir · Saldo: <strong>{$gamificationStore.coins}</strong>
        </div>
        <div class="flex gap-3 justify-center">
            <button on:click={startGame}
                class="px-8 py-3.5 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl shadow-lg shadow-violet-500/30 transition active:scale-95">
                Iniciar Jogo
            </button>
            <a href="/games"
                class="px-6 py-3.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 font-bold rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-700 transition text-sm">
                Voltar
            </a>
        </div>
    </div>

{:else if phase === 'playing'}
    <div class="max-w-2xl mx-auto space-y-5">

        <!-- HUD -->
        <div class="flex items-center justify-between text-sm font-bold">
            <span class="text-neutral-500">Jogadas: <span class="text-neutral-800 dark:text-neutral-200">{moves}</span></span>
            <span class="text-indigo-600 dark:text-indigo-400">{matchedPairs}/{PAIR_COUNT} pares</span>
            <div class="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                🪙 {$gamificationStore.coins}
            </div>
        </div>

        <!-- Progress -->
        <div class="w-full bg-neutral-100 dark:bg-neutral-700 rounded-full h-2 overflow-hidden">
            <div class="h-full bg-violet-500 rounded-full transition-all duration-500"
                style="width: {(matchedPairs / PAIR_COUNT) * 100}%"></div>
        </div>

        <!-- Board: 4×2 grid -->
        <div class="grid grid-cols-4 gap-3">
            {#each tiles as tile (tile.id)}
                <button
                    on:click={() => flipTile(tile)}
                    disabled={tile.matched || tile.flipped || checking}
                    class="aspect-square rounded-2xl text-xs font-semibold text-center p-2 leading-tight
                           transition-all duration-300 select-none overflow-hidden
                           {tile.matched
                               ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-400/50 cursor-default scale-95'
                               : tile.flipped
                                   ? 'bg-white dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100 shadow-lg ring-2 ring-violet-400 scale-105'
                                   : 'bg-violet-600 hover:bg-violet-500 text-violet-600 cursor-pointer hover:scale-105 shadow-md'}"
                >
                    {#if tile.flipped || tile.matched}
                        <span class="block w-full h-full flex items-center justify-center">{tile.text}</span>
                    {:else}
                        <!-- Card back face -->
                        <span class="block w-full h-full flex items-center justify-center text-white/40 text-2xl">🃏</span>
                    {/if}
                </button>
            {/each}
        </div>

        <div class="text-center">
            <button on:click={() => { phase = 'ready'; }}
                class="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 underline">
                Desistir e voltar
            </button>
        </div>
    </div>

{:else if phase === 'finished'}
    <div class="max-w-lg mx-auto mt-8 text-center space-y-6">
        <div class="text-6xl">🎉</div>
        <h1 class="text-2xl font-extrabold text-neutral-800 dark:text-neutral-100">Tabuleiro Completo!</h1>
        <p class="text-neutral-500 text-sm">Você encontrou todos os pares.</p>

        <div class="grid grid-cols-2 gap-4">
            <div class="bg-white dark:bg-neutral-800 rounded-2xl p-5 shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700">
                <div class="text-3xl font-black text-violet-600 dark:text-violet-400">{moves}</div>
                <div class="text-xs text-neutral-500 font-bold uppercase mt-1">Jogadas</div>
            </div>
            <div class="bg-white dark:bg-neutral-800 rounded-2xl p-5 shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700">
                <div class="text-3xl font-black text-indigo-600 dark:text-indigo-400">{fmtTime(elapsed)}</div>
                <div class="text-xs text-neutral-500 font-bold uppercase mt-1">Tempo</div>
            </div>
        </div>

        <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl px-5 py-4 flex items-center justify-center gap-3">
            <span class="text-2xl">🪙</span>
            <div class="text-left">
                <div class="font-black text-amber-700 dark:text-amber-400 text-lg">+{REFUND} moedas recuperadas</div>
                <div class="text-xs text-amber-600/70 dark:text-amber-500">Saldo atual: {$gamificationStore.coins}</div>
            </div>
        </div>

        <div class="flex gap-3 justify-center pt-2">
            <button on:click={() => { phase = 'ready'; }}
                disabled={$gamificationStore.coins < COST}
                class="px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl transition shadow text-sm
                       disabled:opacity-50 disabled:cursor-not-allowed">
                Jogar Novamente {$gamificationStore.coins < COST ? `(${COST - $gamificationStore.coins}🪙 faltam)` : ''}
            </button>
            <a href="/games"
                class="px-6 py-3 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 font-bold rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-700 transition text-sm">
                Lobby
            </a>
        </div>
    </div>
{/if}
