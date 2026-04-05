/**
 * localDeletions — persists intentional user deletions in localStorage.
 *
 * Survives clearCyankiData() (which only wipes IndexedDB) so the pull logic
 * can refuse to restore items the user has explicitly deleted.
 *
 * Format in localStorage:
 *   cyanki_deleted_notebooks = JSON array of notebook IDs
 *   cyanki_deleted_flashcards = JSON array of flashcard IDs
 */

const KEY_NB = 'cyanki_deleted_notebooks';
const KEY_FC = 'cyanki_deleted_flashcards';

function load(key: string): Set<string> {
    try {
        const raw = localStorage.getItem(key);
        if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {}
    return new Set();
}

function save(key: string, set: Set<string>) {
    localStorage.setItem(key, JSON.stringify([...set]));
}

export function markNotebooksDeleted(ids: string[]) {
    const s = load(KEY_NB);
    ids.forEach(id => s.add(id));
    save(KEY_NB, s);
}

export function markFlashcardsDeleted(ids: string[]) {
    const s = load(KEY_FC);
    ids.forEach(id => s.add(id));
    save(KEY_FC, s);
}

/** Call after server confirms deletion (isDeleted=true in pull response) */
export function clearDeletedNotebooks(ids: string[]) {
    const s = load(KEY_NB);
    ids.forEach(id => s.delete(id));
    save(KEY_NB, s);
}

export function clearDeletedFlashcards(ids: string[]) {
    const s = load(KEY_FC);
    ids.forEach(id => s.delete(id));
    save(KEY_FC, s);
}

export function getDeletedNotebookIds(): Set<string> {
    return load(KEY_NB);
}

export function getDeletedFlashcardIds(): Set<string> {
    return load(KEY_FC);
}
