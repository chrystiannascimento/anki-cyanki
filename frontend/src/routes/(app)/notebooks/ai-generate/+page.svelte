<script lang="ts">
    /**
     * US-06: Convert notebook content to AI flashcards
     * US-07: Generate flashcards from free-text prompt
     * US-08: Preview and edit generated cards before saving
     */
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { onMount } from 'svelte';
    import { db, type Flashcard, type FlashcardType } from '$lib/db';
    import { syncEngine } from '$lib/sync';
    import {
        generateFlashcards,
        hasApiKey,
        type AIProvider,
        type GenerationParams
    } from '$lib/aiService';
    import { parsePromptMasterCards, promptCardToFlashcard, type ParsedPromptCard } from '$lib/notebookParser';

    // --- Route params ---
    // Optional: ?notebookId=xxx to pre-fill from a notebook
    const notebookId = $page.url.searchParams.get('notebookId') ?? '';

    // --- Generation mode ---
    type Mode = 'prompt' | 'notebook';
    let mode: Mode = notebookId ? 'notebook' : 'prompt';

    // --- Form state ---
    let provider: AIProvider = 'openai';
    let topic = '';
    let notebookContent = '';
    let notebookTitle = '';
    let maxCards = 10;
    let cardType: GenerationParams['cardType'] = 'automático';
    let level: GenerationParams['level'] = 'intermediário';
    let domain = '';

    // --- Generation state ---
    let isGenerating = false;
    let error = '';

    // --- Preview state (US-08) ---
    type CardAction = 'approved' | 'discarded';
    interface PreviewCard {
        parsed: ParsedPromptCard;
        edited: { front: string; back: string; criteria: string; tags: string; type?: FlashcardType };
        action: CardAction;
        editMode: boolean;
    }
    let previewCards: PreviewCard[] = [];
    let step: 'form' | 'preview' | 'saving' | 'done' = 'form';
    let savedCount = 0;

    // --- Existing questions for "gerar mais" ---
    let existingQuestions: string[] = [];

    onMount(async () => {
        // Pick the stored provider (if set)
        if (hasApiKey('anthropic') && !hasApiKey('openai')) provider = 'anthropic';

        if (notebookId) {
            const nb = await db.notebooks.get(notebookId);
            if (nb) {
                notebookContent = nb.content;
                notebookTitle = nb.title;
                domain = nb.title;
            }
        }
    });

    // --- Computed ---
    $: approvedCount = previewCards.filter(c => c.action === 'approved').length;
    $: hasApiConfigured = hasApiKey(provider);

    async function generate() {
        if (!hasApiKey(provider)) {
            error = 'Configure sua chave de API em Perfil > Inteligência Artificial.';
            return;
        }
        isGenerating = true;
        error = '';

        try {
            const params: GenerationParams = {
                provider,
                maxCards,
                cardType,
                level,
                domain,
                existingQuestions
            };

            if (mode === 'notebook') {
                params.notebookContent = notebookContent;
            } else {
                params.topic = topic;
            }

            const parsed = await generateFlashcards(params);

            previewCards = parsed.map(p => ({
                parsed: p,
                edited: {
                    front: p.front,
                    back: p.back,
                    criteria: p.criteria,
                    tags: p.tags.join(', '),
                    type: p.type
                },
                action: 'approved',
                editMode: false
            }));

            step = 'preview';
        } catch (e: any) {
            error = e.message ?? 'Erro ao gerar flashcards. Tente novamente.';
        } finally {
            isGenerating = false;
        }
    }

    async function generateMore() {
        existingQuestions = [
            ...existingQuestions,
            ...previewCards.map(c => c.edited.front)
        ];
        step = 'form';
        previewCards = [];
    }

    function toggleAction(i: number) {
        previewCards[i] = {
            ...previewCards[i],
            action: previewCards[i].action === 'approved' ? 'discarded' : 'approved'
        };
    }

    function toggleEdit(i: number) {
        previewCards[i] = { ...previewCards[i], editMode: !previewCards[i].editMode };
    }

    function updateType(i: number, t: string) {
        previewCards[i] = {
            ...previewCards[i],
            edited: { ...previewCards[i].edited, type: t as FlashcardType }
        };
    }

    async function saveApproved() {
        step = 'saving';

        const toSave = previewCards.filter(c => c.action === 'approved');

        for (const card of toSave) {
            const mergedBack = card.edited.criteria
                ? `${card.edited.back}\n\nCritérios:\n${card.edited.criteria}`
                : card.edited.back;

            const tags = card.edited.tags
                .split(/[,;\s]+/)
                .map(t => t.trim())
                .filter(Boolean);

            const flashcard: Flashcard = {
                id: crypto.randomUUID(),
                front: card.edited.front,
                back: mergedBack,
                tags,
                type: card.edited.type,
                createdAt: Date.now()
            };

            await db.flashcards.add(flashcard);
            await syncEngine.enqueue('CREATE', 'FLASHCARD', flashcard.id, flashcard);
        }

        savedCount = toSave.length;
        step = 'done';
    }

    function typeBadgeClass(type?: string) {
        if (type === 'CONCEITO') return 'bg-violet-500/20 text-violet-300 border-violet-500/30';
        if (type === 'FATO') return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
        if (type === 'PROCEDIMENTO') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
        return 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30';
    }
