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
    let updatedMarkdown = markdown;
    const extractedCards: Flashcard[] = [];
    let hasNewInjections = false;

    // Use a multiline regex to capture everything from Q: until the next Q: or End Of File
    const flashcardRegex = /^Q:\s*(?:<!--\s*id:\s*([\w-]+)\s*-->\s*)?([^\n]+)\n^A:\s*([\s\S]+?)(?=\n^Q:|$)/gm;

    updatedMarkdown = markdown.replace(flashcardRegex, (match, id, front, back) => {
        let cardId = id;
        let injected = false;

        if (!cardId) {
            // Generate a new ID if it's a new card
            cardId = nanoid();
            hasNewInjections = true;
            injected = true;
        }

        const frontText = front.trim();
        const backText = back.trim();

        extractedCards.push({
            id: cardId,
            front: frontText,
            back: backText,
            tags: [], // Tags could be parsed from backText using regex if needed (#\w+)
            createdAt: Date.now()
        });

        if (injected) {
            // Inject the ID smoothly at the start line
            return `Q: <!-- id: ${cardId} --> ${frontText}\nA: ${back}`;
        }
        return match;
    });

    // Update existing cards or create new ones in the Database
    for (const card of extractedCards) {
        const existing = await db.flashcards.get(card.id);
        if (existing) {
            const hasChanged = existing.front !== card.front || existing.back !== card.back;
            if (hasChanged) {
                await db.flashcards.update(card.id, {
                    front: card.front,
                    back: card.back
                });
                await syncEngine.enqueue('UPDATE', 'FLASHCARD', card.id, card);
            }
        } else {
            await db.flashcards.add(card);
            await syncEngine.enqueue('CREATE', 'FLASHCARD', card.id, card);
        }
    }

    return {
        updatedMarkdown,
        hasNewInjections
    };
}
