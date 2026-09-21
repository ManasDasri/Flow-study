import { initSocket, getSocket, getMyUserId, broadcastYouTube, updateCameraState, updateMyUsername, sendReaction, sendHandRaise } from './modules/socket.js';
import { initMedia, toggleAudio, toggleVideo, handleSignal, removePeer, callUser, hasPeer, peerNeedsCall, cleanupDummyStream, isDummyMedia, isVideoActive, hasAudioTrack } from './modules/rtc.js';
import { initTimer, toggleTimer, resetTimer, setMode, syncState, setTimerSettings, broadcastCurrentState } from './modules/timer.js';
import { initTasks, addTask, toggleTask, deleteTask, assignTask, rerenderTasks, getStats as getTaskStats, setSharedTasks } from './modules/tasks.js';
import { initPresence, updatePresence, startFocusTracking, stopFocusTracking, formatFocusTime } from './modules/presence.js';
import { initChat, handleIncomingMessage } from './modules/chat.js';
import { getMyProfile, saveDisplayName, getStats as getProfileStats } from './modules/profile.js';
import * as UI from './modules/ui.js';
import supabase from './modules/supabase.js';

let currentRoomId = null;
let currentUsername = null;
let partners = {}; // Store partner data
let handRaised = false;

// A participant's realtime channel can drop and reconnect on its own (network
// blips, provider-side connection churn) — from CLOSED to fully resubscribed
// takes a 3s retry delay plus round-trip time, occasionally more. Debouncing
// the leave past that window lets a rejoin cancel the teardown instead of
// tearing down and rebuilding the peer connection and video tile for a blip
// that was never a real leave.
const pendingLeaves = {};
const LEAVE_GRACE_MS = 18000;

// Mic/camera toggle icons, swapped in on click so the button's on/off state
// is unmistakable at a glance instead of relying on a subtle background
// color change alone.
const MIC_ON_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
const MIC_OFF_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
const CAM_ON_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>';
const CAM_OFF_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

// Modals
const modalOverlay = document.getElementById('modal-overlay');
const joinBtn = document.getElementById('join-btn');
const roomCodeInput = document.getElementById('room-code-input');
const appContainer = document.getElementById('app');

// Video Container
const videoGrid = document.getElementById('video-grid');

// Excludes visually ambiguous characters (0/O, 1/I/L) so codes shared verbally
// or by text can't be mistyped into a different valid-looking code.
const ROOM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const generateRoomCode = () => {
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }
    return code;
};

