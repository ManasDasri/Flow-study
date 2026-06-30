// Initialize Supabase Client
// Note: These keys will be provided by the user via environment variables or a config file later
const supabaseUrl = 'https://mrjtkxwenqswbjplmzko.supabase.co';
const supabaseKey = 'sb_publishable_KbaspJKanVVEPMzUxMSmXw_nQyzfNyf';

// Only initialize if keys are replaced
let supabase = null;
if (supabaseUrl !== 'YOUR_SUPABASE_URL') {
    supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
}

document.getElementById('google-login-btn').addEventListener('click', async () => {
    if (!supabase) {
        alert("Supabase keys are not configured yet! Redirecting to app for now...");
        window.location.href = '/';
        return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
    });
    if (error) console.error('Error logging in with Google:', error.message);
});

document.getElementById('apple-login-btn').addEventListener('click', async () => {
    if (!supabase) {
        alert("Supabase keys are not configured yet! Redirecting to app for now...");
        window.location.href = '/';
        return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
    });
    if (error) console.error('Error logging in with Apple:', error.message);
});
