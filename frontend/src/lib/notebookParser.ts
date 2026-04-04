import { nanoid } from 'nanoid';
import { db, type Flashcard, type FlashcardType } from '$lib/db';
import { syncEngine } from '$lib/sync';

// ─── Prompt Master parser (shared by AI generation and .md import) ──────────

export interface ParsedPromptCard {
    type?: FlashcardType;
    front: string;
    back: string;   // answer text (A: field)
    criteria: string; // raw checklist block (may be empty)
    tags: string[];
}

/**
 * Parses markdown in the Prompt Master / AI output format:
 *
 *   Tipo: CONCEITO
 *   Q: question...
 *   A: answer...
 *   Critérios:
 *   - [ ] criterion 1
 *   Tags: tag1, tag2
 *
 * Two flashcards are separated by one or more blank lines.
 * "Tipo:" and "Critérios:" sections are optional for backward compat.
 *
 * Returns an array of parsed cards ready for preview (not yet in DB).
 */
export function parsePromptMasterCards(markdown: string): ParsedPromptCard[] {
    const cards: ParsedPromptCard[] = [];

    // Split on double (or more) blank lines to separate card blocks
    const blocks = markdown.split(/\n{2,}/);

    for (const rawBlock of blocks) {
        const block = rawBlock.trim();
        if (!block) continue;

        // Must have at least Q: and A: to be a valid card
        if (!block.includes('Q:') || !block.includes('A:')) continue;

        const card: ParsedPromptCard = { front: '', back: '', criteria: '', tags: [] };

        // Tipo:
        const tipoMatch = block.match(/^Tipo:\s*(CONCEITO|FATO|PROCEDIMENTO)/im);
        if (tipoMatch) card.type = tipoMatch[1].toUpperCase() as FlashcardType;

        // Q: (single line)
        const qMatch = block.match(/^Q:\s*(.+)/m);
        if (qMatch) card.front = qMatch[1].trim();

        // Tags: (single line — capture before A: parsing to avoid confusion)
        const tagsMatch = block.match(/^Tags:\s*(.+)/im);
        if (tagsMatch) {
            card.tags = tagsMatch[1]
                .split(/[,;|\s]+/)
                .map(t => t.trim())
                .filter(Boolean);
        }

        // Critérios: block — everything from "Critérios:" to "Tags:" (or end)
        const criteriaMatch = block.match(/^Crit[eé]rios?:\s*\r?\n([\s\S]+?)(?=\nTags:|\n\nQ:|$)/im);
        if (criteriaMatch) card.criteria = criteriaMatch[1].trim();

        // A: — from after "A:" up to "Critérios:" or "Tags:" or end
        const aMatch = block.match(/^A:\s*([\s\S]+?)(?=\nCrit[eé]rios?:|\nTags:|\n\nQ:|$)/im);
        if (aMatch) card.back = aMatch[1].trim();

        if (card.front && card.back) cards.push(card);
    }

    return cards;
}

/**
 * Converts a ParsedPromptCard into a full Flashcard by merging the
 * Critérios block into the back field and assigning an ID.
 *
 * The merged back format:
 *   {answer text}
 *
 *   Critérios:
 *   - [ ] criterion 1
 *   - [ ] criterion 2
 */
export function promptCardToFlashcard(parsed: ParsedPromptCard): Flashcard {
    const mergedBack = parsed.criteria
        ? `${parsed.back}\n\nCritérios:\n${parsed.criteria}`
        : parsed.back;

    return {
        id: nanoid(),
        front: parsed.front,
        back: mergedBack,
        tags: parsed.tags,
        type: parsed.type,
        createdAt: Date.now()
    };
}

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
    // Captures ID in match[1], Front in match[2], Back in match[3], and Tags in match[4]
    // Optionally captures Tipo: prefix (match[5]) for Ultralearning card type
    const flashcardRegex = /^(?:Tipo:\s*(CONCEITO|FATO|PROCEDIMENTO)\s*\r?\n)?^Q:\s*(?:<!--\s*id:\s*([\w-]+)\s*-->\s*)?([^\n]+)\r?\n^A:\s*([\s\S]+?)(?:\r?\n^Tags:\s*([^\n]+))?(?=\r?\n^(?:Tipo:|Q:)|$)/gm;

    // Find all matches iteratively to reconstruct the string accurately
    let match;
    let lastIndex = 0;

    // We must reset the regex index
    flashcardRegex.lastIndex = 0;

    while ((match = flashcardRegex.exec(markdown)) !== null) {
        // match[0] = whole block
        // match[1] = Tipo (optional, new)
        // match[2] = ID comment (optional)
        // match[3] = front (Q:)
        // match[4] = back (A:)
        // match[5] = tags (optional)
        const fullMatch = match[0];
        const cardType = match[1] ? match[1].toUpperCase() as FlashcardType : undefined;
        let cardId = match[2];

        const frontText = match[3].trim();
        let backText = match[4].trim();
        let tagsArray: string[] = [];

        const tagsString = match[5];
        if (tagsString) {
            tagsArray = tagsString.split(/[,|;|\s]+/).filter((t: string) => t.trim() !== '');
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
            type: cardType,
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
                    tags: card.tags,
                    type: card.type
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
