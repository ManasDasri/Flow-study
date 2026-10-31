import { updateTimer as socketUpdateTimer, getMyUserId } from './socket.js';
import supabase from './supabase.js';
import { finishFocus, confirmFocus } from './focus-progress.js';
import { fetchDailyFocusTime } from './presence.js';
import { openModal, closeModal, notify } from './feedback.js';

let state = {
    mode: 'focus', // 'focus', 'shortBreak', 'longBreak'
    timeLeft: 25 * 60,
    isRunning: false,
    duration: 25 * 60,
    sessionCount: 0,
    durations: { focus: 25 * 60, shortBreak: 5 * 60, longBreak: 15 * 60 }
};

let timerInterval = null;
let deadline = 0;
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
    if (!newState || typeof newState !== 'object') return;
    if (newState.mode !== undefined && !Object.hasOwn(MODES, newState.mode)) return;
    if (newState.timeLeft !== undefined && (!Number.isInteger(newState.timeLeft) || newState.timeLeft < 0 || newState.timeLeft > 7200)) return;
    if (newState.duration !== undefined && (!Number.isInteger(newState.duration) || newState.duration < 60 || newState.duration > 7200)) return;
    if (newState.durations && !validDurations(newState.durations)) return;
    if (newState.isRunning !== undefined && typeof newState.isRunning !== 'boolean') return;
    // If we receive a sync with the full state, update our local state
    if (newState.durations) state.durations = newState.durations;
    if (newState.mode) state.mode = newState.mode;
    if (newState.duration) state.duration = newState.duration;
    if (newState.timeLeft !== undefined) state.timeLeft = newState.timeLeft;
    if (newState.isRunning !== undefined) state.isRunning = newState.isRunning;
    
    deadline = Date.now() + state.timeLeft * 1000;
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

export const broadcastCurrentState = () => {
    broadcastState();
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
    if (Object.hasOwn(MODES, mode)) {
        state.mode = mode;
        state.duration = MODES[mode]();
        state.timeLeft = state.duration;
        state.isRunning = false;
        stopLocalTick();
        renderTimer();
        if (broadcast) broadcastState();
    }
};

const validDurations = values => ['focus', 'shortBreak', 'longBreak'].every(key => Number.isInteger(values[key]) && values[key] >= 60 && values[key] <= (key === 'focus' ? 7200 : 3600));

export const setTimerSettings = (durations, broadcast = true) => {
    if (!validDurations(durations)) return false;
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
    
    deadline = Date.now() + state.timeLeft * 1000;
    timerInterval = setInterval(() => {
        if (state.timeLeft > 0) {
            state.timeLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
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

let sharedAudioCtx = null;

const playChime = () => {
    try {
        if (!sharedAudioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            sharedAudioCtx = new AudioContext();
        }
        
        // Resume if suspended (browser autoplay policy)
        if (sharedAudioCtx.state === 'suspended') {
            sharedAudioCtx.resume();
        }
        
        // Main tone
        const osc = sharedAudioCtx.createOscillator();
        const gainNode = sharedAudioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, sharedAudioCtx.currentTime); // A5
        osc.frequency.exponentialRampToValueAtTime(440, sharedAudioCtx.currentTime + 0.5); // Slide down to A4
        
        gainNode.gain.setValueAtTime(0, sharedAudioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.5, sharedAudioCtx.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, sharedAudioCtx.currentTime + 1.5);
        
        osc.connect(gainNode);
        gainNode.connect(sharedAudioCtx.destination);
        
        osc.start();
        osc.stop(sharedAudioCtx.currentTime + 1.5);
    } catch (e) {
        console.warn('Audio Context not supported or failed', e);
    }
};

const handleComplete = () => {
    stopLocalTick();
    
    let title = "Time's Up!";
    let msg = "Great session!";
    
    if (state.mode === 'focus') {
        title = "Focus session complete";
        msg = "Your focus session is complete. Take a short break before the next one.";
        
        const userId = getMyUserId();
        const completed = finishFocus();
        if (userId && completed) {
            supabase.from('sessions').insert([{
                id: completed.id, user_id: userId, room_id: roomId, mode: 'focus',
                duration_seconds: completed.seconds, completed_at: completed.completedAt
            }]).then(async ({ error }) => {
                if (error) throw error;
                if (await fetchDailyFocusTime()) confirmFocus(completed.id);
                document.dispatchEvent(new Event('session-completed'));
            }).catch(() => notify('This session could not be saved. Its focus time is still included while this page stays open.', 'error'));
        }

        // Auto switch to break mode
        setMode('shortBreak');
        document.body.classList.remove('focus-active');
        const focusBtn = document.getElementById('focus-mode-toggle');
        if(focusBtn) focusBtn.classList.remove('active');
    } else {
        title = "Break complete";
        msg = "Ready for your next focus session?";
        // Auto switch to focus mode
        setMode('focus');
    }
    
    // Play sound
    playChime();
    
    // Show Modal
    const overlay = document.getElementById('modal-overlay');
    const alertModal = document.getElementById('timer-alert-modal');
    if (overlay && alertModal) {
        document.getElementById('timer-alert-title').innerText = title;
        document.getElementById('timer-alert-msg').innerText = msg;
        openModal('timer-alert-modal');
        document.getElementById('close-timer-alert-btn').onclick = closeModal;
    }
};

const renderTimer = () => {
    if (updateUI) {
        updateUI(state);
    }
};