</script>

<div class="min-h-screen bg-neutral-900 text-neutral-100 p-4 md:p-8">
    <div class="max-w-3xl mx-auto">

        <!-- Header -->
        <div class="flex items-center gap-4 mb-8">
            <button on:click={() => goto(notebookId ? `/notebooks/${notebookId}` : '/notebooks')}
                class="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <div>
                <h1 class="text-2xl font-extrabold tracking-tight">Gerar com IA</h1>
                <p class="text-sm text-neutral-400 mt-0.5">Crie flashcards de alta qualidade em segundos.</p>
            </div>
        </div>

        <!-- STEP: Form -->
        {#if step === 'form'}
            <div class="space-y-6">

                <!-- Mode tabs -->
                <div class="flex gap-2 p-1 bg-neutral-800 rounded-xl">
                    <button on:click={() => mode = 'prompt'}
                        class="flex-1 py-2.5 rounded-lg text-sm font-semibold transition {mode === 'prompt' ? 'bg-indigo-600 text-white shadow' : 'text-neutral-400 hover:text-white'}">
                        Tema livre
                    </button>
                    <button on:click={() => mode = 'notebook'}
                        class="flex-1 py-2.5 rounded-lg text-sm font-semibold transition {mode === 'notebook' ? 'bg-indigo-600 text-white shadow' : 'text-neutral-400 hover:text-white'}">
                        A partir de caderno
                    </button>
                </div>

                <!-- Provider selector -->
                <div class="space-y-2">
                    <label class="text-xs font-bold text-neutral-400 uppercase tracking-widest">Modelo de IA</label>
                    <div class="flex gap-2">
                        <button on:click={() => provider = 'openai'}
                            class="flex-1 py-2 rounded-xl text-sm font-medium border transition {provider === 'openai' ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'}">
                            GPT-4o
                        </button>
                        <button on:click={() => provider = 'anthropic'}
                            class="flex-1 py-2 rounded-xl text-sm font-medium border transition {provider === 'anthropic' ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'}">
                            Claude Sonnet
                        </button>
                    </div>
                    {#if !hasApiConfigured}
                        <p class="text-xs text-amber-400">
                            Nenhuma chave configurada para {provider === 'openai' ? 'OpenAI' : 'Anthropic'}.
                            <a href="/profile" class="underline">Configurar em Perfil →</a>
                        </p>
                    {/if}
                </div>

                <!-- Content input -->
                {#if mode === 'prompt'}
                    <div class="space-y-2">
                        <label class="text-xs font-bold text-neutral-400 uppercase tracking-widest">O que você quer aprender?</label>
                        <textarea
                            bind:value={topic}
                            placeholder="Ex: 50 cartões sobre análise de ponto de função em sistemas de software..."
                            rows="4"
                            class="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-neutral-600"
                        ></textarea>
                    </div>
                {:else}
                    <div class="space-y-2">
                        <label class="text-xs font-bold text-neutral-400 uppercase tracking-widest">Conteúdo do caderno</label>
                        {#if notebookTitle}
                            <p class="text-xs text-neutral-500">Caderno: <span class="text-neutral-300">{notebookTitle}</span></p>
                        {/if}
                        <textarea
                            bind:value={notebookContent}
                            placeholder="Cole o conteúdo do caderno aqui..."
                            rows="6"
                            class="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-neutral-600 font-mono text-xs"
                        ></textarea>
                        <p class="text-xs text-neutral-600">~{Math.ceil(notebookContent.length / 4)} tokens estimados (limite: 6.000)</p>
                    </div>
                {/if}

                <!-- Parameters -->
                <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div class="space-y-1.5">
                        <label class="text-xs font-bold text-neutral-400 uppercase tracking-widest">Quantidade</label>
                        <input type="number" bind:value={maxCards} min="1" max="50"
                            class="w-full px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        <p class="text-xs text-neutral-600">máx. 50</p>
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-xs font-bold text-neutral-400 uppercase tracking-widest">Tipo</label>
                        <select bind:value={cardType}
                            class="w-full px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value="automático">Automático</option>
                            <option value="CONCEITO">Conceito</option>
                            <option value="FATO">Fato</option>
                            <option value="PROCEDIMENTO">Procedimento</option>
                        </select>
                    </div>

                    <div class="space-y-1.5">
                        <label class="text-xs font-bold text-neutral-400 uppercase tracking-widest">Nível</label>
                        <select bind:value={level}
                            class="w-full px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value="iniciante">Iniciante</option>
                            <option value="intermediário">Intermediário</option>
                            <option value="avançado">Avançado</option>
                        </select>
                    </div>
                </div>

                <div class="space-y-1.5">
                    <label class="text-xs font-bold text-neutral-400 uppercase tracking-widest">Área / Domínio (opcional)</label>
                    <input type="text" bind:value={domain} placeholder="Ex: direito administrativo, programação, nutrição"
                        class="w-full px-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-neutral-600" />
                </div>

                {#if existingQuestions.length > 0}
                    <div class="p-3 rounded-xl bg-neutral-800 border border-neutral-700 text-xs text-neutral-400">
                        Modo "Gerar mais" ativo — {existingQuestions.length} pergunta(s) já gerada(s) serão excluídas da próxima geração.
                    </div>
                {/if}

                {#if error}
                    <div class="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">{error}</div>
                {/if}

                <button
                    on:click={generate}
                    disabled={isGenerating || (!topic.trim() && !notebookContent.trim())}
                    class="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-lg transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-3"
                >
                    {#if isGenerating}
                        <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        Gerando flashcards...
                    {:else}
                        Gerar flashcards
                    {/if}
                </button>
            </div>

        <!-- STEP: Preview (US-08) -->
        {:else if step === 'preview'}
            <div class="space-y-4">
                <div class="flex items-center justify-between">
                    <div>
                        <h2 class="text-lg font-bold">{previewCards.length} cartões gerados</h2>
                        <p class="text-xs text-neutral-400 mt-0.5">{approvedCount} aprovados · {previewCards.length - approvedCount} descartados</p>
                    </div>
                    <button on:click={generateMore}
                        class="px-4 py-2 rounded-xl border border-neutral-600 text-sm text-neutral-300 hover:bg-neutral-800 transition">
                        + Gerar mais
                    </button>
                </div>

                {#each previewCards as card, i}
                    <div class="rounded-2xl border transition {card.action === 'discarded' ? 'border-neutral-700 opacity-50' : 'border-neutral-600 bg-neutral-800/60'}">
                        <div class="p-4">
                            <div class="flex items-start justify-between gap-3 mb-3">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <!-- Type badge -->
                                    <select
                                        value={card.edited.type ?? ''}
                                        on:change={(e) => updateType(i, e.currentTarget.value)}
                                        class="text-xs font-bold px-2.5 py-1 rounded-full border cursor-pointer bg-transparent {typeBadgeClass(card.edited.type)}"
                                    >
                                        <option value="">Sem tipo</option>
                                        <option value="CONCEITO">Conceito</option>
                                        <option value="FATO">Fato</option>
                                        <option value="PROCEDIMENTO">Procedimento</option>
                                    </select>
                                </div>

                                <div class="flex items-center gap-2 shrink-0">
                                    <button on:click={() => toggleEdit(i)}
                                        class="text-xs px-3 py-1 rounded-lg border border-neutral-600 text-neutral-400 hover:border-neutral-400 hover:text-neutral-200 transition">
                                        {card.editMode ? 'Fechar' : 'Editar'}
                                    </button>
                                    <button on:click={() => toggleAction(i)}
                                        class="text-xs px-3 py-1 rounded-lg transition font-semibold {card.action === 'approved' ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'}">
                                        {card.action === 'approved' ? 'Descartar' : 'Aprovar'}
                                    </button>
                                </div>
                            </div>

                            {#if card.editMode}
                                <div class="space-y-3">
                                    <div>
                                        <label class="text-xs text-neutral-500 font-bold uppercase">Pergunta</label>
                                        <textarea bind:value={card.edited.front} rows="2"
                                            class="w-full mt-1 px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"></textarea>
                                    </div>
                                    <div>
                                        <label class="text-xs text-neutral-500 font-bold uppercase">Resposta</label>
                                        <textarea bind:value={card.edited.back} rows="3"
                                            class="w-full mt-1 px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"></textarea>
                                    </div>
                                    <div>
                                        <label class="text-xs text-neutral-500 font-bold uppercase">Critérios (um por linha)</label>
                                        <textarea bind:value={card.edited.criteria} rows="3"
                                            class="w-full mt-1 px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-xs"
                                            placeholder="- [ ] critério 1&#10;- [ ] critério 2"></textarea>
                                    </div>
                                    <div>
                                        <label class="text-xs text-neutral-500 font-bold uppercase">Tags (vírgula)</label>
                                        <input bind:value={card.edited.tags} type="text"
                                            class="w-full mt-1 px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                                    </div>
                                </div>
                            {:else}
                                <div class="space-y-2">
                                    <p class="text-sm font-semibold text-neutral-100">{card.edited.front}</p>
                                    <p class="text-sm text-neutral-400 leading-relaxed">{card.edited.back}</p>
                                    {#if card.edited.criteria}
                                        <div class="mt-2 space-y-1">
                                            {#each card.edited.criteria.split('\n').filter(l => l.trim()) as line}
                                                <p class="text-xs text-neutral-500 font-mono">{line}</p>
                                            {/each}
                                        </div>
                                    {/if}
                                    {#if card.edited.tags}
                                        <div class="flex flex-wrap gap-1 mt-1">
                                            {#each card.edited.tags.split(',').map(t => t.trim()).filter(Boolean) as tag}
                                                <span class="text-xs px-2 py-0.5 rounded-full bg-neutral-700 text-neutral-400">{tag}</span>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    </div>
                {/each}

                <!-- Save bar -->
                <div class="sticky bottom-4 p-4 bg-neutral-900/95 backdrop-blur rounded-2xl border border-neutral-700 shadow-xl flex items-center justify-between gap-4">
                    <span class="text-sm text-neutral-400 font-medium">{approvedCount} de {previewCards.length} aprovados</span>
                    <button
                        on:click={saveApproved}
                        disabled={approvedCount === 0}
                        class="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all active:scale-95 disabled:opacity-40 text-sm">
                        Salvar {approvedCount} aprovados
                    </button>
                </div>
            </div>

        <!-- STEP: Saving -->
        {:else if step === 'saving'}
            <div class="flex flex-col items-center justify-center py-32 gap-6">
                <div class="w-14 h-14 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                <p class="text-indigo-400 font-bold tracking-widest uppercase text-sm animate-pulse">Salvando flashcards...</p>
            </div>

        <!-- STEP: Done -->
        {:else if step === 'done'}
            <div class="flex flex-col items-center justify-center py-32 gap-6 text-center">
                <div class="text-6xl">🎉</div>
                <h2 class="text-2xl font-extrabold">{savedCount} flashcard{savedCount !== 1 ? 's' : ''} salvo{savedCount !== 1 ? 's' : ''}!</h2>
                <p class="text-neutral-400 text-sm">Os cartões estão prontos para revisão pelo algoritmo FSRS.</p>
                <div class="flex gap-3 mt-2">
                    <button on:click={() => goto('/notebooks')} class="px-6 py-3 rounded-xl border border-neutral-600 text-neutral-300 hover:bg-neutral-800 transition font-semibold text-sm">Ver cadernos</button>
                    <button on:click={() => { step = 'form'; previewCards = []; existingQuestions = []; }} class="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition text-sm">Gerar mais</button>
                </div>
            </div>
        {/if}

    </div>
</div>
