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

    // Split markdown into blocks on card boundaries (Tipo:? + Q:).
    // Each block is parsed individually so the regex has no `m` flag and
    // $ anchors to the end of the block — preventing the lazy [\s\S]+?
    // from stopping at the first line-end and truncating Critérios blocks.
    const blockSplitRe = /(?=^(?:Tipo:\s+\S[^\n]*\n)?Q:\s)/m;
    const blocks = markdown.split(blockSplitRe);

    // Per-block regex — NO `m` flag, so ^ and $ anchor to block boundaries.
    const cardRe = /^(?:Tipo:\s*(CONCEITO|FATO|PROCEDIMENTO)[ \t]*\n)?Q:\s*(?:<!--\s*id:\s*([\w-]+)\s*-->\s*)?([^\n]+)\r?\nA:\s*([\s\S]+?)(?:\r?\nTags:\s*([^\n]+))?\s*$/;

    for (const block of blocks) {
        const match = cardRe.exec(block);
        if (!match) {
            updatedMarkdown += block;
            continue;
        }

        const cardType = match[1] ? match[1].toUpperCase() as FlashcardType : undefined;
        let cardId = match[2];
        const frontText = match[3].trim();
        const backText = match[4].trim();
        const tagsArray = match[5]
            ? match[5].split(/[,|;\s]+/).filter((t: string) => t.trim() !== '')
            : [];

        let injected = false;

        if (!cardId) {
            const normalizedFront = frontText.toLowerCase();
            const collisionCard = cardDictionary.get(normalizedFront);

            if (collisionCard && collisionCard.back.trim() === backText) {
                cardId = collisionCard.id;
            } else {
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

        updatedMarkdown += injected
            ? block.replace(/^Q:\s*/m, `Q: <!--id:${cardId}--> `)
            : block;
    }

    // Update existing cards or create new ones in the Database
    for (const card of extractedCards) {
        const existing = await db.flashcards.get(card.id);
        if (existing) {
            const hasChanged = existing.front !== card.front ||
                existing.back !== card.back ||
                (existing.tags || []).join() !== (card.tags || []).join() ||
                existing.type !== card.type;

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
