<script lang="ts">
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import { db, type Notebook, type Flashcard } from '$lib/db';
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
	let viewMode: 'markdown' | 'flashcards' = 'markdown';
	let sessionFlashcards: ParsedCard[] = [];

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
	async function persistCards(cards: ParsedCard[]) {
		for (const card of cards) {
			const existing = await db.flashcards.get(card.id);
			if (existing) {
				const hasChanged =
					existing.front !== card.front ||
					existing.back !== card.back ||
					(existing.tags ?? []).join() !== (card.tags ?? []).join();
				if (hasChanged) {
					await db.flashcards.update(card.id, {
						front: card.front,
						back: card.back,
						tags: card.tags
					});
					await syncEngine.enqueue('UPDATE', 'FLASHCARD', card.id, card);
					// Update dictionary so future incremental passes don't re-inject
					cardDictionary.set(card.front.toLowerCase(), card.id);
				}
			} else {
				await db.flashcards.add(card as Flashcard);
				await syncEngine.enqueue('CREATE', 'FLASHCARD', card.id, card);
				cardDictionary.set(card.front.toLowerCase(), card.id);
			}
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

		await persistCards(parsed.extractedCards);
		showPerfHint = true;
	});

	onDestroy(() => {
		clearTimeout(saveTimer);
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
		<div class="w-1/2 flex flex-col overflow-hidden bg-white dark:bg-neutral-800">

			<!-- Tab switcher + search toggle -->
			<div class="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
				<div class="bg-neutral-100 dark:bg-neutral-900 rounded-full p-1 flex shadow-inner">
					<button
						class="px-6 py-1.5 rounded-full text-sm font-semibold transition-all {viewMode === 'markdown' ? 'bg-white dark:bg-neutral-700 shadow text-indigo-600 dark:text-indigo-400' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}"
						on:click={() => { viewMode = 'markdown'; searchVisible = false; searchQuery = ''; }}
					>Markdown</button>
					<button
						class="px-6 py-1.5 rounded-full text-sm font-semibold transition-all {viewMode === 'flashcards' ? 'bg-white dark:bg-neutral-700 shadow text-indigo-600 dark:text-indigo-400' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}"
						on:click={() => viewMode = 'flashcards'}
					>
						Flashcards
						<span class="ml-1 bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400 px-2 py-0.5 rounded-full text-xs">{sessionFlashcards.length}</span>
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

			{#if viewMode === 'markdown'}
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
								<div class="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-5 shadow-sm mb-4 transition-shadow hover:shadow-md">
									<div class="flex items-start justify-between gap-2 mb-2">
										<!-- UC-19: highlighted front text -->
										<h3 class="font-bold text-neutral-800 dark:text-neutral-200">
											{@html highlightText(card.front, searchQuery)}
										</h3>
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
									<!-- UC-19: highlighted back text -->
									<p class="text-neutral-600 dark:text-neutral-400 text-sm whitespace-pre-wrap">
										{@html highlightText(card.back, searchQuery)}
									</p>
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
