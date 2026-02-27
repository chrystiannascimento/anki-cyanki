<script lang="ts">
	import { onMount } from 'svelte';
	import { db, type Notebook } from '$lib/db';
	import { syncEngine } from '$lib/sync';
	import { nanoid } from 'nanoid';
	import { liveQuery } from 'dexie';

	let titleInput = '';
	let notebooks: Notebook[] = [];

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
		// Note: We would queue notebook creation for sync too!
		// await syncEngine.enqueue('CREATE', 'NOTEBOOK', newNotebook.id, newNotebook);
		
		titleInput = '';
	}
	
	async function deleteNotebook(id: string) {
	    await db.notebooks.delete(id);
	}
</script>

<div class="max-w-4xl mx-auto space-y-8 py-8">
	<header class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white">Your Notebooks</h1>
			<p class="text-neutral-500 mt-1">PKM connected directly to your Spaced Repetition engine.</p>
		</div>
		<a href="/" class="px-4 py-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-sm font-medium hover:bg-neutral-200 dark:hover:bg-neutral-700 transition">Back to Home</a>
	</header>

	<section class="flex gap-4 p-6 bg-white dark:bg-neutral-800 rounded-2xl shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700">
		<input bind:value={titleInput} type="text" placeholder="Notebook Title..." class="flex-1 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 outline-none" />
		<button on:click={createNotebook} class="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md transition-all active:scale-[0.98]">
			Create
		</button>
	</section>

	<section class="grid grid-cols-1 md:grid-cols-2 gap-4">
		{#each notebooks as notebook (notebook.id)}
			<div class="relative p-6 bg-white dark:bg-neutral-800 rounded-2xl shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 group hover:shadow-md transition-all">
			    <button on:click={() => deleteNotebook(notebook.id)} class="absolute top-4 right-4 text-neutral-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">Delete</button>
				<h3 class="font-bold text-xl mb-2 text-neutral-800 dark:text-neutral-100">{notebook.title}</h3>
				<p class="text-neutral-500 dark:text-neutral-400 text-sm mb-6">Last edited: {new Date(notebook.updatedAt).toLocaleDateString()}</p>
				<a href="/notebooks/{notebook.id}" class="inline-block px-4 py-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors">
					Open Editor
				</a>
			</div>
		{/each}
		
		{#if notebooks.length === 0}
			<div class="col-span-full py-16 text-center text-neutral-400 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl">
				<p>No notebooks created yet. Build your knowledge base!</p>
			</div>
		{/if}
	</section>
</div>
