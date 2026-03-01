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
    let updatedMarkdown = '';
    const extractedCards: Flashcard[] = [];
    let hasNewInjections = false;

    // Pre-fetch all existing flashcards to quickly check for duplicate injections
    const existingCards = await db.flashcards.toArray();

    // Create a deterministic dictionary indexed by exact normalized 'front' strings
    const cardDictionary = new Map<string, Flashcard>();
    for (const card of existingCards) {
        cardDictionary.set(card.front.trim().toLowerCase(), card);
    }

    // Use a multiline regex to capture everything from Q: until the next Q: or End Of File
    const flashcardRegex = /^Q:\s*(?:<!--\s*id:\s*([\w-]+)\s*-->\s*)?([^\n]+)\n^A:\s*([\s\S]+?)(?=\n^Q:|$)/gm;

    // Find all matches iteratively to reconstruct the string accurately
    let match;
    let lastIndex = 0;

    // We must reset the regex index
    flashcardRegex.lastIndex = 0;

    while ((match = flashcardRegex.exec(markdown)) !== null) {
        // match[0] is the whole block, match[1] is ID (optional), match[2] is front, match[3] is back
        const fullMatch = match[0];
        let cardId = match[1];

        const frontText = match[2].trim();
        let backText = match[3].trim();
        let tagsArray: string[] = [];

        // Check if backText ends with a Tags block
        const tagsMatch = /(?:\r?\n)Tags:\s*(.+)$/i.exec(backText);
        if (tagsMatch) {
            tagsArray = tagsMatch[1].split(/[,]+|\s+/).filter((t: string) => t.trim() !== '');
            // Rip the Tags string block off the base Answer text
            backText = backText.substring(0, tagsMatch.index).trim();
        }

        let injected = false;

        if (!cardId) {
            // Deduplication Strategy: Test if this newly typed Question already fundamentally exists
            const normalizedFront = frontText.toLowerCase();
            const collisionCard = cardDictionary.get(normalizedFront);

            // If the front matches, and the back is also an exact match (ignoring spaces), it's a true Duplication
            if (collisionCard && collisionCard.back.trim() === backText) {
                // Do NOT generate a new ID. Re-use the existing card's ID invisibly.
                cardId = collisionCard.id;
            } else {
                // Truly unique new card
                cardId = nanoid();
            }

            hasNewInjections = true;
            injected = true;
        }

        extractedCards.push({
            id: cardId,
            front: frontText,
            back: backText,
            tags: tagsArray,
            createdAt: Date.now()
        });

        // Push the leading unconverted text
        updatedMarkdown += markdown.slice(lastIndex, match.index);

        if (injected) {
            // Rebuild the match with the ID injected, safely preserving spacing and Tags text
            updatedMarkdown += fullMatch.replace(/^Q:\s*/, `Q: <!-- id: ${cardId} --> `);
        } else {
            // Keep unchanged match
            updatedMarkdown += fullMatch;
        }

        lastIndex = flashcardRegex.lastIndex;
    }

    // Append the tail end of the markdown
    updatedMarkdown += markdown.slice(lastIndex);

    // Update existing cards or create new ones in the Database
    for (const card of extractedCards) {
        const existing = await db.flashcards.get(card.id);
        if (existing) {
            const hasChanged = existing.front !== card.front ||
                existing.back !== card.back ||
                (existing.tags || []).join() !== (card.tags || []).join();

            if (hasChanged) {
                await db.flashcards.update(card.id, {
                    front: card.front,
                    back: card.back,
                    tags: card.tags
                });
                await syncEngine.enqueue('UPDATE', 'FLASHCARD', card.id, card);
            }
        } else {
            // Add new cards entirely, or completely decoupled duplicated collision cards that changed
            await db.flashcards.add(card);
            await syncEngine.enqueue('CREATE', 'FLASHCARD', card.id, card);
        }
    }

    return {
        updatedMarkdown,
        hasNewInjections,
        extractedCards
    };
}
