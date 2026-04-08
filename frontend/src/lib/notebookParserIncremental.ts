/**
 * UC-16 — Incremental block-level parsing for notebook editor.
 *
 * Instead of re-parsing the entire markdown on every keystroke, we split
 * the document into "blocks" (one per Q:/A: pair plus any surrounding prose),
 * hash each block, and only re-parse blocks whose content has changed since
 * the last parse cycle. Unchanged blocks reuse cached results.
 *
 * This brings parsing cost from O(N) to O(changed_blocks) per keystroke,
 * making large notebooks (100+ cards) feel instant.
 */

import { nanoid } from 'nanoid';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedCard {
    id: string;
    front: string;
    back: string;
    tags: string[];
    type?: string;
    createdAt: number;
}

interface BlockParseResult {
    /** The (possibly ID-injected) block text */
    blockText: string;
    cards: ParsedCard[];
    hasNewInjections: boolean;
}

// ─── Block splitting ──────────────────────────────────────────────────────────

/**
 * Split markdown into segments. Each segment is either a prose chunk
 * (text before the first Q: or between blocks) or a Q:/A: flashcard block.
 * We keep the split boundaries so we can reconstruct the full markdown.
 */
export function splitIntoBlocks(markdown: string): string[] {
    // Split before each card block — optionally preceded by a "Tipo: ..." line
    const parts = markdown.split(/(?=^(?:Tipo:\s+\S+[ \t]*\n)?Q:\s)/m);
    return parts;
}

// ─── Single-block parsing ─────────────────────────────────────────────────────

// No `m` flag — ^ and $ anchor to start/end of block string, not per-line.
// This prevents `$` from matching end-of-first-line, which would truncate
// multi-line back content (criteria blocks, etc.).
const QA_REGEX =
    /^(?:Tipo:\s*(CONCEITO|FATO|PROCEDIMENTO)[ \t]*\n)?Q:\s*(?:<!--\s*id:\s*([\w-]+)\s*-->\s*)?([^\n]+)\r?\nA:\s*([\s\S]+?)(?:\r?\nTags:\s*([^\n]+))?\s*$/;

function parseBlock(
    block: string,
    cardDictionary: Map<string, string>
): BlockParseResult {
    const match = QA_REGEX.exec(block);
    if (!match) {
        // Prose block — no flashcard
        return { blockText: block, cards: [], hasNewInjections: false };
    }

    const cardType = match[1] ? (match[1].toUpperCase() as string) : undefined;
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
        injected = true;
    }

    const card: ParsedCard = {
        id: cardId,
        front: frontText,
        back: backText,
        tags: tagsArray,
        type: cardType,
        createdAt: Date.now()
    };

    const blockText = injected
        ? block.replace(/^Q:\s*/m, `Q: <!--id:${cardId}--> `)
        : block;

    return { blockText, cards: [card], hasNewInjections: injected };
}

// ─── Incremental parser ────────────────────────────────────────────────────────

export interface IncrementalResult {
    updatedMarkdown: string;
    extractedCards: ParsedCard[];
    hasNewInjections: boolean;
    /** How many blocks were actually re-parsed (vs served from cache) */
    parsedBlockCount: number;
    cachedBlockCount: number;
}

/**
 * Parse markdown incrementally using a per-block string cache.
 *
 * @param markdown         Current full markdown content.
 * @param previousBlocks   Block array from the previous parse cycle (for diffing).
 * @param blockCache       Map<blockText, BlockParseResult> — mutated in place.
 * @param cardDictionary   Map<normalizedFront, cardId> — for deduplication.
 */
export function parseIncremental(
    markdown: string,
    previousBlocks: string[],
    blockCache: Map<string, BlockParseResult>,
    cardDictionary: Map<string, string>
): { result: IncrementalResult; newBlocks: string[] } {
    const newBlocks = splitIntoBlocks(markdown);

    let updatedMarkdown = '';
    const extractedCards: ParsedCard[] = [];
    let hasNewInjections = false;
    let parsedBlockCount = 0;
    let cachedBlockCount = 0;

    for (const block of newBlocks) {
        let cached = blockCache.get(block);
        if (!cached) {
            cached = parseBlock(block, cardDictionary);
            blockCache.set(block, cached);
            parsedBlockCount++;
        } else {
            cachedBlockCount++;
        }

        updatedMarkdown += cached.blockText;
        extractedCards.push(...cached.cards);
        if (cached.hasNewInjections) hasNewInjections = true;
    }

    // Evict stale cache entries that no longer appear in the document
    // (keeps memory bounded for very long editing sessions)
    const currentBlockSet = new Set(newBlocks);
    for (const key of blockCache.keys()) {
        if (!currentBlockSet.has(key)) blockCache.delete(key);
    }

    return {
        result: {
            updatedMarkdown,
            extractedCards,
            hasNewInjections,
            parsedBlockCount,
            cachedBlockCount
        },
        newBlocks
    };
}

// ─── Threshold ────────────────────────────────────────────────────────────────

/**
 * If a notebook has fewer blocks than this threshold, parse synchronously on
 * the main thread (incremental cache). Larger notebooks offload to the Worker.
 */
export const WORKER_THRESHOLD_BLOCKS = 40;