const initApp = async () => {
    // Auth Guard
    const userStr = localStorage.getItem('flow_user');
    if (!userStr) {
        window.location.href = '/login.html';
        return;
    }
    const user = JSON.parse(userStr);

    const hostBtn = document.getElementById('host-btn');
    
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
        roomCodeInput.value = roomParam;
    }
    
    joinBtn.addEventListener('click', handleJoin);
    
    hostBtn.addEventListener('click', async () => {
        const originalText = hostBtn.innerText;
        hostBtn.innerText = 'Creating...';
        hostBtn.disabled = true;
        
        let code = '';
        let isCollision = true;
        while (isCollision) {
            code = generateRoomCode();
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
        if (enabled === null) {
            alert('No microphone is available. Check your browser/OS mic permissions, then rejoin.');
            return;
        }
        e.currentTarget.classList.toggle('active', enabled);
        e.currentTarget.innerHTML = enabled ? MIC_ON_ICON : MIC_OFF_ICON;
    });

    document.getElementById('toggle-cam').addEventListener('click', (e) => {
        const isEnabled = toggleVideo();
        e.currentTarget.classList.toggle('active', isEnabled);
        e.currentTarget.innerHTML = isEnabled ? CAM_ON_ICON : CAM_OFF_ICON;

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

    // Reactions & Raise Hand
    document.querySelectorAll('.reaction-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const emoji = btn.dataset.emoji;
            sendReaction(emoji);
            showReaction(getMyUserId(), emoji); // no self-broadcast echo, so render locally too
        });
    });

    document.getElementById('toggle-hand').addEventListener('click', (e) => {
        handRaised = !handRaised;
        e.currentTarget.classList.toggle('active', handRaised);
        sendHandRaise(handRaised);
        setHandRaised(getMyUserId(), handRaised);
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

    // Profile Modal
    const profileModal = document.getElementById('profile-modal');
    document.getElementById('my-presence-card').addEventListener('click', async () => {
        modalOverlay.classList.remove('hidden');
        profileModal.classList.remove('hidden');
        document.getElementById('join-modal').classList.add('hidden');

        document.getElementById('profile-display-name-input').value = currentUsername || '';
        const statsEl = document.getElementById('profile-stats');
        statsEl.innerHTML = '<div style="color: var(--text-muted);">Loading…</div>';

        const stats = await getProfileStats(getMyUserId());
        renderProfileStats(stats);
    });

    document.getElementById('close-profile-btn').addEventListener('click', () => {
        modalOverlay.classList.add('hidden');
        profileModal.classList.add('hidden');
    });

    document.getElementById('save-profile-name-btn').addEventListener('click', async () => {
        const input = document.getElementById('profile-display-name-input');
        const newName = input.value.trim();
        if (!newName) return;

        const btn = document.getElementById('save-profile-name-btn');
        const originalText = btn.innerText;
        btn.innerText = 'Saving...';
        btn.disabled = true;

        const ok = await saveDisplayName(getMyUserId(), newName);

        btn.innerText = originalText;
        btn.disabled = false;

        if (!ok) {
            alert('Failed to save your name. Please try again.');
            return;
        }

        currentUsername = newName;
        updateMyUsername(newName);
        updatePresence({}); // re-broadcasts presence so partners see the new name too
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
        const urlObj = new URL(window.location.href);
        urlObj.searchParams.set('room', document.getElementById('header-room-code').innerText);
        navigator.clipboard.writeText(urlObj.toString());
        alert('Room link copied to clipboard!');
    });
    
    // Theming Logic
    const themePicker = document.getElementById('theme-picker');
    const supportedThemes = new Set(['forest', 'midnight', 'warm', 'aqua', 'amethyst']);
    const savedTheme = localStorage.getItem('flow_theme');
    const activeTheme = supportedThemes.has(savedTheme) ? savedTheme : 'forest';
    document.documentElement.setAttribute('data-theme', activeTheme);
    themePicker.value = activeTheme;
    
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

const renderProfileStats = (stats) => {
    const rows = [
        ['Current streak', `${stats.streak} day${stats.streak === 1 ? '' : 's'}`],
        ['Focused today', formatFocusTime(stats.todayMinutes)],
        ['Focused all-time', formatFocusTime(stats.totalMinutes)],
        ['Sessions completed', stats.sessionsCompleted],
        ['Tasks completed', stats.tasksCompleted]
    ];
    document.getElementById('profile-stats').innerHTML = rows.map(([label, value]) => `
        <div style="display: flex; justify-content: space-between; padding: 8px 12px; background: var(--glass-bg-soft); border-radius: var(--radius-sm);">
            <span style="color: var(--text-secondary);">${label}</span>
            <span>${value}</span>
        </div>
    `).join('');
};

// Everyone currently in the room, keyed by user id, for the task
// assignee picker — includes yourself alongside partners.js's tracked list.
const getRoomParticipants = () => ({
    [getMyUserId()]: { username: currentUsername },
    ...partners
});

const handleJoin = async () => {
    const roomCode = roomCodeInput.value.trim().toUpperCase();
    const pin = document.getElementById('room-pin-input').value.trim();
    
    // Extract username from email
    const userStr = localStorage.getItem('flow_user');
    const userObj = userStr ? JSON.parse(userStr) : { email: 'student@example.com' };
    const username = userObj.email.split('@')[0];
    
    if (!roomCode) {
        alert('Please enter a 6-character Room Code to join, or click "Host Room" to create a new one!');
        return;
    }
    
    const originalText = joinBtn.innerText;
    joinBtn.innerText = 'Joining...';
    joinBtn.disabled = true;
    
    // Join room securely and get UUID
    let { data: roomUuid, error } = await supabase.rpc('join_room', { p_room_code: roomCode, p_pin: pin });
    
    if (error && error.message.includes('Incorrect PIN')) {
        const userPin = prompt("This room is locked. Please enter the PIN:");
        if (userPin !== null) {
            const res = await supabase.rpc('join_room', { p_room_code: roomCode, p_pin: userPin });
            roomUuid = res.data;
            error = res.error;
        } else {
            joinBtn.innerText = originalText;
            joinBtn.disabled = false;
            return; // User cancelled
        }
    }
    
    joinBtn.innerText = originalText;
    joinBtn.disabled = false;
    
    if (error) {
        console.error("Join Room Error:", error);
        alert(error.message || 'Failed to join room. Check your code and PIN.');
        return;
    }
    
    currentRoomId = roomUuid; // currentRoomId is now the UUID

    // A saved display name overrides the email-derived default.
    const profile = await getMyProfile(userObj.id);
    currentUsername = profile?.display_name || username;
    
    modalOverlay.classList.add('hidden');
    appContainer.classList.remove('hidden');

    // Task list becomes visible/clickable here, but tasks.js's roomId isn't
    // set until initTasks() runs much later in this function (after media
    // and socket setup) — adding a task in that window hits a real "room_id
    // violates not-null constraint" error. Disable until initTasks is ready.
    const taskInput = document.getElementById('new-task-input');
    const addTaskBtn = document.getElementById('add-task-btn');
    taskInput.disabled = true;
    addTaskBtn.disabled = true;

    document.getElementById('header-room-code').innerText = roomCode; // Still show the code in the UI

    
    // Initialize Local Media
    const localVideo = document.getElementById('local-video');
    await initMedia(localVideo);
    
    const localDummy = document.getElementById('local-dummy-placeholder');
    if (!isVideoActive()) {
        localDummy.classList.remove('hidden');
        document.getElementById('local-dummy-avatar').innerText = currentUsername.charAt(0).toUpperCase();
        localDummy.querySelector('.text').innerText = 'Camera Off';
    }

    // getUserMedia can succeed for video while falling back to no audio at
    // all (mic busy/denied while camera works). There's no track to toggle
    // in that case, so disable the control up front instead of leaving a
    // clickable button that silently does nothing.
    if (!hasAudioTrack()) {
        const micBtn = document.getElementById('toggle-mic');
        micBtn.classList.remove('active');
        micBtn.innerHTML = MIC_OFF_ICON;
        micBtn.disabled = true;
        micBtn.title = 'No microphone detected';
    }

    // Setup Socket
    initSocket(currentRoomId, username, !isVideoActive(), {
        onRoomState: (state) => {
            const users = state.participants || {};
            UI.updateRoomInfo(roomCode, Object.keys(users).length);

            // Add/update current partners. Removal is handled exclusively by the
            // presence "leave" event (onUserLeft) below — "sync" fires on every
            // track() call (e.g. every focus-mode/status change), and treating a
            // momentarily-incomplete sync snapshot as "user left" was tearing down
            // healthy WebRTC connections and partner UI for users who never left.
            Object.keys(users).forEach(userId => {
                if (userId !== getMyUserId()) {
                    if (pendingLeaves[userId]) {
                        clearTimeout(pendingLeaves[userId]);
                        delete pendingLeaves[userId];
                    }
                    partners[userId] = users[userId];
                    updatePartnerUI(userId);
                }
            });
        },
        onUserJoined: (data) => {
            // If this is just a rejoin from a pending debounced leave, cancel
            // the teardown instead of destroying and recreating the peer
            // connection/video tile.
            if (pendingLeaves[data.userId]) {
                clearTimeout(pendingLeaves[data.userId]);
                delete pendingLeaves[data.userId];
            }

            partners[data.userId] = data;
            UI.updateRoomInfo(roomCode, Object.keys(partners).length + 1);
            updatePartnerUI(data.userId);
            rerenderTasks(); // refresh assignee picker options with the new participant
            // Broadcast timer state to the new user
            broadcastCurrentState();
        },
        onUserLeft: (userId) => {
            // Don't tear down immediately — a channel rebuild elsewhere in
            // the room looks identical to a genuine leave followed almost
            // instantly by a rejoin. Give it a grace window to resolve
            // itself before destroying the peer connection and video tile.
            if (pendingLeaves[userId]) clearTimeout(pendingLeaves[userId]);
            pendingLeaves[userId] = setTimeout(() => {
                delete pendingLeaves[userId];
                delete partners[userId];
                removePeer(userId);
                removeRemoteVideo(userId);
                UI.removePartnerPresenceCard(userId);
                UI.updateRoomInfo(roomCode, Object.keys(partners).length + 1);
                rerenderTasks(); // drop the departed participant from the assignee picker
            }, LEAVE_GRACE_MS);
        },
        onPresenceHeartbeat: (data) => {
            // Presence is already tracking this user normally — nothing to heal.
            if (partners[data.userId]) return;

            if (pendingLeaves[data.userId]) {
                clearTimeout(pendingLeaves[data.userId]);
                delete pendingLeaves[data.userId];
            }

            partners[data.userId] = data;
            UI.updateRoomInfo(roomCode, Object.keys(partners).length + 1);
            updatePartnerUI(data.userId);
            rerenderTasks(); // refresh assignee picker options with the recovered participant
            broadcastCurrentState();
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
        },
        onReaction: (data) => {
            showReaction(data.userId, data.emoji);
        }
    });
    
    // Self-healing WebRTC loop: Continuously check if we are missing any connections
    setInterval(() => {
        Object.keys(partners).forEach(userId => {
            if (userId !== getMyUserId() && peerNeedsCall(userId)) {
                // getOrCreatePeerConnection only builds a fresh RTCPeerConnection
                // when there's no existing one — a peer stuck 'failed'/'disconnected'
                // is still "there", so without this it would keep renegotiating on
                // the same broken connection instead of actually recovering.
                if (hasPeer(userId)) removePeer(userId);
                // Only the "smaller" ID initiates the call to prevent double-calling
                if (getMyUserId() < userId) {
                    console.log(`[Self-Healing] Missing connection to ${userId}. Initiating call...`);
                    callUser(userId, onRemoteStream);
                }
            }
        });

    }, 3000);

    // Initialize Modules
    initTimer(currentRoomId, (timerState) => {
        UI.updateTimerUI(timerState);
    });

    initTasks(currentRoomId, [], (tasks, stats) => {
        UI.renderTaskList(document.getElementById('room-task-list'), tasks, false, toggleTask, deleteTask, getRoomParticipants(), assignTask);
        UI.updateTaskStatsUI(stats, document.getElementById('room-task-progress-text'), document.getElementById('room-task-progress-fill'));

        // Refresh my presence UI when tasks change
        UI.updateMyPresenceUI(getPresenceState(), getTaskStats(), currentUsername);
    });
    taskInput.disabled = false;
    addTaskBtn.disabled = false;

    initPresence(currentRoomId, (presenceState) => {
        UI.updateMyPresenceUI(presenceState, getTaskStats(), currentUsername);
    });

    initChat(currentRoomId, currentUsername);
    
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
    if (videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
    }
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

const getWrapperForUser = (userId) =>
    document.getElementById(userId === getMyUserId() ? 'video-wrapper-local' : `video-wrapper-${userId}`);

const showReaction = (userId, emoji) => {
    const wrapper = getWrapperForUser(userId);
    if (!wrapper) return;

    const el = document.createElement('div');
    el.className = 'floating-reaction';
    el.textContent = emoji;
    wrapper.appendChild(el);
    setTimeout(() => el.remove(), 1800);
};

const setHandRaised = (userId, raised) => {
    const wrapper = getWrapperForUser(userId);
    if (!wrapper) return;

    let badge = wrapper.querySelector('.hand-raised-badge');
    if (raised) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'hand-raised-badge';
            badge.textContent = '✋';
            wrapper.appendChild(badge);
        }
    } else if (badge) {
        badge.remove();
    }
};

const updatePartnerUI = (userId) => {
    const partner = partners[userId];
    if (!partner) return;
    
    // Ensure their video box exists (even if their camera is off)
    ensureVideoWrapper(userId);

    // Raised-hand state rides along with presence (survives a channel
    // reconnect) rather than a one-shot broadcast, so it's kept in sync
    // here alongside everything else presence already drives.
    setHandRaised(userId, !!partner.handRaised);

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
