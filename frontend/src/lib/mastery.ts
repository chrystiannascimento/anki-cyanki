/**
 * UC-09 — Mestria e Níveis de Proficiência
 *
 * Computes a per-tag mastery score (0–100) that accounts for:
 *   - Recent accuracy  (Good/Easy reviews in the last 30 days)
 *   - Coverage         (fraction of cards in the tag reviewed at least once)
 *   - Inactivity decay (score degrades if the tag hasn't been reviewed recently)
 *   - Minimum-review gate (stays at Iniciante until at least 5 reviews)
 */

import { db } from './db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MasteryLevel = 'Iniciante' | 'Familiarizado' | 'Proficiente' | 'Mestre';

export interface TagMastery {
    tag: string;
    level: MasteryLevel;
    score: number;           // 0–100
    totalCards: number;      // flashcards carrying this tag
    reviewedCards: number;   // cards with at least one review log ever
    totalReviews: number;    // all-time review count for this tag's cards
    recentReviews: number;   // reviews in the last 30 days
    accuracy: number;        // 0–100 — (Good+Easy) / recentReviews in window
    coverage: number;        // 0–100 — reviewedCards / totalCards
    daysSinceLast: number | null; // null means never reviewed
    isDecaying: boolean;     // true when decay has started (> DECAY_START_DAYS)
    lastReviewedAt: number | null;
}

// ---------------------------------------------------------------------------
// Constants — all configurable via this block
// ---------------------------------------------------------------------------

const RECENT_WINDOW_DAYS = 30;          // window for "recent" accuracy
const MIN_REVIEWS_GATE = 5;             // minimum reviews to escape Iniciante cap
const DECAY_START_DAYS = 14;            // inactivity days before decay begins
const DECAY_FULL_DAYS = 44;             // days of inactivity for full decay (score → 0)

// Level thresholds (lower bound, inclusive)
const LEVEL_THRESHOLDS: [number, MasteryLevel][] = [
    [75, 'Mestre'],
    [50, 'Proficiente'],
    [25, 'Familiarizado'],
    [0,  'Iniciante'],
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function scoreToLevel(score: number): MasteryLevel {
    for (const [threshold, level] of LEVEL_THRESHOLDS) {
        if (score >= threshold) return level;
    }
    return 'Iniciante';
}

function decayFactor(daysSinceLast: number): number {
    if (daysSinceLast <= DECAY_START_DAYS) return 1.0;
    const elapsed = daysSinceLast - DECAY_START_DAYS;
    const window = DECAY_FULL_DAYS - DECAY_START_DAYS; // 30 days
    return Math.max(0, 1 - elapsed / window);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute mastery data for every unique tag that has at least one flashcard.
 * Reads the local Dexie database — works fully offline.
 */
export async function computeAllTagsMastery(): Promise<TagMastery[]> {
    const [allCards, allLogs] = await Promise.all([
        db.flashcards.toArray(),
        db.reviewLogs.toArray()
    ]);

    // Build tag → card set
    const tagCards = new Map<string, Set<string>>(); // tag → Set<flashcardId>
    for (const card of allCards) {
        for (const tag of card.tags ?? []) {
            if (!tag.trim()) continue;
            if (!tagCards.has(tag)) tagCards.set(tag, new Set());
            tagCards.get(tag)!.add(card.id);
        }
    }

    // Build flashcardId → logs[]
    const logsById = new Map<string, typeof allLogs>();
    for (const log of allLogs) {
        if (!logsById.has(log.flashcardId)) logsById.set(log.flashcardId, []);
        logsById.get(log.flashcardId)!.push(log);
    }

    const recentCutoff = Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const results: TagMastery[] = [];

    for (const [tag, cardIds] of tagCards) {
        const totalCards = cardIds.size;

        // Collect all logs relevant to this tag
        const tagLogs: typeof allLogs = [];
        let lastReviewedAt: number | null = null;
        const reviewedCardIds = new Set<string>();

        for (const cardId of cardIds) {
            const logs = logsById.get(cardId) ?? [];
            for (const log of logs) {
                tagLogs.push(log);
                if (log.reviewedAt > (lastReviewedAt ?? 0)) lastReviewedAt = log.reviewedAt;
            }
            if (logs.length > 0) reviewedCardIds.add(cardId);
        }

        const totalReviews = tagLogs.length;
        const reviewedCards = reviewedCardIds.size;

        // Recent window
        const recentLogs = tagLogs.filter(l => l.reviewedAt >= recentCutoff);
        const recentReviews = recentLogs.length;

        // Accuracy: grade >= 2 (Good or Easy) counts as correct
        const correctRecent = recentLogs.filter(l => l.grade >= 2).length;
        const accuracy = recentReviews > 0 ? (correctRecent / recentReviews) * 100 : 0;

        // Coverage
        const coverage = totalCards > 0 ? (reviewedCards / totalCards) * 100 : 0;

        // Days since last review
        const daysSinceLast = lastReviewedAt !== null
            ? (now - lastReviewedAt) / (1000 * 60 * 60 * 24)
            : null;

        const decay = daysSinceLast !== null ? decayFactor(daysSinceLast) : 0;
        const isDecaying = daysSinceLast !== null && daysSinceLast > DECAY_START_DAYS;

        // Raw score: accuracy × coverage × decay, all in 0–100
        const rawScore = (accuracy / 100) * (coverage / 100) * decay * 100;

        // Minimum-review gate: cap at Iniciante ceiling (24) if insufficient reviews
        const score = Math.round(
            totalReviews < MIN_REVIEWS_GATE ? Math.min(rawScore, 24) : rawScore
        );

        results.push({
            tag,
            level: scoreToLevel(score),
            score,
            totalCards,
            reviewedCards,
            totalReviews,
            recentReviews,
            accuracy: Math.round(accuracy),
            coverage: Math.round(coverage),
            daysSinceLast: daysSinceLast !== null ? Math.floor(daysSinceLast) : null,
            isDecaying,
            lastReviewedAt
        });
    }

    // Sort: highest score first, then alphabetical
    results.sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag));
    return results;
}

