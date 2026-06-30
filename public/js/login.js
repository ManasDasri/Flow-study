const supabaseUrl = 'https://mrjtkxwenqswbjplmzko.supabase.co';
const supabaseKey = 'sb_publishable_KbaspJKanVVEPMzUxMSmXw_nQyzfNyf';

let supabase = null;
if (supabaseUrl && supabaseKey) {
    supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
}

// DOM Elements
const stepEmail = document.getElementById('step-email');
const stepOtp = document.getElementById('step-otp');
const emailInput = document.getElementById('email-input');
const otpInput = document.getElementById('otp-input');
const sendCodeBtn = document.getElementById('send-code-btn');
const verifyCodeBtn = document.getElementById('verify-code-btn');
const backBtn = document.getElementById('back-btn');
const errorMsg = document.getElementById('error-message');
const successMsg = document.getElementById('success-message');
const subtitleText = document.getElementById('subtitle-text');

let currentEmail = '';

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

// Send OTP
sendCodeBtn.addEventListener('click', async () => {
    clearMessages();
    const email = emailInput.value.trim();
    if (!email || !email.includes('@')) {
        showError('Please enter a valid email address.');
        return;
    }

    if (!supabase) {
        showError('Supabase not configured.');
        return;
    }

    sendCodeBtn.innerText = 'Sending...';
    sendCodeBtn.disabled = true;

    const { error } = await supabase.auth.signInWithOtp({
        email: email,
        options: {
            // Usually you'd set emailRedirectTo to your app URL
        }
    });

    sendCodeBtn.innerText = 'Send Login Code';
    sendCodeBtn.disabled = false;

    if (error) {
        showError(error.message);
    } else {
        currentEmail = email;
        showSuccess('Code sent! Check your inbox.');
        // Switch UI to OTP step
        stepEmail.classList.add('hidden');
        stepOtp.classList.remove('hidden');
        subtitleText.innerText = `Enter the code sent to ${email}`;
    }
});

// Verify OTP
verifyCodeBtn.addEventListener('click', async () => {
    clearMessages();
    const token = otpInput.value.trim();
    
    if (token.length !== 6) {
        showError('Please enter the 6-digit code.');
        return;
    }

    verifyCodeBtn.innerText = 'Verifying...';
    verifyCodeBtn.disabled = true;

    const { data, error } = await supabase.auth.verifyOtp({
        email: currentEmail,
        token: token,
        type: 'email'
    });

    verifyCodeBtn.innerText = 'Verify Code';
    verifyCodeBtn.disabled = false;

    if (error) {
        showError(error.message);
    } else {
        showSuccess('Logged in successfully! Redirecting...');
        // Store user info in localStorage for the main app
        localStorage.setItem('flow_user', JSON.stringify({
            id: data.user.id,
            email: data.user.email
        }));
        
        setTimeout(() => {
            window.location.href = '/';
        }, 1000);
    }
});

// Back Button
backBtn.addEventListener('click', () => {
    clearMessages();
    stepOtp.classList.add('hidden');
    stepEmail.classList.remove('hidden');
    subtitleText.innerText = 'Enter your email to log in or sign up.';
    otpInput.value = '';
});
