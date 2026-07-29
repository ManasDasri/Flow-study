import supabase from './modules/supabase.js';

// DOM Elements
const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const errorMsg = document.getElementById('error-message');
const successMsg = document.getElementById('success-message');

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
    clearMessages();
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
        showError('Supabase not configured.');
        return;
    }

    const btn = action === 'login' ? loginBtn : signupBtn;
    const originalText = btn.innerText;
    btn.innerText = 'Processing...';
    btn.disabled = true;

    let result;
    if (action === 'login') {
        result = await supabase.auth.signInWithPassword({ email, password });
    } else {
        result = await supabase.auth.signUp({ email, password });
    }

    btn.innerText = originalText;
    btn.disabled = false;

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
            showError('Email confirmation is enabled in Supabase Auth. Disable "Confirm email" to allow instant signup/login, or configure SMTP to deliver verification emails.');
            return;
        }
    }

    showError('Authentication failed. Please try again.');
};

loginBtn.addEventListener('click', () => handleAuth('login'));
signupBtn.addEventListener('click', () => handleAuth('signup'));

passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleAuth('login');
    }
});
