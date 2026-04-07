<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { db, clearCyankiData } from '$lib/db';
    import { session } from '$lib/authStore';
    import { PUBLIC_API_URL } from '$env/static/public';

    // ─── Data inventory ────────────────────────────────────────────────────────
    let counts = {
        flashcards: 0,
        notebooks: 0,
        reviewLogs: 0,
        savedFilters: 0,
        challenges: 0,
        studyGoals: 0,
        mediaCache: 0,
        syncQueue: 0,
    };

    onMount(async () => {
        const [fc, nb, rl, sf, ch, sg, mc, sq] = await Promise.all([
            db.flashcards.count(),
            db.notebooks.count(),
            db.reviewLogs.count(),
            db.savedFilters.count(),
            db.challenges.count(),
            db.studyGoals.count(),
            db.mediaCache.count(),
            db.syncQueue.count(),
        ]);
        counts = { flashcards: fc, notebooks: nb, reviewLogs: rl, savedFilters: sf, challenges: ch, studyGoals: sg, mediaCache: mc, syncQueue: sq };
    });

    // ─── Export my data ────────────────────────────────────────────────────────
    let isExporting = false;

    async function exportMyData() {
        isExporting = true;
        await new Promise(r => setTimeout(r, 60));
        try {
            const [flashcards, notebooks, reviewLogs, savedFilters, challenges, studyGoals] = await Promise.all([
                db.flashcards.toArray(),
                db.notebooks.toArray(),
                db.reviewLogs.toArray(),
                db.savedFilters.toArray(),
                db.challenges.toArray(),
                db.studyGoals.toArray(),
            ]);

            const payload = {
                exportedAt: new Date().toISOString(),
                email: $session.email,
                data: { flashcards, notebooks, reviewLogs, savedFilters, challenges, studyGoals }
            };

            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cyanki_meus_dados_${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            isExporting = false;
        }
    }

    // ─── Delete review history only ────────────────────────────────────────────
    let confirmDeleteHistory = false;
    let isDeletingHistory = false;
    let deleteHistoryDone = false;

    async function deleteHistory() {
        isDeletingHistory = true;
        try {
            await db.reviewLogs.clear();
            // Remove from localStorage gamification streak
            localStorage.removeItem('cyanki_gamification');
            counts.reviewLogs = 0;
            deleteHistoryDone = true;
            confirmDeleteHistory = false;
        } finally {
            isDeletingHistory = false;
        }
    }

    // ─── Delete account ────────────────────────────────────────────────────────
    // Two-click guard: first click opens confirmation, second executes
    let deleteAccountStep: 0 | 1 | 2 = 0;
    let deletePassword = '';
    let isDeletingAccount = false;
    let deleteAccountError = '';

    async function requestAccountDeletion() {
        if (!deletePassword.trim()) {
            deleteAccountError = 'Informe sua senha para confirmar a exclusão.';
            return;
        }
        isDeletingAccount = true;
        deleteAccountError = '';

        try {
            const res = await fetch(`${PUBLIC_API_URL}/auth/delete-account`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${$session.token}`
                },
                body: JSON.stringify({ password: deletePassword })
            });

            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.detail ?? `Erro ${res.status}`);
            }

            // Wipe local data immediately
            await clearCyankiData();
            localStorage.clear();
            session.set({ token: null, email: null });
            // session store's subscriber will call clearCyankiData again (idempotent)
            deleteAccountStep = 2;
        } catch (e: any) {
            deleteAccountError = e.message ?? 'Erro ao solicitar exclusão. Tente novamente.';
        } finally {
            isDeletingAccount = false;
        }
    }

    // ─── Collected data description ────────────────────────────────────────────
    const dataCategories = [
        {
            icon: '📧',
            title: 'Conta',
            items: ['E-mail (identificação e login)', 'Hash bcrypt da senha (nunca em texto simples)', 'Data de criação da conta'],
            stored: 'Servidor',
            basis: 'Contrato (execução de serviço)',
        },
        {
            icon: '📚',
            title: 'Conteúdo de Estudo',
            items: ['Cadernos (títulos e conteúdo Markdown)', 'Flashcards (frente, verso, tags)', 'Filtros salvos'],
            stored: 'Local (IndexedDB) + Servidor',
            basis: 'Legítimo interesse (funcionalidade core)',
        },
        {
            icon: '🧠',
            title: 'Dados de Revisão FSRS',
            items: ['Log de revisões (flashcard ID, grade, timestamp)', 'Estado FSRS por card (due date, stability, difficulty)'],
            stored: 'Local (IndexedDB) + Servidor',
            basis: 'Legítimo interesse (funcionalidade core)',
        },
        {
            icon: '🎮',
            title: 'Gamificação',
            items: ['XP, nível, moedas, sequência de dias (streak)', 'Data do último estudo'],
            stored: 'Local (localStorage)',
            basis: 'Legítimo interesse (engajamento)',
        },
        {
            icon: '🖼️',
            title: 'Mídia em Cache',
            items: ['Blobs de imagens referenciadas em cadernos/cards (IndexedDB)'],
            stored: 'Local (IndexedDB)',
            basis: 'Legítimo interesse (funcionamento offline)',
        },
    ];
</script>

<div class="max-w-3xl mx-auto py-8 px-4 space-y-8">

    <!-- Header -->
    <div>
        <h1 class="text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white">Privacidade & Dados</h1>
        <p class="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Transparência sobre os dados coletados e controle total sobre suas informações — conforme a LGPD (Lei nº 13.709/2018).
        </p>
    </div>

    <!-- ── Dados coletados ─────────────────────────────────────────────────── -->
    <section class="bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-neutral-200 dark:ring-neutral-700 overflow-hidden">
        <div class="px-6 py-4 border-b border-neutral-200 dark:border-neutral-700">
            <h2 class="text-base font-bold text-neutral-900 dark:text-white">Dados que coletamos</h2>
            <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Quais informações o Cyanki armazena sobre você e por quê.</p>
        </div>
        <div class="divide-y divide-neutral-100 dark:divide-neutral-700">
            {#each dataCategories as cat}
                <div class="px-6 py-4 flex gap-4">
                    <span class="text-2xl mt-0.5 shrink-0">{cat.icon}</span>
                    <div class="flex-1 min-w-0">
                        <p class="font-semibold text-sm text-neutral-800 dark:text-neutral-200">{cat.title}</p>
                        <ul class="mt-1 space-y-0.5">
                            {#each cat.items as item}
                                <li class="text-xs text-neutral-500 dark:text-neutral-400 flex items-start gap-1.5">
                                    <span class="mt-1 w-1 h-1 rounded-full bg-neutral-300 dark:bg-neutral-600 shrink-0"></span>
                                    {item}
                                </li>
                            {/each}
                        </ul>
                        <div class="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                            <span class="text-[11px] text-neutral-400 dark:text-neutral-600">
                                <span class="font-semibold text-neutral-500 dark:text-neutral-400">Armazenado:</span> {cat.stored}
                            </span>
                            <span class="text-[11px] text-neutral-400 dark:text-neutral-600">
                                <span class="font-semibold text-neutral-500 dark:text-neutral-400">Base legal:</span> {cat.basis}
                            </span>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    </section>

    <!-- ── Inventário local ────────────────────────────────────────────────── -->
    <section class="bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-neutral-200 dark:ring-neutral-700 p-6 space-y-4">
        <div>
            <h2 class="text-base font-bold text-neutral-900 dark:text-white">Seus dados locais</h2>
            <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Contagem atual de registros no IndexedDB deste dispositivo.</p>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {#each [
                { label: 'Flashcards',     count: counts.flashcards,   icon: '🃏' },
                { label: 'Cadernos',       count: counts.notebooks,    icon: '📓' },
                { label: 'Revisões',       count: counts.reviewLogs,   icon: '📊' },
                { label: 'Filtros',        count: counts.savedFilters, icon: '🔖' },
                { label: 'Desafios',       count: counts.challenges,   icon: '🏆' },
                { label: 'Metas',          count: counts.studyGoals,   icon: '🎯' },
                { label: 'Mídia (cache)',  count: counts.mediaCache,   icon: '🖼️' },
                { label: 'Fila de sync',   count: counts.syncQueue,    icon: '🔄' },
            ] as row}
                <div class="flex items-center gap-3 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700">
                    <span class="text-xl shrink-0">{row.icon}</span>
                    <div class="min-w-0">
                        <p class="text-lg font-black tabular-nums text-neutral-800 dark:text-neutral-100">{row.count}</p>
                        <p class="text-[10px] font-semibold text-neutral-400 dark:text-neutral-600 truncate">{row.label}</p>
                    </div>
                </div>
            {/each}
        </div>
    </section>

    <!-- ── Exportar dados ──────────────────────────────────────────────────── -->
    <section class="bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-neutral-200 dark:ring-neutral-700 p-6 space-y-4">
        <div>
            <h2 class="text-base font-bold text-neutral-900 dark:text-white">Exportar meus dados</h2>
            <p class="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                Direito de portabilidade (LGPD Art. 18, V). Baixe todos os seus dados em formato JSON legível por máquina.
            </p>
        </div>
        <ul class="text-xs text-neutral-500 dark:text-neutral-400 space-y-1 pl-4 list-disc">
            <li>Inclui: flashcards, cadernos, revisões, filtros, desafios, metas</li>
            <li>Não inclui: senha (armazenada apenas como hash no servidor) e cache de mídia (Blobs locais)</li>
            <li>Formato: JSON indentado, compatível com qualquer editor de texto</li>
        </ul>
        <button
            on:click={exportMyData}
            disabled={isExporting}
            class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-md shadow-indigo-500/20 transition-all active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
        >
            {#if isExporting}
                <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Preparando arquivo...
            {:else}
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                Baixar meus dados (JSON)
            {/if}
        </button>
    </section>

    <!-- ── Excluir histórico de revisões ─────────────────────────────────── -->
    <section class="bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-amber-200 dark:ring-amber-800/50 p-6 space-y-4">
        <div class="flex items-start gap-3">
            <div class="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                <svg class="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                </svg>
            </div>
            <div>
                <h2 class="text-base font-bold text-neutral-900 dark:text-white">Excluir histórico de revisões</h2>
                <p class="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                    Remove todos os logs de revisão FSRS e reseta a gamificação localmente.
                    Os flashcards e cadernos são preservados.
                    Esta ação afeta apenas este dispositivo — logs no servidor permanecem até a próxima sincronização.
                </p>
            </div>
        </div>

        {#if deleteHistoryDone}
            <div class="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-sm font-semibold">
                <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                </svg>
                Histórico apagado. {counts.reviewLogs} registros removidos deste dispositivo.
            </div>
        {:else if confirmDeleteHistory}
            <div class="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 space-y-3">
                <p class="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    Tem certeza? Esta ação apagará <strong>{counts.reviewLogs}</strong> log{counts.reviewLogs !== 1 ? 's' : ''} de revisão neste dispositivo e não poderá ser desfeita localmente.
                </p>
                <div class="flex gap-2">
                    <button
                        on:click={deleteHistory}
                        disabled={isDeletingHistory}
                        class="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold transition disabled:opacity-60 flex items-center gap-2"
                    >
                        {#if isDeletingHistory}
                            <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                            </svg>
                        {/if}
                        Sim, apagar histórico
                    </button>
                    <button
                        on:click={() => confirmDeleteHistory = false}
                        class="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-sm font-semibold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        {:else}
            <button
                on:click={() => confirmDeleteHistory = true}
                disabled={counts.reviewLogs === 0}
                class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 text-sm font-bold transition disabled:opacity-40 disabled:pointer-events-none"
            >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
                Apagar histórico de revisões ({counts.reviewLogs} registros)
            </button>
        {/if}
    </section>

    <!-- ── Excluir conta ─────────────────────────────────────────────────── -->
    <section class="bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-red-200 dark:ring-red-900/50 p-6 space-y-4">
        <div class="flex items-start gap-3">
            <div class="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <svg class="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </div>
            <div>
                <h2 class="text-base font-bold text-red-700 dark:text-red-400">Excluir minha conta</h2>
                <p class="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                    Direito de eliminação (LGPD Art. 18, VI). Seus dados pessoais serão removidos do servidor em até <strong>30 dias</strong>.
                    O IndexedDB deste dispositivo é limpo imediatamente. Esta ação é irreversível.
                </p>
            </div>
        </div>

        {#if deleteAccountStep === 2}
            <!-- Post-deletion -->
            <div class="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-center space-y-2">
                <p class="font-bold text-neutral-700 dark:text-neutral-300">Solicitação de exclusão enviada.</p>
                <p class="text-sm text-neutral-500 dark:text-neutral-400">Seus dados locais foram apagados. Os dados do servidor serão removidos em até 30 dias.</p>
                <button on:click={() => goto('/login')} class="mt-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition">
                    Ir para o login
                </button>
            </div>

        {:else if deleteAccountStep === 1}
            <!-- Confirmation form -->
            <div class="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 space-y-4">
                <p class="text-sm font-semibold text-red-800 dark:text-red-300">
                    Esta ação é permanente e irreversível. Para confirmar, insira sua senha atual.
                </p>

                {#if deleteAccountError}
                    <div class="flex items-center gap-2 p-3 rounded-xl bg-white dark:bg-neutral-900 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
                        <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                        {deleteAccountError}
                    </div>
                {/if}

                <div>
                    <label class="block text-xs font-semibold mb-1.5 text-red-700 dark:text-red-400">Senha atual</label>
                    <input
                        bind:value={deletePassword}
                        type="password"
                        placeholder="••••••••"
                        autocomplete="current-password"
                        class="w-full px-4 py-3 rounded-xl bg-white dark:bg-neutral-900 border border-red-300 dark:border-red-800 focus:ring-2 focus:ring-red-400 outline-none text-sm text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 transition"
                    />
                </div>

                <div class="flex gap-2">
                    <button
                        on:click={requestAccountDeletion}
                        disabled={isDeletingAccount || !deletePassword.trim()}
                        class="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
                    >
                        {#if isDeletingAccount}
                            <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                            </svg>
                            Excluindo...
                        {:else}
                            Confirmar exclusão da conta
                        {/if}
                    </button>
                    <button
                        on:click={() => { deleteAccountStep = 0; deletePassword = ''; deleteAccountError = ''; }}
                        class="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-sm font-semibold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition"
                    >
                        Cancelar
                    </button>
                </div>
            </div>

        {:else}
            <!-- Step 0: initial button -->
            <div class="space-y-3">
                <ul class="text-xs text-neutral-500 dark:text-neutral-400 space-y-1 pl-4 list-disc">
                    <li>IndexedDB limpo <strong>imediatamente</strong> neste dispositivo</li>
                    <li>Dados no servidor removidos em até <strong>30 dias</strong> (LGPD Art. 16)</li>
                    <li>E-mail, cadernos, flashcards, revisões e histórico serão eliminados</li>
                    <li>Ação <strong>irreversível</strong> — faça download dos seus dados antes</li>
                </ul>
                <button
                    on:click={() => deleteAccountStep = 1}
                    class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 text-sm font-bold transition"
                >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                    Solicitar exclusão da minha conta
                </button>
            </div>
        {/if}
    </section>

    <!-- ── Nota legal ─────────────────────────────────────────────────────── -->
    <section class="p-5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 space-y-2">
        <h2 class="text-sm font-bold text-neutral-700 dark:text-neutral-300">Seus direitos pela LGPD</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
            {#each [
                ['Art. 18, I',   'Confirmação da existência de tratamento'],
                ['Art. 18, II',  'Acesso aos dados — via exportação JSON acima'],
                ['Art. 18, III', 'Correção de dados — via tela de Perfil'],
                ['Art. 18, IV',  'Anonimização, bloqueio ou eliminação de dados desnecessários'],
                ['Art. 18, V',   'Portabilidade — via exportação JSON acima'],
                ['Art. 18, VI',  'Eliminação dos dados tratados — via exclusão de conta acima'],
                ['Art. 18, IX',  'Revisão de decisões automatizadas — FSRS é local e auditável'],
            ] as [art, desc]}
                <div class="flex gap-2 text-xs py-1">
                    <span class="font-bold text-indigo-500 dark:text-indigo-400 shrink-0 w-20">{art}</span>
                    <span class="text-neutral-500 dark:text-neutral-400">{desc}</span>
                </div>
            {/each}
        </div>
        <p class="text-xs text-neutral-400 dark:text-neutral-600 pt-2 border-t border-neutral-200 dark:border-neutral-700 mt-2">
            Para dúvidas ou exercício de direitos não cobertos acima, entre em contato com o encarregado de dados (DPO) pelo e-mail <strong>privacy@cyanki.app</strong>.
        </p>
    </section>

</div>
