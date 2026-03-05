import { writable } from 'svelte/store';

// Initialize with a safe default, will be hydrated onMount
export const themeStore = writable<'light' | 'dark'>('light');

export function toggleTheme() {
    themeStore.update(current => {
        const next = current === 'light' ? 'dark' : 'light';

        if (typeof window !== 'undefined') {
            localStorage.setItem('theme', next);
            if (next === 'dark') {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        }

        return next;
    });
}
