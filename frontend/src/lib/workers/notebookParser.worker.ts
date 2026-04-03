/**
 * UC-16 — Notebook Parser Web Worker
 *
 * Runs the Q:/A: regex parsing entirely off the main thread.
 * No IndexedDB access here — the worker is pure computation.
 * The main thread receives results and performs all DB operations.
 */

import { nanoid } from 'nanoid';

// ─── Message types ────────────────────────────────────────────────────────────

export interface ParseRequest {
    /** Monotonic request ID so the caller can discard stale responses. */
    reqId: number;
    markdown: string;
    /**
     * Snapshot of existing cards as [normalizedFront, cardId] tuples.
     * Used for deduplication — same logic as the main-thread parser.
     */
    cardDictionary: [string, string][];
}

export interface ParsedCard {
    id: string;
    front: string;
    back: string;
    tags: string[];
    createdAt: number;
}

export interface ParseResponse {
    reqId: number;
    updatedMarkdown: string;
    extractedCards: ParsedCard[];
    hasNewInjections: boolean;
}

// ─── Core parsing logic (mirrored from notebookParser.ts) ────────────────────

function parseMarkdown(
    markdown: string,
    cardDictionary: Map<string, string>
): Omit<ParseResponse, 'reqId'> {
    let updatedMarkdown = '';
    const extractedCards: ParsedCard[] = [];
    let hasNewInjections = false;

    const flashcardRegex =
        /^Q:\s*(?:<!--\s*id:\s*([\w-]+)\s*-->\s*)?([^\n]+)\r?\n^A:\s*([\s\S]+?)(?:\r?\n^Tags:\s*([^\n]+))?(?=\r?\n^Q:|$)/gm;

    let match: RegExpExecArray | null;
    let lastIndex = 0;
    flashcardRegex.lastIndex = 0;

    while ((match = flashcardRegex.exec(markdown)) !== null) {
        const fullMatch = match[0];
        let cardId = match[1];
        const frontText = match[2].trim();
        const backText = match[3].trim();

        let tagsArray: string[] = [];
        if (match[4]) {
            tagsArray = match[4].split(/[,|;\s]+/).filter((t: string) => t.trim() !== '');
        }

        let injected = false;

        if (!cardId) {
            const normalizedFront = frontText.toLowerCase();
            const existingId = cardDictionary.get(normalizedFront);
            cardId = existingId ?? nanoid();
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

        updatedMarkdown += markdown.slice(lastIndex, match.index);
        updatedMarkdown += injected
            ? fullMatch.replace(/^Q:\s*/, `Q: <!-- id: ${cardId} --> `)
            : fullMatch;

        lastIndex = flashcardRegex.lastIndex;
    }

    updatedMarkdown += markdown.slice(lastIndex);

    return { updatedMarkdown, extractedCards, hasNewInjections };
}

// ─── Worker message handler ────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<ParseRequest>) => {
    const { reqId, markdown, cardDictionary } = e.data;
    const dict = new Map<string, string>(cardDictionary);
    const result = parseMarkdown(markdown, dict);
    self.postMessage({ reqId, ...result } satisfies ParseResponse);
};
