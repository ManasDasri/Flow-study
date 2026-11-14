// Email verification. Arriving from sign-up, the page says where the link went and
// can send it again. Arriving from the link in the email (?token_hash=…), it
// confirms the address, which signs the person in, and offers the way into Flow.
import { byId } from './dom';
import supabase from './modules/supabase';
import { completeSignIn } from './modules/sign-in';

const status = byId<HTMLElement>('verify-status');
const show = (state: 'sent' | 'checking' | 'done' | 'failed') =>
    document.querySelectorAll<HTMLElement>('[data-state]').forEach(section => { section.hidden = section.dataset.state !== state; });
const pendingEmail = () => { try { return sessionStorage.getItem('flow_verify_email'); } catch { return null; } };

// Links can be resent once a minute (Supabase limits them too).
let cooldown: ReturnType<typeof setInterval> | undefined;
async function resend(email: string, button: HTMLButtonElement) {
    button.disabled = true;
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: location.origin + '/verify.html' } });
    if (error) {
        status.textContent = /rate|seconds|many/i.test(error.message) ? 'A link was sent a moment ago. Give it a minute, then try again.' : 'The email could not be sent just now. Try again in a minute.';
        button.disabled = false;
        return false;
    }
    let left = 60;
    status.textContent = `Sent. You can send another in ${left} s.`;
    clearInterval(cooldown);
    cooldown = setInterval(() => {
        left -= 1;
        status.textContent = left > 0 ? `Sent. You can send another in ${left} s.` : '';
        if (left <= 0) { clearInterval(cooldown); button.disabled = false; }
    }, 1000);
    return true;
}

async function confirm(tokenHash: string, type: 'email' | 'signup') {
    show('checking');
    // The token is single-use: take it out of the address straight away.
    history.replaceState(null, '', '/verify.html');
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error || !data.user) { show('failed'); return; }
    try { sessionStorage.removeItem('flow_verify_email'); } catch { /* nothing to clear */ }
    byId<HTMLAnchorElement>('verify-continue').href = await completeSignIn(data.user);
    show('done');
}

const params = new URLSearchParams(location.search);
const tokenHash = params.get('token_hash');
if (tokenHash) confirm(tokenHash, params.get('type') === 'signup' ? 'signup' : 'email');
else if (params.has('error') || params.has('error_description') || !pendingEmail()) show('failed');
else {
    byId<HTMLElement>('verify-email').textContent = pendingEmail()!;
    show('sent');
}

byId<HTMLButtonElement>('verify-resend').addEventListener('click', event => {
    const email = pendingEmail();
    if (email) resend(email, event.currentTarget as HTMLButtonElement);
});
byId<HTMLFormElement>('verify-form').addEventListener('submit', async event => {
    event.preventDefault();
    const email = byId<HTMLInputElement>('verify-email-input').value.trim();
    if (!email.includes('@')) return;
    const button = (event.currentTarget as HTMLFormElement).querySelector('button')!;
    if (await resend(email, button)) {
        try { sessionStorage.setItem('flow_verify_email', email); } catch { /* shown below instead */ }
        byId<HTMLElement>('verify-email').textContent = email;
        show('sent');
    }
});
