import Dexie, { type Table } from 'dexie';

export interface Flashcard {
    id: str; // UUID / NanoID
    front: str;
    back: str;
    tags: str[];
    createdAt: number;
}

export interface ReviewLog {
    id?: number;
    flashcardId: str;
    grade: number; // FSRS Grade
    state: number; // FSRS State
    reviewedAt: number;
    synced: boolean;
}

export interface SyncQueue {
    id?: number;
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'REVIEW';
    entityType: 'FLASHCARD' | 'REVIEW_LOG';
    entityId: str | number;
    payload: any;
    createdAt: number;
}

export class CyankiDB extends Dexie {
    flashcards!: Table<Flashcard, string>;
    reviewLogs!: Table<ReviewLog, number>;
    syncQueue!: Table<SyncQueue, number>;

    constructor() {
        super('cyanki_db');

        // Indexing: ++id (auto-increment), id (primary key), others are indexed for swift querying
        this.version(1).stores({
            flashcards: 'id, *tags, createdAt',
            reviewLogs: '++id, flashcardId, reviewedAt, synced',
            syncQueue: '++id, action, entityType, createdAt'
        });
    }
}

export const db = new CyankiDB();
