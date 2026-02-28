import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { syncEngine } from '../lib/sync';
import { db } from '../lib/db';
import 'fake-indexeddb/auto';

describe('SyncEngine', () => {
    beforeEach(async () => {
        await db.syncQueue.clear();
        // Mock fetch globally
        globalThis.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should enqueue operations', async () => {
        await syncEngine.enqueue('CREATE', 'FLASHCARD', 'f1', { front: 'q', back: 'a' });

        const count = await db.syncQueue.count();
        expect(count).toBe(1);
    });

    it('should trigger sync and clear queue on success', async () => {
        // Mock network
        vi.stubGlobal('navigator', { onLine: true });

        // Mock successful fetch
        (globalThis.fetch as any).mockResolvedValue({
            ok: true,
            json: async () => ({ status: 'success' })
        });

        // Add to queue
        await db.syncQueue.add({
            action: 'CREATE',
            entityType: 'FLASHCARD',
            entityId: 'f2',
            payload: { front: 'x', back: 'y' },
            createdAt: Date.now()
        });

        await syncEngine.triggerSync();

        // Verify fetch was called
        expect(globalThis.fetch).toHaveBeenCalled();

        // Queue should be cleared
        const pending = await db.syncQueue.toArray();
        expect(pending.length).toBe(0);
    });

    it('should not clear queue if sync fails', async () => {
        vi.stubGlobal('navigator', { onLine: true });

        (globalThis.fetch as any).mockResolvedValue({
            ok: false,
            status: 500
        });

        await db.syncQueue.add({
            action: 'DELETE',
            entityType: 'FLASHCARD',
            entityId: 'f3',
            payload: {},
            createdAt: Date.now()
        });

        await syncEngine.triggerSync();

        // Queue should remain
        const count = await db.syncQueue.count();
        expect(count).toBe(1);
    });

    it('should not sync if offline', async () => {
        // Mock offline
        vi.stubGlobal('navigator', { onLine: false });

        await db.syncQueue.add({
            action: 'CREATE',
            entityType: 'FLASHCARD',
            entityId: 'f4',
            payload: {},
            createdAt: Date.now()
        });

        await syncEngine.triggerSync();

        // Fetch should not be called
        expect(globalThis.fetch).not.toHaveBeenCalled();

        // Items remain in queue
        const count = await db.syncQueue.count();
        expect(count).toBe(1);
    });
});
