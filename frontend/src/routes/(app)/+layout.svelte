<script lang="ts">
    import Sidebar from '$lib/components/Sidebar.svelte';
    import Header from '$lib/components/Header.svelte';

    let isSidebarOpen = false;

    function toggleSidebar() {
        isSidebarOpen = !isSidebarOpen;
    }
</script>

<div class="min-h-screen bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 flex">
    <Sidebar bind:isOpen={isSidebarOpen} />
    
    <!-- Main Content Area -->
    <div class="flex-1 flex flex-col min-w-0 md:ml-64 transition-all duration-300">
        <Header on:toggleSidebar={toggleSidebar} />
        
        <main class="flex-1 relative">
            <slot />
        </main>
    </div>
</div>
