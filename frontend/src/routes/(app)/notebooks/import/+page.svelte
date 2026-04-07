<script lang="ts">
    /**
     * US-14: Import flashcards from .md files in Prompt Master / Anki basic format
     */
    import { goto } from '$app/navigation';
    import { db, type Flashcard } from '$lib/db';
    import { syncEngine } from '$lib/sync';
    import { parsePromptMasterCards, promptCardToFlashcard, type ParsedPromptCard } from '$lib/notebookParser';

    // --- State ---
    type CardAction = 'approved' | 'review' | 'discarded';
    interface PreviewCard {
        parsed: ParsedPromptCard;
        edited: { front: string; back: string; criteria: string; tags: string };
        action: CardAction;
        editMode: boolean;
        malformed: boolean;
    }

    let step: 'upload' | 'preview' | 'saving' | 'done' = 'upload';
    let previewCards: PreviewCard[] = [];
    let malformedCount = 0;
    let savedCount = 0;
    let fileName = '';
    let parseError = '';

    // --- Computed ---
    $: approvedCount = previewCards.filter(c => c.action === 'approved').length;

    function handleFileChange(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        fileName = file.name;
        parseError = '';

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            parseFile(text);
        };
        reader.readAsText(file, 'utf-8');
    }

    function parseFile(content: string) {
        // Detect format: Prompt Master or Anki basic (front;back)
        const isAnkiBasic = !content.includes('Q:') && content.includes(';');

        let parsed: ParsedPromptCard[] = [];

        if (isAnkiBasic) {
            parsed = parseAnkiBasic(content);
        } else {
            parsed = parsePromptMasterCards(content);
        }

        malformedCount = 0;

        previewCards = parsed.map(p => {
            const malformed = !p.front.trim() || !p.back.trim();
            if (malformed) malformedCount++;
            return {
                parsed: p,
                edited: {
                    front: p.front,
                    back: p.back,
                    criteria: p.criteria,
                    tags: p.tags.join(', ')
                },
                action: malformed ? 'review' : 'approved',
                editMode: malformed,
                malformed
            };
        });

        if (previewCards.length === 0) {
            parseError = 'Nenhum flashcard encontrado no arquivo. Verifique o formato (Prompt Master: Q:/A: ou Anki: frente;verso).';
            return;
        }

        step = 'preview';
    }

    function parseAnkiBasic(text: string): ParsedPromptCard[] {
        const cards: ParsedPromptCard[] = [];
        for (const line of text.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const sep = trimmed.indexOf(';');
            if (sep === -1) continue;
            cards.push({
                front: trimmed.slice(0, sep).trim(),
                back: trimmed.slice(sep + 1).trim(),
                criteria: '',
                tags: []
            });
        }
        return cards;
    }

    function toggleAction(i: number) {
        const next: Record<CardAction, CardAction> = { approved: 'discarded', discarded: 'approved', review: 'approved' };
        previewCards[i] = { ...previewCards[i], action: next[previewCards[i].action] };
    }

    function toggleEdit(i: number) {
        previewCards[i] = { ...previewCards[i], editMode: !previewCards[i].editMode };
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
                type: card.parsed.type,
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
        return '';
    }
</script>

