<script lang="ts">
    import { goto } from '$app/navigation';
    import { session } from '$lib/authStore';
    
    // Form State
    let targetConfig = { goal: '', intensity: 'medium' };
    let selectedSubjects: string[] = [];
    
    const availableSubjects = [
        'Mathematics', 'Programming/CS', 'Law', 'Biology',
        'History', 'Languages', 'Medicine', 'Physics'
    ];
    
    function toggleSubject(subject: string) {
        if (selectedSubjects.includes(subject)) {
            selectedSubjects = selectedSubjects.filter(s => s !== subject);
        } else {
            selectedSubjects = [...selectedSubjects, subject];
        }
    }
    
    async function completeOnboarding() {
        // Save preferences to localstorage / user config db (Offline-first approach)
        localStorage.setItem('cyanki_profile_setup', 'true');
        localStorage.setItem('cyanki_subjects', JSON.stringify(selectedSubjects));
        localStorage.setItem('cyanki_goal', targetConfig.goal);
        
        goto('/');
    }
</script>

<div class="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex flex-col items-center justify-center p-6 text-neutral-900 dark:text-neutral-100">
    <div class="max-w-xl w-full">
        <div class="mb-12 text-center space-y-4">
            <h1 class="text-4xl font-extrabold text-indigo-600 dark:text-indigo-400">Welcome to Cyanki</h1>
            <p class="text-neutral-500 text-lg">Let's tailor the learning engine to your specific needs.</p>
        </div>

        <div class="bg-white dark:bg-neutral-800 p-8 rounded-3xl shadow-xl ring-1 ring-neutral-200 dark:ring-neutral-700 space-y-10">
            
            <section class="space-y-4">
                <h2 class="text-xl font-bold flex items-center gap-2">
                    <span class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400 flex items-center justify-center text-sm">1</span> 
                    What is your core objective?
                </h2>
                <input bind:value={targetConfig.goal} type="text" placeholder="e.g., Pass the Bar Exam, Learn Spanish..." class="w-full p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-indigo-500 outline-none" />
            </section>

            <section class="space-y-4">
                <h2 class="text-xl font-bold flex items-center gap-2">
                    <span class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400 flex items-center justify-center text-sm">2</span> 
                    Select your disciplines
                </h2>
                <div class="flex flex-wrap gap-2">
                    {#each availableSubjects as subject}
                         <button 
                            on:click={() => toggleSubject(subject)}
                            class="px-4 py-2 rounded-full border-2 font-semibold transition-all {selectedSubjects.includes(subject) ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-500 dark:text-indigo-300' : 'border-neutral-200 text-neutral-500 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600'}"
                         >
                            {subject}
                         </button>
                    {/each}
                </div>
            </section>

            <button on:click={completeOnboarding} class="w-full py-4 text-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/30 transition-all active:scale-[0.98]">
                Start Learning Ecosystem
            </button>
        </div>
    </div>
</div>
