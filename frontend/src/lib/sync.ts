import { db } from './db';
import { PUBLIC_API_URL } from '$env/static/public';
import { writable } from 'svelte/store';
import { markSessionExpired } from './authStore';
import {
    getDeletedNotebookIds,
    getDeletedFlashcardIds,
    clearDeletedNotebooks,
    clearDeletedFlashcards
} from './localDeletions';

export const isSyncingStore = writable(false);
export const lastSyncedAt = writable<number | null>(null);
export const syncPendingCount = writable(0);

export class SyncEngine {
    private isSyncing = false;

    async enqueue(action: 'CREATE' | 'UPDATE' | 'DELETE' | 'REVIEW', entityType: 'FLASHCARD' | 'NOTEBOOK' | 'REVIEW_LOG', entityId: string | number, payload: any) {
        await db.syncQueue.add({
            action,
            entityType,
            entityId,
            payload,
            createdAt: Date.now()
        });

        const count = await db.syncQueue.count();
        syncPendingCount.set(count);

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
                    // UC-24: 401 means token expired — surface to user without logging out
                    if (response.status === 401) markSessionExpired();
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
            const remaining = await db.syncQueue.count();
            syncPendingCount.set(remaining);
            if (remaining === 0) lastSyncedAt.set(Date.now());
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

            if (response.status === 401) { markSessionExpired(); return; }

            if (response.ok) {
                const data = await response.json();

                // Intelligently UPSERT server data resolving conflicts via Timestamps
                await db.transaction('rw', db.notebooks, db.flashcards, db.reviewLogs, db.leaderboard, async () => {
                    // Load tombstones — items the user explicitly deleted locally
                    const deletedNbIds = getDeletedNotebookIds();
                    const deletedFcIds = getDeletedFlashcardIds();
                    const confirmedNbDeletes: string[] = [];
                    const confirmedFcDeletes: string[] = [];

                    if (data.notebooks && data.notebooks.length > 0) {
                        const locals = await db.notebooks.toArray();
                        const localMap = new Map(locals.map(n => [n.id, n]));
                        const safePuts = [];

                        for (const remote of data.notebooks) {
                            if (remote.isDeleted) {
                                await db.notebooks.delete(remote.id);
                                confirmedNbDeletes.push(remote.id);
                                continue;
                            }
                            // Skip items the user intentionally deleted locally
                            if (deletedNbIds.has(remote.id)) continue;
                            const local = localMap.get(remote.id);
                            if (!local || remote.updatedAt > local.updatedAt) {
                                safePuts.push(remote);
                            }
                        }
                        if (safePuts.length > 0) await db.notebooks.bulkPut(safePuts);
                        if (confirmedNbDeletes.length > 0) clearDeletedNotebooks(confirmedNbDeletes);
                    }

                    if (data.flashcards && data.flashcards.length > 0) {
                        const locals = await db.flashcards.toArray();
                        const localMap = new Map(locals.map(f => [f.id, f]));
                        const safePuts = [];

                        for (const remote of data.flashcards) {
                            if (remote.isDeleted) {
                                await db.flashcards.delete(remote.id);
                                confirmedFcDeletes.push(remote.id);
                                continue;
                            }
                            // Skip items the user intentionally deleted locally
                            if (deletedFcIds.has(remote.id)) continue;
                            const local = localMap.get(remote.id);
                            // Flashcards used fallback createdAt logic for comparisons previously.
                            // Switching over to updatedAt for true remote diff-reconciliation.
                            if (!local || (remote.updatedAt && remote.updatedAt > (local.createdAt || 0))) {
                                safePuts.push(remote);
                            }
                        }
                        if (safePuts.length > 0) await db.flashcards.bulkPut(safePuts);
                        if (confirmedFcDeletes.length > 0) clearDeletedFlashcards(confirmedFcDeletes);
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

                    if (data.leaderboard && data.leaderboard.length > 0) {
                        // Leaderboard is typically fully replaced or upserted
                        const safePuts = data.leaderboard;
                        await db.leaderboard.bulkPut(safePuts);
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