/**
 * Compute mastery data for a single tag.
 * Useful for inline card-level display without loading all tags.
 */
export async function computeTagMastery(tag: string): Promise<TagMastery | null> {
    const all = await computeAllTagsMastery();
    return all.find(t => t.tag === tag) ?? null;
}

// ---------------------------------------------------------------------------
// Display helpers (pure functions — no side effects)
// ---------------------------------------------------------------------------

export interface LevelMeta {
    label: MasteryLevel;
    color: string;          // Tailwind text color class
    ring: string;           // SVG stroke color (hex)
    bg: string;             // Tailwind bg class for badge
    text: string;           // Tailwind text class for badge
    description: string;
}

export const LEVEL_META: Record<MasteryLevel, LevelMeta> = {
    Iniciante: {
        label: 'Iniciante',
        color: 'text-neutral-500',
        ring: '#9ca3af',    // neutral-400
        bg: 'bg-neutral-100 dark:bg-neutral-800',
        text: 'text-neutral-600 dark:text-neutral-400',
        description: 'Primeiros contatos com o tópico. Continue revisando!'
    },
    Familiarizado: {
        label: 'Familiarizado',
        color: 'text-sky-600 dark:text-sky-400',
        ring: '#38bdf8',    // sky-400
        bg: 'bg-sky-50 dark:bg-sky-900/30',
        text: 'text-sky-700 dark:text-sky-400',
        description: 'Conceitos básicos assimilados. Mantenha a consistência.'
    },
    Proficiente: {
        label: 'Proficiente',
        color: 'text-violet-600 dark:text-violet-400',
        ring: '#a78bfa',    // violet-400
        bg: 'bg-violet-50 dark:bg-violet-900/30',
        text: 'text-violet-700 dark:text-violet-400',
        description: 'Domínio sólido. Foque nas lacunas restantes.'
    },
    Mestre: {
        label: 'Mestre',
        color: 'text-amber-600 dark:text-amber-400',
        ring: '#fbbf24',    // amber-400
        bg: 'bg-amber-50 dark:bg-amber-900/30',
        text: 'text-amber-700 dark:text-amber-400',
        description: 'Domínio excelente. Mantenha as revisões periódicas!'
    }
};

/** SVG circle circumference for radius r. */
export function circleCircumference(r: number): number {
    return 2 * Math.PI * r;
}

/** stroke-dashoffset value to render `pct` percent of the ring (0–100). */
export function ringOffset(r: number, pct: number): number {
    const c = circleCircumference(r);
    return c * (1 - Math.max(0, Math.min(100, pct)) / 100);
}
