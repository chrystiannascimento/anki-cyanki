import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../lib/db';
import 'fake-indexeddb/auto'; // Polyfill IndexedDB for node tests

describe('Cyanki DB (Dexie)', () => {
    beforeEach(async () => {
        // Clear tables
        await db.flashcards.clear();
        await db.reviewLogs.clear();
        await db.syncQueue.clear();
    });

    it('should insert and fetch a flashcard', async () => {
        const card = {
            id: 'card-test-1',
            front: 'Front text',
            back: 'Back text',
            tags: ['test'],
            createdAt: Date.now()
        };

        await db.flashcards.add(card);

        const fetched = await db.flashcards.get('card-test-1');
        expect(fetched).toBeDefined();
        expect(fetched?.front).toBe('Front text');
    });

    it('should add item to sync queue', async () => {
        const queueOp = {
            action: 'CREATE' as const,
            entityType: 'FLASHCARD' as const,
            entityId: 'test-entity',
            payload: { data: 'test data' },
            createdAt: Date.now()
        };

        const id = await db.syncQueue.add(queueOp);
        expect(id).toBeDefined();

        const pending = await db.syncQueue.toArray();
        expect(pending.length).toBe(1);
        expect(pending[0].entityType).toBe('FLASHCARD');
    });
});
