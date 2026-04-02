<script lang="ts">
    import { onMount } from 'svelte';
    import { db, type Flashcard, type SavedFilter } from '$lib/db';
    import { nanoid } from 'nanoid';

    // Tabs state
    let activeTab: 'filter_form' | 'results' | 'saved_filters' = 'filter_form';

    // Forms & Filters State
    let keywordQuery = '';
    let selectedDifficulty = 'all'; // all, easy, medium, hard
    
    // Nested Tags
    let tagDisciplines = '';
    let tagSubjects = '';
    let tagModality = '';
    let tagArea = '';

    // Results State
    let flashcards: Flashcard[] = [];
    let displayedFlashcards: Flashcard[] = [];
    let currentPage = 1;
    let itemsPerPage = 20;
    let hasMore = false;
    let isLoading = false;
    let sortBy = 'newest';

    // Saved Filters
    let savedFilters: SavedFilter[] = [];
    let filterSaveName = '';

    onMount(async () => {
        await loadSavedFilters();
    });

    async function loadSavedFilters() {
        savedFilters = await db.savedFilters.orderBy('createdAt').reverse().toArray();
    }

    // Helper: Combines all tag inputs into a unified array
    function getCompiledTags(): string[] {
        const pool = [tagDisciplines, tagSubjects, tagModality, tagArea];
        let compiled: string[] = [];
        pool.forEach(str => {
            if (str.trim()) {
                const parts = str.split(',').map(p => p.trim()).filter(Boolean);
                compiled = [...compiled, ...parts];
            }
        });
        return [...new Set(compiled)]; // unique tags
    }

    async function applyFilters(resetPage = true) {
        if (resetPage) {
            currentPage = 1;
            displayedFlashcards = [];
        }
        isLoading = true;
        activeTab = 'results';

        try {
            const compiledTags = getCompiledTags();
            let baseQuery = db.flashcards;
            let results: Flashcard[] = [];

            // Step 1: Dexie Index for Tags (most restrictive)
            if (compiledTags.length > 0) {
                const firstTag = compiledTags[0];
                const initialSet = await baseQuery.where('tags').equals(firstTag).toArray();
                
                results = initialSet.filter(card => {
                    return compiledTags.every(tag => card.tags?.includes(tag));
                });
            } else {
                results = await baseQuery.orderBy('createdAt').reverse().toArray();
            }

            // Step 2: In-memory refinement
            if (keywordQuery.trim()) {
                const q = keywordQuery.toLowerCase();
                results = results.filter(c => 
                    c.front.toLowerCase().includes(q) || 
                    c.back.toLowerCase().includes(q)
                );
            }

            // Pseudo-Difficulty parsing (usually derived from FSRS state or explicit tags in the future)
            // For now, if difficulty is used, we look for explicit tags #easy, #medium, #hard mapped to the cards
            if (selectedDifficulty !== 'all') {
                 results = results.filter(card => card.tags?.includes(selectedDifficulty));
            }

            // Sort logic
            results.sort((a, b) => {
                if(sortBy === 'newest') return b.createdAt - a.createdAt;
                if(sortBy === 'oldest') return a.createdAt - b.createdAt;
                return 0; // fallback Custom Sorts like Difficulty require FSRS state mapping
            });

            flashcards = results;
            updatePagination();
        } finally {
            isLoading = false;
        }
    }

    function updatePagination() {
        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        
        if (currentPage === 1) {
            displayedFlashcards = flashcards.slice(0, end);
        } else {
            displayedFlashcards = [...displayedFlashcards, ...flashcards.slice(start, end)];
        }
        hasMore = end < flashcards.length;
    }

    function loadMore() {
        if (!hasMore || isLoading) return;
        currentPage++;
        updatePagination();
    }

    // Filter Persistence
    async function saveCurrentFilter() {
        if (!filterSaveName.trim()) {
            alert("Nome do filtro é obrigatório.");
            return;
        }

        const criteriaObj = {
            tags: getCompiledTags(),
            keyword: keywordQuery.trim(),
            difficulty: selectedDifficulty
        };

        const newFilter: SavedFilter = {
            id: nanoid(),
            name: filterSaveName.trim(),
            criteria: criteriaObj,
            createdAt: Date.now()
        };

        await db.savedFilters.add(newFilter);
        filterSaveName = '';
        await loadSavedFilters();
        activeTab = 'saved_filters';
    }

    function editFilter(filterId: string) {
        const f = savedFilters.find(x => x.id === filterId);
        if (!f) return;

        // Reset and populate form
        keywordQuery = f.criteria.keyword || '';
        selectedDifficulty = f.criteria.difficulty || 'all';
        
        // Since we unified tags, we just dump them into subjects as a raw import for now in edit mode
        tagSubjects = f.criteria.tags ? f.criteria.tags.join(', ') : '';
        tagDisciplines = '';
        tagModality = '';
        tagArea = '';

        activeTab = 'filter_form';
    }

    async function deleteSavedFilter(filterId: string) {
        if(confirm("Tem certeza que deseja deletar este filtro salvo?")) {
            await db.savedFilters.delete(filterId);
            await loadSavedFilters();
        }
    }

    function parseDate(ms: number) {
        return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    }

