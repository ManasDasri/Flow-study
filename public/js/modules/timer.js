import { updateTimer as socketUpdateTimer } from './socket.js';

let state = {
    mode: 'focus', // 'focus', 'shortBreak', 'longBreak'
    timeLeft: 25 * 60,
    isRunning: false,
    duration: 25 * 60,
    sessionCount: 0,
    durations: { focus: 25 * 60, shortBreak: 5 * 60, longBreak: 15 * 60 }
};

let timerInterval = null;
let roomId = null;
let updateUI = null;

const MODES = {
    focus: () => state.durations.focus,
    shortBreak: () => state.durations.shortBreak,
    longBreak: () => state.durations.longBreak
};

export const initTimer = (rId, uiCallback) => {
    roomId = rId;
    updateUI = uiCallback;
    renderTimer();
};

export const syncState = (newState) => {
    // If we receive a sync with the full state, update our local state
    if (newState.durations) state.durations = newState.durations;
    if (newState.mode) state.mode = newState.mode;
    if (newState.duration) state.duration = newState.duration;
    if (newState.timeLeft !== undefined) state.timeLeft = newState.timeLeft;
    if (newState.isRunning !== undefined) state.isRunning = newState.isRunning;
    
    if (state.isRunning && !timerInterval) {
        startLocalTick();
    } else if (!state.isRunning && timerInterval) {
        stopLocalTick();
    }
    
    renderTimer();
};

const broadcastState = () => {
    socketUpdateTimer(roomId, 'sync', state);
};

export const toggleTimer = (broadcast = true) => {
    state.isRunning = !state.isRunning;
    if (state.isRunning) {
        startLocalTick();
    } else {
        stopLocalTick();
    }
    renderTimer();
    if (broadcast) broadcastState();
};

export const resetTimer = (broadcast = true) => {
    state.isRunning = false;
    state.duration = MODES[state.mode]();
    state.timeLeft = state.duration;
    stopLocalTick();
    renderTimer();
    if (broadcast) broadcastState();
};

export const setMode = (mode, broadcast = true) => {
    if (MODES[mode]) {
        state.mode = mode;
        state.duration = MODES[mode]();
        state.timeLeft = state.duration;
        state.isRunning = false;
        stopLocalTick();
        renderTimer();
        if (broadcast) broadcastState();
    }
};

export const setTimerSettings = (durations, broadcast = true) => {
    state.durations = durations;
    state.duration = MODES[state.mode]();
    if (!state.isRunning) {
        state.timeLeft = state.duration;
    }
    renderTimer();
    if (broadcast) broadcastState();
};

const startLocalTick = () => {
    if (timerInterval) clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
        if (state.timeLeft > 0) {
            state.timeLeft--;
            renderTimer();
            
            // Sync with server every 10 seconds to ensure everyone is exact
            if (state.timeLeft % 10 === 0) {
                socketUpdateTimer(roomId, 'sync', { timeLeft: state.timeLeft });
            }
        } else {
            handleComplete();
        }
    }, 1000);
};

const stopLocalTick = () => {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
};

const handleComplete = () => {
    stopLocalTick();
    
    if (state.mode === 'focus') {
        socketUpdateTimer(roomId, 'session_complete');
        // Auto switch to break logic could go here
    }
    
    // Play sound or show notification
    const audio = new Audio('/assets/chime.mp3'); // Assuming asset exists, won't break if not
    audio.play().catch(e => console.log('Audio play failed', e));
};

const renderTimer = () => {
    if (updateUI) {
        updateUI(state);
    }
};
