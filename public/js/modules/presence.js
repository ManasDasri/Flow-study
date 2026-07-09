import { updatePresence as socketUpdatePresence, getMyUserId } from './socket.js';
import supabase from './supabase.js';

let currentState = {
    status: '🟢 Online',
    nowPlaying: null,
    currentTask: 'Planning...',
    focusTime: 0
};

let roomId = null;
let updateUI = null;
let focusInterval = null;
let dbFocusMinutes = 0;
let currentFocusStartTime = null;

export const fetchDailyFocusTime = async () => {
    const userId = getMyUserId();
    if (!userId) return;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data } = await supabase
        .from('sessions')
        .select('duration_seconds')
        .eq('user_id', userId)
        .gte('completed_at', today.toISOString());
        
    if (data) {
        const totalSeconds = data.reduce((acc, curr) => acc + curr.duration_seconds, 0);
        dbFocusMinutes = Math.floor(totalSeconds / 60);
        currentState.focusTime = dbFocusMinutes;
        renderPresence();
    }
};

export const initPresence = (rId, uiCallback) => {
    roomId = rId;
    updateUI = uiCallback;
    broadcastPresence();
    renderPresence();
    fetchDailyFocusTime();
    
    document.addEventListener('session-completed', () => {
        fetchDailyFocusTime();
    });
};

export const updatePresence = (updates) => {
    currentState = { ...currentState, ...updates };
    broadcastPresence();
    renderPresence();
};

export const startFocusTracking = () => {
    if (focusInterval) return;
    updatePresence({ status: '🟢 Deep Focus' });
    
    currentFocusStartTime = Date.now();
    
    focusInterval = setInterval(() => {
        currentState.focusTime = dbFocusMinutes + Math.floor((Date.now() - currentFocusStartTime) / 60000);
        renderPresence();
    }, 60000); // every minute
};

export const stopFocusTracking = () => {
    if (focusInterval) {
        clearInterval(focusInterval);
        focusInterval = null;
    }
    updatePresence({ status: '🟡 On Break' });
};

const broadcastPresence = () => {
    // We only send status and nowPlaying to socket. 
    // Tasks are handled by task update.
    socketUpdatePresence(roomId, currentState.status, currentState.nowPlaying);
};

const renderPresence = () => {
    if (updateUI) {
        updateUI(currentState);
    }
};

export const formatFocusTime = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
};
