import { updateTimer as socketUpdateTimer } from './socket.js';

let state = {
    mode: 'focus', // 'focus', 'shortBreak', 'longBreak'
    timeLeft: 25 * 60,
    isRunning: false,
    duration: 25 * 60,
    sessionCount: 0
};

let timerInterval = null;
let roomId = null;
let updateUI = null;

const MODES = {
    focus: 25 * 60,
    shortBreak: 5 * 60,
    longBreak: 15 * 60
};

export const initTimer = (rId, uiCallback) => {
    roomId = rId;
    updateUI = uiCallback;
    renderTimer();
};

export const syncState = (serverState) => {
    state = { ...state, ...serverState };
    if (state.mode) {
        state.duration = MODES[state.mode];
    }
    
    if (state.isRunning && !timerInterval) {
        startLocalTick();
    } else if (!state.isRunning && timerInterval) {
        stopLocalTick();
    }
    
    renderTimer();
};

export const toggleTimer = () => {
    if (state.isRunning) {
        socketUpdateTimer(roomId, 'pause');
    } else {
        socketUpdateTimer(roomId, 'start');
    }
};

export const resetTimer = () => {
    socketUpdateTimer(roomId, 'reset', { duration: MODES[state.mode] });
};

export const setMode = (mode) => {
    if (MODES[mode]) {
        socketUpdateTimer(roomId, 'mode_change', { mode, duration: MODES[mode] });
    }
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
