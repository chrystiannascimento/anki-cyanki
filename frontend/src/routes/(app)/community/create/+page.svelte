<script lang="ts">
    import { onMount } from 'svelte';
    import { db, type Flashcard, type Challenge } from '$lib/db';
    import { goto } from '$app/navigation';
    import { nanoid } from 'nanoid';

    // ─── Form state ──────────────────────────────────────────────────────────
    let title = '';
    let description = '';
    let tagInput = '';
    let keyword = '';
    let cardCount = 10;
    let isPublic = false;

    // ─── Preview state ────────────────────────────────────────────────────────
    let allTags: string[] = [];
    let selectedTags: string[] = [];
    let previewCards: Flashcard[] = [];
    let isPreviewing = false;
    let isCreating = false;
    let createdCode = '';

    // ─── UI steps: 'form' → 'preview' → 'done' ───────────────────────────────
    let step: 'form' | 'preview' | 'done' = 'form';

    onMount(async () => {
        // Build tag list from all flashcards
        const cards = await db.flashcards.toArray();
        const tagSet = new Set<string>();
        for (const c of cards) {
            for (const t of c.tags ?? []) {
                if (t) tagSet.add(t);
            }
        }
        allTags = [...tagSet].sort();
    });

    function toggleTag(tag: string) {
        if (selectedTags.includes(tag)) {
            selectedTags = selectedTags.filter(t => t !== tag);
        } else {
            selectedTags = [...selectedTags, tag];
        }
    }

    // Filter pool using same two-step pattern as practice/questions
    async function queryPool(): Promise<Flashcard[]> {
        let pool: Flashcard[];

        if (selectedTags.length > 0) {
            const first = selectedTags[0];
            const initial = await db.flashcards.where('tags').equals(first).toArray();
            pool = initial.filter(c => selectedTags.every(t => c.tags?.includes(t)));
        } else {
            pool = await db.flashcards.toArray();
        }

        if (keyword.trim()) {
            const q = keyword.toLowerCase();
            pool = pool.filter(c =>
                c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q)
            );
        }

        return pool;
    }

    // Shuffle array in-place (Fisher-Yates)
    function shuffle<T>(arr: T[]): T[] {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    async function preview() {
        if (!title.trim()) { alert('Dê um título ao desafio.'); return; }
        isPreviewing = true;
        try {
            const pool = await queryPool();
            previewCards = shuffle(pool).slice(0, cardCount);
            step = 'preview';
        } finally {
            isPreviewing = false;
        }
    }

    function generateCode(): string {
        // 6-char uppercase alphanumeric (avoids 0/O and I/1 confusion)
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
        return code;
    }

    async function createChallenge() {
        if (previewCards.length === 0) {
            alert('Nenhum card encontrado para os critérios selecionados.');
            return;
        }
        isCreating = true;
        try {
            // Guarantee code uniqueness locally
            let code = generateCode();
            while (await db.challenges.where('code').equals(code).first()) {
                code = generateCode();
            }

            const challenge: Challenge = {
                id: nanoid(),
                code,
                title: title.trim(),
                description: description.trim() || undefined,
                criteria: {
                    tags: [...selectedTags],
                    keyword: keyword.trim() || undefined,
                },
                cardIds: previewCards.map(c => c.id),
                cardCount: previewCards.length,
                isPublic,
                createdAt: Date.now(),
                attempts: 0,
                synced: false
            };

            await db.challenges.add(challenge);
            createdCode = code;
            step = 'done';
        } finally {
            isCreating = false;
        }
    }

    function reshuffleSample() {
        queryPool().then(pool => {
            previewCards = shuffle(pool).slice(0, cardCount);
        });
    }
</script>

<div class="max-w-2xl mx-auto py-8 space-y-6">

    <!-- Back nav -->
    <a href="/community" class="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-white transition">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
        Comunidade
    </a>

    <!-- ── STEP: FORM ──────────────────────────────────────────────────────── -->
    {#if step === 'form'}

    <div>
        <h1 class="text-2xl font-extrabold text-neutral-900 dark:text-white">Criar Desafio</h1>
        <p class="text-neutral-500 dark:text-neutral-400 mt-1">Selecione questões do seu acervo, gere um código e compartilhe com quem quiser.</p>
    </div>

    <div class="bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-neutral-200 dark:ring-neutral-700 p-6 space-y-5">

        <!-- Title -->
        <div>
            <label class="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">Título do Desafio <span class="text-rose-500">*</span></label>
            <input bind:value={title} type="text" placeholder="ex: Direito Constitucional — Nível Médio" class="w-full p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white dark:placeholder-neutral-500 text-sm" />
        </div>

        <!-- Description -->
        <div>
            <label class="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">Descrição (opcional)</label>
            <textarea bind:value={description} rows="2" placeholder="Explique do que se trata o desafio..." class="w-full p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 outline-none resize-none dark:text-white dark:placeholder-neutral-500 text-sm"></textarea>
        </div>

        <!-- Tag filter -->
        <div>
            <label class="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">
                Filtrar por Tags
                {#if selectedTags.length > 0}<span class="text-indigo-500 font-normal ml-1">({selectedTags.length} selecionadas)</span>{/if}
            </label>
            {#if allTags.length === 0}
                <p class="text-sm text-neutral-400 italic">Nenhuma tag encontrada no seu acervo.</p>
            {:else}
                <div class="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
                    {#each allTags as tag}
                        <button
                            on:click={() => toggleTag(tag)}
                            class="px-3 py-1 rounded-full text-xs font-semibold border transition {selectedTags.includes(tag) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-600 hover:border-indigo-400'}"
                        >
                            {tag}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- Keyword -->
        <div>
            <label class="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">Busca por Palavra-chave (opcional)</label>
            <input bind:value={keyword} type="text" placeholder="ex: mandado de segurança" class="w-full p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white dark:placeholder-neutral-500 text-sm" />
        </div>

        <!-- Card count -->
        <div>
            <label class="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">
                Número de Questões: <span class="text-indigo-500">{cardCount}</span>
            </label>
            <input bind:value={cardCount} type="range" min="5" max="20" step="1" class="w-full accent-indigo-600" />
            <div class="flex justify-between text-xs text-neutral-400 mt-1"><span>5</span><span>20</span></div>
        </div>

        <!-- Visibility -->
        <div class="flex items-center gap-3">
            <button
                on:click={() => isPublic = !isPublic}
                class="relative inline-flex h-6 w-11 items-center rounded-full transition {isPublic ? 'bg-indigo-600' : 'bg-neutral-300 dark:bg-neutral-600'}"
                role="switch" aria-checked={isPublic}
            >
                <span class="inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform {isPublic ? 'translate-x-6' : 'translate-x-1'}"></span>
            </button>
            <div>
                <span class="text-sm font-bold text-neutral-700 dark:text-neutral-300">{isPublic ? 'Público' : 'Privado'}</span>
                <p class="text-xs text-neutral-400">{isPublic ? 'Qualquer pessoa com o código pode jogar.' : 'Apenas você pode acessar.'}</p>
            </div>
        </div>
    </div>

    <button
        on:click={preview}
        disabled={isPreviewing || !title.trim()}
        class="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl shadow-xl shadow-indigo-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-sm uppercase tracking-wider"
    >
        {isPreviewing ? 'Carregando...' : 'Ver prévia das questões →'}
    </button>

    <!-- ── STEP: PREVIEW ───────────────────────────────────────────────────── -->
    {:else if step === 'preview'}

    <div>
        <h1 class="text-2xl font-extrabold text-neutral-900 dark:text-white">Prévia do Desafio</h1>
        <p class="text-neutral-500 dark:text-neutral-400 mt-1">
            {previewCards.length} questões selecionadas aleatoriamente do seu acervo.
            Elas serão <strong>imutáveis</strong> após a criação.
        </p>
    </div>

    <!-- Title preview -->
    <div class="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/50 rounded-2xl p-5">
        <div class="flex items-start justify-between gap-2">
            <div>
                <h2 class="font-black text-lg text-neutral-900 dark:text-white">{title}</h2>
                {#if description}<p class="text-sm text-neutral-500 mt-0.5">{description}</p>{/if}
            </div>
            <span class="shrink-0 text-xs font-bold px-2.5 py-1 rounded-lg {isPublic ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400'}">
                {isPublic ? '🌐 Público' : '🔒 Privado'}
            </span>
        </div>
        <div class="flex gap-4 mt-3 text-xs text-neutral-500 dark:text-neutral-400">
            {#if selectedTags.length > 0}<span>🏷 {selectedTags.join(', ')}</span>{/if}
            {#if keyword}<span>🔍 "{keyword}"</span>{/if}
            <span>📋 {previewCards.length} cards</span>
        </div>
    </div>

    <!-- Card list preview -->
    {#if previewCards.length === 0}
        <div class="py-10 text-center border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl text-neutral-400">
            <p class="font-medium">Nenhuma questão encontrada para esses critérios.</p>
            <button on:click={() => step = 'form'} class="mt-4 px-4 py-2 text-sm font-bold text-indigo-600 hover:underline">← Ajustar filtros</button>
        </div>
    {:else}
        <div class="space-y-3 max-h-80 overflow-y-auto pr-1">
            {#each previewCards as card, i (card.id)}
                <div class="p-4 bg-white dark:bg-neutral-800 rounded-xl ring-1 ring-neutral-200 dark:ring-neutral-700 flex gap-3">
                    <span class="shrink-0 text-xs font-black text-neutral-400 w-5 text-right mt-0.5">{i + 1}.</span>
                    <div class="min-w-0">
                        <p class="text-sm font-semibold text-neutral-800 dark:text-neutral-100 line-clamp-2">{card.front}</p>
                        <p class="text-xs text-neutral-400 line-clamp-1 mt-0.5">{card.back}</p>
                    </div>
                </div>
            {/each}
        </div>

        <!-- Reshuffle + actions -->
        <div class="flex flex-col sm:flex-row gap-3">
            <button on:click={reshuffleSample} class="flex-1 py-3 border-2 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 font-bold rounded-xl text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 transition">
                🔀 Sortear novamente
            </button>
            <button on:click={() => step = 'form'} class="flex-1 py-3 border-2 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 font-bold rounded-xl text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 transition">
                ← Editar filtros
            </button>
            <button
                on:click={createChallenge}
                disabled={isCreating}
                class="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl text-sm shadow-lg shadow-indigo-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isCreating ? 'Criando...' : 'Confirmar e Criar ✓'}
            </button>
        </div>
    {/if}

    <!-- ── STEP: DONE ──────────────────────────────────────────────────────── -->
    {:else}

    <div class="bg-white dark:bg-neutral-800 rounded-3xl ring-1 ring-neutral-200 dark:ring-neutral-700 p-10 text-center space-y-6">
        <div class="text-6xl">🎉</div>
        <div>
            <h1 class="text-2xl font-extrabold text-neutral-900 dark:text-white">Desafio criado!</h1>
            <p class="text-neutral-500 mt-2">Compartilhe o código abaixo com seus colegas.</p>
        </div>

        <!-- Code display -->
        <div class="inline-flex flex-col items-center gap-2 px-8 py-5 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl border-2 border-indigo-200 dark:border-indigo-700">
            <span class="text-xs font-black uppercase tracking-widest text-indigo-400">Código do Desafio</span>
            <span class="text-5xl font-black font-mono tracking-[0.3em] text-indigo-600 dark:text-indigo-400">{createdCode}</span>
        </div>

        <p class="text-sm text-neutral-400 max-w-sm mx-auto">
            Quem tiver o código pode buscar o desafio na aba <strong>Desafios</strong> da Comunidade e jogar.
        </p>

        <div class="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="/community/challenge/{createdCode}" class="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm shadow-lg shadow-indigo-500/20 transition">
                Jogar agora
            </a>
            <a href="/community" class="px-6 py-3 bg-neutral-100 dark:bg-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-300 font-bold rounded-xl text-sm transition">
                Ver meus desafios
            </a>
        </div>
    </div>

    {/if}

</div>
