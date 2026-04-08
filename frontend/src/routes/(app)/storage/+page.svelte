<script lang="ts">
    import { onMount } from 'svelte';
    import { db, type Notebook, type SavedFilter, type Flashcard } from '$lib/db';
    import { getStorageInfo, pruneOldMedia, clearMediaCache, type StorageInfo } from '$lib/mediaCache';
    import { clearCyankiData } from '$lib/db';
    import { syncEngine } from '$lib/sync';
    import { markNotebooksDeleted, markFlashcardsDeleted } from '$lib/localDeletions';

    // ─── Storage overview ─────────────────────────────────────────────────────
    let storageInfo: StorageInfo | null = null;
    let loadingStorage = true;

    // ─── Per-table counts ─────────────────────────────────────────────────────
    let counts = {
        flashcards: 0,
        notebooks: 0,
        reviewLogs: 0,
        syncQueue: 0,
        challenges: 0,
        studyGoals: 0,
        savedFilters: 0,
    };

    // ─── Content packages (notebooks + saved filters as exportable units) ─────
    let notebooks: Notebook[] = [];
    let savedFilters: SavedFilter[] = [];
    let flashcards: Flashcard[] = [];

    // ─── UI state ─────────────────────────────────────────────────────────────
    let pruneAge = 30;        // days for media prune
    let logsPruneAge = 90;   // days for old review log cleanup
    let isPruning = false;
    let isPruningLogs = false;
    let isExporting: string | null = null; // notebook id / filter id being exported
    let isDeletingNotebook: string | null = null;
    let confirmClearAll = false;
    let isClearingAll = false;
    let isReuploadingAll = false;
    let reuploadStatus = '';
    let lastAction = '';

    const PACKAGE_SIZE = 500; // cards per export package

    onMount(async () => {
        await refresh();
    });

    async function refresh() {
        loadingStorage = true;
        try {
            [
                storageInfo,
                counts.flashcards,
                counts.notebooks,
                counts.reviewLogs,
                counts.syncQueue,
                counts.challenges,
                counts.studyGoals,
                counts.savedFilters,
                notebooks,
                savedFilters,
                flashcards
            ] = await Promise.all([
                getStorageInfo(),
                db.flashcards.count(),
                db.notebooks.count(),
                db.reviewLogs.count(),
                db.syncQueue.count(),
                db.challenges.count(),
                db.studyGoals.count(),
                db.savedFilters.count(),
                db.notebooks.orderBy('updatedAt').reverse().toArray(),
                db.savedFilters.orderBy('createdAt').reverse().toArray(),
                db.flashcards.toArray(),
            ]);
        } finally {
            loadingStorage = false;
        }
    }

    // ─── Bytes formatter ──────────────────────────────────────────────────────
    function formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
        return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
    }

    // ─── Cards per notebook (approximate via content NanoID matching) ─────────
    function cardsForNotebook(nb: Notebook): number {
        // Cards belonging to a notebook have their IDs embedded in the content
        // Each Q:/A: block has a <!--id:XXX--> tag injected by the parser
        const matches = nb.content.match(/<!--\s*id:\s*[\w-]+\s*-->/g);
        return matches ? matches.length : 0;
    }

    // ─── Cards for a saved filter ─────────────────────────────────────────────
    function cardsForFilter(sf: SavedFilter): number {
        let pool = flashcards;
        if (sf.criteria.tags?.length) {
            pool = pool.filter(c => sf.criteria.tags.every(t => c.tags?.includes(t)));
        }
        if (sf.criteria.keyword?.trim()) {
            const q = sf.criteria.keyword.toLowerCase();
            pool = pool.filter(c =>
                c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q)
            );
        }
        return pool.length;
    }

    // ─── Export package as JSON (chunked at PACKAGE_SIZE) ────────────────────
    async function exportNotebookPackage(nb: Notebook) {
        isExporting = nb.id;
        try {
            // Find all card IDs referenced in the notebook
            const idMatches = nb.content.match(/<!--\s*id:\s*([\w-]+)\s*-->/g) ?? [];
            const cardIds = idMatches.map(m => m.match(/<!--\s*id:\s*([\w-]+)\s*-->/)?.[1] ?? '');
            const cards = cardIds.length
                ? await db.flashcards.where('id').anyOf(cardIds).toArray()
                : [];

            // Chunk into packages of PACKAGE_SIZE
            const chunks = chunkArray(cards, PACKAGE_SIZE);
            chunks.forEach((chunk, i) => {
                const payload = {
                    source: 'Cyanki',
                    notebook: nb.title,
                    exportedAt: new Date().toISOString(),
                    package: i + 1,
                    totalPackages: chunks.length,
                    cards: chunk.map(c => ({ id: c.id, front: c.front, back: c.back, tags: c.tags }))
                };
                downloadJSON(payload, `${slugify(nb.title)}_pkg${i + 1}.json`);
            });

            lastAction = `📦 ${chunks.length} pacote(s) exportados: "${nb.title}"`;
        } finally {
            isExporting = null;
        }
    }

    async function exportFilterPackage(sf: SavedFilter) {
        isExporting = sf.id;
        try {
            let pool = flashcards;
            if (sf.criteria.tags?.length) {
                pool = pool.filter(c => sf.criteria.tags.every(t => c.tags?.includes(t)));
            }
            if (sf.criteria.keyword?.trim()) {
                const q = sf.criteria.keyword.toLowerCase();
                pool = pool.filter(c =>
                    c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q)
                );
            }

            const chunks = chunkArray(pool, PACKAGE_SIZE);
            chunks.forEach((chunk, i) => {
                const payload = {
                    source: 'Cyanki',
                    filter: sf.name,
                    criteria: sf.criteria,
                    exportedAt: new Date().toISOString(),
                    package: i + 1,
                    totalPackages: chunks.length,
                    cards: chunk.map(c => ({ id: c.id, front: c.front, back: c.back, tags: c.tags }))
                };
                downloadJSON(payload, `${slugify(sf.name)}_pkg${i + 1}.json`);
            });

            lastAction = `📦 ${chunks.length} pacote(s) exportados: "${sf.name}"`;
        } finally {
            isExporting = null;
        }
    }

    // ─── Delete a notebook and its associated cards ───────────────────────────
    async function deleteNotebook(nb: Notebook) {
        if (!confirm(`Excluir o caderno "${nb.title}" e todos os seus flashcards? Esta ação não pode ser desfeita.`)) return;
        isDeletingNotebook = nb.id;
        try {
            const idMatches = nb.content.match(/<!--\s*id:\s*([\w-]+)\s*-->/g) ?? [];
            const cardIds = idMatches.map(m => m.match(/<!--\s*id:\s*([\w-]+)\s*-->/)?.[1] ?? '');
            // Tombstone before deleting so pull never re-inserts
            markNotebooksDeleted([nb.id]);
            if (cardIds.length) markFlashcardsDeleted(cardIds);
            await db.transaction('rw', db.notebooks, db.flashcards, async () => {
                await db.notebooks.delete(nb.id);
                if (cardIds.length) await db.flashcards.bulkDelete(cardIds);
            });
            // Enqueue server-side deletions
            await syncEngine.enqueue('DELETE', 'NOTEBOOK', nb.id, {});
            for (const cardId of cardIds) {
                await syncEngine.enqueue('DELETE', 'FLASHCARD', cardId, {});
            }
            lastAction = `🗑 Caderno "${nb.title}" excluído (${cardIds.length} cards removidos). Sincronização enfileirada.`;
            await refresh();
        } finally {
            isDeletingNotebook = null;
        }
    }

    // ─── Orphan flashcards (not referenced by any notebook) ─────────────────
    let orphanCards: Flashcard[] = [];
    let isDeletingOrphans = false;
    let selectedOrphans = new Set<string>();

    $: {
        if (flashcards.length > 0 && notebooks.length >= 0) {
            const referenced = new Set<string>();
            for (const nb of notebooks) {
                const matches = nb.content.match(/<!--\s*id:\s*([\w-]+)\s*-->/g) ?? [];
                for (const m of matches) { const id = m.match(/<!--\s*id:\s*([\w-]+)\s*-->/)?.[1]; if (id) referenced.add(id); }
            }
            orphanCards = flashcards.filter(fc => !referenced.has(fc.id));
        } else {
            orphanCards = [];
        }
    }

    function toggleOrphan(id: string) {
        if (selectedOrphans.has(id)) selectedOrphans.delete(id);
        else selectedOrphans.add(id);
        selectedOrphans = new Set(selectedOrphans);
    }

    function toggleAllOrphans() {
        if (selectedOrphans.size === orphanCards.length) selectedOrphans = new Set();
        else selectedOrphans = new Set(orphanCards.map(c => c.id));
    }

    async function deleteSelectedOrphans() {
        if (selectedOrphans.size === 0) return;
        if (!confirm(`Excluir ${selectedOrphans.size} card(s) avulso(s)? Esta ação não pode ser desfeita.`)) return;
        isDeletingOrphans = true;
        try {
            const ids = [...selectedOrphans];
            markFlashcardsDeleted(ids);
            await db.flashcards.bulkDelete(ids);
            for (const id of ids) {
                await syncEngine.enqueue('DELETE', 'FLASHCARD', id, {});
            }
            selectedOrphans = new Set();
            lastAction = `🗑 ${ids.length} card(s) avulso(s) excluído(s). Sincronização enfileirada.`;
            await refresh();
        } finally {
            isDeletingOrphans = false;
        }
    }

    // ─── Force full re-upload (recovery after server DB reset) ───────────────
    async function reuploadAll() {
        if (!confirm(`Re-enviar todos os dados locais para o servidor?\n\nIsso enfileira CREATE para ${counts.notebooks} caderno(s) e ${counts.flashcards} flashcard(s). Use quando os dados do servidor estiverem desatualizados em relação ao dispositivo atual.`)) return;
        isReuploadingAll = true;
        reuploadStatus = '';
        try {
            const [allNotebooks, allFlashcards] = await Promise.all([
                db.notebooks.toArray(),
                db.flashcards.toArray(),
            ]);

            let queued = 0;
            for (const nb of allNotebooks) {
                await syncEngine.enqueue('CREATE', 'NOTEBOOK', nb.id, {
                    title: nb.title,
                    content: nb.content,
                    isPublic: false
                });
                queued++;
                reuploadStatus = `Enfileirando... ${queued}/${allNotebooks.length + allFlashcards.length}`;
            }
            for (const fc of allFlashcards) {
                await syncEngine.enqueue('CREATE', 'FLASHCARD', fc.id, {
                    front: fc.front,
                    back: fc.back,
                    tags: fc.tags ?? [],
                    type: fc.type
                });
                queued++;
                reuploadStatus = `Enfileirando... ${queued}/${allNotebooks.length + allFlashcards.length}`;
            }

            lastAction = `↑ ${allNotebooks.length} caderno(s) e ${allFlashcards.length} flashcard(s) enfileirados para re-envio.`;
            reuploadStatus = '';
            await refresh();
        } finally {
            isReuploadingAll = false;
        }
    }

    // ─── Prune old media ──────────────────────────────────────────────────────
    async function pruneMedia() {
        isPruning = true;
        try {
            const removed = await pruneOldMedia(pruneAge * 24 * 60 * 60 * 1000);
            lastAction = `🧹 ${removed} arquivo(s) de mídia antigos removidos.`;
            await refresh();
        } finally {
            isPruning = false;
        }
    }

    async function clearAllMedia() {
        if (!confirm('Limpar todo o cache de mídia? As imagens serão recarregadas da internet quando necessário.')) return;
        await clearMediaCache();
        lastAction = '🧹 Cache de mídia limpo.';
        await refresh();
    }

    // ─── Prune old review logs ────────────────────────────────────────────────
    async function pruneOldLogs() {
        if (!confirm(`Excluir revisões com mais de ${logsPruneAge} dias? O histórico antigo será perdido.`)) return;
        isPruningLogs = true;
        try {
            const cutoff = Date.now() - logsPruneAge * 24 * 60 * 60 * 1000;
            const removed = await db.reviewLogs.where('reviewedAt').below(cutoff).delete();
            lastAction = `🧹 ${removed} revisão(ões) antigas removidas.`;
            await refresh();
        } finally {
            isPruningLogs = false;
        }
    }

    // ─── Clear all data ───────────────────────────────────────────────────────
    async function clearAll() {
        isClearingAll = true;
        try {
            // Collect IDs before wiping so we can enqueue DELETEs after
            const [allNotebooks, allFlashcards] = await Promise.all([
                db.notebooks.toArray(),
                db.flashcards.toArray(),
            ]);

            // Tombstone all IDs before wiping so pull can never re-insert them
            markNotebooksDeleted(allNotebooks.map(n => n.id));
            markFlashcardsDeleted(allFlashcards.map(f => f.id));

            await clearCyankiData();

            // Re-enqueue DELETE operations so the server also removes the data on next sync
            for (const nb of allNotebooks) {
                await db.syncQueue.add({ action: 'DELETE', entityType: 'NOTEBOOK', entityId: nb.id, payload: {}, createdAt: Date.now() });
            }
            for (const fc of allFlashcards) {
                await db.syncQueue.add({ action: 'DELETE', entityType: 'FLASHCARD', entityId: fc.id, payload: {}, createdAt: Date.now() });
            }

            syncEngine.triggerSync();
            lastAction = `⚠️ Dados locais apagados. ${allNotebooks.length} caderno(s) e ${allFlashcards.length} card(s) enfileirados para deleção no servidor.`;
            confirmClearAll = false;
            await refresh();
        } finally {
            isClearingAll = false;
        }
    }

    // ─── Utilities ────────────────────────────────────────────────────────────
    function chunkArray<T>(arr: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
        return chunks;
    }

    function downloadJSON(data: unknown, filename: string) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    function slugify(s: string): string {
        return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    }

    function formatDate(ts: number) {
        return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    // ─── Ring chart helper ────────────────────────────────────────────────────
    const R = 52;
    const CIRC = 2 * Math.PI * R;
    $: ringOffset = storageInfo ? CIRC * (1 - Math.min(storageInfo.percent / 100, 1)) : CIRC;
    $: ringColor = storageInfo
        ? storageInfo.percent >= 85 ? '#f43f5e'
        : storageInfo.percent >= 60 ? '#f59e0b'
        : '#6366f1'
        : '#6366f1';
</script>

<div class="max-w-4xl mx-auto py-8 space-y-6 px-4">

    <!-- Header -->
    <div>
        <h1 class="text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white">Armazenamento</h1>
        <p class="text-neutral-500 dark:text-neutral-400 mt-1">Gerencie o espaço offline, exporte pacotes e limpe dados desnecessários.</p>
    </div>

    <!-- Action feedback -->
    {#if lastAction}
        <div class="flex items-center gap-3 px-5 py-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl text-sm font-medium text-emerald-800 dark:text-emerald-300">
            {lastAction}
            <button on:click={() => lastAction = ''} class="ml-auto text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300">×</button>
        </div>
    {/if}

    <!-- ── Storage overview ────────────────────────────────────────────────── -->
    <section class="bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-neutral-200 dark:ring-neutral-700 p-6">
        <h2 class="text-sm font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-5">Uso de Espaço</h2>

        {#if loadingStorage}
            <div class="flex justify-center py-8">
                <div class="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
            </div>
        {:else if storageInfo}
            <div class="flex flex-col sm:flex-row items-center gap-8">

                <!-- Ring chart -->
                <div class="relative shrink-0">
                    <svg width="140" height="140" viewBox="0 0 140 140">
                        <circle cx="70" cy="70" r={R} fill="none" stroke="#e5e7eb" class="dark:stroke-neutral-700" stroke-width="14"/>
                        <circle cx="70" cy="70" r={R} fill="none"
                            stroke={ringColor}
                            stroke-width="14"
                            stroke-dasharray={CIRC}
                            stroke-dashoffset={ringOffset}
                            stroke-linecap="round"
                            transform="rotate(-90 70 70)"
                            class="transition-all duration-700"
                        />
                    </svg>
                    <div class="absolute inset-0 flex flex-col items-center justify-center">
                        <span class="text-2xl font-black text-neutral-800 dark:text-white">{storageInfo.percent.toFixed(1)}%</span>
                        <span class="text-xs text-neutral-400 font-bold">usado</span>
                    </div>
                </div>

                <!-- Stats -->
                <div class="flex-1 space-y-3 w-full">
                    <div class="flex justify-between text-sm">
                        <span class="text-neutral-500 dark:text-neutral-400">Total usado</span>
                        <span class="font-black text-neutral-800 dark:text-white">{formatBytes(storageInfo.usage)}</span>
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-neutral-500 dark:text-neutral-400">Cota disponível</span>
                        <span class="font-bold text-neutral-600 dark:text-neutral-300">{formatBytes(storageInfo.quota)}</span>
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-neutral-500 dark:text-neutral-400">Cache de mídia</span>
                        <span class="font-bold text-indigo-600 dark:text-indigo-400">
                            {formatBytes(storageInfo.mediaCacheSize)}
                            <span class="text-neutral-400 font-normal">({storageInfo.mediaCacheCount} arquivos)</span>
                        </span>
                    </div>
                    <div class="w-full h-2.5 bg-neutral-100 dark:bg-neutral-700 rounded-full overflow-hidden mt-2">
                        <div class="h-full rounded-full transition-all duration-700"
                            style="width: {Math.min(storageInfo.percent, 100)}%; background: {ringColor}">
                        </div>
                    </div>

                    <!-- Per-table counts -->
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                        {#each [
                            ['Flashcards', counts.flashcards, 'text-indigo-600 dark:text-indigo-400'],
                            ['Cadernos', counts.notebooks, 'text-violet-600 dark:text-violet-400'],
                            ['Revisões', counts.reviewLogs, 'text-amber-600 dark:text-amber-400'],
                            ['Desafios', counts.challenges, 'text-emerald-600 dark:text-emerald-400'],
                        ] as [label, count, cls]}
                            <div class="p-2.5 bg-neutral-50 dark:bg-neutral-900/50 rounded-xl text-center">
                                <div class="text-lg font-black {cls}">{count}</div>
                                <div class="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">{label}</div>
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
        {/if}
    </section>

    <!-- ── Content packages: Notebooks ───────────────────────────────────────── -->
    <section class="bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-neutral-200 dark:ring-neutral-700 overflow-hidden">
        <div class="px-6 py-4 border-b border-neutral-200 dark:border-neutral-700">
            <h2 class="text-sm font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Pacotes — Cadernos</h2>
            <p class="text-xs text-neutral-400 mt-0.5">Exporte flashcards de cada caderno em pacotes de até {PACKAGE_SIZE} cards.</p>
        </div>

        {#if notebooks.length === 0}
            <div class="px-6 py-8 text-center text-neutral-400 dark:text-neutral-500 text-sm">Nenhum caderno criado.</div>
        {:else}
            <div class="divide-y divide-neutral-100 dark:divide-neutral-700/50">
                {#each notebooks as nb (nb.id)}
                    {@const cardCount = cardsForNotebook(nb)}
                    {@const pkgCount = Math.ceil(cardCount / PACKAGE_SIZE) || 1}
                    <div class="px-6 py-4 flex items-center gap-4">
                        <div class="flex-1 min-w-0">
                            <p class="font-bold text-neutral-800 dark:text-neutral-100 truncate">📓 {nb.title}</p>
                            <p class="text-xs text-neutral-400 mt-0.5">
                                ~{cardCount} cards · {pkgCount} pacote{pkgCount !== 1 ? 's' : ''} · Atualizado {formatDate(nb.updatedAt)}
                            </p>
                        </div>
                        <div class="flex gap-2 shrink-0">
                            <button
                                on:click={() => exportNotebookPackage(nb)}
                                disabled={isExporting === nb.id}
                                class="px-3 py-1.5 text-xs font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-lg transition disabled:opacity-50"
                            >
                                {isExporting === nb.id ? '...' : '⬇ Exportar'}
                            </button>
                            <button
                                on:click={() => deleteNotebook(nb)}
                                disabled={isDeletingNotebook === nb.id}
                                class="px-3 py-1.5 text-xs font-bold bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40 rounded-lg transition disabled:opacity-50"
                            >
                                {isDeletingNotebook === nb.id ? '...' : '🗑 Excluir'}
                            </button>
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </section>

    <!-- ── Content packages: Saved Filters ───────────────────────────────────── -->
    <section class="bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-neutral-200 dark:ring-neutral-700 overflow-hidden">
        <div class="px-6 py-4 border-b border-neutral-200 dark:border-neutral-700">
            <h2 class="text-sm font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Pacotes — Filtros Salvos</h2>
            <p class="text-xs text-neutral-400 mt-0.5">Exporte as questões de cada filtro em pacotes de até {PACKAGE_SIZE} cards.</p>
        </div>

        {#if savedFilters.length === 0}
            <div class="px-6 py-8 text-center text-neutral-400 dark:text-neutral-500 text-sm">Nenhum filtro salvo.</div>
        {:else}
            <div class="divide-y divide-neutral-100 dark:divide-neutral-700/50">
                {#each savedFilters as sf (sf.id)}
                    {@const cardCount = cardsForFilter(sf)}
                    {@const pkgCount = Math.ceil(cardCount / PACKAGE_SIZE) || 1}
                    <div class="px-6 py-4 flex items-center gap-4">
                        <div class="flex-1 min-w-0">
                            <p class="font-bold text-neutral-800 dark:text-neutral-100 truncate">📁 {sf.name}</p>
                            <p class="text-xs text-neutral-400 mt-0.5">
                                {cardCount} cards · {pkgCount} pacote{pkgCount !== 1 ? 's' : ''} · Tags: {sf.criteria.tags.join(', ') || '—'}
                            </p>
                        </div>
                        <button
                            on:click={() => exportFilterPackage(sf)}
                            disabled={isExporting === sf.id}
                            class="shrink-0 px-3 py-1.5 text-xs font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-lg transition disabled:opacity-50"
                        >
                            {isExporting === sf.id ? '...' : '⬇ Exportar'}
                        </button>
                    </div>
                {/each}
            </div>
        {/if}
    </section>

    <!-- ── Orphan flashcards ─────────────────────────────────────────────────── -->
    <section class="bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-neutral-200 dark:ring-neutral-700 overflow-hidden">
        <div class="px-6 py-4 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between gap-4">
            <div>
                <h2 class="text-sm font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Cards Avulsos</h2>
                <p class="text-xs text-neutral-400 mt-0.5">Flashcards que não pertencem a nenhum caderno. <a href="/flashcards" class="text-indigo-500 hover:underline">Gerenciar todos os flashcards →</a></p>
            </div>
            {#if orphanCards.length > 0}
                <div class="flex items-center gap-2 shrink-0">
                    <button on:click={toggleAllOrphans} class="px-3 py-1.5 text-xs font-bold bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-600 rounded-lg transition">
                        {selectedOrphans.size === orphanCards.length ? 'Desmarcar todos' : 'Selecionar todos'}
                    </button>
                    {#if selectedOrphans.size > 0}
                        <button on:click={deleteSelectedOrphans} disabled={isDeletingOrphans} class="px-3 py-1.5 text-xs font-bold bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40 rounded-lg transition disabled:opacity-50">
                            {isDeletingOrphans ? '...' : `🗑 Excluir (${selectedOrphans.size})`}
                        </button>
                    {/if}
                </div>
            {/if}
        </div>

        {#if orphanCards.length === 0}
            <div class="px-6 py-8 text-center text-neutral-400 dark:text-neutral-500 text-sm">Nenhum card avulso encontrado.</div>
        {:else}
            <div class="divide-y divide-neutral-100 dark:divide-neutral-700/50 max-h-80 overflow-y-auto">
                {#each orphanCards as fc (fc.id)}
                    <label class="px-6 py-3 flex items-start gap-3 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition">
                        <input
                            type="checkbox"
                            checked={selectedOrphans.has(fc.id)}
                            on:change={() => toggleOrphan(fc.id)}
                            class="mt-0.5 w-4 h-4 rounded accent-rose-500 cursor-pointer flex-shrink-0"
                        />
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-semibold text-neutral-800 dark:text-neutral-200 truncate">{fc.front}</p>
                            <p class="text-xs text-neutral-400 truncate mt-0.5">{fc.back.slice(0, 80)}{fc.back.length > 80 ? '…' : ''}</p>
                        </div>
                        {#if fc.type}
                            <span class="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border
                                {fc.type === 'CONCEITO' ? 'bg-violet-500/10 text-violet-400 border-violet-500/20' :
                                 fc.type === 'FATO' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}">
                                {fc.type}
                            </span>
                        {/if}
                    </label>
                {/each}
            </div>
        {/if}
    </section>

    <!-- ── Cleanup tools ──────────────────────────────────────────────────────── -->
    <section class="bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-neutral-200 dark:ring-neutral-700 p-6 space-y-5">
        <h2 class="text-sm font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Ferramentas de Limpeza</h2>

        <!-- Media cache prune -->
        <div class="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-xl">
            <div class="flex-1">
                <p class="font-bold text-sm text-neutral-800 dark:text-neutral-200">Cache de Mídia</p>
                <p class="text-xs text-neutral-400 mt-0.5">
                    Remove imagens antigas do cache local.
                    {#if storageInfo}
                        Atual: <strong>{formatBytes(storageInfo.mediaCacheSize)}</strong> ({storageInfo.mediaCacheCount} arquivos)
                    {/if}
                </p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <select bind:value={pruneAge} class="p-2 text-xs font-bold rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600 outline-none dark:text-white">
                    <option value={7}>+7 dias</option>
                    <option value={14}>+14 dias</option>
                    <option value={30}>+30 dias</option>
                </select>
                <button on:click={pruneMedia} disabled={isPruning} class="px-3 py-2 text-xs font-bold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-lg transition disabled:opacity-50">
                    {isPruning ? 'Limpando...' : 'Limpar antigos'}
                </button>
                <button on:click={clearAllMedia} class="px-3 py-2 text-xs font-bold bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40 rounded-lg transition">
                    Limpar tudo
                </button>
            </div>
        </div>

        <!-- Review log prune -->
        <div class="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-xl">
            <div class="flex-1">
                <p class="font-bold text-sm text-neutral-800 dark:text-neutral-200">Revisões Antigas</p>
                <p class="text-xs text-neutral-400 mt-0.5">
                    Remove registros de revisão mais antigos que o limite. O FSRS continua funcionando com revisões recentes.
                    Atual: <strong>{counts.reviewLogs.toLocaleString('pt-BR')} registros</strong>
                </p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <select bind:value={logsPruneAge} class="p-2 text-xs font-bold rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600 outline-none dark:text-white">
                    <option value={30}>+30 dias</option>
                    <option value={60}>+60 dias</option>
                    <option value={90}>+90 dias</option>
                    <option value={180}>+180 dias</option>
                </select>
                <button on:click={pruneOldLogs} disabled={isPruningLogs} class="px-3 py-2 text-xs font-bold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-lg transition disabled:opacity-50">
                    {isPruningLogs ? 'Limpando...' : 'Limpar antigos'}
                </button>
            </div>
        </div>

        <!-- Force re-upload -->
        <div class="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-xl">
            <div class="flex-1">
                <p class="font-bold text-sm text-neutral-800 dark:text-neutral-200">Re-enviar tudo ao servidor</p>
                <p class="text-xs text-neutral-400 mt-0.5">
                    Útil quando outro dispositivo está com dados diferentes (ex: após reset do banco). Enfileira CREATE para todos os cadernos e flashcards locais — o servidor irá mesclar sem duplicar.
                </p>
                {#if reuploadStatus}
                    <p class="text-xs text-indigo-500 font-semibold mt-1">{reuploadStatus}</p>
                {/if}
            </div>
            <button
                on:click={reuploadAll}
                disabled={isReuploadingAll}
                class="shrink-0 px-3 py-2 text-xs font-bold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-lg transition disabled:opacity-50"
            >
                {isReuploadingAll ? reuploadStatus || 'Enfileirando...' : '↑ Re-enviar tudo'}
            </button>
        </div>

        <!-- Danger zone -->
        <div class="p-4 bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800/50 rounded-xl space-y-3">
            <div>
                <p class="font-bold text-sm text-rose-800 dark:text-rose-300">Zona de Perigo</p>
                <p class="text-xs text-rose-600/80 dark:text-rose-400/70 mt-0.5">Apaga <strong>todos</strong> os dados locais: flashcards, cadernos, revisões, filtros, desafios e cache de mídia. Irreversível.</p>
            </div>

            {#if !confirmClearAll}
                <button on:click={() => confirmClearAll = true} class="px-4 py-2 text-xs font-black bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 hover:bg-rose-200 dark:hover:bg-rose-900/50 rounded-lg transition border border-rose-200 dark:border-rose-700">
                    Apagar todos os dados locais
                </button>
            {:else}
                <div class="flex items-center gap-3">
                    <span class="text-xs font-bold text-rose-700 dark:text-rose-400">Confirmar exclusão total?</span>
                    <button on:click={clearAll} disabled={isClearingAll} class="px-4 py-2 text-xs font-black bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition disabled:opacity-50">
                        {isClearingAll ? 'Apagando...' : 'Sim, apagar tudo'}
                    </button>
                    <button on:click={() => confirmClearAll = false} class="px-3 py-2 text-xs font-bold text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition">
                        Cancelar
                    </button>
                </div>
            {/if}
        </div>
    </section>

    <!-- Refresh button -->
    <div class="flex justify-end">
        <button on:click={refresh} disabled={loadingStorage} class="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-white border border-neutral-200 dark:border-neutral-700 rounded-xl transition disabled:opacity-50">
            <svg class="w-4 h-4 {loadingStorage ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            Atualizar
        </button>
    </div>

</div>
