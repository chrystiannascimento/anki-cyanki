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
            const pending = await db.syncQueue.orderBy('createdAt').toArray();

            // Push pending changes to the server
            const token = localStorage.getItem('cyanki_token');
            if (!token) return; // Cannot sync without being logged in

            if (pending.length > 0) {
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

                // Intelligently UPSERT server data into local Dexie offline storage
                await db.transaction('rw', db.notebooks, db.flashcards, db.reviewLogs, async () => {
                    if (data.notebooks && data.notebooks.length > 0) {
                        await db.notebooks.bulkPut(data.notebooks);
                    }
                    if (data.flashcards && data.flashcards.length > 0) {
                        await db.flashcards.bulkPut(data.flashcards);
                    }
                    if (data.reviewLogs && data.reviewLogs.length > 0) {
                        await db.reviewLogs.bulkPut(data.reviewLogs);
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
