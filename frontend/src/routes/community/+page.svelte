<script lang="ts">
	import { onMount } from 'svelte';
	import { db } from '$lib/db';
	import { syncEngine } from '$lib/sync';
	import { nanoid } from 'nanoid';
	import { PUBLIC_API_URL } from '$env/static/public';

	interface PublicNotebook {
		id: string;
		title: string;
		content: string;
		author: string;
		created_at: string;
	}

	let notebooks: PublicNotebook[] = [];
	let loading = true;
	let error = '';

	onMount(async () => {
		try {
			const res = await fetch(`${PUBLIC_API_URL}/community/notebooks`);
			if (!res.ok) throw new Error('Failed to fetch community notebooks');
			notebooks = await res.json();
		} catch (e: any) {
			error = e.message;
		} finally {
			loading = false;
		}
	});

	async function cloneNotebook(notebook: PublicNotebook) {
		const clonedId = nanoid();
		await db.notebooks.add({
			id: clonedId,
			title: `${notebook.title} (Clone)`,
			content: `> Cloned from ${notebook.author}\n\n${notebook.content}`,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			isPublic: false
		});
		
		await syncEngine.enqueue('CREATE', 'NOTEBOOK', clonedId, {
			title: `${notebook.title} (Clone)`,
			content: `> Cloned from ${notebook.author}\n\n${notebook.content}`,
			isPublic: false
		});
		
		alert('Notebook cloned to your private collection! Returning to dashboard...');
	}
</script>

<div class="max-w-4xl mx-auto space-y-8 py-8">
	<header class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white">Community Notes</h1>
			<p class="text-neutral-500 mt-1">Discover public notebooks shared by other learners.</p>
		</div>
		<a href="/dashboard" class="px-4 py-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-sm font-medium hover:bg-neutral-200 dark:hover:bg-neutral-700 transition">Back to Dashboard</a>
	</header>

	{#if loading}
		<div class="py-16 text-center animate-pulse text-indigo-500 font-medium">Fetching public nodes...</div>
	{:else if error}
		<div class="py-4 px-6 bg-red-50 text-red-600 rounded-lg border border-red-100">{error}</div>
	{:else if notebooks.length === 0}
		<div class="py-16 text-center text-neutral-400 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl">
			<p>No public notebooks available yet. Be the first to share your knowledge!</p>
		</div>
	{:else}
		<section class="grid grid-cols-1 md:grid-cols-2 gap-4">
			{#each notebooks as notebook (notebook.id)}
				<div class="relative p-6 bg-white dark:bg-neutral-800 rounded-2xl shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 group hover:shadow-md transition-all flex flex-col items-start justify-between min-h-[160px]">
					<div class="absolute top-4 right-4 bg-indigo-100 text-indigo-700 text-xs px-2 py-1 rounded-full dark:bg-indigo-900/30 dark:text-indigo-400 font-semibold">
						By @{notebook.author}
					</div>
					
					<div class="mb-6 w-full pr-16">
						<h3 class="font-bold text-xl mb-1 text-neutral-800 dark:text-neutral-100 truncate" title={notebook.title}>{notebook.title}</h3>
						<p class="text-neutral-500 dark:text-neutral-400 text-sm line-clamp-2">{notebook.content.substring(0, 100)}...</p>
					</div>
					
					<div class="flex gap-2 w-full mt-auto">
						<button on:click={() => cloneNotebook(notebook)} class="inline-block px-4 py-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors">
							Clone Notebook
						</button>
					</div>
				</div>
			{/each}
		</section>
	{/if}
</div>
