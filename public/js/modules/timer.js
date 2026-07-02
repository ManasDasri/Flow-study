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

const playChime = () => {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        
        // Main tone
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5); // Slide down to A4
        
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
        
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        osc.start();
        osc.stop(ctx.currentTime + 1.5);
    } catch (e) {
        console.warn('Audio Context not supported or failed', e);
    }
};

const handleComplete = () => {
    stopLocalTick();
    
    let title = "Time's Up!";
    let msg = "Great session!";
    
    if (state.mode === 'focus') {
        socketUpdateTimer(roomId, 'session_complete');
        title = "Focus Complete! 🎯";
        msg = "Awesome work! Take a well-deserved break.";
        // Auto switch to break mode
        setMode('shortBreak');
    } else {
        title = "Break Over! ⚡";
        msg = "Time to get back into flow state.";
        // Auto switch to focus mode
        setMode('focus');
    }
    
    // Play sound
    playChime();
    
    // Show Modal
    const overlay = document.getElementById('modal-overlay');
    const alertModal = document.getElementById('timer-alert-modal');
    if (overlay && alertModal) {
        // Hide join/settings modals just in case
        document.getElementById('join-modal')?.classList.add('hidden');
        document.getElementById('timer-settings-modal')?.classList.add('hidden');
        
        document.getElementById('timer-alert-title').innerText = title;
        document.getElementById('timer-alert-msg').innerText = msg;
        
        overlay.classList.remove('hidden');
        alertModal.classList.remove('hidden');
        
        document.getElementById('close-timer-alert-btn').onclick = () => {
            overlay.classList.add('hidden');
            alertModal.classList.add('hidden');
        };
    }
};

const renderTimer = () => {
    if (updateUI) {
        updateUI(state);
    }
};
