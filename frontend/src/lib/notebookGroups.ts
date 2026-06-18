import { nanoid } from 'nanoid';
import { db, type NotebookGroup, type GroupSession, type Flashcard } from './db';

export type SessionScore = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';

export const SCORE_COLOR: Record<SessionScore, string> = {
    S: '#10b981',
    A: '#6366f1',
    B: '#3b82f6',
    C: '#f59e0b',
    D: '#f97316',
    E: '#f43f5e',
};

export const SCORE_LABEL: Record<SessionScore, string> = {
    S: 'S',
    A: 'A',
    B: 'B',
    C: 'C',
    D: 'D',
    E: 'E',
};

export function calculateScore(correct: number, total: number): SessionScore {
    if (total === 0) return 'E';
    const pct = correct / total;
    if (pct >= 0.95) return 'S';
    if (pct >= 0.85) return 'A';
    if (pct >= 0.70) return 'B';
    if (pct >= 0.55) return 'C';
    if (pct >= 0.40) return 'D';
    return 'E';
}

export async function generateGroups(
    notebookId: string,
    cardIds: string[],
    groupSize: number
): Promise<NotebookGroup[]> {
    const groups: NotebookGroup[] = [];
    const now = Date.now();
    for (let i = 0; i < cardIds.length; i += groupSize) {
        const slice = cardIds.slice(i, i + groupSize);
        groups.push({
            id: nanoid(),
            notebookId,
            groupIndex: Math.floor(i / groupSize) + 1,
            cardIds: slice,
            cardCount: slice.length,
            groupSize,
            shuffled: false,
            shuffleSeed: null,
            createdAt: now,
            synced: false,
        });
    }
    await db.notebookGroups.bulkAdd(groups);
    return groups;
}

export async function getGroupsForNotebook(notebookId: string): Promise<NotebookGroup[]> {
    return db.notebookGroups
        .where('notebookId').equals(notebookId)
        .sortBy('groupIndex');
}

export async function getRecentSessions(groupId: string, limit = 5): Promise<GroupSession[]> {
    const all = await db.groupSessions
        .where('groupId').equals(groupId)
        .sortBy('studiedAt');
    return all.slice(-limit);
}

export async function saveGroupSession(
    data: Omit<GroupSession, 'id' | 'synced'>
): Promise<GroupSession> {
    const record: GroupSession = { ...data, id: nanoid(), synced: false };
    await db.groupSessions.add(record);
    return record;
}

export async function toggleShuffle(group: NotebookGroup): Promise<void> {
    if (!group.shuffled) {
        await db.notebookGroups.update(group.id, {
            shuffled: true,
            shuffleSeed: Math.floor(Math.random() * 2 ** 31),
        });
    } else {
        await db.notebookGroups.update(group.id, {
            shuffled: false,
            shuffleSeed: null,
        });
    }
}

export async function reshuffleSeed(groupId: string): Promise<void> {
    await db.notebookGroups.update(groupId, {
        shuffleSeed: Math.floor(Math.random() * 2 ** 31),
    });
}

export async function deleteGroupsForNotebook(notebookId: string): Promise<void> {
    await db.groupSessions.where('notebookId').equals(notebookId).delete();
    await db.notebookGroups.where('notebookId').equals(notebookId).delete();
}

// Deterministic seeded shuffle (mulberry32 algorithm)
export function shuffledCards(cardIds: string[], seed: number): string[] {
    let s = seed;
    function rand(): number {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    const arr = [...cardIds];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export async function getValidCardsForGroup(group: NotebookGroup): Promise<Flashcard[]> {
    const cards = await db.flashcards.where('id').anyOf(group.cardIds).toArray();
    // Preserve the original order from cardIds (or shuffled order if active)
    const idOrder = group.shuffled && group.shuffleSeed !== null
        ? shuffledCards(group.cardIds, group.shuffleSeed)
        : group.cardIds;
    const cardMap = new Map(cards.map(c => [c.id, c]));
    return idOrder.map(id => cardMap.get(id)).filter((c): c is Flashcard => c !== undefined);
}

export function relativeDate(ts: number): string {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'agora mesmo';
    if (mins < 60) return `há ${mins} minuto${mins !== 1 ? 's' : ''}`;
    if (hours < 24) return `há ${hours} hora${hours !== 1 ? 's' : ''}`;
    if (days === 1) return 'há 1 dia';
    if (days < 30) return `há ${days} dias`;
    const months = Math.floor(days / 30);
    return `há ${months} ${months === 1 ? 'mês' : 'meses'}`;
}
