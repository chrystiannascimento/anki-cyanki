<script lang="ts">
	import { onMount } from 'svelte';
	import { db, type Challenge } from '$lib/db';
	import { syncEngine } from '$lib/sync';
	import { nanoid } from 'nanoid';
	import { liveQuery } from 'dexie';
	import { goto } from '$app/navigation';
	import { PUBLIC_API_URL } from '$env/static/public';

	interface PublicNotebook {
		id: string;
		title: string;
		content: string;
		author: string;
		created_at: string;
	}

	// ─── Tabs ────────────────────────────────────────────────────────────────
	let activeTab: 'notebooks' | 'challenges' = 'challenges';

	// ─── Notebooks tab ────────────────────────────────────────────────────────
	let notebooks: PublicNotebook[] = [];
	let loadingNotebooks = true;
	let notebooksError = '';

	// ─── Challenges tab ───────────────────────────────────────────────────────
	let localChallenges: Challenge[] = [];
	let searchCode = '';
	let searchError = '';
	let searching = false;

	onMount(async () => {
		// Load community notebooks from server
		try {
			const res = await fetch(`${PUBLIC_API_URL}/community/notebooks`);
			if (!res.ok) throw new Error('Failed to fetch community notebooks');
			notebooks = await res.json();
		} catch (e: any) {
			notebooksError = e.message;
		} finally {
			loadingNotebooks = false;
		}

		// Live-query local challenges
		const sub = liveQuery(() =>
			db.challenges.orderBy('createdAt').reverse().toArray()
		).subscribe(rows => {
			localChallenges = rows;
		});
		return () => sub.unsubscribe();
	});

	async function cloneNotebook(notebook: PublicNotebook) {
		const clonedId = nanoid();
		await db.notebooks.add({
			id: clonedId,
			title: `${notebook.title} (Clone)`,
			content: `> Cloned from ${notebook.author}\n\n${notebook.content}`,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			isPublic: false
		});
		await syncEngine.enqueue('CREATE', 'NOTEBOOK', clonedId, {
			title: `${notebook.title} (Clone)`,
			content: `> Cloned from ${notebook.author}\n\n${notebook.content}`,
			isPublic: false
		});
		alert('Notebook clonado para sua coleção privada!');
	}

	async function searchChallenge() {
		const code = searchCode.trim().toUpperCase();
		if (!code) return;
		searching = true;
		searchError = '';
		try {
			const found = await db.challenges.where('code').equals(code).first();
			if (found) {
				goto(`/community/challenge/${found.code}`);
			} else {
				searchError = `Desafio com código "${code}" não encontrado localmente. Peça ao criador para compartilhar o link.`;
			}
		} finally {
			searching = false;
		}
	}

	function formatDate(ts: number) {
		return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
	}
</script>

