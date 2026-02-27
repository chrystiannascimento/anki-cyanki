import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface UserSession {
    token: string | null;
    email: string | null;
}

const initialSession: UserSession = {
    token: browser ? localStorage.getItem('cyanki_token') : null,
    email: browser ? localStorage.getItem('cyanki_email') : null
};

export const session = writable<UserSession>(initialSession);

session.subscribe(value => {
    if (browser) {
        if (value.token && value.email) {
            localStorage.setItem('cyanki_token', value.token);
            localStorage.setItem('cyanki_email', value.email);
        } else {
            localStorage.removeItem('cyanki_token');
            localStorage.removeItem('cyanki_email');
        }
    }
});
