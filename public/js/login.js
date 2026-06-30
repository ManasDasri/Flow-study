const supabaseUrl = 'https://mrjtkxwenqswbjplmzko.supabase.co';
const supabaseKey = 'sb_publishable_KbaspJKanVVEPMzUxMSmXw_nQyzfNyf';

let supabase = null;
if (supabaseUrl && supabaseKey) {
    supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
}

// DOM Elements
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
        showError(result.error.message);
    } else {
        showSuccess(action === 'login' ? 'Logged in successfully! Redirecting...' : 'Account created successfully! Redirecting...');
        // Store user info in localStorage for the main app
        localStorage.setItem('flow_user', JSON.stringify({
            id: result.data.user.id,
            email: result.data.user.email
        }));
        
        setTimeout(() => {
            window.location.href = '/';
        }, 1000);
    }
};

loginBtn.addEventListener('click', () => handleAuth('login'));
signupBtn.addEventListener('click', () => handleAuth('signup'));
