// Email verification. Arriving from sign-up, the page says where the link went and
// can send it again. Arriving from the link in the email (?token_hash=…), it asks
// for one tap before confirming: email scanners that open links can't use up the
// token, and a link someone else sent can't quietly sign this browser into their
// account. The account is named once confirmed, and the name typed during setup is
// only saved to it when it is the address this browser signed up with.
import { byId } from './dom';
import supabase from './modules/supabase';
import { completeSignIn } from './modules/sign-in';
import { markSignedOut } from './modules/session';

const status = byId<HTMLElement>('verify-status');
const show = (state: 'sent' | 'confirm' | 'checking' | 'done' | 'failed') =>
    document.querySelectorAll<HTMLElement>('[data-state]').forEach(section => { section.hidden = section.dataset.state !== state; });
const pendingEmail = () => { try { return localStorage.getItem('flow_verify_email'); } catch { return null; } };

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
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error || !data.user) { show('failed'); return; }
    const email = data.user.email ?? '';
    const ours = !!email && email.toLowerCase() === (pendingEmail() ?? '').toLowerCase();
    try { localStorage.removeItem('flow_verify_email'); } catch { /* nothing to clear */ }
    byId<HTMLElement>('verify-account').textContent = email || 'your account';
    byId<HTMLAnchorElement>('verify-continue').href = await completeSignIn(data.user, ours);
    show('done');
}

const params = new URLSearchParams(location.search);
const tokenHash = params.get('token_hash');
if (tokenHash) {
    // The token is single-use: out of the address at once, and used only on a tap.
    const type = params.get('type') === 'signup' ? 'signup' : 'email';
    history.replaceState(null, '', '/verify.html');
    show('confirm');
    byId<HTMLButtonElement>('verify-confirm').addEventListener('click', () => confirm(tokenHash, type), { once: true });
}
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
        try { localStorage.setItem('flow_verify_email', email); } catch { /* shown below instead */ }
        byId<HTMLElement>('verify-email').textContent = email;
        show('sent');
    }
});

byId<HTMLButtonElement>('verify-sign-out').addEventListener('click', async () => {
    await supabase.auth.signOut().catch(() => {});
    markSignedOut();
    location.replace('/login.html');
});
