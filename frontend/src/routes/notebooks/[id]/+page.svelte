<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { db, type Notebook } from '$lib/db';
	import { parseAndInjectNotebookFlashcards } from '$lib/notebookParser';
	import { syncEngine } from '$lib/sync';
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';

	let notebookId = $page.params.id as string;
	let notebook: Notebook | undefined = undefined;
	
	let content = '';
	let renderedContent = '';
	let isSaving = false;
	
	let viewMode: 'markdown' | 'flashcards' = 'markdown';
	let sessionFlashcards: Flashcard[] = [];

    // GFM Line Break Configuration
	marked.setOptions({ breaks: true });

	// Debounce timer for saving
	let saveTimer: ReturnType<typeof setTimeout>;

	onMount(async () => {
		notebook = await db.notebooks.get(notebookId);
		if (notebook) {
			content = notebook.content;
			renderMarkdown(content);
			
			// Non-destructive initial Load populating visual array & upgrading empty tags gracefully
			const { extractedCards } = await parseAndInjectNotebookFlashcards(content);
			sessionFlashcards = extractedCards;
		}
	});

	async function handleInput() {
		renderMarkdown(content);
		
		// Auto-save debounce (UC-18 and UC-16 high performance)
		clearTimeout(saveTimer);
		saveTimer = setTimeout(async () => {
			if (!notebook) return;
			isSaving = true;
			
			// 1. Process Markdown for Q/A -> Flashcards injection
			const { updatedMarkdown, hasNewInjections, extractedCards } = await parseAndInjectNotebookFlashcards(content);
			
			sessionFlashcards = extractedCards;
			
			if (hasNewInjections) {
				content = updatedMarkdown;
				renderMarkdown(content);
			}

			// 2. Save Updated Notebook Content
			await db.notebooks.update(notebookId, {
				content: content,
				updatedAt: Date.now()
			});
			
			// 3. Enqueue the mutation to the sync engine so Cloud isn't bypassed
			await syncEngine.enqueue('UPDATE', 'NOTEBOOK', notebookId, {
				title: notebook.title,
				content: content,
				isPublic: notebook.isPublic
			});
			
			isSaving = false;
		}, 1000); // 1s auto-save debounce
	}

	function renderMarkdown(md: string) {
	    // Clean tracking IDs from visual preview
	    const cleanMd = md.replace(/<!--\s*id:\s*[\w-]+\s*-->/g, '');
	    // Sanitize and render HTML to avoid XSS
		renderedContent = DOMPurify.sanitize(marked.parse(cleanMd) as string);
	}

	async function togglePublic() {
		if (!notebook) return;
		
		notebook.isPublic = !notebook.isPublic;
		
		await db.notebooks.update(notebookId, {
			isPublic: notebook.isPublic,
			updatedAt: Date.now()
		});
		
		// Enqueue the Notebook update to Backend
		await syncEngine.enqueue('UPDATE', 'NOTEBOOK', notebookId, {
			title: notebook.title,
			content: notebook.content,
			isPublic: notebook.isPublic
		});
		
		notebook = notebook; // Trigger Svelte Reactivity
	}
</script>

{#if notebook}
<div class="h-screen flex flex-col items-stretch overflow-hidden bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100">
	<header class="flex items-center justify-between p-4 bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
		<div class="flex items-center gap-4">
			<a href="/notebooks" class="text-neutral-500 hover:text-indigo-600 transition">← Back</a>
			<h1 class="font-bold text-lg">{notebook.title}</h1>
			<button 
				on:click={togglePublic} 
				class="ml-4 text-xs font-semibold px-2 py-1 rounded-full border transition-colors {notebook.isPublic ? 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30' : 'bg-neutral-100 text-neutral-600 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-400'}"
			>
				{notebook.isPublic ? '🌍 Public' : '🔒 Private'}
			</button>
		</div>
		<div class="text-sm font-medium text-neutral-400">
			{#if isSaving}
				<span class="text-indigo-500 animate-pulse">Saving & Parsing...</span>
			{:else}
				<span>Saved locally</span>
			{/if}
		</div>
	</header>

	<div class="flex-1 flex overflow-hidden">
		<!-- Editor Pane (Left) -->
		<div class="w-1/2 overflow-y-auto border-r border-neutral-200 dark:border-neutral-700 p-6 flex flex-col">
		    <p class="text-xs text-neutral-400 mb-4">Tip: Write "Q: Question" followed by "A: Answer" to auto-generate tracking Flashcards!</p>
			<textarea 
				bind:value={content} 
				on:input={handleInput}
				class="flex-1 w-full bg-transparent resize-none outline-none font-mono text-sm leading-relaxed dark:text-neutral-200 dark:placeholder-neutral-600"
				placeholder="Start typing markdown here..."
			></textarea>
		</div>

		<!-- Preview Pane (Right) -->
		<div class="w-1/2 flex flex-col overflow-hidden bg-white dark:bg-neutral-800">
		    <div class="flex items-center justify-center p-4 border-b border-neutral-200 dark:border-neutral-700">
                <div class="bg-neutral-100 dark:bg-neutral-900 rounded-full p-1 flex shadow-inner">
                    <button class="px-6 py-1.5 rounded-full text-sm font-semibold transition-all {viewMode === 'markdown' ? 'bg-white dark:bg-neutral-700 shadow text-indigo-600 dark:text-indigo-400' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}" on:click={() => viewMode = 'markdown'}>Markdown</button>
                    <button class="px-6 py-1.5 rounded-full text-sm font-semibold transition-all {viewMode === 'flashcards' ? 'bg-white dark:bg-neutral-700 shadow text-indigo-600 dark:text-indigo-400' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}" on:click={() => viewMode = 'flashcards'}>Flashcards <span class="ml-1 bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400 px-2 py-0.5 rounded-full text-xs">{sessionFlashcards.length}</span></button>
                </div>
		    </div>
		    
		    <div class="flex-1 overflow-y-auto p-8">
                {#if viewMode === 'markdown'}
                    <div class="prose dark:prose-invert prose-indigo max-w-none">
                        {@html renderedContent}
                    </div>
                {:else}
                    <div class="max-w-3xl mx-auto space-y-4">
                        {#each sessionFlashcards as card (card.id)}
                            <div class="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-5 shadow-sm">
                                <h3 class="font-bold text-neutral-800 dark:text-neutral-200 mb-2">{card.front}</h3>
                                <p class="text-neutral-600 dark:text-neutral-400 text-sm whitespace-pre-wrap">{card.back}</p>
                                {#if card.tags && card.tags.length > 0}
                                    <div class="mt-4 flex flex-wrap gap-2">
                                        {#each card.tags as tag}
                                            <span class="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs rounded-lg font-medium tracking-wide">#{tag}</span>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        {/each}
                        {#if sessionFlashcards.length === 0}
                            <div class="text-center text-neutral-400 py-12 flex flex-col items-center">
                                <svg class="w-12 h-12 mb-4 text-neutral-300 dark:text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                                No Flashcards generated yet. Type `Q: Question` and `A: Answer`.
                            </div>
                        {/if}
                    </div>
                {/if}
		    </div>
		</div>
	</div>
</div>
{:else}
<div class="flex items-center justify-center h-screen bg-neutral-900 text-white">
	<p class="animate-pulse">Loading notebook...</p>
</div>
{/if}
