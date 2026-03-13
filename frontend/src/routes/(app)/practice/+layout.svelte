<script lang="ts">
    import { page } from '$app/stores';
    
    // As rotas que ficarão agrupadas dentro do Hub "Prática"
    const tabs = [
        { href: '/practice/questions', label: 'Questões' },
        { href: '/practice/my-exams', label: 'Meus Simulados' },
        { href: '/practice/community-exams', label: 'Simulados da Comunidade' }
    ];
</script>

<div class="min-h-screen bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 p-4 md:p-8">
    <div class="max-w-6xl mx-auto space-y-6">
        
        <div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
                <h1 class="text-3xl font-extrabold tracking-tight text-indigo-600 dark:text-indigo-400">Prática</h1>
                <p class="text-neutral-500 mt-2">Teste seus conhecimentos e gerencie resoluções.</p>
            </div>
        </div>

        <!-- Navegação Hierárquica do Módulo -->
        <div class="border-b border-neutral-200 dark:border-neutral-800">
            <nav class="-mb-px flex space-x-6 overflow-x-auto scrollbar-hide" aria-label="Tabs">
                {#each tabs as tab}
                    <a 
                        href={tab.href}
                        class="whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors
                        {$page.url.pathname.startsWith(tab.href) 
                            ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' 
                            : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300 dark:text-neutral-400 dark:hover:text-neutral-300'}"
                    >
                        {tab.label}
                    </a>
                {/each}
            </nav>
        </div>

        <!-- Renderiza o conteúdo das sub-páginas (Questões, Simulados, etc) -->
        <main class="py-4">
            <slot />
        </main>

    </div>
</div>
