<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { db, type Flashcard } from '$lib/db';
	import { syncEngine } from '$lib/sync';
	import { nanoid } from 'nanoid';
	import { liveQuery } from 'dexie';
	import { session } from '$lib/authStore';

	let front = '';
	let back = '';
	let tags = '';

	let flashcards: Flashcard[] = [];
	let reviewsToday = 0;
	let totalReviews = 0;
	
	let searchQuery = '';
	$: filteredFlashcards = flashcards.filter(c => 
	    c.front.toLowerCase().includes(searchQuery.toLowerCase()) || 
	    c.back.toLowerCase().includes(searchQuery.toLowerCase()) ||
	    c.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
	);

	onMount(() => {
		const observable = liveQuery(() => db.flashcards.orderBy('createdAt').reverse().toArray());
		const subscription = observable.subscribe((result) => {
			flashcards = result;
		});

		const reviewsObservable = liveQuery(async () => {
		    const logs = await db.reviewLogs.toArray();
		    const today = new Date();
		    today.setHours(0,0,0,0);
		    const todayReviews = logs.filter(l => l.reviewedAt >= today.getTime());
		    return { total: logs.length, today: todayReviews.length };
		});
		
		const revSub = reviewsObservable.subscribe(res => {
		    totalReviews = res.total;
		    reviewsToday = res.today;
		});

		return () => {
		    subscription.unsubscribe();
		    revSub.unsubscribe();
		}
	});

	async function addFlashcard() {
		if (!front.trim() || !back.trim()) return;
		
		const normalizedFront = front.trim().toLowerCase();
		const normalizedBack = back.trim();
		
		// Idempotency: Deduplication check based on Front Hash + Exact Back
		const existingCards = await db.flashcards.toArray();
		const isDuplicate = existingCards.some(c => 
		    c.front.trim().toLowerCase() === normalizedFront && 
		    c.back.trim() === normalizedBack
		);
		
		if (isDuplicate) {
		    alert("Duplicate Detected: You already have this exact flashcard in your Global Memory.");
		    return;
		}
		
		const newCard: Flashcard = {
			id: nanoid(),
			front: front.trim(),
			back: back.trim(),
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
	
	function logout() {
	    session.set({ token: null, email: null });
	}
</script>

<div class="min-h-screen bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 p-8">
	<div class="max-w-4xl mx-auto space-y-8">
		<header class="flex flex-col md:flex-row md:items-center justify-between gap-4">
			<div>
				<h1 class="text-4xl font-extrabold tracking-tight text-indigo-600 dark:text-indigo-400">Cyanki</h1>
				<p class="text-neutral-500 mt-2">Continuous Learning Ecosystem</p>
			</div>
			
			<div class="flex flex-wrap items-center gap-2 sm:gap-3">
			    <a href="/notebooks" class="px-3 sm:px-5 py-2.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 rounded-xl font-semibold hover:bg-neutral-200 dark:hover:bg-neutral-700 transition text-sm sm:text-base">
			        Notebooks
			    </a>
			    <a href="/memory" class="px-3 sm:px-5 py-2.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 rounded-xl font-semibold hover:bg-neutral-200 dark:hover:bg-neutral-700 transition text-sm sm:text-base">
			        Memory
			    </a>
			    <a href="/community" class="px-3 sm:px-5 py-2.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 rounded-xl font-semibold hover:bg-neutral-200 dark:hover:bg-neutral-700 transition text-sm sm:text-base">
			        Community
			    </a>
			    <a href="/study" class="px-4 sm:px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md shadow-indigo-500/20 transition-all hover:-translate-y-0.5 text-sm sm:text-base whitespace-nowrap">
			        Study Now
			    </a>
			    
			    <!-- Auth logic -->
			    {#if $session.token}
			        <button on:click={triggerSync} class="px-3 sm:px-4 py-2.5 text-sm bg-neutral-100 dark:bg-neutral-800 text-neutral-500 rounded-xl font-medium hover:bg-neutral-200 transition-colors cursor-pointer" title="Manually push changes to server">
					    Sync
				    </button>
			        <div class="flex flex-col text-right ml-0 sm:ml-4 border-l border-neutral-300 dark:border-neutral-700 pl-4">
			            <span class="text-xs font-bold text-neutral-400 truncate max-w-[100px] sm:max-w-xs" title="{$session.email}">{$session.email}</span>
			            <div class="flex gap-2 justify-end mt-1">
			                <a href="/profile" class="text-xs hover:text-indigo-500 transition-colors">Profile</a>
			                <button on:click={logout} class="text-xs text-red-500 hover:text-red-400 transition-colors">Logout</button>
			            </div>
			        </div>
			    {:else}
			        <a href="/login" class="ml-auto sm:ml-4 px-4 sm:px-5 py-2.5 text-sm border-2 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 rounded-xl font-bold hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">
			            Log in
			        </a>
			    {/if}
			</div>
		</header>

		<section class="grid grid-cols-1 md:grid-cols-3 gap-6">
		    <div class="p-6 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-800/50 flex flex-col items-center justify-center transition-transform hover:scale-105 cursor-default">
		        <span class="text-4xl font-black text-indigo-600 dark:text-indigo-400 mb-2">{flashcards.length}</span>
		        <span class="text-xs text-indigo-800/70 dark:text-indigo-300 font-extrabold uppercase tracking-widest">Global Memory</span>
		    </div>
		    <a href="/history" class="p-6 bg-orange-50 dark:bg-orange-900/20 rounded-2xl shadow-sm border border-orange-100 dark:border-orange-800/50 flex flex-col items-center justify-center transition-transform hover:scale-105 cursor-pointer relative group">
		        <span class="text-4xl font-black text-orange-600 dark:text-orange-400 mb-2">{reviewsToday}</span>
		        <span class="text-xs text-orange-800/70 dark:text-orange-300 font-extrabold uppercase tracking-widest">Reviews Today</span>
		        <div class="absolute inset-0 bg-orange-500/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center backdrop-blur-[1px]">
		            <span class="font-bold text-orange-700 dark:text-orange-300">View History &rarr;</span>
		        </div>
		    </a>
		    <div class="p-6 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl shadow-sm border border-emerald-100 dark:border-emerald-800/50 flex flex-col items-center justify-center transition-transform hover:scale-105 cursor-default">
		        <span class="text-4xl font-black text-emerald-600 dark:text-emerald-400 mb-2">{totalReviews}</span>
		        <span class="text-xs text-emerald-800/70 dark:text-emerald-300 font-extrabold uppercase tracking-widest">Total XP</span>
		    </div>
		</section>

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
			<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
			    <h2 class="text-2xl font-bold flex items-center gap-2">Your Deck <span class="text-indigo-600 bg-indigo-100 dark:bg-indigo-500/20 dark:text-indigo-400 text-xs px-2 py-1 rounded-full">{filteredFlashcards.length} cards</span></h2>
			    <input bind:value={searchQuery} type="text" placeholder="Search cards & tags..." class="w-full sm:w-64 p-2.5 text-sm rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm transition-shadow" />
			</div>
			
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				{#each filteredFlashcards as card (card.id)}
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
				{:else if filteredFlashcards.length === 0}
				    <div class="col-span-full py-12 text-center text-neutral-500 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl">
						<p>No results found for "{searchQuery}".</p>
					</div>
				{/if}
			</div>
		</section>
	</div>
</div>
