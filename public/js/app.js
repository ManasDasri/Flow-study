import { initSocket, getSocket } from './modules/socket.js';
import { initMedia, toggleAudio, toggleVideo, handleSignal, removePeer, callUser } from './modules/rtc.js';
import { initTimer, toggleTimer, resetTimer, setMode, syncState, setTimerSettings } from './modules/timer.js';
import { initTasks, addTask, toggleTask, deleteTask, getStats as getTaskStats, setSharedTasks } from './modules/tasks.js';
import { initPresence, updatePresence, startFocusTracking, stopFocusTracking } from './modules/presence.js';
import { initChat, handleIncomingMessage } from './modules/chat.js';
import * as UI from './modules/ui.js';

let currentRoomId = null;
let currentUsername = null;
let partners = {}; // Store partner data

// Modals
const modalOverlay = document.getElementById('modal-overlay');
const joinBtn = document.getElementById('join-btn');
const roomCodeInput = document.getElementById('room-code-input');
const usernameInput = document.getElementById('username-input');
const appContainer = document.getElementById('app');

// Video Container
const videoGrid = document.getElementById('video-grid');

// Initialize App
const initApp = async () => {
    // Generate random code if empty
    roomCodeInput.value = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    joinBtn.addEventListener('click', handleJoin);
    
    // RTC Controls
    document.getElementById('toggle-mic').addEventListener('click', (e) => {
        const enabled = toggleAudio();
        e.currentTarget.classList.toggle('active', enabled);
    });
    
    document.getElementById('toggle-cam').addEventListener('click', (e) => {
        const enabled = toggleVideo();
        e.currentTarget.classList.toggle('active', enabled);
    });
    
    // Timer Controls
    UI.UI.timerToggleBtn.addEventListener('click', () => {
        toggleTimer();
    });
    
    document.getElementById('timer-reset-btn').addEventListener('click', () => {
        resetTimer();
    });
    
    UI.UI.timerModes.forEach(btn => {
        btn.addEventListener('click', (e) => {
            setMode(e.target.dataset.mode);
        });
    });

    // Timer Settings Modal
    const timerSettingsModal = document.getElementById('timer-settings-modal');
    document.getElementById('open-timer-settings-btn').addEventListener('click', () => {
        modalOverlay.classList.remove('hidden');
        timerSettingsModal.classList.remove('hidden');
        document.getElementById('join-modal').classList.add('hidden'); // Ensure join is hidden
    });
    
    document.getElementById('close-timer-settings-btn').addEventListener('click', () => {
        modalOverlay.classList.add('hidden');
        timerSettingsModal.classList.add('hidden');
    });

    document.getElementById('save-timer-settings-btn').addEventListener('click', () => {
        const focus = parseInt(document.getElementById('setting-focus-duration').value) || 25;
        const shortBreak = parseInt(document.getElementById('setting-short-break-duration').value) || 5;
        const longBreak = parseInt(document.getElementById('setting-long-break-duration').value) || 15;
        
        setTimerSettings({
            focus: focus * 60,
            shortBreak: shortBreak * 60,
            longBreak: longBreak * 60
        });
        
        modalOverlay.classList.add('hidden');
        timerSettingsModal.classList.add('hidden');
    });

    // Task Controls
    const taskInput = document.getElementById('new-task-input');
    document.getElementById('add-task-btn').addEventListener('click', () => {
        addTask(taskInput.value);
        taskInput.value = '';
    });
    taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addTask(taskInput.value);
            taskInput.value = '';
        }
    });

    // Copy Invite
    document.getElementById('copy-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(currentRoomId);
        // Simple toast or feedback here
    });

    document.getElementById('leave-btn').addEventListener('click', () => {
        window.location.reload();
    });
};

