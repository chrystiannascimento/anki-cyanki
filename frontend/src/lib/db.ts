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

export class CyankiDB extends Dexie {
    flashcards!: Table<Flashcard, string>;
    reviewLogs!: Table<ReviewLog, number>;
    syncQueue!: Table<SyncQueue, number>;
    notebooks!: Table<Notebook, string>;

    constructor() {
        super('cyanki_db');

        // Indexing: ++id (auto-increment), id (primary key), others are indexed for swift querying
        this.version(2).stores({
            flashcards: 'id, *tags, createdAt',
            reviewLogs: '++id, flashcardId, reviewedAt, synced',
            syncQueue: '++id, action, entityType, createdAt',
            notebooks: 'id, updatedAt, createdAt'
        });
    }
}

export const db = new CyankiDB();

export async function clearCyankiData() {
    await Promise.all([
        db.flashcards.clear(),
        db.reviewLogs.clear(),
        db.syncQueue.clear(),
        db.notebooks.clear()
    ]);
}
