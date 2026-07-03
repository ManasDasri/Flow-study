import supabase from './modules/supabase.js';

// Apply saved theme
const savedTheme = localStorage.getItem('flow_theme') || 'forest';
document.documentElement.setAttribute('data-theme', savedTheme);

// DOM Elements
const statFocus = document.getElementById('stat-focus');
const statSessions = document.getElementById('stat-sessions');
const usernameInput = document.getElementById('username-input');
const avatarPicker = document.getElementById('avatar-picker');
const saveBtn = document.getElementById('save-btn');
const statusMsg = document.getElementById('status-msg');
const logoutBtn = document.getElementById('logout-btn');

const AVATARS = ['🦊', '🐼', '🐯', '🐙', '🐸', '🦉', '🦄', '🦖', '🚀', '⭐', '🔥', '⚡'];
let currentAvatar = AVATARS[0];
let currentUser = null;

// Initialize
const init = async () => {
    // Check Auth
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.href = '/login.html';
        return;
    }
    currentUser = session.user;

    // Render Avatars
    renderAvatars();

    // Fetch Profile
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
    if (profile) {
        usernameInput.value = profile.username || '';
        if (profile.avatar_url && AVATARS.includes(profile.avatar_url)) {
            currentAvatar = profile.avatar_url;
        }
        renderAvatars(); // Re-render to show selection
    }

    // Fetch Stats
    const { data: sessions } = await supabase.from('sessions').select('duration_seconds').eq('user_id', currentUser.id);
    if (sessions) {
        statSessions.innerText = sessions.length;
        const totalSeconds = sessions.reduce((acc, curr) => acc + curr.duration_seconds, 0);
        
        // Also fetch from profiles.total_focus_minutes (legacy/aggregated)
        const totalMinutes = Math.floor(totalSeconds / 60) + (profile?.total_focus_minutes || 0);
        
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        statFocus.innerText = `${hours}h ${mins}m`;
    }
};

const renderAvatars = () => {
    avatarPicker.innerHTML = '';
    AVATARS.forEach(avatar => {
        const div = document.createElement('div');
        div.className = `avatar-option ${avatar === currentAvatar ? 'selected' : ''}`;
        div.innerText = avatar;
        div.addEventListener('click', () => {
            currentAvatar = avatar;
            renderAvatars();
        });
        avatarPicker.appendChild(div);
    });
};

// Save Changes
saveBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    if (!username) {
        showStatus('Username cannot be empty', 'var(--danger)');
        return;
    }

    saveBtn.innerText = 'Saving...';
    saveBtn.disabled = true;

    const { error } = await supabase.from('profiles').update({
        username: username,
        avatar_url: currentAvatar
    }).eq('id', currentUser.id);

    saveBtn.innerText = 'Save Changes';
    saveBtn.disabled = false;

    if (error) {
        showStatus('Error saving profile: ' + error.message, 'var(--danger)');
    } else {
        showStatus('Profile saved successfully!', 'var(--green)');
        // Update local storage
        const flowUser = JSON.parse(localStorage.getItem('flow_user')) || { id: currentUser.id };
        flowUser.username = username;
        flowUser.avatar = currentAvatar;
        localStorage.setItem('flow_user', JSON.stringify(flowUser));
    }
});

// Logout
logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('flow_user');
    window.location.href = '/login.html';
});

const showStatus = (msg, color) => {
    statusMsg.innerText = msg;
    statusMsg.style.color = color;
    setTimeout(() => statusMsg.innerText = '', 3000);
};

init();