const handleJoin = async () => {
    const roomId = roomCodeInput.value.trim().toUpperCase();
    const username = usernameInput.value.trim() || 'Student';
    
    if (!roomId) return;
    
    currentRoomId = roomId;
    currentUsername = username;
    
    modalOverlay.classList.add('hidden');
    appContainer.classList.remove('hidden');
    
    document.getElementById('room-code-display').innerText = roomId;
    
    // Initialize Local Media
    const localVideo = document.getElementById('local-video');
    await initMedia(localVideo);
    
    // Setup Socket
    initSocket(roomId, username, {
        onRoomState: (state) => {
            UI.updateRoomInfo(roomId, Object.keys(state.users).length);
            
            // Sync timer
            syncState(state.timer);
            
            // Sync users (if we just joined)
            Object.keys(state.users).forEach(userId => {
                if (userId !== getSocket().id) {
                    partners[userId] = state.users[userId];
                    updatePartnerUI(userId);
                    // Since we joined later, call existing users
                    callUser(userId, onRemoteStream);
                }
            });
        },
        onUserJoined: (data) => {
            partners[data.userId] = data.userData;
            UI.updateRoomInfo(roomId, Object.keys(partners).length + 1);
            updatePartnerUI(data.userId);
        },
        onUserLeft: (userId) => {
            delete partners[userId];
            removePeer(userId);
            removeRemoteVideo(userId);
            UI.removePartnerPresenceCard(userId);
            UI.updateRoomInfo(roomId, Object.keys(partners).length + 1);
            
            if (Object.keys(partners).length === 0) {
                UI.UI.partnerEmptyState.classList.remove('hidden');
                UI.UI.partnerTaskList.innerHTML = '';
                UI.updateTaskStatsUI({total:0, completed:0}, UI.UI.partnerTaskProgressText, UI.UI.partnerTaskProgressFill);
            }
        },
        onSignal: (data) => {
            handleSignal(data, onRemoteStream);
        },
        onTimerUpdated: (timerData) => {
            syncState(timerData);
            
            // Auto update presence based on timer mode
            if (timerData.isRunning && timerData.mode === 'focus') {
                startFocusTracking();
            } else if (timerData.isRunning && timerData.mode !== 'focus') {
                stopFocusTracking();
            } else if (!timerData.isRunning) {
                updatePresence({ status: '🟢 Online' });
            }
        },
        onRoomTasksUpdate: (data) => {
            setSharedTasks(data.tasks);
        },
        onPartnerPresenceUpdate: (data) => {
            if (partners[data.userId]) {
                partners[data.userId].presence = { status: data.status, nowPlaying: data.nowPlaying };
                updatePartnerUI(data.userId);
            }
        },
        onChatMessage: (messageData) => {
            handleIncomingMessage(messageData);
        }
    });

    // Initialize Modules
    initTimer(roomId, (timerState) => {
        UI.updateTimerUI(timerState);
    });

    initTasks(roomId, [], (tasks, stats) => {
        UI.renderTaskList(document.getElementById('room-task-list'), tasks, false, toggleTask, deleteTask);
        UI.updateTaskStatsUI(stats, document.getElementById('room-task-progress-text'), document.getElementById('room-task-progress-fill'));
        
        // Refresh my presence UI when tasks change
        UI.updateMyPresenceUI(getPresenceState(), getTaskStats(), currentUsername);
        
        // Tab Logic
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                tabBtns.forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                e.target.classList.add('active');
                document.getElementById(e.target.dataset.tab).classList.add('active');
            });
        });
    });

    initPresence(roomId, (presenceState) => {
        UI.updateMyPresenceUI(presenceState, getTaskStats(), currentUsername);
    });

    initChat(roomId, currentUsername);
    
    // Helper to extract current local presence for UI refresh
    function getPresenceState() {
        return {
            status: UI.UI.myStatusText.innerText,
            currentTask: UI.UI.myCurrentTask.innerText,
            focusTime: parseInt(UI.UI.myFocusTime.innerText) || 0, // Mock
            nowPlaying: UI.UI.myNowPlaying.innerText !== 'Lofi Girl • Snowfall' ? UI.UI.myNowPlaying.innerText : null
        };
    }
};

const onRemoteStream = (userId, stream) => {
    let videoEl = document.getElementById(`video-${userId}`);
    if (!videoEl) {
        const wrapper = document.createElement('div');
        wrapper.className = 'video-wrapper fade-in';
        wrapper.id = `video-wrapper-${userId}`;
        
        videoEl = document.createElement('video');
        videoEl.id = `video-${userId}`;
        videoEl.autoplay = true;
        videoEl.playsInline = true;
        
        const overlay = document.createElement('div');
        overlay.className = 'video-overlay';
        overlay.innerHTML = `<span class="name-tag">${partners[userId]?.username || 'Partner'}</span>`;
        
        wrapper.appendChild(videoEl);
        wrapper.appendChild(overlay);
        videoGrid.appendChild(wrapper);
    }
    videoEl.srcObject = stream;
};

const removeRemoteVideo = (userId) => {
    const wrapper = document.getElementById(`video-wrapper-${userId}`);
    if (wrapper) wrapper.remove();
};

const updatePartnerUI = (userId) => {
    const partner = partners[userId];
    if (!partner) return;
    
    // Update presence card
    UI.renderPartnerPresenceCard(userId, partner);
};

// Start
initApp();
