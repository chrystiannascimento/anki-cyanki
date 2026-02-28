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

	// Debounce timer for saving
	let saveTimer: ReturnType<typeof setTimeout>;

	onMount(async () => {
		notebook = await db.notebooks.get(notebookId);
		if (notebook) {
			content = notebook.content;
			renderMarkdown(content);
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
			const { updatedMarkdown, hasNewInjections } = await parseAndInjectNotebookFlashcards(content);
			
			if (hasNewInjections) {
				content = updatedMarkdown;
				renderMarkdown(content);
			}

			// 2. Save Updated Notebook Content
			await db.notebooks.update(notebookId, {
				content: content,
				updatedAt: Date.now()
			});
			
			isSaving = false;
		}, 1000); // 1s auto-save debounce
	}

	function renderMarkdown(md: string) {
	    // Sanitize and render HTML to avoid XSS
		renderedContent = DOMPurify.sanitize(marked.parse(md) as string);
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
				class="flex-1 w-full bg-transparent resize-none outline-none font-mono text-sm leading-relaxed"
				placeholder="Start typing markdown here..."
			></textarea>
		</div>

		<!-- Preview Pane (Right) -->
		<div class="w-1/2 overflow-y-auto p-8 bg-white dark:bg-neutral-800 prose dark:prose-invert prose-indigo max-w-none">
			{@html renderedContent}
		</div>
	</div>
</div>
{:else}
<div class="flex items-center justify-center h-screen bg-neutral-900 text-white">
	<p class="animate-pulse">Loading notebook...</p>
</div>
{/if}
