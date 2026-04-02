<script lang="ts">
    /**
     * UC-10 — Game Lobby
     * Entry point for all mini-games. Shows current coin balance, game catalog,
     * unlock costs, and direct links to each game.
     */
    import { gamificationStore } from '$lib/stores/gamification';

    // Cost configuration — single source of truth consumed by lobby + game pages
    export const GAME_COSTS = {
        timed:  30,
        memory: 50
    };

    const GAMES = [
        {
            id: 'timed',
            href: '/games/timed',
            title: 'Desafio Cronometrado',
            description: 'Responda o máximo de flashcards possível em 60 segundos. Mostre o que você sabe!',
            icon: '⏱️',
            cost: GAME_COSTS.timed,
            accent: 'from-rose-500 to-orange-500',
            ring: 'ring-rose-200 dark:ring-rose-800/50',
            badge: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400',
            cta: 'bg-rose-600 hover:bg-rose-500',
        },
        {
            id: 'memory',
            href: '/games/memory',
            title: 'Jogo da Memória',
            description: 'Encontre os pares de Pergunta e Resposta. Treine a associação dos seus flashcards.',
            icon: '🃏',
            cost: GAME_COSTS.memory,
            accent: 'from-violet-500 to-indigo-600',
            ring: 'ring-violet-200 dark:ring-violet-800/50',
            badge: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400',
            cta: 'bg-violet-600 hover:bg-violet-500',
        }
    ];

    $: coins = $gamificationStore.coins;
</script>

<div class="max-w-4xl mx-auto space-y-8">

    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
            <h1 class="text-2xl font-extrabold text-neutral-800 dark:text-neutral-100">Mini-Games</h1>
            <p class="text-sm text-neutral-500 mt-1">Recompensas desbloqueadas com moedas ganhas nas sessões de estudo FSRS.</p>
        </div>

        <!-- Coin balance -->
        <div class="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-2xl px-5 py-3 shadow-sm">
            <span class="text-2xl">🪙</span>
            <div>
                <div class="text-2xl font-black text-amber-600 dark:text-amber-400 leading-none">{coins}</div>
                <div class="text-[10px] font-bold text-amber-700/60 dark:text-amber-500 uppercase tracking-wider">moedas</div>
            </div>
        </div>
    </div>

    <!-- How to earn coins -->
    <div class="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/50 rounded-xl px-5 py-4 flex items-start gap-3">
        <svg class="w-5 h-5 text-indigo-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <p class="text-sm text-indigo-800 dark:text-indigo-300">
            Cada revisão em sessões <strong>FSRS</strong> (Estudar Caderno, Study) concede <strong>1 moeda</strong>.
            Você não pode comprar moedas — elas são a recompensa pelo estudo consistente.
        </p>
    </div>

    <!-- Game cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        {#each GAMES as game}
            {@const canPlay = coins >= game.cost}
            <div class="bg-white dark:bg-neutral-800 rounded-2xl shadow-sm ring-1 {game.ring} overflow-hidden flex flex-col">

                <!-- Banner gradient -->
                <div class="h-24 bg-gradient-to-br {game.accent} flex items-center justify-center text-5xl">
                    {game.icon}
                </div>

                <div class="p-6 flex flex-col flex-1 gap-4">
                    <div>
                        <h2 class="text-lg font-extrabold text-neutral-800 dark:text-neutral-100">{game.title}</h2>
                        <p class="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{game.description}</p>
                    </div>

                    <!-- Cost badge -->
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-bold px-2.5 py-1 rounded-lg {game.badge} flex items-center gap-1">
                            🪙 {game.cost} moedas
                        </span>
                        {#if !canPlay}
                            <span class="text-xs text-neutral-400 font-medium">
                                Faltam {game.cost - coins} moedas
                            </span>
                        {/if}
                    </div>

                    <!-- CTA -->
                    <div class="mt-auto">
                        {#if canPlay}
                            <a href={game.href}
                                class="block w-full text-center px-5 py-3 {game.cta} text-white font-bold rounded-xl transition shadow-md active:scale-95 text-sm">
                                Jogar Agora
                            </a>
                        {:else}
                            <!-- Locked state: progress bar toward cost -->
                            <div class="space-y-2">
                                <div class="w-full bg-neutral-100 dark:bg-neutral-700 rounded-full h-2 overflow-hidden">
                                    <div
                                        class="h-full rounded-full bg-amber-400 transition-all duration-500"
                                        style="width: {Math.min(100, Math.round((coins / game.cost) * 100))}%"
                                    ></div>
                                </div>
                                <button disabled
                                    class="block w-full text-center px-5 py-3 bg-neutral-100 dark:bg-neutral-700 text-neutral-400 font-bold rounded-xl text-sm cursor-not-allowed">
                                    🔒 Bloqueado
                                </button>
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        {/each}
    </div>

    <!-- Empty-deck tip -->
    {#if coins === 0}
        <div class="bg-white dark:bg-neutral-800 rounded-2xl p-8 text-center shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700">
            <div class="text-4xl mb-3">📚</div>
            <h3 class="font-extrabold text-neutral-700 dark:text-neutral-300">Comece estudando para ganhar moedas</h3>
            <p class="text-sm text-neutral-500 mt-2 max-w-sm mx-auto">
                Complete revisões FSRS no Study, nos Cadernos ou na Prática para acumular moedas e desbloquear os jogos.
            </p>
            <div class="flex gap-3 justify-center mt-5">
                <a href="/study" class="px-5 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition text-sm">
                    Estudar Agora
                </a>
                <a href="/practice/questions" class="px-5 py-2 bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 rounded-xl font-bold hover:bg-neutral-50 dark:hover:bg-neutral-600 transition text-sm">
                    Praticar
                </a>
            </div>
        </div>
    {/if}
</div>
