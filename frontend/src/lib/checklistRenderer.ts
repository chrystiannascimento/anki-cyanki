/**
 * Checklist rendering utilities for Ultralearning flashcards.
 *
 * Handles the Prompt Master format:
 *   - [ ] unchecked criterion
 *   - [x] pre-checked criterion   (case-insensitive [X] also works)
 *
 * US-01: render unchecked  – US-02: render checked  – US-03: counter
 * US-04: auto-evaluation score derived from checked ratio
 */

export interface ChecklistItem {
    text: string;
    checked: boolean;
}

/** Regex that matches a single checklist line (tolerates leading spaces and varied bracket content) */
const ITEM_RE = /^\s*-\s*\[\s*(x|X| )\s*\]\s*(.+)/;

/**
 * Splits raw card `back` content into:
 *  - `answerText`    — everything before the first checklist block
 *  - `checklistItems` — parsed checklist items (may be empty)
 *
 * Supports two layouts:
 *  1. Explicit "Critérios:" / "Criterios:" header followed by `- [ ]` lines
 *  2. Inline checklist items anywhere in the content (no header required)
 */
// Matches "Critérios:" / "Criterios:" regardless of Unicode normalization form,
// case, or whether it appears mid-line or at line start.
const CRITERIA_HEADER_RE = /Crit[eé]rios?\s*:/i;

export function splitContentAndChecklist(content: string): {
    answerText: string;
    checklistItems: ChecklistItem[];
} {
    // Normalize Unicode so composed (é = \u00e9) and decomposed (e + \u0301) match equally
    const normalized = content.normalize('NFC');

    // --- Layout 1: explicit "Critérios:" header ---
    const headerMatch = CRITERIA_HEADER_RE.exec(normalized);
    if (headerMatch && headerMatch.index !== undefined) {
        // Find the newline that ends the header line
        const newlineIdx = normalized.indexOf('\n', headerMatch.index);
        if (newlineIdx !== -1) {
            const answerText = normalized.slice(0, headerMatch.index).trim();
            const criteriaBlock = normalized.slice(newlineIdx + 1);
            const checklistItems = parseChecklistItems(criteriaBlock);
            if (checklistItems.length > 0) {
                return { answerText, checklistItems };
            }
        }
    }

    // --- Layout 2: bare checklist lines anywhere in the content ---
    const lines = normalized.split('\n');
    let firstChecklist = -1;
    for (let i = 0; i < lines.length; i++) {
        if (ITEM_RE.test(lines[i])) {
            firstChecklist = i;
            break;
        }
    }

    if (firstChecklist === -1) {
        return { answerText: content, checklistItems: [] };
    }

    const answerText = lines.slice(0, firstChecklist).join('\n').trim();
    const checklistText = lines.slice(firstChecklist).join('\n');
    return { answerText, checklistItems: parseChecklistItems(checklistText) };
}

/**
 * Parses all `- [ ]` / `- [x]` lines from a text block into ChecklistItems.
 * Non-checklist lines are ignored.
 */
export function parseChecklistItems(text: string): ChecklistItem[] {
    const items: ChecklistItem[] = [];
    for (const line of text.split('\n')) {
        const m = ITEM_RE.exec(line.trim());
        if (m) {
            items.push({ text: m[2].trim(), checked: m[1].toLowerCase() === 'x' });
        }
    }
    return items;
}

/**
 * Returns { checked, total } from a checklist items array.
 */
export function countChecklist(items: ChecklistItem[]): { checked: number; total: number } {
    return {
        checked: items.filter(i => i.checked).length,
        total: items.length
    };
}

/**
 * US-04: Maps a checklist score (0–1) to a suggested FSRS rating label.
 *
 * score = 1.0        → 'good' (passed — long interval)
 * score >= 0.5       → 'hard' (partial — short interval)
 * score < 0.5        → 'again' (failed — reschedule tomorrow)
 */
export function scoreToRating(checked: number, total: number): 'again' | 'hard' | 'good' {
    if (total === 0) return 'good'; // no checklist → no auto-eval
    const ratio = checked / total;
    if (ratio >= 1.0) return 'good';
    if (ratio >= 0.5) return 'hard';
    return 'again';
}

/**
 * US-10: Returns the interval multiplier for a given card type when the
 * review result is "passed" (Good/Easy).
 *
 * FATO        × 1.5 — slower forgetting
 * CONCEITO    × 1.0 — default
 * PROCEDIMENTO × 1.5 — procedural memory is stable
 */
export function typeMultiplier(type?: string): number {
    if (type === 'FATO' || type === 'PROCEDIMENTO') return 1.5;
    return 1.0;
}
