import { FSRS, type Card as FSRSCardType, Rating as FSRSRating, generatorParameters, createEmptyCard } from 'ts-fsrs';
import { db, type ReviewLog } from '$lib/db';
import { syncEngine } from '$lib/sync';
import { typeMultiplier } from '$lib/checklistRenderer';

const params = generatorParameters({ request_retention: 0.90 });
const f = new FSRS(params);

export { FSRSRating as Rating };

export async function getCardState(flashcardId: string): Promise<FSRSCardType> {
    const logs = await db.reviewLogs
        .where('flashcardId').equals(flashcardId)
        .sortBy('reviewedAt');

    let card = createEmptyCard();

    for (const log of logs) {
        const rating = log.grade as FSRSRating;
        const reviewTime = new Date(log.reviewedAt);
        const schedulingCards = f.repeat(card, reviewTime);
        const ratingKey = String(rating) as unknown as keyof typeof schedulingCards;
        card = (schedulingCards as any)[ratingKey]?.card || card;
    }

    return card;
}

export async function getAllCardStates(): Promise<Map<string, FSRSCardType>> {
    const allCards = await db.flashcards.toArray();
    const reviews = await db.reviewLogs.toArray();

    const cardStates = new Map<string, FSRSCardType>();

    for (const card of allCards) {
        cardStates.set(card.id, createEmptyCard());
    }

    // Apply historical reviews sequentially to build current state
    const sortedReviews = reviews.sort((a, b) => a.reviewedAt - b.reviewedAt);

    for (const log of sortedReviews) {
        let cardState = cardStates.get(log.flashcardId);
        if (cardState) {
            const rating = log.grade as FSRSRating;
            const reviewTime = new Date(log.reviewedAt);
            const schedulingCards = f.repeat(cardState, reviewTime);
            const ratingKey = String(rating) as unknown as keyof typeof schedulingCards;
            cardStates.set(log.flashcardId, (schedulingCards as any)[ratingKey]?.card || cardState);
        }
    }

    return cardStates;
}

export async function getDueCards(limit = 20) {
    const allCards = await db.flashcards.toArray();
    const cardStates = await getAllCardStates();

    const now = new Date();

    // Filter cards that are due
    const overdueCards = allCards.filter(c => {
        const state = cardStates.get(c.id);
        return state && state.due <= now;
    });

    // Sort by due date ascending (most overdue first)
    overdueCards.sort((a, b) => {
        const dateA = cardStates.get(a.id)?.due.getTime() || 0;
        const dateB = cardStates.get(b.id)?.due.getTime() || 0;
        return dateA - dateB;
    });

    return overdueCards.slice(0, limit);
}

export async function processReview(flashcardId: string, rating: FSRSRating) {
    // 1. Get current true card state from local history replay
    const card = await getCardState(flashcardId);

    // 2. Calculate next state
    const now = new Date();
    const schedulingCards = f.repeat(card, now);
    const ratingKey = String(rating) as unknown as keyof typeof schedulingCards;

    let nextState = (schedulingCards as any)[ratingKey]?.card || card;
    const logItem = (schedulingCards as any)[ratingKey]?.log;

    // US-10: Apply type-based interval multiplier for Good/Easy ratings
    // FATO × 1.5 | CONCEITO × 1.0 | PROCEDIMENTO × 1.5
    if (rating >= FSRSRating.Good) {
        const flashcard = await db.flashcards.get(flashcardId);
        const mult = typeMultiplier(flashcard?.type);
        if (mult !== 1.0 && nextState.due) {
            const dueDiff = nextState.due.getTime() - now.getTime();
            nextState = {
                ...nextState,
                due: new Date(now.getTime() + dueDiff * mult)
            };
        }
    }

    // 3. Save Review Log to Dexie
    const reviewLog: ReviewLog = {
        flashcardId,
        grade: rating,
        state: nextState.state,
        reviewedAt: now.getTime(),
        synced: false
    };

    const logId = await db.reviewLogs.add(reviewLog);

    // 4. Queue Sync
    await syncEngine.enqueue('CREATE', 'REVIEW_LOG', logId as number, reviewLog);

    return { nextState, logItem };
}
