import { initSocket, getSocket, getMyUserId, broadcastYouTube, updateCameraState } from './modules/socket.js';
import { initMedia, toggleAudio, toggleVideo, handleSignal, removePeer, callUser, hasPeer, cleanupDummyStream, isDummyMedia, isVideoActive } from './modules/rtc.js';
import { initTimer, toggleTimer, resetTimer, setMode, syncState, setTimerSettings, broadcastCurrentState } from './modules/timer.js';
import { initTasks, addTask, toggleTask, deleteTask, getStats as getTaskStats, setSharedTasks } from './modules/tasks.js';
import { initPresence, updatePresence, startFocusTracking, stopFocusTracking } from './modules/presence.js';
import { initChat, handleIncomingMessage } from './modules/chat.js';
import * as UI from './modules/ui.js';
import supabase from './modules/supabase.js';

let currentRoomId = null;
let currentUsername = null;
let partners = {}; // Store partner data

// Modals
const modalOverlay = document.getElementById('modal-overlay');
const joinBtn = document.getElementById('join-btn');
const roomCodeInput = document.getElementById('room-code-input');
const appContainer = document.getElementById('app');

// Video Container
const videoGrid = document.getElementById('video-grid');

const initApp = async () => {
    // Auth Guard
    const userStr = localStorage.getItem('flow_user');
    if (!userStr) {
        window.location.href = '/login.html';
        return;
    }
    const user = JSON.parse(userStr);

    const hostBtn = document.getElementById('host-btn');
    
    joinBtn.addEventListener('click', handleJoin);
    
    hostBtn.addEventListener('click', async () => {
        const originalText = hostBtn.innerText;
        hostBtn.innerText = 'Creating...';
        hostBtn.disabled = true;
        
        let code = '';
        let isCollision = true;
        while (isCollision) {
            code = Math.random().toString(36).substring(2, 8).toUpperCase();
            const { data } = await supabase.from('rooms').select('id').eq('room_code', code).limit(1);
            if (!data || data.length === 0) {
                isCollision = false;
            }
        }
        
        const pin = document.getElementById('room-pin-input').value.trim();
        const { error } = await supabase.from('rooms').insert([{
            room_code: code,
            is_locked: !!pin,
            pin: pin || null
        }]);
        
        if (error) {
            console.error("Room creation error:", error);
            alert("Failed to create room. Please try again.");
            hostBtn.innerText = originalText;
            hostBtn.disabled = false;
            return;
        }
        
        hostBtn.innerText = originalText;
        hostBtn.disabled = false;
        
        // Auto-generate a room code and join
        roomCodeInput.value = code;
        handleJoin();
    });

    document.getElementById('logout-link').addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('flow_user');
        window.location.href = '/login.html';
    });
    document.getElementById('toggle-mic').addEventListener('click', (e) => {
        const enabled = toggleAudio();
        e.currentTarget.classList.toggle('active', enabled);
    });
    
    document.getElementById('toggle-cam').addEventListener('click', (e) => {
        const isEnabled = toggleVideo();
        e.currentTarget.classList.toggle('active', isEnabled);
        
        const localDummy = document.getElementById('local-dummy-placeholder');
        if (!isEnabled) {
            localDummy.classList.remove('hidden');
            document.getElementById('local-dummy-avatar').innerText = currentUsername.charAt(0).toUpperCase();
            localDummy.querySelector('.text').innerText = 'Camera Off';
        } else {
            localDummy.classList.add('hidden');
        }
        
        updateCameraState(isEnabled);
    });
    
    // Timer Controls
    UI.UI.timerToggleBtn.addEventListener('click', () => {
        toggleTimer();
    });
    
    document.getElementById('timer-reset-btn').addEventListener('click', () => {
        resetTimer();
    });
    
    document.getElementById('focus-mode-toggle').addEventListener('click', (e) => {
        document.body.classList.toggle('focus-active');
        e.currentTarget.classList.toggle('active', document.body.classList.contains('focus-active'));
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
    document.getElementById('share-link-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(window.location.href + '?room=' + currentRoomId);
        alert('Room link copied to clipboard!');
    });
    
    // Theming Logic
    const themePicker = document.getElementById('theme-picker');
    const savedTheme = localStorage.getItem('flow_theme') || 'forest';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themePicker.value = savedTheme;
    
    themePicker.addEventListener('change', (e) => {
        const theme = e.target.value;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('flow_theme', theme);
    });
    


    document.getElementById('leave-btn').addEventListener('click', () => {
        window.location.reload();
    });

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

    // Instantly drop from presence when tab is closed or refreshed
    window.addEventListener('beforeunload', () => {
        cleanupDummyStream();
        const socket = getSocket();
        if (socket) {
            socket.untrack();
        }
    });

    // YouTube Sync Logic
    const youtubeInput = document.getElementById('youtube-url-input');
    const syncYoutubeBtn = document.getElementById('sync-youtube-btn');
    
    syncYoutubeBtn.addEventListener('click', () => {
        const url = youtubeInput.value.trim();
        if (url) {
            broadcastYouTube(url);
            updateYouTubeIframe(url);
        }
    });
};

