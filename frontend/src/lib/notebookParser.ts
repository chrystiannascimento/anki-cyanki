import { nanoid } from 'nanoid';
import { db, type Flashcard } from '$lib/db';
import { syncEngine } from '$lib/sync';

/**
 * Parses markdown to extract flashcards in Q: / A: format.
 * If a flashcard doesn't have an ID, it generates one and injects it back.
 * Example of markdown block:
 * 
 * Q: What is Dexie.js?
 * A: It's a wrapper for IndexedDB.
 * <!-- id: xyz123 -->
 * 
 * Returns the updated markdown text (with newly injected IDs) and the detected flashcards.
 */
export async function parseAndInjectNotebookFlashcards(markdown: string) {
    // Simple regex matching for "Q: [any text]\nA: [any text]"
    const flashcardRegex = /Q:\s*(.+)\s+A:\s*([\s\S]+?)(?=\nQ:|\n<!-- id:|<|$)/g;

    let updatedMarkdown = markdown;
    const extractedCards: Flashcard[] = [];
    let hasNewInjections = false;

    // Process the markdown blocks line by line or via Regex
    const blocks = markdown.split(/\n\s*\n/);

    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const qMatch = block.match(/^Q:\s*(.+)$/m);
        const aMatch = block.match(/^A:\s*([\s\S]+?)(?:\n<!-- id: ([\w-]+) -->)?$/m);

        if (qMatch && aMatch) {
            const front = qMatch[1].trim();
            const back = aMatch[1].trim();
            let id = aMatch[2];

            if (!id) {
                // Inject ID back into the block
                id = nanoid();
                hasNewInjections = true;
                blocks[i] = block + `\n<!-- id: ${id} -->`;

                const newCard: Flashcard = {
                    id,
                    front,
                    back,
                    tags: [], // Could be extracted via hastags in the block
                    createdAt: Date.now()
                };
                extractedCards.push(newCard);

                // Add to Dexie and SyncQueue
                await db.flashcards.add(newCard);
                await syncEngine.enqueue('CREATE', 'FLASHCARD', newCard.id, newCard);
            }
        }
    }

    if (hasNewInjections) {
        updatedMarkdown = blocks.join('\n\n');
    }

    return {
        updatedMarkdown,
        hasNewInjections
    };
}