</script>

<div class="space-y-6">
    
    <!-- Sub-Navbar for Questões -->
    <div class="bg-white dark:bg-neutral-800 rounded-xl shadow-sm p-1.5 ring-1 ring-neutral-200 dark:ring-neutral-700 flex max-w-md mx-auto relative overflow-hidden">
        <div class="absolute inset-y-1.5 transition-transform duration-300 ease-spring rounded-lg bg-indigo-50 dark:bg-indigo-900/40 {activeTab === 'filter_form' ? 'left-1.5 w-[46%]' : activeTab === 'results' ? 'left-[0%] w-[0%] opacity-0' : 'left-[51%] w-[47%]'}" style="z-index: 0;"></div>
        
        <button on:click={() => activeTab = 'filter_form'} class="flex-1 px-4 py-2 font-bold text-sm rounded-lg transition-colors z-10 {activeTab === 'filter_form' ? 'text-indigo-700 dark:text-indigo-300' : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400'}">Filtro de Questões</button>
        <button on:click={() => activeTab = 'saved_filters'} class="flex-1 px-4 py-2 font-bold text-sm rounded-lg transition-colors z-10 {activeTab === 'saved_filters' ? 'text-indigo-700 dark:text-indigo-300' : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400'}">Filtros Salvos</button>
    </div>

    <!-- TAB 1: FORMULÁRIO DE FILTRO -->
    {#if activeTab === 'filter_form'}
        <div class="bg-white dark:bg-neutral-800 rounded-2xl p-6 md:p-8 shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 max-w-3xl mx-auto space-y-6 animate-fade-in">
            <div>
                <h2 class="text-xl font-extrabold text-neutral-800 dark:text-neutral-100 flex items-center gap-2">
                    <svg class="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                    Busca Detalhada
                </h2>
                <p class="text-sm text-neutral-500 mt-1">Configure os parâmetros para seu bloco de estudos operando 100% offline.</p>
            </div>

            <!-- Palavra chave & Dificuldade -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="md:col-span-2 space-y-1.5">
                    <label class="text-xs font-bold text-neutral-600 dark:text-neutral-400 uppercase tracking-widest">Palavra-Chave</label>
                    <input bind:value={keywordQuery} type="text" placeholder="Termo exato no texto..." class="w-full p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 outline-none transition text-sm text-neutral-800 dark:text-neutral-200 placeholder-neutral-400" />
                </div>
                <div class="space-y-1.5">
                    <label class="text-xs font-bold text-neutral-600 dark:text-neutral-400 uppercase tracking-widest">Dificuldade</label>
                    <select bind:value={selectedDifficulty} class="w-full p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 outline-none transition text-sm text-neutral-800 dark:text-neutral-200 cursor-pointer">
                        <option value="all">Qualquer Nível</option>
                        <option value="easy">Fácil</option>
                        <option value="medium">Média</option>
                        <option value="hard">Difícil</option>
                    </select>
                </div>
            </div>

            <div class="w-full h-px bg-neutral-100 dark:bg-neutral-800"></div>

            <!-- Categorização Hierarquica (Tags) -->
            <div class="space-y-4">
                <label class="text-xs font-bold text-neutral-600 dark:text-neutral-400 uppercase tracking-widest block mb-2">Filtros Categóricos (Multitags)</label>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                        <span class="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5 block">Disciplina</span>
                        <input bind:value={tagDisciplines} type="text" placeholder="ex: Português, Matemática" class="w-full p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 outline-none transition text-sm text-neutral-800 dark:text-neutral-200" />
                    </div>
                    <div>
                        <span class="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5 block">Assunto Específico</span>
                        <input bind:value={tagSubjects} type="text" placeholder="ex: Crase, Frações" class="w-full p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 outline-none transition text-sm text-neutral-800 dark:text-neutral-200" />
                    </div>
                    <div>
                        <span class="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5 block">Modalidade</span>
                        <input bind:value={tagModality} type="text" placeholder="ex: Certo/Errado, Múltipla Escolha" class="w-full p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 outline-none transition text-sm text-neutral-800 dark:text-neutral-200" />
                    </div>
                    <div>
                        <span class="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5 block">Área/Carreira</span>
                        <input bind:value={tagArea} type="text" placeholder="ex: Policial, Fiscal, TI" class="w-full p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 outline-none transition text-sm text-neutral-800 dark:text-neutral-200" />
                    </div>
                </div>
            </div>

            <div class="pt-4 flex justify-end">
                <button on:click={() => applyFilters(true)} class="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl shadow-lg shadow-indigo-500/30 transition-all active:scale-95 flex items-center gap-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    Aplicar Filtros e Selecionar
                </button>
            </div>
        </div>
    {/if}

    <!-- TAB 2: RESULTADOS SELECIONADOS -->
    {#if activeTab === 'results'}
        <div class="bg-white dark:bg-neutral-800 rounded-2xl shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 overflow-hidden flex flex-col min-h-[500px] animate-fade-in">
            <!-- Action Header -->
            <div class="p-4 bg-neutral-50 dark:bg-neutral-900/40 border-b border-neutral-200 dark:border-neutral-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div class="flex items-center gap-3">
                    <button on:click={() => activeTab = 'filter_form'} class="text-neutral-500 hover:text-indigo-600 font-semibold text-sm flex items-center gap-1 transition-colors px-2 py-1 bg-white dark:bg-neutral-800 rounded shadow-sm border border-neutral-200 dark:border-neutral-700">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                        Voltar / Editar Filtro
                    </button>
                    <span class="text-xs font-bold px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full">{flashcards.length} Encontradas</span>
                </div>

                <div class="flex items-center gap-3 w-full md:w-auto">
                    <select bind:value={sortBy} on:change={() => applyFilters(true)} class="p-2 text-sm font-semibold rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 outline-none text-neutral-700 dark:text-neutral-300">
                        <option value="newest">Inserção: Mais Recente</option>
                        <option value="oldest">Inserção: Mais Antiga</option>
                    </select>

                    <div class="flex items-center gap-2 bg-white dark:bg-neutral-800 p-1 rounded-lg border border-neutral-200 dark:border-neutral-700 flex-1 md:flex-none">
                        <input bind:value={filterSaveName} type="text" placeholder="Nomeie este filtro..." class="w-full md:w-40 px-3 py-1.5 text-sm bg-transparent outline-none dark:text-white" />
                        <button on:click={saveCurrentFilter} class="px-3 py-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-800/50 rounded flex items-center gap-1 font-bold text-sm transition-colors whitespace-nowrap">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
                            Salvar
                        </button>
                    </div>
                </div>
            </div>

            <!-- List Area -->
            <div class="flex-1 overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="border-b border-neutral-200 dark:border-neutral-700 text-neutral-500 tracking-wider text-xs uppercase bg-white dark:bg-neutral-800">
                            <th class="p-5 font-bold w-16">Data</th>
                            <th class="p-5 font-bold">Conteúdo da Questão</th>
                            <th class="p-5 font-bold w-48 text-right">Tags Associadas</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-neutral-100 dark:divide-neutral-800">
                        {#each displayedFlashcards as card (card.id)}
                            <tr class="hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors group cursor-pointer">
                                <td class="p-5 text-xs text-neutral-400 font-mono align-top whitespace-nowrap">
                                    {parseDate(card.createdAt)}
                                </td>
                                <td class="p-5 align-top">
                                    <div class="text-sm font-medium text-neutral-800 dark:text-neutral-200 line-clamp-3 leading-relaxed">{card.front}</div>
                                </td>
                                <td class="p-5 align-top text-right">
                                    <div class="flex flex-wrap gap-1.5 justify-end">
                                        {#if card.tags}
                                            {#each card.tags.slice(0, 4) as tag}
                                                <span class="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 text-[10px] uppercase font-bold tracking-wider rounded border border-neutral-200 dark:border-neutral-700">{tag}</span>
                                            {/each}
                                            {#if card.tags.length > 4}
                                                <span class="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-400 text-[10px] font-bold rounded">+{card.tags.length - 4}</span>
                                            {/if}
                                        {/if}
                                    </div>
                                </td>
                            </tr>
                        {/each}
                        
                        {#if displayedFlashcards.length === 0 && !isLoading}
                            <tr>
                                <td colspan="3" class="p-16 text-center">
                                    <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-800 mb-4 text-2xl">🕵️‍♀️</div>
                                    <div class="font-extrabold text-neutral-700 dark:text-neutral-300 text-lg">Nenhuma questão encontrada</div>
                                    <p class="text-sm text-neutral-500 mt-2 max-w-sm mx-auto">Nenhum cartão atende aos critérios exatos. Tente remover algumas tags ou deixar os filtros mais genéricos.</p>
                                    <button on:click={() => activeTab = 'filter_form'} class="mt-6 px-6 py-2 bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 font-bold rounded-lg hover:bg-indigo-100 transition">Ajustar Filtros</button>
                                </td>
                            </tr>
                        {/if}
                    </tbody>
                </table>
            </div>

            <!-- Loader / Pagination -->
            {#if hasMore}
                 <div class="p-4 border-t border-neutral-100 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 flex justify-center">
                    <button on:click={loadMore} class="px-6 py-2 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 font-bold text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 shadow-sm hover:shadow transition-all hover:-translate-y-0.5">Carregar mais 20 questões</button>
                 </div>
            {/if}
        </div>
    {/if}

    <!-- TAB 3: FILTROS SALVOS -->
    {#if activeTab === 'saved_filters'}
        <div class="max-w-4xl mx-auto animate-fade-in">
            <h2 class="text-2xl font-extrabold mb-6 dark:text-white">Meus Filtros e Cadernos Virtuais</h2>

            {#if savedFilters.length === 0}
                <div class="bg-white dark:bg-neutral-800 rounded-2xl p-12 text-center shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 border-dashed border-2">
                    <p class="text-neutral-500 font-medium">Você ainda não tem filtros pré-configurados salvos.</p>
                    <button on:click={() => activeTab = 'filter_form'} class="mt-4 text-indigo-600 font-bold hover:underline">Criar meu primeiro Filtro</button>
                </div>
            {:else}
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {#each savedFilters as sf}
                        <div class="bg-white dark:bg-neutral-800 rounded-2xl p-5 shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 flex flex-col justify-between group hover:shadow-md transition-shadow relative overflow-hidden">
                            <div class="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 bg-gradient-to-l from-white dark:from-neutral-800 via-white dark:via-neutral-800 to-transparent">
                                <button on:click={() => editFilter(sf.id)} title="Carregar no Formulário" class="p-1.5 text-indigo-500 bg-indigo-50 dark:bg-indigo-900/40 rounded hover:bg-indigo-100 transition">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                                </button>
                                <button on:click={() => deleteSavedFilter(sf.id)} title="Apagar Filtro" class="p-1.5 text-red-500 bg-red-50 dark:bg-red-900/40 rounded hover:bg-red-100 transition">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                </button>
                            </div>

                            <div>
                                <h3 class="font-bold text-lg text-neutral-800 dark:text-neutral-100 mb-1 pr-16">{sf.name}</h3>
                                <p class="text-xs text-neutral-400 font-mono mb-4">Criado em: {parseDate(sf.createdAt)}</p>
                            </div>

                            <div class="mt-auto space-y-2">
                                {#if sf.criteria.keyword}
                                    <div class="text-xs bg-neutral-100 dark:bg-neutral-900/50 text-neutral-600 dark:text-neutral-400 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 truncate">
                                        <span class="font-bold mr-1">Palavra:</span> "{sf.criteria.keyword}"
                                    </div>
                                {/if}
                                {#if sf.criteria.difficulty && sf.criteria.difficulty !== 'all'}
                                    <div class="text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800/50 font-bold uppercase tracking-wider">
                                        Nível: {sf.criteria.difficulty}
                                    </div>
                                {/if}
                                <div class="flex flex-wrap gap-1 mt-2">
                                    {#each (sf.criteria.tags || []).slice(0, 3) as t}
                                        <span class="text-[10px] font-bold px-1.5 py-0.5 bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 rounded">#{t}</span>
                                    {/each}
                                    {#if (sf.criteria.tags || []).length > 3}
                                         <span class="text-[10px] font-bold px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-500 rounded">+{sf.criteria.tags.length - 3}</span>
                                    {/if}
                                </div>
                                <div class="mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-700 flex flex-col md:flex-row gap-2 justify-end">
                                    <a href={`/practice/solve/${sf.id}`} class="px-4 py-2 bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 hover:bg-neutral-200 font-bold rounded-lg text-sm transition-colors flex items-center justify-center gap-1.5 shadow-sm w-full md:w-auto">
                                        Resolver Prática
                                    </a>
                                    <a href={`/practice/study/${sf.id}`} class="px-4 py-2 bg-indigo-600 text-white dark:bg-indigo-500 dark:hover:bg-indigo-400 hover:bg-indigo-500 font-bold rounded-lg text-sm transition-colors flex items-center justify-center gap-1.5 shadow-sm w-full md:w-auto">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                                        Estudar Caderno (FSRS)
                                    </a>
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .scrollbar-hide::-webkit-scrollbar {
        display: none;
    }
    .scrollbar-hide {
        -ms-overflow-style: none; /* IE and Edge */
        scrollbar-width: none; /* Firefox */
    }
    .animate-fade-in {
        animation: fadeIn 0.3s ease-out forwards;
    }
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(5px); }
        to { opacity: 1; transform: translateY(0); }
    }
</style>
