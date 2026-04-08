<script lang="ts">
    import { onMount } from 'svelte';
    import { db, type Flashcard, type Notebook } from '$lib/db';
    import { syncEngine } from '$lib/sync';
    import { markFlashcardsDeleted } from '$lib/localDeletions';

    // ─── State ────────────────────────────────────────────────────────────────
    let allCards: Flashcard[] = [];
    let notebooks: Notebook[] = [];
    let loading = true;

    // Filter state
    let filterMode: 'all' | 'orphan' = 'orphan';
    let searchQuery = '';
    let filterType: '' | 'CONCEITO' | 'FATO' | 'PROCEDIMENTO' = '';

    // Selection
    let selected = new Set<string>();
    let isDeleting = false;

    // Expanded card preview
    let expandedId: string | null = null;

    // Feedback
    let lastAction = '';

    // ─── Derived ─────────────────────────────────────────────────────────────
    let referencedIds: Set<string> = new Set();

    // Matches both <!-- id: xyz --> (old) and <!--id:xyz--> (new) formats
    const ID_TAG_RE = /<!--\s*id:\s*([\w-]+)\s*-->/g;

    function buildReferencedIds(nbs: Notebook[]): Set<string> {
        const ids = new Set<string>();
        for (const nb of nbs) {
            let m: RegExpExecArray | null;
            ID_TAG_RE.lastIndex = 0;
            while ((m = ID_TAG_RE.exec(nb.content)) !== null) {
                ids.add(m[1]);
            }
        }
        return ids;
    }

    $: referencedIds = buildReferencedIds(notebooks);

    $: filtered = allCards.filter(card => {
        if (filterMode === 'orphan' && referencedIds.has(card.id)) return false;
        if (filterType && card.type !== filterType) return false;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            if (!card.front.toLowerCase().includes(q) && !card.back.toLowerCase().includes(q)) return false;
        }
        return true;
    });

    $: orphanCount = allCards.filter(c => !referencedIds.has(c.id)).length;
    $: allSelected = filtered.length > 0 && selected.size === filtered.length;

    // ─── Load ─────────────────────────────────────────────────────────────────
    onMount(async () => {
        await loadData();
    });

    async function loadData() {
        loading = true;
        try {
            [allCards, notebooks] = await Promise.all([
                db.flashcards.orderBy('createdAt').reverse().toArray(),
                db.notebooks.toArray(),
            ]);
            selected = new Set();
        } finally {
            loading = false;
        }
    }

    // ─── Selection ────────────────────────────────────────────────────────────
    function toggleCard(id: string) {
        if (selected.has(id)) selected.delete(id);
        else selected.add(id);
        selected = new Set(selected);
    }

    function toggleAll() {
        if (allSelected) selected = new Set();
        else selected = new Set(filtered.map(c => c.id));
    }

    // ─── Delete ───────────────────────────────────────────────────────────────
    async function deleteSelected() {
        if (selected.size === 0) return;
        if (!confirm(`Excluir ${selected.size} flashcard(s) selecionado(s)? Esta ação não pode ser desfeita.`)) return;
        isDeleting = true;
        try {
            const ids = [...selected];
            markFlashcardsDeleted(ids);
            await db.flashcards.bulkDelete(ids);
            for (const id of ids) {
                await syncEngine.enqueue('DELETE', 'FLASHCARD', id, {});
            }
            lastAction = `🗑 ${ids.length} flashcard(s) excluído(s). Deleção enfileirada no servidor.`;
            selected = new Set();
            expandedId = null;
            await loadData();
        } finally {
            isDeleting = false;
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────
    function typeBadgeClass(type?: string) {
        if (type === 'CONCEITO') return 'bg-violet-500/10 text-violet-400 border-violet-500/20';
        if (type === 'FATO') return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
        if (type === 'PROCEDIMENTO') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
        return 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20';
    }

    function notebookForCard(id: string): string | null {
        const re = new RegExp(`<!--\\s*id:\\s*${id}\\s*-->`);
        for (const nb of notebooks) {
            if (re.test(nb.content)) return nb.title;
        }
        return null;
    }

    function extractCriteria(back: string): string[] {
        const lines = back.split('\n');
        return lines
            .filter(l => /^\s*-\s*\[\s*(x|X| )\s*\]/.test(l))
            .map(l => l.replace(/^\s*-\s*\[\s*(x|X| )\s*\]\s*/, '').trim());
    }

    function answerText(back: string): string {
        const lines = back.split('\n');
        const firstCriteria = lines.findIndex(l => /^\s*-\s*\[/.test(l));
        const criteriaHeader = lines.findIndex(l => /Crit[eé]rios?\s*:/i.test(l));
        const cutoff = criteriaHeader !== -1 ? criteriaHeader : firstCriteria !== -1 ? firstCriteria : lines.length;
        return lines.slice(0, cutoff).join('\n').replace(/Crit[eé]rios?\s*:/i, '').trim();
    }
</script>

<div class="max-w-5xl mx-auto py-8 px-4 space-y-6">

    <!-- Header -->
    <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
            <h1 class="text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white">Flashcards</h1>
            <p class="text-neutral-500 dark:text-neutral-400 mt-1">
                {allCards.length} total · <span class="text-rose-500 font-semibold">{orphanCount} avulso{orphanCount !== 1 ? 's' : ''}</span> (sem caderno)
            </p>
        </div>
        {#if selected.size > 0}
            <button
                on:click={deleteSelected}
                disabled={isDeleting}
                class="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl transition disabled:opacity-50 shadow-sm"
            >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                {isDeleting ? 'Excluindo...' : `Excluir (${selected.size})`}
            </button>
        {/if}
    </div>

    <!-- Feedback -->
    {#if lastAction}
        <div class="flex items-center gap-3 px-5 py-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl text-sm font-medium text-emerald-800 dark:text-emerald-300">
            {lastAction}
            <button on:click={() => lastAction = ''} class="ml-auto text-emerald-500 hover:text-emerald-700">×</button>
        </div>
    {/if}

    <!-- Filters -->
    <div class="bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-neutral-200 dark:ring-neutral-700 p-4 flex flex-col sm:flex-row gap-3">
        <!-- Mode toggle -->
        <div class="flex rounded-xl overflow-hidden ring-1 ring-neutral-200 dark:ring-neutral-600 shrink-0">
            <button
                on:click={() => { filterMode = 'orphan'; selected = new Set(); }}
                class="px-4 py-2 text-sm font-bold transition {filterMode === 'orphan' ? 'bg-rose-600 text-white' : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700'}"
            >
                Avulsos ({orphanCount})
            </button>
            <button
                on:click={() => { filterMode = 'all'; selected = new Set(); }}
                class="px-4 py-2 text-sm font-bold transition {filterMode === 'all' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700'}"
            >
                Todos ({allCards.length})
            </button>
        </div>

        <!-- Search -->
        <div class="flex-1 relative">
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <input
                type="text"
                bind:value={searchQuery}
                placeholder="Buscar frente ou verso..."
                class="w-full pl-9 pr-4 py-2 text-sm rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white dark:placeholder-neutral-500"
            />
        </div>

        <!-- Type filter -->
        <select
            bind:value={filterType}
            class="shrink-0 px-3 py-2 text-sm font-bold rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 outline-none dark:text-white"
        >
            <option value="">Todos os tipos</option>
            <option value="CONCEITO">Conceito</option>
            <option value="FATO">Fato</option>
            <option value="PROCEDIMENTO">Procedimento</option>
        </select>
    </div>

    <!-- Cards list -->
    <div class="bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-neutral-200 dark:ring-neutral-700 overflow-hidden">

        <!-- List header -->
        <div class="px-5 py-3 border-b border-neutral-200 dark:border-neutral-700 flex items-center gap-3">
            <input
                type="checkbox"
                checked={allSelected}
                on:change={toggleAll}
                class="w-4 h-4 rounded accent-indigo-500 cursor-pointer"
                disabled={filtered.length === 0}
            />
            <span class="text-xs font-bold text-neutral-400 uppercase tracking-widest">
                {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
                {#if selected.size > 0}
                    · <span class="text-indigo-500">{selected.size} selecionado{selected.size !== 1 ? 's' : ''}</span>
                {/if}
            </span>
            <button on:click={loadData} class="ml-auto text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition">
                <svg class="w-4 h-4 {loading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            </button>
        </div>

        {#if loading}
            <div class="flex justify-center py-12">
                <div class="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
            </div>
        {:else if filtered.length === 0}
            <div class="py-16 text-center text-neutral-400 dark:text-neutral-500 text-sm">
                {filterMode === 'orphan' ? 'Nenhum card avulso encontrado.' : 'Nenhum resultado.'}
            </div>
        {:else}
            <div class="divide-y divide-neutral-100 dark:divide-neutral-700/50">
                {#each filtered as card (card.id)}
                    {@const isOrphan = !referencedIds.has(card.id)}
                    {@const notebook = notebookForCard(card.id)}
                    {@const criteria = extractCriteria(card.back)}
                    {@const answer = answerText(card.back)}
                    {@const isExpanded = expandedId === card.id}

                    <div class="transition-colors {selected.has(card.id) ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : 'hover:bg-neutral-50 dark:hover:bg-neutral-700/20'}">
                        <!-- Row -->
                        <div class="px-5 py-4 flex items-start gap-3">
                            <input
                                type="checkbox"
                                checked={selected.has(card.id)}
                                on:change={() => toggleCard(card.id)}
                                class="mt-0.5 w-4 h-4 rounded accent-indigo-500 cursor-pointer flex-shrink-0"
                            />

                            <!-- Main content -->
                            <button
                                on:click={() => expandedId = isExpanded ? null : card.id}
                                class="flex-1 text-left min-w-0"
                            >
                                <div class="flex items-start gap-2 flex-wrap">
                                    <p class="font-semibold text-neutral-800 dark:text-neutral-100 leading-snug">
                                        {card.front}
                                    </p>
                                </div>
                                <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                                    {#if card.type}
                                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border {typeBadgeClass(card.type)}">
                                            {card.type}
                                        </span>
                                    {/if}
                                    {#if isOrphan}
                                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-rose-500/10 text-rose-400 border-rose-500/20">
                                            avulso
                                        </span>
                                    {:else if notebook}
                                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
                                            📓 {notebook}
                                        </span>
                                    {/if}
                                    {#if criteria.length > 0}
                                        <span class="text-[10px] text-neutral-400">{criteria.length} critério{criteria.length !== 1 ? 's' : ''}</span>
                                    {/if}
                                    {#if card.tags?.length}
                                        {#each card.tags as tag}
                                            <span class="text-[10px] text-neutral-400 font-mono">#{tag}</span>
                                        {/each}
                                    {/if}
                                </div>
                            </button>

                            <!-- Expand chevron -->
                            <button
                                on:click={() => expandedId = isExpanded ? null : card.id}
                                class="shrink-0 p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition"
                                aria-label="Expandir"
                            >
                                <svg class="w-4 h-4 transition-transform {isExpanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                            </button>
                        </div>

                        <!-- Expanded detail -->
                        {#if isExpanded}
                            <div class="px-12 pb-5 space-y-3 animate-fade-in">
                                {#if answer}
                                    <div>
                                        <p class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Resposta</p>
                                        <p class="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap leading-relaxed">{answer}</p>
                                    </div>
                                {/if}
                                {#if criteria.length > 0}
                                    <div>
                                        <p class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Critérios</p>
                                        <ul class="space-y-1">
                                            {#each criteria as c}
                                                <li class="flex items-start gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                                                    <span class="mt-1 w-3 h-3 rounded border border-neutral-400 flex-shrink-0 inline-block"></span>
                                                    {c}
                                                </li>
                                            {/each}
                                        </ul>
                                    </div>
                                {/if}
                                <div class="flex items-center justify-between pt-1">
                                    <span class="text-[10px] text-neutral-400 font-mono">id: {card.id}</span>
                                    <button
                                        on:click={() => { toggleCard(card.id); }}
                                        class="text-xs font-bold px-3 py-1.5 rounded-lg transition
                                            {selected.has(card.id)
                                                ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                                                : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40'}"
                                    >
                                        {selected.has(card.id) ? '✓ Selecionado' : 'Selecionar para excluir'}
                                    </button>
                                </div>
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}
    </div>

    <!-- Bottom action bar (sticky when selection active) -->
    {#if selected.size > 0}
        <div class="sticky bottom-4 flex justify-center">
            <div class="inline-flex items-center gap-3 px-5 py-3 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-2xl shadow-2xl">
                <span class="text-sm font-bold">{selected.size} selecionado{selected.size !== 1 ? 's' : ''}</span>
                <button on:click={() => selected = new Set()} class="text-xs text-neutral-400 dark:text-neutral-600 hover:text-white dark:hover:text-neutral-900 transition">Limpar</button>
                <button
                    on:click={deleteSelected}
                    disabled={isDeleting}
                    class="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm rounded-xl transition disabled:opacity-50"
                >
                    {isDeleting ? 'Excluindo...' : 'Excluir'}
                </button>
            </div>
        </div>
    {/if}
</div>

<style>
    .animate-fade-in { animation: fadeIn 0.15s ease forwards; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
</style>
