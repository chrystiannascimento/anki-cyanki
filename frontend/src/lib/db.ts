import Dexie, { type Table } from 'dexie';

export interface Flashcard {
    id: string; // UUID / NanoID
    front: string;
    back: string;
    tags: string[];
    createdAt: number;
}

export interface ReviewLog {
    id?: number;
    flashcardId: string;
    grade: number; // FSRS Grade
    state: number; // FSRS State
    reviewedAt: number;
    synced: boolean;
}

export interface SyncQueue {
    id?: number;
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'REVIEW';
    entityType: 'FLASHCARD' | 'REVIEW_LOG' | 'NOTEBOOK';
    entityId: string | number;
    payload: any;
    createdAt: number;
}

export interface Notebook {
    id: string; // NanoID
    title: string;
    content: string; // Markdown text
    isPublic?: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface LeaderboardEntry {
    id: string; // userId
    name: string;
    xp: number;
    position: number;
    updatedAt: number;
}

export interface SavedFilter {
    id: string; // NanoID
    name: string; // User defined name for the filter
    criteria: {
        tags: string[]; // e.g., ["direito", "constitucional"]
        keyword?: string; // e.g., "mandado de injunção"
        difficulty?: string; // e.g., "all", "easy", "medium", "hard"
        states?: number[]; // e.g., FSRS states [0, 1, 2, 3]
    };
    createdAt: number;
}

// UC-02: Dynamic media (images in flashcard/notebook content) stored as Blobs
// Avoids Base64 overhead and gives fine-grained storage control
export interface MediaCacheEntry {
    url: string;          // Original URL — primary key
    blob: Blob;           // Raw binary stored natively in IndexedDB
    mimeType: string;
    size: number;         // Bytes
    cachedAt: number;     // Unix timestamp ms
    flashcardId?: string; // Optional association for pruning by card
}

export class CyankiDB extends Dexie {
    flashcards!: Table<Flashcard, string>;
    reviewLogs!: Table<ReviewLog, number>;
    syncQueue!: Table<SyncQueue, number>;
    notebooks!: Table<Notebook, string>;
    leaderboard!: Table<LeaderboardEntry, string>;
    savedFilters!: Table<SavedFilter, string>;
    mediaCache!: Table<MediaCacheEntry, string>;

    constructor() {
        super('cyanki_db');

        // Indexing: ++id (auto-increment), id (primary key), others are indexed for swift querying
        this.version(5).stores({
            flashcards: 'id, *tags, createdAt',
            reviewLogs: '++id, flashcardId, reviewedAt, synced',
            syncQueue: '++id, action, entityType, createdAt',
            notebooks: 'id, updatedAt, createdAt',
            leaderboard: 'id, position, xp',
            savedFilters: 'id, name, createdAt'
        }).upgrade(tx => {
            // Future-proofing: Upgrade hook for v4 to v5
            return tx.table('savedFilters').toCollection().modify(filter => {
                if (filter.criteria && typeof filter.criteria.difficulty === 'undefined') {
                    filter.criteria.difficulty = 'all';
                }
            });
        });

        // v6: add mediaCache table for Blob storage of dynamic media (UC-02)
        this.version(6).stores({
            mediaCache: 'url, cachedAt, flashcardId'
        });
    }
}

export const db = new CyankiDB();

export async function clearCyankiData() {
    await Promise.all([
        db.flashcards.clear(),
        db.reviewLogs.clear(),
        db.syncQueue.clear(),
        db.notebooks.clear(),
        db.leaderboard.clear(),
        db.savedFilters.clear(),
        db.mediaCache.clear()
    ]);
}
