import supabase from './modules/supabase.js';

// DOM Elements
const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const errorMsg = document.getElementById('error-message');
const successMsg = document.getElementById('success-message');
const themePicker = document.getElementById('theme-picker');

let authBusy = false;
let redirectPending = false;

const supportedThemes = new Set(['forest', 'midnight', 'warm', 'aqua', 'amethyst']);
const savedTheme = localStorage.getItem('flow_theme');
const activeTheme = supportedThemes.has(savedTheme) ? savedTheme : 'forest';
document.documentElement.setAttribute('data-theme', activeTheme);
if (themePicker) {
    themePicker.value = activeTheme;
    themePicker.addEventListener('change', (e) => {
        const theme = e.target.value;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('flow_theme', theme);
    });
}

// Helper to show errors
const showError = (msg) => {
    errorMsg.innerText = msg;
    errorMsg.style.display = 'block';
    successMsg.style.display = 'none';
};

const showSuccess = (msg) => {
    successMsg.innerText = msg;
    successMsg.style.display = 'block';
    errorMsg.style.display = 'none';
};

const clearMessages = () => {
    errorMsg.style.display = 'none';
    successMsg.style.display = 'none';
};

const persistAndRedirect = (user, action) => {
    redirectPending = true;
    localStorage.setItem('flow_user', JSON.stringify({
        id: user.id,
        email: user.email
    }));
    showSuccess(action === 'login' ? 'Logged in successfully! Redirecting...' : 'Account created successfully! Redirecting...');
    setTimeout(() => {
        window.location.href = '/';
    }, 1000);
};

const handleAuth = async (action) => {
    if (authBusy) return;
    clearMessages();
    if (!document.getElementById('auth-form').reportValidity()) return;
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !email.includes('@')) {
        showError('Please enter a valid email address.');
        return;
    }
    if (password.length < 6) {
        showError('Password must be at least 6 characters.');
        return;
    }
    if (!supabase) {
        showError('Sign-in is temporarily unavailable. Refresh the page and try again.');
        return;
    }

    const btn = action === 'login' ? loginBtn : signupBtn;
    const originalText = btn.innerText;
    btn.innerText = 'Processing...';
    authBusy = true;
    loginBtn.disabled = signupBtn.disabled = true;
    try {

        let result;
        if (action === 'login') {
            result = await supabase.auth.signInWithPassword({ email, password });
        } else {
            result = await supabase.auth.signUp({ email, password });
        }


        if (result.error) {
            if (action === 'signup' && /already registered|already exists|user already/i.test(result.error.message)) {
                showError('An account with this email already exists. Please log in.');
                return;
            }
            showError(result.error.message);
            return;
        }

        if (result.data?.session && result.data?.user) {
            persistAndRedirect(result.data.user, action);
            return;
        }

        if (action === 'signup') {
            // Some Supabase configs create the user but don't return a session immediately.
            // Try signing in directly so "Confirm email OFF" works without any extra steps.
            const signInResult = await supabase.auth.signInWithPassword({ email, password });
            if (!signInResult.error && signInResult.data?.session && signInResult.data?.user) {
                persistAndRedirect(signInResult.data.user, 'signup');
                return;
            }

            if (signInResult.error && /confirm|confirmed|verification/i.test(signInResult.error.message)) {
                showSuccess('Check your email for a confirmation link, then return here to log in.');
                return;
            }
        }

        showError('Authentication failed. Please try again.');
    } catch {
        showError('Could not reach the sign-in service. Check your connection and try again.');
    } finally {
        authBusy = false;
        btn.innerText = originalText;
        loginBtn.disabled = signupBtn.disabled = redirectPending;
    }
};

document.getElementById('auth-form').addEventListener('submit', (e) => {
    e.preventDefault();
    handleAuth('login');
});
signupBtn.addEventListener('click', () => handleAuth('signup'));

document.getElementById('toggle-password').addEventListener('click', event => {
    const visible = passwordInput.type === 'password';
    passwordInput.type = visible ? 'text' : 'password';
    event.currentTarget.textContent = visible ? 'Hide' : 'Show';
    event.currentTarget.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    event.currentTarget.setAttribute('aria-pressed', String(visible));
});
document.querySelectorAll('[data-preview-minutes]').forEach(button => button.addEventListener('click', () => {
    document.getElementById('preview-time').textContent = button.dataset.previewMinutes.padStart(2, '0') + ':00';
    document.querySelectorAll('[data-preview-minutes]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
}));
