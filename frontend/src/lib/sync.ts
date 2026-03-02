import { db } from './db';
import { PUBLIC_API_URL } from '$env/static/public';
import { writable } from 'svelte/store';

export const isSyncingStore = writable(false);

export class SyncEngine {
    private isSyncing = false;

    async enqueue(action: 'CREATE' | 'UPDATE' | 'DELETE' | 'REVIEW', entityType: 'FLASHCARD' | 'REVIEW_LOG', entityId: string | number, payload: any) {
        await db.syncQueue.add({
            action,
            entityType,
            entityId,
            payload,
            createdAt: Date.now()
        });

        this.triggerSync();
    }

    async triggerSync() {
        if (this.isSyncing || !navigator.onLine) return;
        this.isSyncing = true;
        isSyncingStore.set(true);

        try {
            const token = localStorage.getItem('cyanki_token');
            if (!token) return; // Cannot sync without being logged in

            // Drain the queue completely to handle rapid continuous user edits
            while (true) {
                const pending = await db.syncQueue.orderBy('createdAt').toArray();
                if (pending.length === 0) break;

                const response = await fetch(`${PUBLIC_API_URL}/sync/push`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ operations: pending })
                });

                if (response.ok) {
                    const idsToDelete = pending.map(p => p.id!);
                    await db.syncQueue.bulkDelete(idsToDelete);
                } else {
                    break; // Abort push loop on server errors to prevent cyclic spam
                }
            }

            // Pull remote changes here unconditionally
            await this.pullRemote();

        } catch (error) {
            console.error('Sync failed', error);
        } finally {
            this.isSyncing = false;
            isSyncingStore.set(false);
        }
    }

    private async pullRemote() {
        const token = localStorage.getItem('cyanki_token');
        if (!token) return;

        try {
            const response = await fetch(`${PUBLIC_API_URL}/sync/pull`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();

                // Intelligently UPSERT server data resolving conflicts via Timestamps
                await db.transaction('rw', db.notebooks, db.flashcards, db.reviewLogs, async () => {
                    if (data.notebooks && data.notebooks.length > 0) {
                        const locals = await db.notebooks.toArray();
                        const localMap = new Map(locals.map(n => [n.id, n]));
                        const safePuts = [];

                        for (const remote of data.notebooks) {
                            if (remote.isDeleted) {
                                await db.notebooks.delete(remote.id);
                                continue;
                            }
                            const local = localMap.get(remote.id);
                            if (!local || remote.updatedAt > local.updatedAt) {
                                safePuts.push(remote);
                            }
                        }
                        if (safePuts.length > 0) await db.notebooks.bulkPut(safePuts);
                    }

                    if (data.flashcards && data.flashcards.length > 0) {
                        const locals = await db.flashcards.toArray();
                        const localMap = new Map(locals.map(f => [f.id, f]));
                        const safePuts = [];

                        for (const remote of data.flashcards) {
                            if (remote.isDeleted) {
                                await db.flashcards.delete(remote.id);
                                continue;
                            }
                            const local = localMap.get(remote.id);
                            // Flashcards used fallback createdAt logic for comparisons previously.
                            // Switching over to updatedAt for true remote diff-reconciliation.
                            if (!local || (remote.updatedAt && remote.updatedAt > (local.createdAt || 0))) {
                                safePuts.push(remote);
                            }
                        }
                        if (safePuts.length > 0) await db.flashcards.bulkPut(safePuts);
                    }

                    if (data.reviewLogs && data.reviewLogs.length > 0) {
                        const locals = await db.reviewLogs.toArray();
                        const localMap = new Map(locals.map(l => [`${l.flashcardId}-${l.reviewedAt}`, l]));
                        const safePuts = data.reviewLogs.filter((remote: any) => {
                            const local = localMap.get(`${remote.flashcardId}-${remote.reviewedAt}`);
                            return !local; // Only insert structurally new review logs
                        });
                        if (safePuts.length > 0) await db.reviewLogs.bulkPut(safePuts);
                    }
                });
            }
        } catch (error) {
            console.error('Remote pull failed', error);
        }
    }
}

export const syncEngine = new SyncEngine();

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        syncEngine.triggerSync();
    });
}
