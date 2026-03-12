<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { db, type Flashcard } from '$lib/db';
	import { syncEngine } from '$lib/sync';
	import { getAllCardStates } from '$lib/fsrs';
	import { nanoid } from 'nanoid';
	import { liveQuery } from 'dexie';
	import { session } from '$lib/authStore';

	let front = '';
	let back = '';
	let tags = '';

	let flashcards: Flashcard[] = [];
	let cardStates = new Map<string, any>();
	let reviewsToday = 0;
	let totalReviews = 0;
	
	let searchQuery = '';
	let sortBy = 'due';
	let currentPage = 1;
	const itemsPerPage = 10;

	$: filteredFlashcards = flashcards.filter(c => 
	    c.front.toLowerCase().includes(searchQuery.toLowerCase()) || 
	    c.back.toLowerCase().includes(searchQuery.toLowerCase()) ||
	    c.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
	).sort((a, b) => {
	    if (sortBy === 'newest') return b.createdAt - a.createdAt;
	    if (sortBy === 'oldest') return a.createdAt - b.createdAt;
	    if (sortBy === 'due') {
	        const dueA = cardStates.get(a.id)?.due?.getTime() || Number.MAX_SAFE_INTEGER;
	        const dueB = cardStates.get(b.id)?.due?.getTime() || Number.MAX_SAFE_INTEGER;
	        return dueA - dueB;
	    }
	    return 0;
	});

	$: paginatedCards = filteredFlashcards.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
	$: totalPages = Math.ceil(filteredFlashcards.length / itemsPerPage);

	// Reset pagination on search drop
	$: if (searchQuery || sortBy) {
		currentPage = 1;
	}

	function formatDueDate(dateString: any) {
	    if (!dateString) return 'New';
	    const date = new Date(dateString);
	    if (date.getTime() <= Date.now()) return 'Due Now';
	    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}

	onMount(() => {
		const observable = liveQuery(() => db.flashcards.orderBy('createdAt').reverse().toArray());
		const subscription = observable.subscribe(async (result) => {
			flashcards = result;
			cardStates = await getAllCardStates();
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
		<div>
			<h1 class="text-3xl font-extrabold tracking-tight mb-2">Dashboard</h1>
			<p class="text-neutral-500">Welcome back. Keep up the momentum!</p>
		</div>

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
					<textarea bind:value={front} class="w-full p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-shadow outline-none resize-none dark:text-white dark:placeholder-neutral-500" rows="2" placeholder="Question or term..."></textarea>
				</div>
				<div>
					<label class="block text-sm font-medium mb-1 dark:text-neutral-300">Back</label>
					<textarea bind:value={back} class="w-full p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-shadow outline-none resize-none dark:text-white dark:placeholder-neutral-500" rows="3" placeholder="Answer or explanation..."></textarea>
				</div>
				<div>
					<label class="block text-sm font-medium mb-1 dark:text-neutral-300">Tags (comma separated)</label>
					<input bind:value={tags} type="text" class="w-full p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-shadow outline-none dark:text-white dark:placeholder-neutral-500" placeholder="e.g. math, geometry, #important" />
				</div>
				<button on:click={addFlashcard} class="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md transition-all active:scale-[0.98] cursor-pointer">
					Save Flashcard
				</button>
			</div>
		</section>

		<section class="space-y-4">
			<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
			    <h2 class="text-2xl font-bold flex items-center gap-2">Your Deck <span class="text-indigo-600 bg-indigo-100 dark:bg-indigo-500/20 dark:text-indigo-400 text-xs px-2 py-1 rounded-full">{filteredFlashcards.length} cards</span></h2>
			    <div class="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
			        <select bind:value={sortBy} class="p-2.5 text-sm rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 outline-none shadow-sm transition-shadow dark:text-white cursor-pointer font-medium text-neutral-600">
			            <option value="due">Sort by Next Review</option>
			            <option value="newest">Sort by Newest</option>
			            <option value="oldest">Sort by Oldest</option>
			        </select>
			        <input bind:value={searchQuery} type="text" placeholder="Search cards & tags..." class="w-full sm:w-64 p-2.5 text-sm rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 outline-none shadow-sm transition-shadow dark:text-white dark:placeholder-neutral-500" />
			    </div>
			</div>
			
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				{#each paginatedCards as card (card.id)}
					<div class="p-5 bg-white dark:bg-neutral-800 rounded-2xl shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 group cursor-pointer hover:shadow-md transition-all hover:-translate-y-1 overflow-hidden flex flex-col justify-between">
					    <div>
						    <div class="flex justify-between items-start gap-4 mb-2">
						        <h3 class="font-bold text-lg line-clamp-2 text-neutral-800 dark:text-neutral-100">{card.front}</h3>
						        {#if cardStates.has(card.id)}
						            <span class="whitespace-nowrap text-[10px] font-bold px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
						                {formatDueDate(cardStates.get(card.id)?.due)}
						            </span>
						        {/if}
						    </div>
						    <p class="text-neutral-500 dark:text-neutral-400 line-clamp-3 text-sm">{card.back}</p>
						</div>
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

			<!-- Pagination Controls -->
			{#if totalPages > 1}
			    <div class="flex items-center justify-between pt-4 pb-2 border-t border-neutral-200 dark:border-neutral-800 mt-6">
			        <button 
			            on:click={() => currentPage = Math.max(1, currentPage - 1)} 
			            disabled={currentPage === 1}
			            class="px-5 py-2 rounded-xl text-sm font-bold bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
			        >
			            Previous
			        </button>
			        <span class="text-sm font-semibold text-neutral-500 dark:text-neutral-400">
			            Page {currentPage} of {totalPages}
			        </span>
			        <button 
			            on:click={() => currentPage = Math.min(totalPages, currentPage + 1)} 
			            disabled={currentPage === totalPages}
			            class="px-5 py-2 rounded-xl text-sm font-bold bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
			        >
			            Next
			        </button>
			    </div>
			{/if}
		</section>
	</div>
</div>