const updateYouTubeIframe = (url) => {
    let videoId = '';
    // Handle youtu.be, youtube.com/watch?v=, and youtube.com/playlist?list=
    if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1].split('?')[0];
    } else if (url.includes('watch?v=')) {
        videoId = url.split('watch?v=')[1].split('&')[0];
    } else if (url.includes('playlist?list=')) {
        const listId = url.split('playlist?list=')[1].split('&')[0];
        document.getElementById('youtube-iframe').src = `https://www.youtube.com/embed/videoseries?list=${listId}&autoplay=1`;
        return;
    }
    
    if (videoId) {
        document.getElementById('youtube-iframe').src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    }
};

const handleJoin = async () => {
    const roomId = roomCodeInput.value.trim().toUpperCase();
    const pin = document.getElementById('room-pin-input').value.trim();
    
    // Extract username from email
    const userStr = localStorage.getItem('flow_user');
    const userObj = userStr ? JSON.parse(userStr) : { email: 'student@example.com' };
    const username = userObj.email.split('@')[0];
    
    if (!roomId) {
        alert('Please enter a 6-character Room Code to join, or click "Host Room" to create a new one!');
        return;
    }
    
    // Verify PIN if the room is locked
    const { data: roomData } = await supabase.from('rooms').select('is_locked').eq('room_code', roomId).maybeSingle();
    if (roomData && roomData.is_locked) {
        const { data: isPinValid } = await supabase.rpc('verify_room_pin', { p_room_code: roomId, p_pin: pin });
        if (!isPinValid) {
            alert('Incorrect PIN for this room.');
            return;
        }
    }
    
    currentRoomId = roomId;
    currentUsername = username;
    
    modalOverlay.classList.add('hidden');
    appContainer.classList.remove('hidden');
    
    document.getElementById('header-room-code').innerText = roomId;
    
    // Initialize Local Media
    const localVideo = document.getElementById('local-video');
    await initMedia(localVideo);
    
    const localDummy = document.getElementById('local-dummy-placeholder');
    if (!isVideoActive()) {
        localDummy.classList.remove('hidden');
        document.getElementById('local-dummy-avatar').innerText = currentUsername.charAt(0).toUpperCase();
        localDummy.querySelector('.text').innerText = 'Camera Off';
    }
    
    // Setup Socket
    initSocket(roomId, username, !isVideoActive(), {
        onRoomState: (state) => {
            const users = state.participants || {};
            UI.updateRoomInfo(roomId, Object.keys(users).length);
            
            // 1. Remove ghosts that are no longer in the state
            Object.keys(partners).forEach(existingId => {
                if (!users[existingId] && existingId !== getMyUserId()) {
                    delete partners[existingId];
                    removePeer(existingId);
                    removeRemoteVideo(existingId);
                    UI.removePartnerPresenceCard(existingId);
                }
            });

            // 2. Add/Update current partners
            Object.keys(users).forEach(userId => {
                if (userId !== getMyUserId()) {
                    partners[userId] = users[userId];
                    updatePartnerUI(userId);
                }
            });
        },
        onUserJoined: (data) => {
            partners[data.userId] = data;
            UI.updateRoomInfo(roomId, Object.keys(partners).length + 1);
            updatePartnerUI(data.userId);
            // Broadcast timer state to the new user
            broadcastCurrentState();
        },
        onUserLeft: (userId) => {
            delete partners[userId];
            removePeer(userId);
            removeRemoteVideo(userId);
            UI.removePartnerPresenceCard(userId);
            UI.updateRoomInfo(roomId, Object.keys(partners).length + 1);
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
        },
        onYouTubeSync: (url) => {
            document.getElementById('youtube-url-input').value = url;
            updateYouTubeIframe(url);
        }
    });
    
    // Self-healing WebRTC loop: Continuously check if we are missing any connections
    setInterval(() => {
        Object.keys(partners).forEach(userId => {
            if (userId !== getMyUserId() && !hasPeer(userId)) {
                // Only the "smaller" ID initiates the call to prevent double-calling
                if (getMyUserId() < userId) {
                    console.log(`[Self-Healing] Missing connection to ${userId}. Initiating call...`);
                    callUser(userId, onRemoteStream);
                }
            }
        });
    }, 3000);

    // Initialize Modules
    initTimer(roomId, (timerState) => {
        UI.updateTimerUI(timerState);
    });

    initTasks(roomId, [], (tasks, stats) => {
        UI.renderTaskList(document.getElementById('room-task-list'), tasks, false, toggleTask, deleteTask);
        UI.updateTaskStatsUI(stats, document.getElementById('room-task-progress-text'), document.getElementById('room-task-progress-fill'));
        
        // Refresh my presence UI when tasks change
        UI.updateMyPresenceUI(getPresenceState(), getTaskStats(), currentUsername);
    });

    initPresence(roomId, (presenceState) => {
        UI.updateMyPresenceUI(presenceState, getTaskStats(), currentUsername);
    });

    initChat(roomId, currentUsername);
    
    // Helper to extract current local presence for UI refresh
    function getPresenceState() {
        return {
            status: UI.UI.myStatusText.innerText
        };
    }
};

