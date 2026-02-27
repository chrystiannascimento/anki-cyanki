import { db } from './db';

const API_BASE_URL = 'http://localhost:8000';

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

        try {
            const pending = await db.syncQueue.orderBy('createdAt').toArray();
            if (pending.length === 0) return;

            // Push pending changes to the server
            // This is a naive batch push for the scaffold. In production, we'll implement batching with offset/cursor.
            const response = await fetch(`${API_BASE_URL}/api/sync/push`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operations: pending })
            });

            if (response.ok) {
                const idsToDelete = pending.map(p => p.id!);
                await db.syncQueue.bulkDelete(idsToDelete);
            }

            // Optional: Pull remote changes here
            await this.pullRemote();

        } catch (error) {
            console.error('Sync failed', error);
        } finally {
            this.isSyncing = false;
        }
    }

    private async pullRemote() {
        // Mock endpoint for pulling updates from server
        /*
        const lastSyncTimestamp = localStorage.getItem('lastSyncTimestamp') || '0';
        const response = await fetch(`${API_BASE_URL}/api/sync/pull?since=${lastSyncTimestamp}`);
        if (response.ok) {
            const data = await response.json();
            // apply remote changes locally to Dexie
            localStorage.setItem('lastSyncTimestamp', Date.now().toString());
        }
        */
    }
}

export const syncEngine = new SyncEngine();

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        syncEngine.triggerSync();
    });
}
