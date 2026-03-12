<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { db, type Flashcard } from '$lib/db';
    import { syncEngine } from '$lib/sync';
    import { liveQuery } from 'dexie';

    let flashcards: Flashcard[] = [];
    let searchQuery = '';
    
    $: filteredFlashcards = flashcards.filter(c => 
        c.front.toLowerCase().includes(searchQuery.toLowerCase()) || 
        c.back.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.id.toLowerCase().includes(searchQuery.toLowerCase())
    );

    onMount(() => {
        const observable = liveQuery(() => db.flashcards.orderBy('createdAt').reverse().toArray());
        const subscription = observable.subscribe((result) => {
            flashcards = result;
        });

        return () => {
            subscription.unsubscribe();
        }
    });

    async function deleteCard(id: string) {
        if (!confirm("Are you sure you want to permanently delete this flashcard?")) return;
        
        await db.flashcards.delete(id);
        
        // Remove associated review logs as well for cleanup
        const logs = await db.reviewLogs.where('flashcardId').equals(id).toArray();
        const logIds = logs.map(l => l.id as number);
        await db.reviewLogs.bulkDelete(logIds);

        // Queue deletion in backend
        await syncEngine.enqueue('DELETE', 'FLASHCARD', id, {});
        // Note: the backend syncQueue should hypothetically delete associated review logs on cascade.
    }

    async function wipeAll() {
        if (!confirm("CRITICAL WARNING: This will permanently eradicate all Flashcards and Review Logs from your Global Memory locally and remotely. Proceed?")) return;
        
        const allIds = flashcards.map(c => c.id);
        
        for (const id of allIds) {
             await db.flashcards.delete(id);
             await syncEngine.enqueue('DELETE', 'FLASHCARD', id, {});
        }
        
        await db.reviewLogs.clear();
        
        alert("Global Memory successfully purged.");
    }
</script>

<div class="min-h-screen bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 p-8">
    <div class="max-w-5xl mx-auto space-y-8">
        <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
            <div>
                <h1 class="text-3xl font-extrabold tracking-tight text-red-600 dark:text-red-400">Global Memory Manger</h1>
                <p class="text-neutral-500 mt-2">Force wipe corrupted data, resolve ID duplication, and inspect raw items.</p>
            </div>
            <div class="flex gap-3">
                <button on:click={wipeAll} class="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-md shadow-red-500/20 transition cursor-pointer">
                    Nuke Database
                </button>
            </div>
        </div>

        <section class="bg-white dark:bg-neutral-800 p-6 rounded-2xl shadow ring-1 ring-neutral-200 dark:ring-neutral-700">
            <div class="mb-6">
                <input bind:value={searchQuery} type="text" placeholder="Search by ID, Front, Back..." class="w-full p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-red-500 outline-none transition dark:text-white dark:placeholder-neutral-500" />
            </div>

            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="border-b border-neutral-200 dark:border-neutral-700 text-neutral-500 text-sm">
                            <th class="p-4 font-semibold w-32">Card ID</th>
                            <th class="p-4 font-semibold">Front (Question)</th>
                            <th class="p-4 font-semibold">Back (Answer)</th>
                            <th class="p-4 font-semibold">Tags</th>
                            <th class="p-4 font-semibold text-right w-24">Action</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-neutral-100 dark:divide-neutral-800">
                        {#each filteredFlashcards as card (card.id)}
                            <tr class="hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition font-mono text-sm max-h-16">
                                <td class="p-4 text-xs text-neutral-400 truncate max-w-[120px]">{card.id}</td>
                                <td class="p-4 truncate max-w-xs text-neutral-800 dark:text-neutral-200">{card.front}</td>
                                <td class="p-4 text-neutral-500 dark:text-neutral-400 truncate max-w-xs">{card.back}</td>
                                <td class="p-4 text-neutral-400 text-xs truncate max-w-[100px]">{card.tags ? card.tags.join(', ') : ''}</td>
                                <td class="p-4 text-right">
                                    <button on:click={() => deleteCard(card.id)} class="text-red-500 hover:text-red-700 dark:hover:text-red-400 font-bold px-3 py-1 bg-red-50 dark:bg-red-900/20 rounded-lg transition border border-red-100 dark:border-red-900/30">Delete</button>
                                </td>
                            </tr>
                        {/each}
                        
                        {#if filteredFlashcards.length === 0}
                            <tr>
                                <td colspan="5" class="p-8 text-center text-neutral-500">
                                    No flashcards found.
                                </td>
                            </tr>
                        {/if}
                    </tbody>
                </table>
            </div>
        </section>
    </div>
</div>
