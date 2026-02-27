import { FSRS, type Card as FSRSCardType, Rating as FSRSRating, generatorParameters, createEmptyCard } from 'ts-fsrs';
import { db, type ReviewLog } from '$lib/db';
import { syncEngine } from '$lib/sync';

const params = generatorParameters({ request_retention: 0.90 });
const f = new FSRS(params);

export { FSRSRating as Rating };

export async function getDueCards(limit = 20) {
    const allCards = await db.flashcards.toArray();
    const reviews = await db.reviewLogs.toArray();

    // Map cards to their latest FSRS state
    // In a real optimized system, we'd store the FSRS stringified state directly on the flashcard table for quick indexing.
    // Since this is a scaffold, we'll calculate it on the fly. Let's create an FSRSCard object per Cyanki flashcard.

    const cardStates = new Map<string, FSRSCardType>();

    for (const card of allCards) {
        cardStates.set(card.id, createEmptyCard());
    }

    // Apply historical reviews sequentially to build current state
    const sortedReviews = reviews.sort((a, b) => a.reviewedAt - b.reviewedAt);
    for (const log of sortedReviews) {
        let cardState = cardStates.get(log.flashcardId);
        if (cardState) {
            // Replay the fsrs iteration
            // We'll skip deep replay for the scaffold and assume we only need the Next Review Date.
            // Ideally, the DB needs a `nextReview` column on the Flashcard model for indexed querying.
        }
    }

    // For simplicity of this Prototype/Scaffold: Return cards that haven't been reviewed much, or simply first N cards.
    // In production, we yield `allCards.filter(c => cardState.get(c.id).due <= new Date())`

    return allCards.slice(0, limit);
}

export async function processReview(flashcardId: string, rating: FSRSRating) {
    // 1. Get current card state from DB (mocked as empty for now)
    const card = createEmptyCard();

    // 2. Calculate next state
    const schedulingCards = f.repeat(card, new Date());
    const ratingKey = String(rating) as unknown as keyof typeof schedulingCards;

    const nextState = (schedulingCards as any)[ratingKey]?.card || card;
    const logItem = (schedulingCards as any)[ratingKey]?.log;

    // 3. Save Review Log to Dexie
    const reviewLog: ReviewLog = {
        flashcardId,
        grade: rating,
        state: nextState.state,
        reviewedAt: Date.now(),
        synced: false
    };

    const logId = await db.reviewLogs.add(reviewLog);

    // 4. Queue Sync
    await syncEngine.enqueue('CREATE', 'REVIEW_LOG', logId as number, reviewLog);

    return { nextState, logItem };
}
