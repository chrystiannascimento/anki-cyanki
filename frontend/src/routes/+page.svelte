<script lang="ts">
	import { onMount } from 'svelte';
	import { db, type Flashcard } from '$lib/db';
	import { syncEngine } from '$lib/sync';
	import { nanoid } from 'nanoid';
	import { liveQuery } from 'dexie';

	let front = '';
	let back = '';
	let tags = '';

	let flashcards: Flashcard[] = [];

	onMount(() => {
		const observable = liveQuery(() => db.flashcards.orderBy('createdAt').reverse().toArray());
		const subscription = observable.subscribe((result) => {
			flashcards = result;
		});
		return () => subscription.unsubscribe();
	});

	async function addFlashcard() {
		if (!front || !back) return;
		
		const newCard: Flashcard = {
			id: nanoid(),
			front,
			back,
			tags: tags.split(',').map(t => t.trim()),
			createdAt: Date.now()
		};

		// 1. Save locally with High Performance
		await db.flashcards.add(newCard);
		
		// 2. Queue for Sync (Optimistic UI)
		await syncEngine.enqueue('CREATE', 'FLASHCARD', newCard.id, newCard);
		
		front = '';
		back = '';
		tags = '';
	}
	
	async function triggerSync() {
	    await syncEngine.triggerSync();
	}
</script>

<div class="min-h-screen bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 p-8">
	<div class="max-w-4xl mx-auto space-y-8">
		<header class="flex items-center justify-between">
			<div>
				<h1 class="text-4xl font-extrabold tracking-tight text-indigo-600 dark:text-indigo-400">Cyanki</h1>
				<p class="text-neutral-500 mt-2">Continuous Learning Ecosystem</p>
			</div>
			
			<button on:click={triggerSync} class="px-4 py-2 bg-neutral-200 dark:bg-neutral-800 rounded-lg shadow-sm font-medium hover:bg-neutral-300 transition-colors cursor-pointer">
				Force Sync
			</button>
		</header>

		<section class="p-6 bg-white dark:bg-neutral-800 rounded-2xl shadow-xl shadow-indigo-500/5 ring-1 ring-neutral-200 dark:ring-neutral-700">
			<h2 class="text-2xl font-bold mb-4">Add Flashcard</h2>
			<div class="space-y-4">
				<div>
					<label class="block text-sm font-medium mb-1 dark:text-neutral-300">Front</label>
					<textarea bind:value={front} class="w-full p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 transition-shadow outline-none resize-none" rows="2" placeholder="Question or term..."></textarea>
				</div>
				<div>
					<label class="block text-sm font-medium mb-1 dark:text-neutral-300">Back</label>
					<textarea bind:value={back} class="w-full p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 transition-shadow outline-none resize-none" rows="3" placeholder="Answer or explanation..."></textarea>
				</div>
				<div>
					<label class="block text-sm font-medium mb-1 dark:text-neutral-300">Tags (comma separated)</label>
					<input bind:value={tags} type="text" class="w-full p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 transition-shadow outline-none" placeholder="e.g. math, geometry, #important" />
				</div>
				<button on:click={addFlashcard} class="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md transition-all active:scale-[0.98] cursor-pointer">
					Save Flashcard
				</button>
			</div>
		</section>

		<section class="space-y-4">
			<h2 class="text-2xl font-bold flex items-center gap-2">Your Deck <span class="text-indigo-600 bg-indigo-100 dark:bg-indigo-500/20 dark:text-indigo-400 text-xs px-2 py-1 rounded-full">{flashcards.length} cards</span></h2>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				{#each flashcards as card (card.id)}
					<div class="p-5 bg-white dark:bg-neutral-800 rounded-2xl shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 group cursor-pointer hover:shadow-md transition-all hover:-translate-y-1 overflow-hidden">
						<h3 class="font-bold text-lg mb-2 line-clamp-2 text-neutral-800 dark:text-neutral-100">{card.front}</h3>
						<p class="text-neutral-500 dark:text-neutral-400 line-clamp-3 text-sm">{card.back}</p>
						<div class="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
							{#each card.tags as tag}
								{#if tag}
									<span class="whitespace-nowrap px-2.5 py-1 text-xs font-semibold bg-indigo-50/50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 rounded-full ring-1 ring-indigo-200/50 dark:ring-indigo-800/50">{tag}</span>
								{/if}
							{/each}
						</div>
					</div>
				{/each}
				
				{#if flashcards.length === 0}
					<div class="col-span-full py-12 text-center text-neutral-500 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl">
						<p>No flashcards yet. Add one above!</p>
					</div>
				{/if}
			</div>
		</section>
	</div>
</div>
