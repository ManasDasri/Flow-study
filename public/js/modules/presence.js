import { updatePresence as socketUpdatePresence, getMyUserId } from './socket.js';
import supabase from './supabase.js';
import { startFocus, pauseFocus, getLiveFocus, confirmFocus } from './focus-progress.js';

let currentState = { status: 'Online', nowPlaying: null, currentTask: 'Planning…', focusTime: 0 };
let roomId = null;
let updateUI = null;
let focusInterval = null;
let savedSeconds = 0;
let savedIds = [];

export const fetchDailyFocusTime = async () => {
    const userId = getMyUserId();
    if (!userId) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    try {
        const { data, error } = await supabase.from('sessions').select('id, duration_seconds').eq('user_id', userId).gte('completed_at', today.toISOString());
        if (!error && data) {
            savedSeconds = data.reduce((sum, row) => sum + row.duration_seconds, 0);
            savedIds = data.map(row => row.id);
            savedIds.forEach(confirmFocus);
            renderPresence();
            return true;
        }
    } catch { /* Retain the last known saved total when offline. */ }
    return false;
};

export const initPresence = (id, callback) => {
    roomId = id;
    updateUI = callback;
    broadcastPresence();
    renderPresence();
    fetchDailyFocusTime();
    document.addEventListener('session-completed', fetchDailyFocusTime);
};

export const updatePresence = updates => {
    currentState = { ...currentState, ...updates };
    broadcastPresence();
    renderPresence();
};

export const startFocusTracking = () => {
    if (focusInterval) return;
    startFocus();
    updatePresence({ status: 'Deep Focus' });
    focusInterval = setInterval(renderPresence, 1000);
};

export const stopFocusTracking = (status = 'On Break') => {
    pauseFocus();
    clearInterval(focusInterval);
    focusInterval = null;
    updatePresence({ status });
};

function broadcastPresence() {
    socketUpdatePresence(roomId, currentState.status, currentState.nowPlaying);
}

function renderPresence() {
    currentState.focusTime = Math.floor((savedSeconds + getLiveFocus({ persistedIds: savedIds }).todaySeconds) / 60);
    updateUI?.(currentState);
    document.dispatchEvent(new Event('focus-progress'));
}

export const formatFocusTime = minutes => {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return hours ? hours + 'h ' + rest + 'm' : rest + 'm';
};
