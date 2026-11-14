// Signing in with GitHub or Google (Supabase OAuth). The provider sends the browser
// back to /login.html, where finishOAuth() completes it: a new account gets the name
// typed during setup, and an invite carries on to its room.
import defaults from '../../../supabase.config.json';
import supabase from './supabase';
import { markSignedIn } from './session';
import { saveDisplayName } from './profile';

type Provider = 'github' | 'google';
// Only the providers switched on for this Supabase project (Authentication → Sign In / Providers).
export const PROVIDERS = ((defaults as { oauthProviders?: string[] }).oauthProviders ?? []).filter((p): p is Provider => p === 'github' || p === 'google');

export async function continueWith(provider: Provider) {
    // Only the invite survives the round trip; nothing else rides along in the address.
    const room = new URLSearchParams(location.search).get('room');
    const back = new URL('/login.html', location.origin);
    if (room && /^[A-Za-z0-9]{6}$/.test(room)) back.searchParams.set('room', room.toUpperCase());
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: back.href } });
    return error;
}

// On /login.html: if the provider has just signed someone in, finish and say where to go.
export async function finishOAuth(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    markSignedIn();
    const pendingName = localStorage.getItem('flow_pending_name');
    if (pendingName && await saveDisplayName(user.id, pendingName)) {
        localStorage.setItem('flow_named', '1');
        localStorage.removeItem('flow_pending_name');
    }
    const room = new URLSearchParams(location.search).get('room');
    return '/room.html' + (room && /^[A-Za-z0-9]{6}$/.test(room) ? '?room=' + room.toUpperCase() : '');
}

// Wires the buttons from SocialSignIn.astro. `before` runs first (setup saves its choices).
export function bindSocialButtons(onError: (message: string) => void, before?: () => void) {
    document.querySelectorAll<HTMLButtonElement>('[data-provider]').forEach(button => button.addEventListener('click', async () => {
        before?.();
        button.disabled = true;
        const error = await continueWith(button.dataset.provider as Provider).catch(() => new Error('unreachable'));
        // On success the browser is already leaving for the provider.
        if (error) { button.disabled = false; onError('That sign-in option isn’t available right now. Use your email instead, or try again later.'); }
    }));
}
