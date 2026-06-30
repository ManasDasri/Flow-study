import { updatePresence as socketUpdatePresence } from './socket.js';

let currentState = {
    status: '🟢 Online',
    nowPlaying: null,
    currentTask: 'Planning...',
    focusTime: 0
};

let roomId = null;
let updateUI = null;
let focusInterval = null;

export const initPresence = (rId, uiCallback) => {
    roomId = rId;
    updateUI = uiCallback;
    broadcastPresence();
    renderPresence();
};

export const updatePresence = (updates) => {
    currentState = { ...currentState, ...updates };
    broadcastPresence();
    renderPresence();
};

export const startFocusTracking = () => {
    if (focusInterval) return;
    updatePresence({ status: '🟢 Deep Focus' });
    
    focusInterval = setInterval(() => {
        currentState.focusTime += 1; // Add 1 minute (assuming we call this tick every minute, but we'll mock it for now)
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
