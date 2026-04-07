import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { clearCyankiData } from '$lib/db';

export interface UserSession {
    token: string | null;
    email: string | null;
}

const initialSession: UserSession = {
    token: browser ? localStorage.getItem('cyanki_token') : null,
    email: browser ? localStorage.getItem('cyanki_email') : null
};

export const session = writable<UserSession>(initialSession);

/**
 * UC-24 — Set to true when the backend returns 401 (token expired / revoked).
 * The app stays accessible in offline-read-only mode; this flag drives the
 * "sessão expirada" banner in the root layout.
 */
export const sessionExpired = writable(false);

/** Called by the sync engine when it receives a 401 from the API. */
export function markSessionExpired() {
    sessionExpired.set(true);
}

session.subscribe(value => {
    if (browser) {
        if (value.token && value.email) {
            localStorage.setItem('cyanki_token', value.token);
            localStorage.setItem('cyanki_email', value.email);
            // Clear expiry flag on fresh login
            sessionExpired.set(false);
        } else {
            localStorage.removeItem('cyanki_token');
            localStorage.removeItem('cyanki_email');

            // Wipe offline database to prevent data leaking between users on same device
            clearCyankiData().catch(console.error);
        }
    }
});
