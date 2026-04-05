<script lang="ts">
	import { onMount } from 'svelte';
	import { db, type Notebook } from '$lib/db';
	import { syncEngine } from '$lib/sync';
	import { nanoid } from 'nanoid';
	import { liveQuery } from 'dexie';
	import { parseAndInjectNotebookFlashcards } from '$lib/notebookParser';

	let titleInput = '';
	let notebooks: Notebook[] = [];
	let isResyncing = false;
	let resyncStatus = '';

	async function resyncAllNotebooks() {
		if (isResyncing) return;
		isResyncing = true;
		resyncStatus = '';
		let updated = 0;
		try {
			const all = await db.notebooks.toArray();
			for (let i = 0; i < all.length; i++) {
				const nb = all[i];
				resyncStatus = `Processando ${i + 1}/${all.length}: ${nb.title}`;
				const { extractedCards, updatedMarkdown, hasNewInjections } = await parseAndInjectNotebookFlashcards(nb.content);
				if (hasNewInjections) {
					await db.notebooks.update(nb.id, { content: updatedMarkdown, updatedAt: Date.now() });
				}
				updated += extractedCards.length;
			}
			resyncStatus = `✓ ${updated} cards atualizados em ${all.length} caderno${all.length !== 1 ? 's' : ''}`;
		} finally {
			isResyncing = false;
			setTimeout(() => { resyncStatus = ''; }, 5000);
		}
	}

	onMount(() => {
		const observable = liveQuery(() => db.notebooks.orderBy('updatedAt').reverse().toArray());
		const subscription = observable.subscribe((result) => {
			notebooks = result;
		});
		return () => subscription.unsubscribe();
	});

	async function createNotebook() {
		if (!titleInput.trim()) return;
		
		const newNotebook: Notebook = {
			id: nanoid(),
			title: titleInput.trim(),
			content: '# ' + titleInput.trim() + '\n\n',
			createdAt: Date.now(),
			updatedAt: Date.now()
		};

		await db.notebooks.add(newNotebook);
		
		await syncEngine.enqueue('CREATE', 'NOTEBOOK', newNotebook.id, {
			title: newNotebook.title,
			content: newNotebook.content,
			isPublic: false
		});
		
		titleInput = '';
	}
	
	async function deleteNotebook(id: string) {
	    await db.notebooks.delete(id);
		await syncEngine.enqueue('DELETE', 'NOTEBOOK', id, {});
	}

	// US-13: Export deck in Obsidian / Prompt Master format
	async function exportToObsidian(notebook: Notebook) {
		// Parse flashcards from the notebook content
		const { extractedCards } = await parseAndInjectNotebookFlashcards(notebook.content);
		if (extractedCards.length === 0) {
			alert('Nenhum flashcard encontrado neste caderno para exportar.');
			return;
		}

		// Fetch full cards from DB (to get type and tags)
		const ids = extractedCards.map(c => c.id);
		const cards = await db.flashcards.where('id').anyOf(ids).toArray();

		const dateStr = new Date().toISOString().slice(0, 10); // AAAA-MM-DD
		const safeName = notebook.title.replace(/[^a-z0-9\s-]/gi, '').trim().replace(/\s+/g, '-').toLowerCase();
		const filename = `deck-${safeName}-${dateStr}.md`;

		// Build Prompt Master format — checkboxes always reset to [ ] on export
		const blocks = cards.map(card => {
			// Strip persisted checklist state: replace [x] with [ ]
			const cleanBack = card.back.replace(/^- \[[xX]\]/gm, '- [ ]');

			const typeLine = card.type ? `Tipo: ${card.type}\n` : '';
			const tagsLine = card.tags?.length ? `\nTags: ${card.tags.join(', ')}` : '';

			return `${typeLine}Q: ${card.front}\nA: ${cleanBack}${tagsLine}`;
		});

		const content = blocks.join('\n\n\n');
		const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="min-h-screen bg-neutral-50 dark:bg-neutral-900 transition-colors">
	<div class="max-w-4xl mx-auto space-y-8 py-8 px-4">
		<div class="mb-6 flex items-center justify-between gap-4 flex-wrap">
				<div>
					<h1 class="text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white">Your Notebooks</h1>
					<p class="text-neutral-500 mt-1">PKM connected directly to your Spaced Repetition engine.</p>
				</div>
				<button
					on:click={resyncAllNotebooks}
					disabled={isResyncing}
					title="Re-parseia todos os cadernos e atualiza os flashcards no banco local"
					class="inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all disabled:opacity-60
						{isResyncing ? 'border-indigo-400 text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' : 'border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:border-indigo-500 dark:hover:text-indigo-400'}"
				>
					{#if isResyncing}
						<svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
						{resyncStatus || 'Sincronizando...'}
					{:else}
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
						{resyncStatus || 'Resync All'}
					{/if}
				</button>
		</div>

	<section class="flex flex-col sm:flex-row gap-4 p-6 bg-white dark:bg-neutral-800 rounded-2xl shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700">
		<input bind:value={titleInput} type="text" placeholder="Notebook Title..." class="flex-1 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 outline-none dark:text-white dark:placeholder-neutral-500" />
		<button on:click={createNotebook} class="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md transition-all active:scale-[0.98]">
			Create
		</button>
		<a href="/notebooks/ai-generate" class="inline-flex items-center justify-center gap-1.5 px-4 py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-lg shadow-md transition-all active:scale-[0.98] text-sm whitespace-nowrap">
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
			Gerar com IA
		</a>
		<a href="/notebooks/import" class="inline-flex items-center justify-center gap-1.5 px-4 py-3 bg-neutral-700 hover:bg-neutral-600 text-white font-bold rounded-lg shadow-md transition-all active:scale-[0.98] text-sm whitespace-nowrap border border-neutral-600">
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
			Importar .md
		</a>
	</section>

	<section class="grid grid-cols-1 md:grid-cols-2 gap-4">
		{#each notebooks as notebook (notebook.id)}
			<div class="relative p-6 bg-white dark:bg-neutral-800 rounded-2xl shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 group hover:shadow-md transition-all">
			    <button on:click={() => deleteNotebook(notebook.id)} class="absolute top-4 right-4 text-neutral-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">Delete</button>
				<h3 class="font-bold text-xl mb-2 text-neutral-800 dark:text-neutral-100">{notebook.title}</h3>
				<p class="text-neutral-500 dark:text-neutral-400 text-sm mb-6">Last edited: {new Date(notebook.updatedAt).toLocaleDateString()}</p>
				<div class="flex flex-col md:flex-row gap-2">
				   <a href="/notebooks/{notebook.id}" class="inline-flex items-center justify-center px-4 py-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors w-full md:w-auto">
				       Editor Markdown
				   </a>
				   <a href="/notebooks/solve/{notebook.id}" class="inline-flex items-center justify-center px-4 py-2 bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 hover:bg-neutral-200 font-bold rounded-lg text-sm transition-colors shadow-sm w-full md:w-auto">
                        Resolver Prática
                   </a>
                   <a href="/notebooks/study/{notebook.id}" class="inline-flex items-center justify-center px-4 py-2 bg-indigo-600 text-white dark:bg-indigo-500 dark:hover:bg-indigo-400 hover:bg-indigo-500 font-bold rounded-lg text-sm transition-colors shadow-sm w-full md:w-auto gap-1.5">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                        Estudar (FSRS)
                   </a>
                   <!-- US-13: Export to Obsidian -->
                   <button on:click={() => exportToObsidian(notebook)} title="Exportar para Obsidian (.md)" class="inline-flex items-center justify-center px-3 py-2 bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-white rounded-lg text-sm transition-colors shadow-sm w-full md:w-auto gap-1.5 border border-neutral-200 dark:border-neutral-600">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                        .md
                   </button>
				</div>
			</div>
		{/each}
		
		{#if notebooks.length === 0}
			<div class="col-span-full py-16 text-center text-neutral-400 dark:text-neutral-500 border-2 border-dashed border-neutral-200 dark:border-neutral-700 rounded-2xl">
				<p>No notebooks created yet. Build your knowledge base!</p>
			</div>
		{/if}
	</section>
	</div>
</div>
