<script lang="ts">
    import { onMount } from 'svelte';
    import { db, type StudyGoal, type ReviewLog } from '$lib/db';
    import { liveQuery } from 'dexie';
    import { gamificationStore } from '$lib/stores/gamification';
    import { minutesToday, requestNotificationPermission, notify } from '$lib/stores/studyTimer';
    import { nanoid } from 'nanoid';

    // ─── Goals list ──────────────────────────────────────────────────────────
    let goals: StudyGoal[] = [];
    let reviewLogs: ReviewLog[] = [];
    let xpAtDayStart = 0; // We approximate today's XP as reviewLogs today * 10

    // ─── New goal form ────────────────────────────────────────────────────────
    let showForm = false;
    let formType: StudyGoal['type'] = 'volume';
    let formLabel = '';
    let formTarget = 20;
    let formPeriod: StudyGoal['period'] = 'daily';
    let formNotify = true;
    let saving = false;

    // ─── Notification permission ──────────────────────────────────────────────
    let notifPermission: NotificationPermission = 'default';
    let notifSupported = false;

    onMount(() => {
        if (typeof Notification !== 'undefined') {
            notifSupported = true;
            notifPermission = Notification.permission;
        }

        const goalSub = liveQuery(() =>
            db.studyGoals.orderBy('createdAt').toArray()
        ).subscribe(rows => { goals = rows; });

        const logSub = liveQuery(() =>
            db.reviewLogs.toArray()
        ).subscribe(logs => { reviewLogs = logs; });

        return () => {
            goalSub.unsubscribe();
            logSub.unsubscribe();
        };
    });

    // ─── Progress computation ─────────────────────────────────────────────────

    function periodStart(period: StudyGoal['period']): Date {
        const now = new Date();
        if (period === 'daily') {
            const d = new Date(now);
            d.setHours(0, 0, 0, 0);
            return d;
        }
        // Weekly: start of Monday
        const d = new Date(now);
        const day = d.getDay(); // 0=Sun, 1=Mon, ...
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function logsInPeriod(period: StudyGoal['period']): ReviewLog[] {
        const start = periodStart(period).getTime();
        return reviewLogs.filter(l => l.reviewedAt >= start);
    }

    function getProgress(goal: StudyGoal): number {
        if (goal.type === 'volume') {
            return logsInPeriod(goal.period).length;
        }
        if (goal.type === 'xp') {
            return logsInPeriod(goal.period).length * 10;
        }
        if (goal.type === 'time') {
            return $minutesToday; // always daily (timer resets each day)
        }
        return 0;
    }

    function getPercent(goal: StudyGoal): number {
        return Math.min(Math.round((getProgress(goal) / goal.target) * 100), 100);
    }

    function isCompleted(goal: StudyGoal): boolean {
        return getProgress(goal) >= goal.target;
    }

    function getUnitLabel(type: StudyGoal['type']): string {
        if (type === 'volume') return 'cards';
        if (type === 'xp') return 'XP';
        return 'min';
    }

    // ─── Auto-notify on completion ────────────────────────────────────────────
    let notifiedGoalIds = new Set<string>();

    $: {
        for (const g of goals) {
            if (!notifiedGoalIds.has(g.id) && isCompleted(g) && g.notifyOnComplete) {
                notifiedGoalIds.add(g.id);
                notify('🎯 Meta atingida!', `Você completou: ${g.label}`);
            }
        }
    }

    // ─── Form actions ─────────────────────────────────────────────────────────
    function openForm() {
        formType = 'volume';
        formLabel = '';
        formTarget = 20;
        formPeriod = 'daily';
        formNotify = true;
        showForm = true;
    }

    async function saveGoal() {
        if (!formLabel.trim() || formTarget <= 0) return;
        saving = true;
        try {
            const goal: StudyGoal = {
                id: nanoid(),
                type: formType,
                label: formLabel.trim(),
                target: formTarget,
                period: formPeriod,
                notifyOnComplete: formNotify,
                createdAt: Date.now()
            };
            await db.studyGoals.add(goal);
            showForm = false;
        } finally {
            saving = false;
        }
    }

    async function deleteGoal(id: string) {
        await db.studyGoals.delete(id);
        notifiedGoalIds.delete(id);
    }

    async function enableNotifications() {
        const granted = await requestNotificationPermission();
        notifPermission = granted ? 'granted' : 'denied';
    }

    // ─── Preset targets ───────────────────────────────────────────────────────
    const PRESETS: Record<StudyGoal['type'], number[]> = {
        volume: [10, 20, 50, 100],
        xp: [100, 200, 500, 1000],
        time: [25, 45, 60, 120]
    };
</script>

<div class="max-w-3xl mx-auto py-8 space-y-6">

    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
            <h1 class="text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white">Metas de Estudo</h1>
            <p class="text-neutral-500 dark:text-neutral-400 mt-1">Defina objetivos e acompanhe seu progresso em tempo real.</p>
        </div>
        <div class="flex gap-2 shrink-0">
            <a href="/goals/timer" class="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 font-bold rounded-xl text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                Timer de Foco
            </a>
            <button on:click={openForm} class="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm shadow-md shadow-indigo-500/20 transition">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"></path></svg>
                Nova Meta
            </button>
        </div>
    </div>

    <!-- Notification permission banner -->
    {#if notifSupported && notifPermission === 'default'}
        <div class="flex items-center gap-4 px-5 py-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl">
            <span class="text-2xl">🔔</span>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-amber-800 dark:text-amber-300">Ative as notificações</p>
                <p class="text-xs text-amber-700/70 dark:text-amber-400/70">Receba um aviso quando bater uma meta.</p>
            </div>
            <button on:click={enableNotifications} class="shrink-0 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-xl text-xs transition">
                Ativar
            </button>
        </div>
    {/if}

    <!-- Goals list -->
    {#if goals.length === 0}
        <div class="py-16 text-center border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl space-y-4">
            <div class="text-5xl">🎯</div>
            <p class="text-neutral-500 dark:text-neutral-400 font-medium">Nenhuma meta definida ainda.</p>
            <button on:click={openForm} class="inline-block px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition">
                Criar primeira meta
            </button>
        </div>
    {:else}
        <div class="space-y-3">
            {#each goals as goal (goal.id)}
                {@const progress = getProgress(goal)}
                {@const pct = getPercent(goal)}
                {@const done = isCompleted(goal)}
                <div class="p-5 bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-neutral-200 dark:ring-neutral-700 shadow-sm {done ? 'ring-emerald-300 dark:ring-emerald-700' : ''}">
                    <div class="flex items-start justify-between gap-3 mb-3">
                        <div class="flex items-center gap-2 min-w-0">
                            {#if done}
                                <span class="text-emerald-500 text-lg">✓</span>
                            {:else}
                                <span class="text-lg">{goal.type === 'volume' ? '📋' : goal.type === 'xp' ? '⚡' : '⏱'}</span>
                            {/if}
                            <div class="min-w-0">
                                <p class="font-bold text-neutral-800 dark:text-neutral-100 truncate {done ? 'line-through text-neutral-400 dark:text-neutral-500' : ''}">{goal.label}</p>
                                <p class="text-xs text-neutral-400 dark:text-neutral-500 font-medium">
                                    {goal.period === 'daily' ? 'Diária' : 'Semanal'} ·
                                    {goal.type === 'volume' ? 'Volume de cards' : goal.type === 'xp' ? 'XP acumulado' : 'Minutos de foco'}
                                </p>
                            </div>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                            {#if done}
                                <span class="px-2.5 py-1 text-xs font-black bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-lg">Concluída! 🎉</span>
                            {/if}
                            <button on:click={() => deleteGoal(goal.id)} class="p-1.5 rounded-lg text-neutral-300 dark:text-neutral-600 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition" title="Excluir meta">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                    </div>

                    <!-- Progress bar -->
                    <div class="space-y-1.5">
                        <div class="w-full h-2 bg-neutral-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                            <div
                                class="h-full rounded-full transition-all duration-500 {done ? 'bg-emerald-500' : pct >= 70 ? 'bg-indigo-500' : pct >= 40 ? 'bg-amber-500' : 'bg-rose-500'}"
                                style="width: {pct}%"
                            ></div>
                        </div>
                        <div class="flex justify-between text-xs font-semibold text-neutral-400 dark:text-neutral-500">
                            <span>{progress} {getUnitLabel(goal.type)}</span>
                            <span>{pct}% · meta: {goal.target} {getUnitLabel(goal.type)}</span>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}

</div>

<!-- ── New goal modal ──────────────────────────────────────────────────────── -->
{#if showForm}
    <!-- Backdrop -->
    <div class="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" on:click={() => showForm = false} on:keydown={e => e.key === 'Escape' && (showForm = false)} role="button" tabindex="-1" aria-label="Fechar"></div>

    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="w-full max-w-md bg-white dark:bg-neutral-800 rounded-3xl shadow-2xl ring-1 ring-neutral-200 dark:ring-neutral-700 p-6 space-y-5">
            <div class="flex items-center justify-between">
                <h2 class="text-xl font-extrabold text-neutral-900 dark:text-white">Nova Meta</h2>
                <button on:click={() => showForm = false} class="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>

            <!-- Type selector -->
            <div>
                <label class="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-2">Tipo de Meta</label>
                <div class="grid grid-cols-3 gap-2">
                    {#each [['volume', '📋', 'Volume de Cards'], ['xp', '⚡', 'XP Acumulado'], ['time', '⏱', 'Minutos de Foco']] as [t, icon, label]}
                        <button
                            on:click={() => { formType = t as StudyGoal['type']; formTarget = PRESETS[t as StudyGoal['type']][1]; }}
                            class="flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-xs font-bold transition {formType === t ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'border-neutral-200 dark:border-neutral-600 text-neutral-500 hover:border-indigo-300'}"
                        >
                            <span class="text-xl">{icon}</span>
                            <span>{label}</span>
                        </button>
                    {/each}
                </div>
            </div>

            <!-- Label -->
            <div>
                <label class="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">Nome da Meta</label>
                <input bind:value={formLabel} type="text" placeholder={formType === 'volume' ? 'ex: Revisar 20 cards de Direito' : formType === 'xp' ? 'ex: Ganhar 200 XP hoje' : 'ex: 45 minutos de foco'} class="w-full p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white dark:placeholder-neutral-500 text-sm" />
            </div>

            <!-- Target with preset pills -->
            <div>
                <label class="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-2">
                    Objetivo: <span class="text-indigo-500">{formTarget} {getUnitLabel(formType)}</span>
                </label>
                <div class="flex gap-2 flex-wrap mb-3">
                    {#each PRESETS[formType] as preset}
                        <button
                            on:click={() => formTarget = preset}
                            class="px-3 py-1 rounded-full text-xs font-bold border transition {formTarget === preset ? 'bg-indigo-600 text-white border-indigo-600' : 'border-neutral-200 dark:border-neutral-600 text-neutral-500 hover:border-indigo-400'}"
                        >
                            {preset}
                        </button>
                    {/each}
                </div>
                <input bind:value={formTarget} type="number" min="1" max="9999" class="w-full p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white text-sm" />
            </div>

            <!-- Period -->
            <div>
                <label class="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-2">Período</label>
                <div class="grid grid-cols-2 gap-2">
                    {#each [['daily', 'Diária', 'Reinicia à meia-noite'], ['weekly', 'Semanal', 'Reinicia na segunda']] as [p, label, sub]}
                        <button
                            on:click={() => formPeriod = p as StudyGoal['period']}
                            class="p-3 rounded-xl border-2 text-left transition {formPeriod === p ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30' : 'border-neutral-200 dark:border-neutral-600 hover:border-indigo-300'}"
                        >
                            <div class="text-sm font-bold text-neutral-800 dark:text-neutral-200">{label}</div>
                            <div class="text-xs text-neutral-400 mt-0.5">{sub}</div>
                        </button>
                    {/each}
                </div>
            </div>

            <!-- Notify toggle -->
            {#if notifSupported}
                <div class="flex items-center gap-3">
                    <button
                        on:click={() => formNotify = !formNotify}
                        class="relative inline-flex h-6 w-11 items-center rounded-full transition {formNotify ? 'bg-indigo-600' : 'bg-neutral-300 dark:bg-neutral-600'}"
                        role="switch" aria-checked={formNotify}
                    >
                        <span class="inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform {formNotify ? 'translate-x-6' : 'translate-x-1'}"></span>
                    </button>
                    <span class="text-sm text-neutral-700 dark:text-neutral-300">Notificar quando concluída</span>
                </div>
            {/if}

            <button
                on:click={saveGoal}
                disabled={saving || !formLabel.trim() || formTarget <= 0}
                class="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl shadow-lg shadow-indigo-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {saving ? 'Salvando...' : 'Criar Meta'}
            </button>
        </div>
    </div>
{/if}