const ensureVideoWrapper = (userId) => {
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
        overlay.innerHTML = `
            <span class="name-tag" id="name-tag-${userId}">${partners[userId]?.username || 'Partner'}</span>
            <div class="dummy-placeholder hidden" id="dummy-${userId}">
                <div class="avatar" style="width:64px; height:64px; font-size:2rem; border-radius:50%;">${(partners[userId]?.username || '?').charAt(0).toUpperCase()}</div>
                <div class="text">Camera Unavailable</div>
            </div>
        `;
        
        wrapper.appendChild(videoEl);
        wrapper.appendChild(overlay);
        videoGrid.appendChild(wrapper);
    } else {
        const nameTag = document.getElementById(`name-tag-${userId}`);
        if (nameTag && partners[userId]) {
            nameTag.innerText = partners[userId].username;
        }
    }
    return videoEl;
};

const onRemoteStream = (userId, stream) => {
    const videoEl = ensureVideoWrapper(userId);
    videoEl.srcObject = stream;
    videoEl.play().catch(e => {
        console.error('Remote video play failed:', e);
        // Fallback: mute the video so Safari/Chrome allows autoplay if interaction was lost
        videoEl.muted = true;
        videoEl.play().catch(err => console.error('Even muted autoplay failed', err));
    });
};

const removeRemoteVideo = (userId) => {
    const wrapper = document.getElementById(`video-wrapper-${userId}`);
    if (wrapper) wrapper.remove();
};

const updatePartnerUI = (userId) => {
    const partner = partners[userId];
    if (!partner) return;
    
    // Ensure their video box exists (even if their camera is off)
    ensureVideoWrapper(userId);
    
    // Update presence card
    UI.renderPartnerPresenceCard(userId, partner);
    
    // Dummy UI
    const dummyEl = document.getElementById(`dummy-${userId}`);
    if (dummyEl) {
        if (partner.isDummyMedia) {
            dummyEl.classList.remove('hidden');
        } else {
            dummyEl.classList.add('hidden');
        }
    }
};

// Start
initApp();