<div class="min-h-screen bg-neutral-900 text-neutral-100 p-4 md:p-8">
    <div class="max-w-3xl mx-auto">

        <!-- Header -->
        <div class="flex items-center gap-4 mb-8">
            <button on:click={() => goto('/notebooks')}
                class="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <div>
                <h1 class="text-2xl font-extrabold tracking-tight">Importar flashcards</h1>
                <p class="text-sm text-neutral-400 mt-0.5">Suporta formato Prompt Master (.md) e Anki básico (frente;verso).</p>
            </div>
        </div>

        <!-- STEP: Upload -->
        {#if step === 'upload'}
            <div class="space-y-6">
                <label class="group block w-full border-2 border-dashed border-neutral-700 hover:border-indigo-500 rounded-2xl p-12 text-center cursor-pointer transition-colors">
                    <input type="file" accept=".md,.txt,.csv" on:change={handleFileChange} class="hidden" />
                    <div class="flex flex-col items-center gap-3">
                        <svg class="w-12 h-12 text-neutral-600 group-hover:text-indigo-400 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                        </svg>
                        <div>
                            <p class="text-sm font-semibold text-neutral-300 group-hover:text-indigo-300 transition">Clique para selecionar ou arraste o arquivo</p>
                            <p class="text-xs text-neutral-600 mt-1">.md · .txt · .csv</p>
                        </div>
                    </div>
                </label>

                {#if parseError}
                    <div class="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">{parseError}</div>
                {/if}

                <div class="p-4 rounded-xl bg-neutral-800 border border-neutral-700 space-y-3">
                    <p class="text-xs font-bold text-neutral-400 uppercase tracking-widest">Formatos suportados</p>
                    <div class="space-y-2 text-xs text-neutral-500 font-mono">
                        <p class="text-neutral-400 font-semibold">Prompt Master:</p>
                        <pre class="bg-neutral-900 p-3 rounded-lg overflow-auto">Tipo: CONCEITO
Q: O que é X?
A: X é...
Critérios:
- [ ] Explicou com palavras próprias
Tags: tag1, tag2</pre>
                        <p class="text-neutral-400 font-semibold mt-2">Anki básico:</p>
                        <pre class="bg-neutral-900 p-3 rounded-lg">Frente do cartão;Verso do cartão</pre>
                    </div>
                </div>
            </div>

        <!-- STEP: Preview -->
        {:else if step === 'preview'}
            <div class="space-y-4">
                <div class="flex items-center justify-between">
                    <div>
                        <h2 class="text-lg font-bold">{previewCards.length} cartões detectados — <span class="text-neutral-500 text-base font-normal">{fileName}</span></h2>
                        <p class="text-xs text-neutral-400 mt-0.5">
                            {approvedCount} aprovados
                            {#if malformedCount > 0}
                                · <span class="text-amber-400">{malformedCount} precisam de revisão</span>
                            {/if}
                        </p>
                    </div>
                    <button on:click={() => step = 'upload'} class="text-xs text-neutral-500 hover:text-neutral-300 transition">Trocar arquivo</button>
                </div>

                {#each previewCards as card, i}
                    <div class="rounded-2xl border transition {card.action === 'discarded' ? 'border-neutral-700 opacity-50' : card.malformed ? 'border-amber-500/40 bg-amber-500/5' : 'border-neutral-600 bg-neutral-800/60'}">
                        <div class="p-4">
                            <div class="flex items-start justify-between gap-3 mb-3">
                                <div class="flex items-center gap-2">
                                    {#if card.malformed && card.action !== 'discarded'}
                                        <span class="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">Revisar</span>
                                    {:else if card.parsed.type}
                                        <span class="text-xs font-bold px-2.5 py-1 rounded-full border {typeBadgeClass(card.parsed.type)}">{card.parsed.type}</span>
                                    {/if}
                                </div>

                                <div class="flex items-center gap-2 shrink-0">
                                    <button on:click={() => toggleEdit(i)}
                                        class="text-xs px-3 py-1 rounded-lg border border-neutral-600 text-neutral-400 hover:border-neutral-400 hover:text-neutral-200 transition">
                                        {card.editMode ? 'Fechar' : 'Editar'}
                                    </button>
                                    <button on:click={() => toggleAction(i)}
                                        class="text-xs px-3 py-1 rounded-lg transition font-semibold {card.action === 'approved' || card.action === 'review' ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'}">
                                        {card.action === 'discarded' ? 'Aprovar' : 'Descartar'}
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
                                    {#if card.edited.criteria}
                                        <div>
                                            <label class="text-xs text-neutral-500 font-bold uppercase">Critérios</label>
                                            <textarea bind:value={card.edited.criteria} rows="3"
                                                class="w-full mt-1 px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-xs"></textarea>
                                        </div>
                                    {/if}
                                    <div>
                                        <label class="text-xs text-neutral-500 font-bold uppercase">Tags</label>
                                        <input bind:value={card.edited.tags} type="text"
                                            class="w-full mt-1 px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                                    </div>
                                </div>
                            {:else}
                                <div class="space-y-1">
                                    <p class="text-sm font-semibold text-neutral-100">{card.edited.front}</p>
                                    <p class="text-sm text-neutral-400">{card.edited.back}</p>
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
                        Importar {approvedCount} cartões
                    </button>
                </div>
            </div>

        <!-- STEP: Saving -->
        {:else if step === 'saving'}
            <div class="flex flex-col items-center justify-center py-32 gap-6">
                <div class="w-14 h-14 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                <p class="text-indigo-400 font-bold tracking-widest uppercase text-sm animate-pulse">Importando flashcards...</p>
            </div>

        <!-- STEP: Done -->
        {:else if step === 'done'}
            <div class="flex flex-col items-center justify-center py-32 gap-6 text-center">
                <div class="text-6xl">✅</div>
                <h2 class="text-2xl font-extrabold">{savedCount} flashcard{savedCount !== 1 ? 's' : ''} importado{savedCount !== 1 ? 's' : ''}!</h2>
                <p class="text-neutral-400 text-sm">Prontos para revisão pelo algoritmo FSRS.</p>
                <div class="flex gap-3 mt-2">
                    <button on:click={() => goto('/notebooks')} class="px-6 py-3 rounded-xl border border-neutral-600 text-neutral-300 hover:bg-neutral-800 transition font-semibold text-sm">Ver cadernos</button>
                    <button on:click={() => { step = 'upload'; previewCards = []; }} class="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition text-sm">Importar mais</button>
                </div>
            </div>
        {/if}

    </div>
</div>
