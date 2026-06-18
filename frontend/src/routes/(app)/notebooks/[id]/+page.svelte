<script lang="ts">
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import { db, type Notebook, type Flashcard, type NotebookGroup, type GroupSession } from '$lib/db';
	import {
		generateGroups,
		getGroupsForNotebook,
		getRecentSessions,
		deleteGroupsForNotebook,
		toggleShuffle,
		reshuffleSeed,
		calculateScore,
		SCORE_COLOR,
		relativeDate,
	} from '$lib/notebookGroups';
	import { syncEngine } from '$lib/sync';
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';
	import {
		parseIncremental,
		splitIntoBlocks,
		WORKER_THRESHOLD_BLOCKS,
		type IncrementalResult,
		type ParsedCard
	} from '$lib/notebookParserIncremental';
	// Fallback: full sync parse used for initial load and as Worker replacement
	import { parseAndInjectNotebookFlashcards } from '$lib/notebookParser';

	// ─── Route ────────────────────────────────────────────────────────────────
	let notebookId = $page.params.id as string;
	let notebook: Notebook | undefined = undefined;

	// ─── Editor state ─────────────────────────────────────────────────────────
	let content = '';
	let renderedContent = '';
	let isSaving = false;
	let viewMode: 'markdown' | 'flashcards' | 'subgroups' = 'markdown';

	// ─── UC-38/39/41: Subgroups state ─────────────────────────────────────────
	let notebookGroupsList: NotebookGroup[] = [];
	let groupSessionsMap = new Map<string, GroupSession[]>();
	let groupValidCounts = new Map<string, number>();
	let groupSize = 20;
	let isGeneratingGroups = false;
	let showReorganizeModal = false;
	let isReorganizing = false;

	async function loadGroups() {
		notebookGroupsList = await getGroupsForNotebook(notebookId);
		const allIds = new Set((await db.flashcards.toArray()).map((c: Flashcard) => c.id));
		const sessionsMap = new Map<string, GroupSession[]>();
		const validMap = new Map<string, number>();
		for (const g of notebookGroupsList) {
			sessionsMap.set(g.id, await getRecentSessions(g.id));
			validMap.set(g.id, g.cardIds.filter(id => allIds.has(id)).length);
		}
		groupSessionsMap = sessionsMap;
		groupValidCounts = validMap;
	}

	async function handleGenerateGroups() {
		if (sessionFlashcards.length === 0 || isGeneratingGroups) return;
		isGeneratingGroups = true;
		try {
			const cardIds = sessionFlashcards.map((c: any) => c.id);
			await generateGroups(notebookId, cardIds, groupSize);
			await loadGroups();
		} finally {
			isGeneratingGroups = false;
		}
	}

	async function handleToggleShuffle(group: NotebookGroup) {
		if (group.shuffled) {
			await reshuffleSeed(group.id);
		} else {
			await toggleShuffle(group);
		}
		await loadGroups();
	}

	async function handleResetShuffle(group: NotebookGroup) {
		await db.notebookGroups.update(group.id, { shuffled: false, shuffleSeed: null });
		await loadGroups();
	}

	async function handleReorganize() {
		isReorganizing = true;
		try {
			await deleteGroupsForNotebook(notebookId);
			const cardIds = sessionFlashcards.map((c: any) => c.id);
			await generateGroups(notebookId, cardIds, groupSize);
			await loadGroups();
			showReorganizeModal = false;
		} finally {
			isReorganizing = false;
		}
	}

	$: groupsPreviewCount = sessionFlashcards.length > 0
		? Math.ceil(sessionFlashcards.length / Math.max(5, groupSize))
		: 0;

	$: masterizedCount = notebookGroupsList.filter(g => {
		const sessions = groupSessionsMap.get(g.id) ?? [];
		const last = sessions[sessions.length - 1];
		return last && ['B', 'A', 'S'].includes(last.score);
	}).length;

	$: notebookUpdatedAfterGroups = notebookGroupsList.length > 0 && (() => {
		const snapshotTotal = notebookGroupsList.reduce((s, g) => s + g.cardIds.length, 0);
		return sessionFlashcards.length !== snapshotTotal;
	})();
	let sessionFlashcards: ParsedCard[] = [];
	let parseToast: { updated: number; created: number } | null = null;
	let parseToastTimer: ReturnType<typeof setTimeout>;
	let isForceReparsing = false;

	// ─── UC-16: Performance indicators ────────────────────────────────────────
	let parseMode: 'worker' | 'incremental' | 'sync' = 'sync';
	let lastParseStats = { parsed: 0, cached: 0, totalMs: 0 };
	let showPerfHint = false;

	// ─── UC-16: Incremental parse state ───────────────────────────────────────
	/** Cache: blockText → parse result. Cleared when notebook changes. */
	const blockCache = new Map<string, ReturnType<typeof import('$lib/notebookParserIncremental').parseIncremental>['result'] extends { extractedCards: infer _; } ? any : any>();
	let previousBlocks: string[] = [];
	/** Map<normalizedFront, cardId> — built from DB on mount and updated after each parse */
	let cardDictionary = new Map<string, string>();

	// ─── UC-16: Web Worker setup ───────────────────────────────────────────────
	let worker: Worker | null = null;
	let workerAvailable = false;
	/** Monotonic counter — discard responses from superseded requests */
	let currentReqId = 0;
	/** Resolve function for the currently pending worker promise */
	let workerResolve: ((r: IncrementalResult) => void) | null = null;

	function initWorker() {
		try {
			worker = new Worker(
				new URL('../../../../lib/workers/notebookParser.worker.ts', import.meta.url),
				{ type: 'module' }
			);
			worker.onmessage = handleWorkerMessage;
			worker.onerror = () => {
				// Worker failed — degrade gracefully to incremental sync
				workerAvailable = false;
				worker?.terminate();
				worker = null;
				if (workerResolve) {
					// Fall back to sync parse for the pending request
					syncParseAndResolve(content).then(workerResolve);
					workerResolve = null;
				}
			};
			workerAvailable = true;
		} catch {
			// Web Workers not available (e.g. some security contexts)
			workerAvailable = false;
		}
	}

	function handleWorkerMessage(e: MessageEvent) {
		const { reqId, updatedMarkdown, extractedCards, hasNewInjections } = e.data;
		if (reqId !== currentReqId) return; // stale response — discard

		const result: IncrementalResult = {
			updatedMarkdown,
			extractedCards,
			hasNewInjections,
			parsedBlockCount: extractedCards.length,
			cachedBlockCount: 0
		};

		if (workerResolve) {
			workerResolve(result);
			workerResolve = null;
		}
	}

	/** Send work to the Web Worker, returns a Promise that resolves with the result. */
	function dispatchToWorker(markdown: string): Promise<IncrementalResult> {
		return new Promise(resolve => {
			workerResolve = resolve;
			currentReqId++;
			worker!.postMessage({
				reqId: currentReqId,
				markdown,
				cardDictionary: [...cardDictionary.entries()]
			});
		});
	}

	// ─── UC-16: Sync fallback ──────────────────────────────────────────────────
	async function syncParseAndResolve(markdown: string): Promise<IncrementalResult> {
		const { updatedMarkdown, hasNewInjections, extractedCards } = await parseAndInjectNotebookFlashcards(markdown);
		return {
			updatedMarkdown,
			extractedCards,
			hasNewInjections,
			parsedBlockCount: extractedCards.length,
			cachedBlockCount: 0
		};
	}

	// ─── UC-16: Main parse dispatcher ─────────────────────────────────────────
	/**
	 * Decides which parse strategy to use based on document size:
	 *   1. Small notebook (< WORKER_THRESHOLD_BLOCKS): incremental main-thread cache
	 *   2. Large notebook with Worker available: offload to Worker
	 *   3. Fallback: full synchronous parse (parseAndInjectNotebookFlashcards)
	 *
	 * Returns the unified IncrementalResult regardless of path taken.
	 */
	async function dispatchParse(markdown: string): Promise<IncrementalResult> {
		const t0 = performance.now();

		const blocks = splitIntoBlocks(markdown);
		let result: IncrementalResult;

		if (blocks.length < WORKER_THRESHOLD_BLOCKS) {
			// ── Path 1: Incremental main-thread ──────────────────────────────
			parseMode = 'incremental';
			const { result: r, newBlocks } = parseIncremental(
				markdown,
				previousBlocks,
				blockCache,
				cardDictionary
			);
			previousBlocks = newBlocks;
			result = r;
		} else if (workerAvailable && worker) {
			// ── Path 2: Web Worker ────────────────────────────────────────────
			parseMode = 'worker';
			result = await dispatchToWorker(markdown);
		} else {
			// ── Path 3: Sync fallback ─────────────────────────────────────────
			parseMode = 'sync';
			result = await syncParseAndResolve(markdown);
		}

		lastParseStats = {
			parsed: result.parsedBlockCount,
			cached: result.cachedBlockCount,
			totalMs: Math.round(performance.now() - t0)
		};

		return result;
	}

	// ─── DB sync after parse ───────────────────────────────────────────────────
	/**
	 * Persist parsed cards to Dexie (create/update) and enqueue sync operations.
	 * This always runs on the main thread regardless of the parse path taken.
	 */
	async function persistCards(cards: ParsedCard[], showToast = false) {
		let updated = 0;
		let created = 0;

		for (const card of cards) {
			const existing = await db.flashcards.get(card.id);
			if (existing) {
				const hasChanged =
					existing.front !== card.front ||
					existing.back !== card.back ||
					(existing.tags ?? []).join() !== (card.tags ?? []).join() ||
					existing.type !== card.type;
				if (hasChanged) {
					await db.flashcards.update(card.id, {
						front: card.front,
						back: card.back,
						tags: card.tags,
						type: card.type
					});
					await syncEngine.enqueue('UPDATE', 'FLASHCARD', card.id, card);
					cardDictionary.set(card.front.toLowerCase(), card.id);
					updated++;
				}
			} else {
				await db.flashcards.add(card as Flashcard);
				await syncEngine.enqueue('CREATE', 'FLASHCARD', card.id, card);
				cardDictionary.set(card.front.toLowerCase(), card.id);
				created++;
			}
		}

		if (showToast && (updated > 0 || created > 0)) {
			clearTimeout(parseToastTimer);
			parseToast = { updated, created };
			parseToastTimer = setTimeout(() => { parseToast = null; }, 4000);
		}
	}

	// ─── Lifecycle ─────────────────────────────────────────────────────────────
	marked.setOptions({ breaks: true });
	let saveTimer: ReturnType<typeof setTimeout>;

	onMount(async () => {
		initWorker();

		notebook = await db.notebooks.get(notebookId);
		if (!notebook) return;

		content = notebook.content;
		renderMarkdown(content);

		// Build initial cardDictionary from existing DB cards
		const existingCards = await db.flashcards.toArray();
		for (const c of existingCards) {
			cardDictionary.set(c.front.trim().toLowerCase(), c.id);
		}

		// Initial parse to populate sessionFlashcards — use Worker/incremental
		const parsed = await dispatchParse(content);
		sessionFlashcards = parsed.extractedCards;

		if (parsed.hasNewInjections) {
			content = parsed.updatedMarkdown;
			renderMarkdown(content);
		}

		await persistCards(parsed.extractedCards, true);
		showPerfHint = true;
		await loadGroups();
	});

	onDestroy(() => {
		clearTimeout(saveTimer);
		clearTimeout(parseToastTimer);
		worker?.terminate();
	});

	// ─── Input handler ─────────────────────────────────────────────────────────
	async function handleInput() {
		renderMarkdown(content);

		clearTimeout(saveTimer);
		saveTimer = setTimeout(async () => {
			if (!notebook) return;
			isSaving = true;
			try {
				const parsed = await dispatchParse(content);
				sessionFlashcards = parsed.extractedCards;

				if (parsed.hasNewInjections) {
					content = parsed.updatedMarkdown;
					renderMarkdown(content);
				}

				await persistCards(parsed.extractedCards);

				await db.notebooks.update(notebookId, {
					content: content,
					updatedAt: Date.now()
				});
				await syncEngine.enqueue('UPDATE', 'NOTEBOOK', notebookId, {
					title: notebook.title,
					content: content,
					isPublic: notebook.isPublic
				});
			} finally {
				isSaving = false;
			}
		}, 1000);
	}

	// ─── Force re-parse (bypasses block cache, uses full sync parser) ──────────
	async function forceReparse() {
		if (!notebook || isForceReparsing) return;
		isForceReparsing = true;
		// Clear caches so everything is re-processed from scratch
		blockCache.clear();
		previousBlocks = [];
		try {
			const parsed = await syncParseAndResolve(content);
			sessionFlashcards = parsed.extractedCards;
			if (parsed.hasNewInjections) {
				content = parsed.updatedMarkdown;
				renderMarkdown(content);
				await db.notebooks.update(notebookId, { content, updatedAt: Date.now() });
			}
			await persistCards(parsed.extractedCards, true);
		} finally {
			isForceReparsing = false;
		}
	}

	// ─── Helpers ───────────────────────────────────────────────────────────────
	function renderMarkdown(md: string) {
		const cleanMd = md.replace(/<!--\s*id:\s*[\w-]+\s*-->/g, '');
		renderedContent = DOMPurify.sanitize(marked.parse(cleanMd) as string);
	}

	async function togglePublic() {
		if (!notebook) return;
		notebook.isPublic = !notebook.isPublic;
		await db.notebooks.update(notebookId, {
			isPublic: notebook.isPublic,
			updatedAt: Date.now()
		});
		await syncEngine.enqueue('UPDATE', 'NOTEBOOK', notebookId, {
			title: notebook.title,
			content: notebook.content,
			isPublic: notebook.isPublic
		});
		notebook = notebook;
	}

	// Parse mode label for the status bar
	$: parseModeLabel = parseMode === 'worker'
		? '⚡ Worker'
		: parseMode === 'incremental'
		? '🔄 Incremental'
		: '📋 Sync';

	// ─── UC-17: Virtual scroll ─────────────────────────────────────────────────
	/**
	 * Estimated height (px) per flashcard item including bottom margin.
	 * Cards with long answers/many tags will be taller; we use a generous
	 * estimate and absorb the drift with a large overscan buffer.
	 */
	const ESTIMATED_CARD_HEIGHT = 156;

	/** Number of extra cards to render above and below the visible viewport. */
	const BASE_OVERSCAN = 5;

	/** Only activate virtual rendering above this threshold — below it, render all. */
	const VIRTUAL_THRESHOLD = 20;

	let flashcardsContainerHeight = 600;
	let flashcardsScrollTop = 0;

	/**
	 * Svelte action: attaches a ResizeObserver so we always know the container's
	 * rendered height without reading the DOM on every scroll event.
	 */
	function useVirtualContainer(node: HTMLElement) {
		flashcardsContainerHeight = node.clientHeight;
		const ro = new ResizeObserver(() => {
			flashcardsContainerHeight = node.clientHeight;
		});
		ro.observe(node);
		return { destroy() { ro.disconnect(); } };
	}

	function onFlashcardsScroll(e: Event) {
		flashcardsScrollTop = (e.currentTarget as HTMLElement).scrollTop;
	}

	// Reduce overscan on low-memory devices (navigator.deviceMemory is 0.25–8 on Chrome)
	$: effectiveOverscan = (() => {
		const mem = (navigator as any).deviceMemory as number | undefined;
		if (mem !== undefined && mem <= 1) return 2;
		if (mem !== undefined && mem <= 2) return 3;
		return BASE_OVERSCAN;
	})();

	// ─── UC-19: Inverted index & in-editor search ─────────────────────────────
	let searchQuery = '';
	let searchVisible = false;
	let textareaEl: HTMLTextAreaElement;
	let searchInputEl: HTMLInputElement;

	/** tag (lowercased) → set of card indices in sessionFlashcards */
	let tagIndex = new Map<string, Set<number>>();
	/** word token (lowercased) → set of card indices in sessionFlashcards */
	let termIndex = new Map<string, Set<number>>();

	function buildIndex(cards: ParsedCard[]) {
		const newTagIdx = new Map<string, Set<number>>();
		const newTermIdx = new Map<string, Set<number>>();
		cards.forEach((card, i) => {
			// Tag index
			for (const tag of card.tags) {
				const k = tag.toLowerCase();
				if (!newTagIdx.has(k)) newTagIdx.set(k, new Set());
				newTagIdx.get(k)!.add(i);
			}
			// Term index (tokenise front + back)
			const tokens = `${card.front} ${card.back}`
				.toLowerCase()
				.split(/\W+/)
				.filter(t => t.length > 1);
			for (const token of tokens) {
				if (!newTermIdx.has(token)) newTermIdx.set(token, new Set());
				newTermIdx.get(token)!.add(i);
			}
		});
		tagIndex = newTagIdx;
		termIndex = newTermIdx;
	}

	// Rebuild index whenever cards change (O(N) but fast for typical notebook sizes)
	$: buildIndex(sessionFlashcards);

	/**
	 * Returns the set of matching card indices, or null when no query is active.
	 * Syntax: `#tag` for tag search; plain text for AND term search.
	 */
	$: matchedIndices = (() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return null;

		if (q.startsWith('#')) {
			const tag = q.slice(1).trim();
			if (!tag) return null;
			return tagIndex.get(tag) ?? new Set<number>();
		}

		// Term search — AND across all tokens, substring match within index keys
		const tokens = q.split(/\s+/).filter(t => t.length > 0);
		let result: Set<number> | null = null;
		for (const token of tokens) {
			const matches = new Set<number>();
			for (const [key, indices] of termIndex) {
				if (key.includes(token)) {
					for (const idx of indices) matches.add(idx);
				}
			}
			result = result === null
				? matches
				: new Set([...result].filter(i => matches.has(i)));
		}
		return result ?? new Set<number>();
	})();

	/** The cards to display — either all or the search-filtered subset. */
	$: displayedFlashcards = matchedIndices === null
		? sessionFlashcards
		: sessionFlashcards.filter((_, i) => matchedIndices!.has(i));

	function typeBadge(type?: string): { label: string; cls: string } | null {
		if (type === 'CONCEITO') return { label: 'Conceito', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' };
		if (type === 'FATO')     return { label: 'Fato',     cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' };
		if (type === 'PROCEDIMENTO') return { label: 'Procedimento', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' };
		return null;
	}

	/** Split back into answer text + criteria lines (mirrors checklistRenderer logic) */
	function splitBack(back: string): { answer: string; criteria: string[] } {
		const headerRe = /^Crit[eé]rios?:\s*\r?\n([\s\S]+)$/im;
		const m = back.match(headerRe);
		if (m && m.index !== undefined) {
			const answer = back.slice(0, m.index).trim();
			const criteria = m[1].split('\n')
				.map(l => l.replace(/^- \[[ xX]\] /, '').trim())
				.filter(Boolean);
			return { answer, criteria };
		}
		return { answer: back, criteria: [] };
	}

	function escapeHtml(s: string): string {
		return s
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	/**
	 * Return HTML with matching tokens wrapped in <mark>.
	 * Input is HTML-escaped first so there is no XSS risk.
	 */
	function highlightText(text: string, query: string): string {
		const escaped = escapeHtml(text);
		const q = query.trim();
		if (!q || q.startsWith('#')) return escaped;
		const tokens = q.toLowerCase().split(/\s+/).filter(t => t.length > 0);
		let result = escaped;
		for (const token of tokens) {
			const safe = escapeHtml(token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			result = result.replace(
				new RegExp(safe, 'gi'),
				'<mark class="bg-yellow-200 dark:bg-yellow-700/70 rounded-sm px-0.5">$&</mark>'
			);
		}
		return result;
	}

	/**
	 * Move the textarea cursor and scroll position to where the card's
	 * front text appears in the markdown source.
	 */
	function jumpToCard(card: ParsedCard) {
		if (!textareaEl) return;
		const pos = content.indexOf(card.front);
		if (pos === -1) return;
		textareaEl.focus();
		textareaEl.setSelectionRange(pos, pos + card.front.length);
		const linesBefore = content.substring(0, pos).split('\n').length;
		// ~20px per line for font-mono text-sm leading-relaxed
		textareaEl.scrollTop = Math.max(0, (linesBefore - 4) * 20);
	}

	function toggleSearch() {
		searchVisible = !searchVisible;
		if (!searchVisible) {
			searchQuery = '';
		} else {
			viewMode = 'flashcards';
			setTimeout(() => searchInputEl?.focus(), 50);
		}
	}

	function handleGlobalKeydown(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
			e.preventDefault();
			toggleSearch();
		}
		if (e.key === 'Escape' && searchVisible) {
			searchVisible = false;
			searchQuery = '';
		}
	}

	// ─── UC-17 virtual scroll — driven by displayedFlashcards (after UC-19 filter)
	$: useVirtual = displayedFlashcards.length > VIRTUAL_THRESHOLD;

	$: virtualStart = useVirtual
		? Math.max(0, Math.floor(flashcardsScrollTop / ESTIMATED_CARD_HEIGHT) - effectiveOverscan)
		: 0;

	$: virtualEnd = useVirtual
		? Math.min(
				displayedFlashcards.length,
				Math.ceil((flashcardsScrollTop + flashcardsContainerHeight) / ESTIMATED_CARD_HEIGHT) + effectiveOverscan
			)
		: displayedFlashcards.length;

	$: visibleCards = displayedFlashcards.slice(virtualStart, virtualEnd);
	$: topSpacerHeight = virtualStart * ESTIMATED_CARD_HEIGHT;
	$: bottomSpacerHeight = Math.max(0, (displayedFlashcards.length - virtualEnd) * ESTIMATED_CARD_HEIGHT);
</script>

{#if notebook}
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
	class="h-screen flex flex-col items-stretch overflow-hidden bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100"
	on:keydown={handleGlobalKeydown}
>

	<!-- Header -->
	<header class="flex items-center justify-between px-4 py-3 bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
		<div class="flex items-center gap-4 min-w-0">
			<a href="/notebooks" class="text-neutral-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition shrink-0">← Voltar</a>
			<h1 class="font-bold text-lg truncate">{notebook.title}</h1>
			<button
				on:click={togglePublic}
				class="shrink-0 ml-2 text-xs font-semibold px-2 py-1 rounded-full border transition-colors {notebook.isPublic ? 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700' : 'bg-neutral-100 text-neutral-600 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-600'}"
			>
				{notebook.isPublic ? '🌍 Público' : '🔒 Privado'}
			</button>
		</div>

		<div class="flex items-center gap-3 shrink-0">
			<!-- UC-16: Parse mode indicator -->
			{#if showPerfHint}
				<span class="hidden md:inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-600 px-2 py-1 bg-neutral-100 dark:bg-neutral-900 rounded-lg" title="Modo de parsing ativo | {lastParseStats.parsed} blocos processados, {lastParseStats.cached} do cache em {lastParseStats.totalMs}ms">
					{parseModeLabel}
					{#if lastParseStats.totalMs > 0}
						<span class="text-neutral-300 dark:text-neutral-700">{lastParseStats.totalMs}ms</span>
					{/if}
				</span>
			{/if}

			<!-- US-06: Generate flashcards with AI button -->
			<a
				href="/notebooks/ai-generate?notebookId={notebookId}"
				class="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors shadow"
				title="Gerar flashcards com IA (US-06)"
			>
				<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
				Gerar com IA
			</a>

			<!-- Force re-parse button -->
			<button
				on:click={forceReparse}
				disabled={isForceReparsing}
				title="Forçar re-parse e salvar todos os cards no banco"
				class="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors disabled:opacity-50
					{isForceReparsing ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-neutral-300 dark:border-neutral-600 text-neutral-500 dark:text-neutral-400 hover:border-indigo-500 hover:text-indigo-500'}"
			>
				{#if isForceReparsing}
					<svg class="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
					Sincronizando...
				{:else}
					<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
					Forçar sync
				{/if}
			</button>

			<div class="text-sm font-medium text-neutral-400">
				{#if isSaving}
					<span class="text-indigo-500 animate-pulse">Salvando...</span>
				{:else}
					<span class="text-neutral-400 dark:text-neutral-600">Salvo</span>
				{/if}
			</div>
		</div>
	</header>

	<div class="flex-1 flex overflow-hidden">

		<!-- Editor Pane (Left) -->
		<div class="w-1/2 overflow-y-auto border-r border-neutral-200 dark:border-neutral-700 flex flex-col">
			<div class="px-6 pt-4 pb-2">
				<p class="text-xs text-neutral-400 dark:text-neutral-600 font-medium">
					💡 Use <code class="bg-neutral-100 dark:bg-neutral-800 px-1 rounded text-[10px]">Q: Pergunta</code> + <code class="bg-neutral-100 dark:bg-neutral-800 px-1 rounded text-[10px]">A: Resposta</code> para gerar flashcards automaticamente.
					{#if lastParseStats.cached > 0}
						<span class="text-indigo-400 ml-2">({lastParseStats.cached} blocos do cache)</span>
					{/if}
				</p>
			</div>
			<textarea
				bind:this={textareaEl}
				bind:value={content}
				on:input={handleInput}
				class="flex-1 w-full bg-transparent resize-none outline-none font-mono text-sm leading-relaxed dark:text-neutral-200 dark:placeholder-neutral-600 px-6 pb-6"
				placeholder="Comece a digitar markdown aqui..."
			></textarea>
		</div>

		<!-- Preview Pane (Right) -->
		<div class="w-1/2 flex flex-col overflow-hidden bg-white dark:bg-neutral-800 relative">

			<!-- Tab switcher + search toggle -->
			<div class="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
				<div class="bg-neutral-100 dark:bg-neutral-900 rounded-full p-1 flex shadow-inner">
					<button
						class="px-4 py-1.5 rounded-full text-sm font-semibold transition-all {viewMode === 'markdown' ? 'bg-white dark:bg-neutral-700 shadow text-indigo-600 dark:text-indigo-400' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}"
						on:click={() => { viewMode = 'markdown'; searchVisible = false; searchQuery = ''; }}
					>Markdown</button>
					<button
						class="px-4 py-1.5 rounded-full text-sm font-semibold transition-all {viewMode === 'flashcards' ? 'bg-white dark:bg-neutral-700 shadow text-indigo-600 dark:text-indigo-400' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}"
						on:click={() => viewMode = 'flashcards'}
					>
						Flashcards
						<span class="ml-1 bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400 px-2 py-0.5 rounded-full text-xs">{sessionFlashcards.length}</span>
					</button>
					<button
						class="px-4 py-1.5 rounded-full text-sm font-semibold transition-all {viewMode === 'subgroups' ? 'bg-white dark:bg-neutral-700 shadow text-indigo-600 dark:text-indigo-400' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}"
						on:click={() => { viewMode = 'subgroups'; searchVisible = false; searchQuery = ''; }}
					>
						Subgrupos
						{#if notebookGroupsList.length > 0}
							<span class="ml-1 bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400 px-2 py-0.5 rounded-full text-xs">{notebookGroupsList.length}</span>
						{/if}
					</button>
				</div>

				<!-- UC-19: Search toggle (only in flashcards view) -->
				{#if viewMode === 'flashcards'}
					<button
						on:click={toggleSearch}
						class="ml-2 p-1.5 rounded-lg transition-colors {searchVisible ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400' : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700'}"
						title="Buscar flashcards (Ctrl+F)"
						aria-label="Buscar flashcards"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
						</svg>
					</button>
				{/if}
			</div>

			<!-- UC-19: Search bar (slides in when active) -->
			{#if searchVisible && viewMode === 'flashcards'}
				<div class="flex items-center gap-2 px-4 py-2 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 shrink-0">
					<svg class="w-4 h-4 text-neutral-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
					</svg>
					<input
						bind:this={searchInputEl}
						bind:value={searchQuery}
						type="text"
						placeholder="Buscar por termo ou #tag..."
						class="flex-1 bg-transparent text-sm outline-none text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 dark:placeholder-neutral-600"
					/>
					{#if matchedIndices !== null}
						<span class="text-xs font-medium tabular-nums {matchedIndices.size === 0 ? 'text-red-400' : 'text-indigo-500'}">
							{matchedIndices.size} de {sessionFlashcards.length}
						</span>
					{/if}
					<button
						on:click={() => { searchQuery = ''; searchVisible = false; }}
						class="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
						aria-label="Fechar busca"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
						</svg>
					</button>
				</div>
			{/if}

			{#if viewMode === 'subgroups'}
				<!-- ── UC-38/39/41 Subgroups Panel ──────────────────────────────── -->
				<div class="flex-1 overflow-y-auto p-6">

					{#if notebookUpdatedAfterGroups}
						<div class="mb-4 flex items-start gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl text-sm text-amber-800 dark:text-amber-300">
							<svg class="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
							<div>
								<p class="font-semibold">Caderno atualizado</p>
								<p class="text-xs mt-0.5 opacity-75">O caderno foi modificado desde a última geração. Deseja reorganizar os subgrupos?</p>
								<button on:click={() => showReorganizeModal = true} class="mt-2 text-xs font-bold text-amber-700 dark:text-amber-400 hover:underline">Reorganizar agora →</button>
							</div>
						</div>
					{/if}

					{#if notebookGroupsList.length === 0}
						<!-- State: no groups yet — setup panel -->
						<div class="max-w-sm mx-auto pt-8 text-center">
							<div class="w-14 h-14 mx-auto mb-4 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
								<svg class="w-7 h-7 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h8m-8 4h4"/>
								</svg>
							</div>
							<h2 class="text-lg font-bold text-neutral-800 dark:text-neutral-200 mb-1">Subgrupos de estudo</h2>
							<p class="text-sm text-neutral-500 dark:text-neutral-400 mb-6">Divida os flashcards deste caderno em grupos menores para praticar progressivamente, sem afetar o FSRS.</p>

							<div class="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-2xl p-5 text-left space-y-4">
								<div>
									<label class="block text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2">Cards por grupo</label>
									<input
										type="number"
										bind:value={groupSize}
										min="5"
										max="200"
										class="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm font-semibold text-neutral-800 dark:text-neutral-200 outline-none focus:border-indigo-400 dark:focus:border-indigo-500"
									/>
								</div>
								{#if sessionFlashcards.length > 0}
									<p class="text-sm text-neutral-500 dark:text-neutral-400">
										→ <span class="font-bold text-neutral-700 dark:text-neutral-300">{groupsPreviewCount} grupo{groupsPreviewCount !== 1 ? 's' : ''}</span> de até <span class="font-bold text-neutral-700 dark:text-neutral-300">{Math.max(5, groupSize)} cards</span>
										<span class="text-neutral-400"> ({sessionFlashcards.length} cards no total)</span>
									</p>
								{/if}
								<button
									on:click={handleGenerateGroups}
									disabled={sessionFlashcards.length === 0 || isGeneratingGroups}
									title={sessionFlashcards.length === 0 ? 'Adicione cards ao caderno antes de gerar subgrupos' : ''}
									class="w-full py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
								>
									{isGeneratingGroups ? 'Gerando...' : 'Gerar Subgrupos'}
								</button>
							</div>
						</div>

					{:else}
						<!-- State: groups exist — progress + grid -->
						<div class="space-y-4">

							<!-- Progress indicator -->
							<div class="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl px-4 py-3">
								<div class="flex items-center justify-between mb-2">
									<span class="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
										{masterizedCount} de {notebookGroupsList.length} grupos masterizados
									</span>
									<span class="text-xs text-neutral-400">{notebookGroupsList.length > 0 ? Math.round(masterizedCount / notebookGroupsList.length * 100) : 0}%</span>
								</div>
								<div class="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
									<div
										class="h-full bg-indigo-500 rounded-full transition-all duration-500"
										style="width:{notebookGroupsList.length > 0 ? (masterizedCount / notebookGroupsList.length * 100) : 0}%"
									></div>
								</div>
							</div>

							<!-- Group grid -->
							<div class="grid grid-cols-1 gap-3">
								{#each notebookGroupsList as group (group.id)}
									{@const sessions = groupSessionsMap.get(group.id) ?? []}
									{@const lastSession = sessions[sessions.length - 1]}
									{@const validCount = groupValidCounts.get(group.id) ?? group.cardCount}
									<div class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-4 space-y-3">
										<div class="flex items-center justify-between gap-2">
											<div class="flex items-center gap-2 min-w-0">
												<span class="font-bold text-neutral-800 dark:text-neutral-200">Grupo {group.groupIndex}</span>
												<span class="text-xs px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400">{validCount} card{validCount !== 1 ? 's' : ''}</span>
												{#if group.shuffled}
													<span class="text-xs px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700">🔀 Embaralhado</span>
												{/if}
											</div>
											{#if lastSession}
												<span
													class="text-sm font-black px-2.5 py-0.5 rounded-lg border"
													style="color:{SCORE_COLOR[lastSession.score as keyof typeof SCORE_COLOR]};border-color:{SCORE_COLOR[lastSession.score as keyof typeof SCORE_COLOR]}40;background:{SCORE_COLOR[lastSession.score as keyof typeof SCORE_COLOR]}15"
												>{lastSession.score}</span>
											{:else}
												<span class="text-xs font-semibold px-2.5 py-0.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-400">–</span>
											{/if}
										</div>

										<!-- Mini history -->
										{#if sessions.length > 0}
											<div class="flex items-center gap-1.5">
												{#each sessions as s, i}
													{#if i > 0}
														<span class="text-neutral-300 dark:text-neutral-700 text-xs">→</span>
													{/if}
													<span
														class="text-xs font-black w-6 h-6 flex items-center justify-center rounded-md"
														style="color:{SCORE_COLOR[s.score as keyof typeof SCORE_COLOR]};background:{SCORE_COLOR[s.score as keyof typeof SCORE_COLOR]}20"
													>{s.score}</span>
												{/each}
												{#if lastSession}
													<span class="text-xs text-neutral-400 ml-1">{relativeDate(lastSession.studiedAt)}</span>
												{/if}
											</div>
										{:else}
											<p class="text-xs text-neutral-400">Nunca estudado</p>
										{/if}

										<!-- Actions -->
										<div class="flex gap-2 pt-1">
											<a
												href="/notebooks/{notebookId}/groups/{group.id}"
												class="flex-1 text-center text-sm font-bold py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors {validCount === 0 ? 'pointer-events-none opacity-40' : ''}"
												title={validCount === 0 ? 'Todos os cards deste grupo foram removidos do caderno' : ''}
											>Estudar</a>
											{#if group.shuffled}
												<button
													on:click={() => handleResetShuffle(group)}
													class="px-3 py-2 text-xs font-semibold rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
													title="Restaurar ordem original"
												>Ordem original</button>
											{:else}
												<button
													on:click={() => handleToggleShuffle(group)}
													class="px-3 py-2 text-xs font-semibold rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
													title="Embaralhar cards"
												>
													<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4l4 4m0 0l4-4m-4 4V3m12 17l-4-4m0 0l-4 4m4-4v5M4 20l16-16"/>
													</svg>
												</button>
											{/if}
										</div>
									</div>
								{/each}
							</div>

							<!-- Reorganize section -->
							<div class="pt-2 border-t border-neutral-200 dark:border-neutral-700 flex items-end gap-3">
								<div class="flex-1">
									<label class="block text-xs font-bold uppercase tracking-widest text-neutral-400 mb-1">Cards por grupo</label>
									<input
										type="number"
										bind:value={groupSize}
										min="5"
										max="200"
										class="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm font-semibold text-neutral-800 dark:text-neutral-200 outline-none focus:border-indigo-400 dark:focus:border-indigo-500"
									/>
								</div>
								<button
									on:click={() => showReorganizeModal = true}
									class="px-4 py-2 text-sm font-bold rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
								>Reorganizar grupos</button>
							</div>
						</div>
					{/if}
				</div>

				<!-- Reorganize confirmation modal -->
				{#if showReorganizeModal}
					<div class="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
						<div class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
							<div class="flex items-start gap-3 mb-4">
								<div class="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
									<svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
								</div>
								<div>
									<h3 class="font-bold text-neutral-800 dark:text-neutral-200">Reorganizar subgrupos?</h3>
									<p class="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Isso irá recriar todos os subgrupos com o novo tamanho configurado. O histórico de sessões de todos os grupos será <strong class="text-red-600 dark:text-red-400">perdido permanentemente</strong>.</p>
								</div>
							</div>
							<div class="flex gap-3">
								<button
									on:click={() => showReorganizeModal = false}
									class="flex-1 py-2 text-sm font-semibold rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
								>Cancelar</button>
								<button
									on:click={handleReorganize}
									disabled={isReorganizing}
									class="flex-1 py-2 text-sm font-bold rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white transition-colors"
								>{isReorganizing ? 'Reorganizando...' : 'Reorganizar e perder histórico'}</button>
							</div>
						</div>
					</div>
				{/if}

			{:else if viewMode === 'markdown'}
				<div class="flex-1 overflow-y-auto p-8">
					<div class="prose dark:prose-invert prose-indigo max-w-none">
						{@html renderedContent}
					</div>
				</div>
			{:else}
				<!--
					UC-17 + UC-19 — Virtual scroll over the search-filtered card list.
					Only the cards in the visible viewport (+ overscan) are in the DOM.
					Top/bottom spacers preserve the correct total scroll height.
				-->
				<div
					class="flex-1 overflow-y-auto"
					use:useVirtualContainer
					on:scroll={onFlashcardsScroll}
				>
					{#if sessionFlashcards.length === 0}
						<div class="text-center text-neutral-400 py-12 flex flex-col items-center gap-3 px-8">
							<svg class="w-12 h-12 text-neutral-300 dark:text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
							</svg>
							<p class="text-sm">Nenhum flashcard gerado. Escreva <code class="bg-neutral-100 dark:bg-neutral-800 px-1 rounded text-xs">Q: Pergunta</code> e <code class="bg-neutral-100 dark:bg-neutral-800 px-1 rounded text-xs">A: Resposta</code>.</p>
						</div>
					{:else if displayedFlashcards.length === 0}
						<!-- Search returned no results -->
						<div class="text-center text-neutral-400 py-12 flex flex-col items-center gap-3 px-8">
							<svg class="w-10 h-10 text-neutral-300 dark:text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
							</svg>
							<p class="text-sm">Nenhum card encontrado para <strong class="text-neutral-600 dark:text-neutral-300">"{searchQuery}"</strong>.</p>
							<p class="text-xs text-neutral-300 dark:text-neutral-600">Use <code class="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">#tag</code> para filtrar por tag.</p>
						</div>
					{:else}
						<!-- Virtual spacer: cards above the rendered window -->
						{#if topSpacerHeight > 0}
							<div style="height: {topSpacerHeight}px" aria-hidden="true"></div>
						{/if}

						<div class="max-w-3xl mx-auto px-8 py-4">
							{#each visibleCards as card, vi (card.id)}
								{@const badge = typeBadge(card.type)}
								{@const split = splitBack(card.back)}
								<div class="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-5 shadow-sm mb-4 transition-shadow hover:shadow-md">
									<div class="flex items-start justify-between gap-2 mb-2">
										<div class="flex items-center gap-2 flex-wrap">
											{#if badge}
												<span class="text-[10px] font-bold px-2 py-0.5 rounded-full {badge.cls}">{badge.label}</span>
											{/if}
											<!-- UC-19: highlighted front text -->
											<h3 class="font-bold text-neutral-800 dark:text-neutral-200">
												{@html highlightText(card.front, searchQuery)}
											</h3>
										</div>
										<div class="flex items-center gap-1.5 shrink-0">
											<!-- UC-19: jump to position in editor -->
											{#if searchVisible}
												<button
													on:click={() => jumpToCard(card)}
													class="p-1 rounded text-neutral-300 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
													title="Ir para este card no editor"
												>
													<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
													</svg>
												</button>
											{/if}
											{#if useVirtual}
												<span class="text-[10px] text-neutral-300 dark:text-neutral-700 tabular-nums" title="Índice do card">
													#{virtualStart + vi + 1}
												</span>
											{/if}
										</div>
									</div>
									<!-- Answer text (before criteria) -->
									<p class="text-neutral-600 dark:text-neutral-400 text-sm whitespace-pre-wrap">
										{@html highlightText(split.answer, searchQuery)}
									</p>
									<!-- Criteria block -->
									{#if split.criteria.length > 0}
										<div class="mt-3 border-t border-neutral-200 dark:border-neutral-800 pt-3">
											<p class="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">Critérios</p>
											<ul class="space-y-1">
												{#each split.criteria as c}
													<li class="flex items-start gap-2 text-xs text-neutral-500 dark:text-neutral-400">
														<span class="mt-0.5 w-3.5 h-3.5 shrink-0 rounded border border-neutral-300 dark:border-neutral-600 inline-block"></span>
														{c}
													</li>
												{/each}
											</ul>
										</div>
									{/if}
									{#if card.tags && card.tags.length > 0}
										<div class="mt-4 flex flex-wrap gap-2">
											{#each card.tags as tag}
												<!-- UC-19: clicking a tag pill triggers tag search -->
												<button
													on:click={() => { searchQuery = `#${tag}`; searchVisible = true; }}
													class="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs rounded-lg font-medium tracking-wide hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors"
												>#{tag}</button>
											{/each}
										</div>
									{/if}
								</div>
							{/each}
						</div>

						<!-- Virtual spacer: cards below the rendered window -->
						{#if bottomSpacerHeight > 0}
							<div style="height: {bottomSpacerHeight}px" aria-hidden="true"></div>
						{/if}

						<!-- Status line (virtual mode or search active) -->
						{#if useVirtual || matchedIndices !== null}
							<p class="text-center text-[11px] text-neutral-300 dark:text-neutral-700 pb-4 tabular-nums">
								{#if matchedIndices !== null}
									{displayedFlashcards.length} resultado{displayedFlashcards.length !== 1 ? 's' : ''} · renderizando {visibleCards.length}
								{:else}
									Renderizando {visibleCards.length} de {displayedFlashcards.length} cards
								{/if}
							</p>
						{/if}
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

{:else}
<div class="flex items-center justify-center h-screen bg-neutral-900 text-white">
	<p class="animate-pulse text-neutral-400">Carregando caderno...</p>
</div>
{/if}

<!-- Parser completion toast -->
{#if parseToast}
	<div class="fixed bottom-24 right-4 z-[200] flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-neutral-900 dark:bg-neutral-800 border border-neutral-700 text-white text-xs font-semibold shadow-2xl animate-fade-in-up">
		<svg class="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
		</svg>
		<span>
			{#if parseToast.updated > 0 && parseToast.created > 0}
				{parseToast.created} card{parseToast.created > 1 ? 's' : ''} criado{parseToast.created > 1 ? 's' : ''}, {parseToast.updated} atualizado{parseToast.updated > 1 ? 's' : ''}
			{:else if parseToast.updated > 0}
				{parseToast.updated} card{parseToast.updated > 1 ? 's' : ''} atualizado{parseToast.updated > 1 ? 's' : ''} no banco
			{:else}
				{parseToast.created} card{parseToast.created > 1 ? 's' : ''} criado{parseToast.created > 1 ? 's' : ''}
			{/if}
		</span>
	</div>
{/if}

<style>
	.animate-fade-in-up {
		animation: fadeInUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}
	@keyframes fadeInUp {
		from { opacity: 0; transform: translateY(8px); }
		to   { opacity: 1; transform: translateY(0); }
	}
</style>