<div class="max-w-4xl mx-auto space-y-6 py-8">

	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
		<div>
			<h1 class="text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white">Comunidade</h1>
			<p class="text-neutral-500 mt-1">Cadernos públicos e desafios criados por outros estudantes.</p>
		</div>
		<a href="/community/create" class="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm shadow-md shadow-indigo-500/20 transition-all hover:-translate-y-0.5 shrink-0">
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"></path></svg>
			Criar Desafio
		</a>
	</div>

	<!-- Tab Bar -->
	<div class="flex gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-xl w-fit">
		<button
			on:click={() => activeTab = 'challenges'}
			class="px-5 py-2 rounded-lg text-sm font-bold transition-all {activeTab === 'challenges' ? 'bg-white dark:bg-neutral-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}"
		>
			🏆 Desafios
		</button>
		<button
			on:click={() => activeTab = 'notebooks'}
			class="px-5 py-2 rounded-lg text-sm font-bold transition-all {activeTab === 'notebooks' ? 'bg-white dark:bg-neutral-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}"
		>
			📓 Cadernos Públicos
		</button>
	</div>

	<!-- ── CHALLENGES TAB ─────────────────────────────────────────────────── -->
	{#if activeTab === 'challenges'}

		<!-- Search by code -->
		<div class="flex gap-2">
			<input
				bind:value={searchCode}
				on:keydown={e => e.key === 'Enter' && searchChallenge()}
				placeholder="Buscar por código (ex: X7K2M9)..."
				class="flex-1 p-3 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono tracking-widest uppercase dark:text-white dark:placeholder-neutral-500"
				maxlength="6"
			/>
			<button
				on:click={searchChallenge}
				disabled={searching || !searchCode.trim()}
				class="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{searching ? '...' : 'Buscar'}
			</button>
		</div>
		{#if searchError}
			<p class="text-sm text-rose-500 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 rounded-xl px-4 py-3">{searchError}</p>
		{/if}

		<!-- Local challenges list -->
		{#if localChallenges.length === 0}
			<div class="py-16 text-center border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl space-y-4">
				<div class="text-5xl">🏆</div>
				<p class="text-neutral-500 dark:text-neutral-400 font-medium">Você ainda não criou nenhum desafio.</p>
				<a href="/community/create" class="inline-block px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition">
					Criar meu primeiro desafio
				</a>
			</div>
		{:else}
			<div>
				<h2 class="text-sm font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-3">Meus Desafios</h2>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					{#each localChallenges as ch (ch.id)}
						<div class="relative p-5 bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-neutral-200 dark:ring-neutral-700 shadow-sm hover:shadow-md transition-all flex flex-col gap-3">
							<!-- Header row -->
							<div class="flex items-start justify-between gap-2">
								<div class="flex-1 min-w-0">
									<h3 class="font-bold text-neutral-800 dark:text-neutral-100 truncate">{ch.title}</h3>
									{#if ch.description}
										<p class="text-sm text-neutral-500 dark:text-neutral-400 line-clamp-2 mt-0.5">{ch.description}</p>
									{/if}
								</div>
								<span class="shrink-0 font-mono text-xs font-black tracking-widest px-2.5 py-1 rounded-lg {ch.isPublic ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400'}">
									{ch.isPublic ? '🌐 Público' : '🔒 Privado'}
								</span>
							</div>

							<!-- Stats row -->
							<div class="flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400">
								<span>📋 {ch.cardCount} cards</span>
								<span>🎮 {ch.attempts} tentativas</span>
								<span>📅 {formatDate(ch.createdAt)}</span>
							</div>

							<!-- Code + actions -->
							<div class="flex items-center gap-2 mt-auto">
								<div class="flex-1 flex items-center gap-2 px-3 py-2 bg-neutral-50 dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-700">
									<span class="text-xs text-neutral-400">Código:</span>
									<span class="font-mono font-black text-indigo-600 dark:text-indigo-400 tracking-widest">{ch.code}</span>
								</div>
								<a href="/community/challenge/{ch.code}" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-sm transition shrink-0">
									Jogar
								</a>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

	<!-- ── NOTEBOOKS TAB ──────────────────────────────────────────────────── -->
	{:else}
		{#if loadingNotebooks}
			<div class="py-16 text-center animate-pulse text-indigo-500 font-medium">Buscando cadernos públicos...</div>
		{:else if notebooksError}
			<div class="py-4 px-6 bg-red-50 text-red-600 rounded-lg border border-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/50">{notebooksError}</div>
		{:else if notebooks.length === 0}
			<div class="py-16 text-center text-neutral-400 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl">
				<p>Nenhum caderno público disponível ainda. Seja o primeiro a compartilhar!</p>
			</div>
		{:else}
			<section class="grid grid-cols-1 md:grid-cols-2 gap-4">
				{#each notebooks as notebook (notebook.id)}
					<div class="relative p-6 bg-white dark:bg-neutral-800 rounded-2xl shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700 group hover:shadow-md transition-all flex flex-col items-start justify-between min-h-[160px]">
						<div class="absolute top-4 right-4 bg-indigo-100 text-indigo-700 text-xs px-2 py-1 rounded-full dark:bg-indigo-900/30 dark:text-indigo-400 font-semibold">
							By @{notebook.author}
						</div>
						<div class="mb-6 w-full pr-16">
							<h3 class="font-bold text-xl mb-1 text-neutral-800 dark:text-neutral-100 truncate">{notebook.title}</h3>
							<p class="text-neutral-500 dark:text-neutral-400 text-sm line-clamp-2">{notebook.content.substring(0, 100)}...</p>
						</div>
						<div class="flex gap-2 w-full mt-auto">
							<button on:click={() => cloneNotebook(notebook)} class="px-4 py-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors text-sm">
								Clonar Caderno
							</button>
						</div>
					</div>
				{/each}
			</section>
		{/if}
	{/if}

</div>
