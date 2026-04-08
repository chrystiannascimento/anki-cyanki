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
    type?: string;
    createdAt: number;
}

export interface ParseResponse {
    reqId: number;
    updatedMarkdown: string;
    extractedCards: ParsedCard[];
    hasNewInjections: boolean;
}

// ─── Core parsing logic ────────────────────────────────────────────────────────

function parseMarkdown(
    markdown: string,
    cardDictionary: Map<string, string>
): Omit<ParseResponse, 'reqId'> {
    let updatedMarkdown = '';
    const extractedCards: ParsedCard[] = [];
    let hasNewInjections = false;

    // Split on card boundaries (optionally preceded by Tipo: line).
    // Each segment is either prose or a full card block (Tipo? + Q + A + Critérios? + Tags?).
    const blockSplitRe = /(?=^(?:Tipo:\s+\S[^\n]*\n)?Q:\s)/m;
    const blocks = markdown.split(blockSplitRe);

    // Regex for a single card block — NO `m` flag so ^ and $ anchor to block
    // start/end, preventing $ from matching end-of-first-line and truncating
    // multi-line back content (Critérios blocks, etc.).
    const cardRe =
        /^(?:Tipo:\s*(CONCEITO|FATO|PROCEDIMENTO)[ \t]*\n)?Q:\s*(?:<!--\s*id:\s*([\w-]+)\s*-->\s*)?([^\n]+)\r?\nA:\s*([\s\S]+?)(?:\r?\nTags:\s*([^\n]+))?\s*$/;

    for (const block of blocks) {
        const match = cardRe.exec(block);
        if (!match) {
            updatedMarkdown += block;
            continue;
        }

        const cardType = match[1] ? match[1].toUpperCase() : undefined;
        let cardId = match[2];
        const frontText = match[3].trim();
        const backText = match[4].trim();
        const tagsArray = match[5]
            ? match[5].split(/[,|;\s]+/).filter((t: string) => t.trim() !== '')
            : [];

        let injected = false;
        if (!cardId) {
            const normalizedFront = frontText.toLowerCase();
            cardId = cardDictionary.get(normalizedFront) ?? nanoid();
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

    return { updatedMarkdown, extractedCards, hasNewInjections };
}

// ─── Worker message handler ────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<ParseRequest>) => {
    const { reqId, markdown, cardDictionary } = e.data;
    const dict = new Map<string, string>(cardDictionary);
    const result = parseMarkdown(markdown, dict);
    self.postMessage({ reqId, ...result } satisfies ParseResponse);
};
