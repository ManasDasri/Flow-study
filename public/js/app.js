import { initSocket, disconnectSocket, reloadTasks, getMyUserId, broadcastYouTube, updateCameraState, updateMyUsername, sendReaction, sendHandRaise } from './modules/socket.js';
import { initMedia, toggleAudio, toggleVideo, handleSignal, removePeer, callUser, hasPeer, peerNeedsCall, cleanupMedia, isVideoActive, hasAudioTrack } from './modules/rtc.js';
import { initTimer, toggleTimer, resetTimer, setMode, syncState, setTimerSettings, broadcastCurrentState } from './modules/timer.js';
import { initTasks, addTask, toggleTask, deleteTask, assignTask, rerenderTasks, getStats as getTaskStats, setSharedTasks } from './modules/tasks.js';
import { initPresence, updatePresence, startFocusTracking, stopFocusTracking, formatFocusTime } from './modules/presence.js';
import { initChat, handleIncomingMessage } from './modules/chat.js';
import { getMyProfile, saveDisplayName, getStats as getProfileStats } from './modules/profile.js';
import * as UI from './modules/ui.js';
import supabase from './modules/supabase.js';
import { notify, openModal, closeModal, initDialogs } from './modules/feedback.js';
import { escapeHTML, getStoredUser, youtubeEmbedUrl } from './modules/utils.js';

let currentRoomId = null;
let currentUsername = null;
let partners = {}; // Store partner data
let handRaised = false;
let roomActionBusy = false;
let leaving = false;
const hostBtn = document.getElementById('host-btn');
const lobbyError = document.getElementById('lobby-error');
function setRoomBusy(busy, action = 'join') {
    roomActionBusy = busy;
    joinBtn.disabled = hostBtn.disabled = busy;
    joinBtn.textContent = busy && action === 'join' ? 'Joining…' : 'Join room';
    hostBtn.textContent = busy && action === 'host' ? 'Creating…' : 'Create a room';
}
function showLobbyError(message) {
    lobbyError.textContent = message;
    lobbyError.classList.remove('hidden');
}
function connectionStatus(status) {
    const el = document.getElementById('connection-status');
    const offline = !navigator.onLine;
    el.textContent = offline ? 'Offline' : status === 'SUBSCRIBED' ? 'Connected' : 'Reconnecting…';
    el.dataset.state = offline ? 'offline' : status === 'SUBSCRIBED' ? 'connected' : 'connecting';
    document.getElementById('network-banner').classList.toggle('hidden', !offline);
}

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
    const user = getStoredUser();
    if (!user) {
        localStorage.removeItem('flow_user');
        window.location.replace('/login.html');
        return;
    }
    initDialogs();

    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room') || sessionStorage.getItem('flow_last_room');
    if (roomParam) {
        roomCodeInput.value = roomParam;
    }

    joinBtn.addEventListener('click', handleJoin);

    [roomCodeInput, document.getElementById('room-pin-input')].forEach(input => {
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); handleJoin(); }
        });
    });
    hostBtn.addEventListener('click', async () => {
        if (roomActionBusy) return;
        const pin = document.getElementById('room-pin-input').value.trim();
        if (pin && !/^\d{4}$/.test(pin)) { showLobbyError('Use a 4-digit PIN, or leave it empty.'); return; }
        setRoomBusy(true, 'host');
        lobbyError.classList.add('hidden');
        let createdCode;
        try {
            if (!supabase) throw new Error('Connection unavailable');
            for (let attempt = 0; attempt < 5; attempt++) {
                const code = generateRoomCode();
                const { data, error } = await supabase.from('rooms').select('id').eq('room_code', code).limit(1);
                if (error) throw error;
                if (data?.length) continue;
                const result = await supabase.from('rooms').insert([{ room_code: code, is_locked: !!pin, pin: pin || null }]);
                if (result.error?.code === '23505') continue;
                if (result.error) throw result.error;
                createdCode = code;
                break;
            }
            if (!createdCode) throw new Error('No available room code');
        } catch {
            showLobbyError('The room could not be created. Check your connection and try again.');
        } finally {
            setRoomBusy(false);
        }
        if (createdCode) { roomCodeInput.value = createdCode; await handleJoin(); }
    });
    document.getElementById('logout-link').addEventListener('click', async e => {
        e.preventDefault();
        try { await supabase?.auth.signOut(); } catch { /* Clear the local login even when offline. */ }
        localStorage.removeItem('flow_user');
        sessionStorage.removeItem('flow_last_room');
        window.location.replace('/login.html');
    });
    document.getElementById('toggle-mic').addEventListener('click', (e) => {
        const enabled = toggleAudio();
        if (enabled === null) {
            notify('No microphone is available. Check your browser permissions, then rejoin.', 'error');
            return;
        }
        e.currentTarget.classList.toggle('active', enabled);
        e.currentTarget.setAttribute('aria-pressed', String(enabled));
        e.currentTarget.innerHTML = enabled ? MIC_ON_ICON : MIC_OFF_ICON;
    });

    document.getElementById('toggle-cam').addEventListener('click', (e) => {
        const isEnabled = toggleVideo();
        e.currentTarget.classList.toggle('active', isEnabled);
        e.currentTarget.setAttribute('aria-pressed', String(isEnabled));
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
        e.currentTarget.setAttribute('aria-pressed', String(handRaised));
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
        e.currentTarget.setAttribute('aria-pressed', String(document.body.classList.contains('focus-active')));
    });

    UI.UI.timerModes.forEach(btn => {
        btn.addEventListener('click', (e) => {
            setMode(e.target.dataset.mode);
        });
    });

    // Timer Settings Modal
    document.getElementById('open-timer-settings-btn').addEventListener('click', () => {
        openModal('timer-settings-modal');
    });

    document.getElementById('close-timer-settings-btn').addEventListener('click', () => {
        closeModal();
    });

    document.getElementById('save-timer-settings-btn').addEventListener('click', () => {
        const inputs = ['setting-focus-duration', 'setting-short-break-duration', 'setting-long-break-duration'].map(id => document.getElementById(id));
        if (!inputs.every(input => input.reportValidity())) return;
        const [focus, shortBreak, longBreak] = inputs.map(input => Number(input.value));

        setTimerSettings({
            focus: focus * 60,
            shortBreak: shortBreak * 60,
            longBreak: longBreak * 60
        });

        closeModal();
    });

    // Profile Modal
    const profileCard = document.getElementById('my-presence-card');
    profileCard.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            profileCard.click();
        }
    });
    profileCard.addEventListener('click', async () => {
        openModal('profile-modal');

        document.getElementById('profile-display-name-input').value = currentUsername || '';
        const statsEl = document.getElementById('profile-stats');
        statsEl.innerHTML = '<div style="color: var(--text-muted);">Loading…</div>';

        try {
            const stats = await getProfileStats(getMyUserId());
            renderProfileStats(stats);
        } catch {
            statsEl.textContent = 'Stats are unavailable right now. Close and reopen your profile to retry.';
        }
    });

    document.getElementById('close-profile-btn').addEventListener('click', () => {
        closeModal();
    });

    document.getElementById('save-profile-name-btn').addEventListener('click', async () => {
        const input = document.getElementById('profile-display-name-input');
        const newName = input.value.trim();
        if (!newName || newName.length > 40) { input.reportValidity(); return; }

        const btn = document.getElementById('save-profile-name-btn');
        const originalText = btn.innerText;
        btn.innerText = 'Saving...';
        btn.disabled = true;

        const ok = await saveDisplayName(getMyUserId(), newName);

        btn.innerText = originalText;
        btn.disabled = false;

        if (!ok) {
            notify('Your name could not be saved. Please try again.', 'error');
            return;
        }

        currentUsername = newName;
        updateMyUsername(newName);
        updatePresence({});
        UI.updateMyPresenceUI({ status: UI.UI.myStatusText.textContent }, getTaskStats(), currentUsername);
        document.getElementById('local-dummy-avatar').textContent = currentUsername.charAt(0).toUpperCase();
        notify('Display name saved.');
    });

    document.getElementById('retry-tasks-btn').addEventListener('click', async event => {
        event.currentTarget.disabled = true;
        try { await reloadTasks(); }
        finally { document.getElementById('retry-tasks-btn').disabled = false; }
    });

    // Task Controls
    const taskInput = document.getElementById('new-task-input');
    const addTaskBtn = document.getElementById('add-task-btn');
    const submitTask = async () => {
        if (addTaskBtn.disabled) return;
        const title = taskInput.value;
        addTaskBtn.disabled = true;
        try { if (await addTask(title) && taskInput.value === title) taskInput.value = ''; }
        finally { addTaskBtn.disabled = false; }
    };
    addTaskBtn.addEventListener('click', submitTask);
    taskInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submitTask(); }
    });
    document.getElementById('share-link-btn').addEventListener('click', async () => {
        const url = new URL(window.location.href);
        url.searchParams.set('room', document.getElementById('header-room-code').textContent);
        try {
            await navigator.clipboard.writeText(url.toString());
            notify('Invite link copied.');
        } catch {
            document.getElementById('invite-link-input').value = url.toString();
            openModal('invite-modal');
            document.getElementById('invite-link-input').select();
        }
    });

    document.getElementById('invite-empty-btn').addEventListener('click', () => document.getElementById('share-link-btn').click());

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



    document.getElementById('leave-btn').addEventListener('click', () => openModal('leave-modal'));
    document.querySelector('.app-header .brand').addEventListener('click', e => { e.preventDefault(); openModal('leave-modal'); });
    document.getElementById('cancel-leave-btn').addEventListener('click', closeModal);
    document.getElementById('close-invite-btn').addEventListener('click', closeModal);
    document.getElementById('confirm-leave-btn').addEventListener('click', async () => {
        if (leaving) return;
        leaving = true;
        document.getElementById('confirm-leave-btn').disabled = true;
        cleanupMedia();
        try {
            await Promise.race([disconnectSocket(), new Promise(resolve => setTimeout(resolve, 1500))]);
        } finally {
            window.location.replace('/');
        }
    });
    window.addEventListener('offline', () => connectionStatus('OFFLINE'));
    window.addEventListener('online', () => connectionStatus('CONNECTING'));
    connectionStatus('CONNECTING');

    // Tab Logic
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('keydown', (e) => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                e.preventDefault();
                const next = e.key === 'Home' ? tabBtns[0] : e.key === 'End' ? tabBtns[tabBtns.length - 1] : [...tabBtns].find(b => b !== btn);
                next.click();
                next.focus();
            }
        });
        btn.addEventListener('click', (e) => {
            tabBtns.forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
                b.tabIndex = -1;
            });
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            e.target.classList.add('active');
            e.target.setAttribute('aria-selected', 'true');
            e.target.tabIndex = 0;
            document.getElementById(e.target.dataset.tab).classList.add('active');
        });
    });

    // Instantly drop from presence when tab is closed or refreshed
    window.addEventListener('beforeunload', () => {
        cleanupMedia();
        disconnectSocket();
    });

    // YouTube Sync Logic
    const youtubeInput = document.getElementById('youtube-url-input');
    const syncYoutubeBtn = document.getElementById('sync-youtube-btn');

    syncYoutubeBtn.addEventListener('click', () => {
        const url = youtubeInput.value.trim();
        if (url) {
            if (updateYouTubeIframe(url)) {
                broadcastYouTube(url);
                notify('Background audio shared with the room.');
            } else notify('Enter a valid YouTube video or playlist link.', 'error');
        }
    });
};

const updateYouTubeIframe = url => {
    const embed = youtubeEmbedUrl(url);
    if (!embed) return false;
    document.getElementById('youtube-iframe').src = embed;
    return true;
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
    if (roomActionBusy) return;
    const roomCode = roomCodeInput.value.trim().toUpperCase();
    const pin = document.getElementById('room-pin-input').value.trim();
    if (!/^[A-Z0-9]{6}$/.test(roomCode)) { showLobbyError('Enter the 6-character code shared by your study group.'); roomCodeInput.focus(); return; }
    if (pin && !/^\d{4}$/.test(pin)) { showLobbyError('Use a 4-digit PIN, or leave it empty.'); return; }
    const userObj = getStoredUser();
    if (!userObj) { window.location.replace('/login.html'); return; }
    const username = userObj.email.split('@')[0];
    setRoomBusy(true);
    lobbyError.classList.add('hidden');
    try {
        if (!supabase) throw new Error('Connection unavailable');
        const { data: roomUuid, error } = await supabase.rpc('join_room', { p_room_code: roomCode, p_pin: pin });
        if (error || !roomUuid) {
            showLobbyError(error?.message?.includes('Incorrect PIN') ? 'This room needs a different PIN. Enter it above and try again.' : error?.message?.includes('Room not found') ? 'Room not found. Check the code and try again.' : 'Could not join this room. Check your connection and try again.');
            return;
        }
        currentRoomId = roomUuid; // currentRoomId is now the UUID

        // A saved display name overrides the email-derived default.
        const profile = await getMyProfile(userObj.id);
        currentUsername = profile?.display_name || username;

        closeModal();
        appContainer.classList.remove('hidden');
        const roomUrl = new URL(window.location.href);
        roomUrl.searchParams.set('room', roomCode);
        history.replaceState(null, '', roomUrl);
        sessionStorage.setItem('flow_last_room', roomCode);

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
        if (leaving) return;

        const localDummy = document.getElementById('local-dummy-placeholder');
        const cameraButton = document.getElementById('toggle-cam');
        cameraButton.classList.toggle('active', isVideoActive());
        cameraButton.setAttribute('aria-pressed', String(isVideoActive()));
        cameraButton.innerHTML = isVideoActive() ? CAM_ON_ICON : CAM_OFF_ICON;
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
        initSocket(currentRoomId, currentUsername, !isVideoActive(), {
            onConnectionStatus: connectionStatus,
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
            onTimerUpdated: timerData => syncState(timerData),
            onTasksError: () => {
                document.getElementById('task-sync-status').textContent = 'Tasks could not be loaded.';
                document.getElementById('task-sync-status').classList.remove('hidden');
                document.getElementById('retry-tasks-btn').classList.remove('hidden');
            },
            onRoomTasksUpdate: (data) => {
                document.getElementById('task-sync-status').classList.add('hidden');
                document.getElementById('retry-tasks-btn').classList.add('hidden');
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
            if (timerState.isRunning && timerState.mode === 'focus') startFocusTracking();
            else stopFocusTracking(timerState.isRunning ? 'On Break' : 'Online');
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
    } catch {
        cleanupMedia();
        disconnectSocket();
        appContainer.classList.add('hidden');
        openModal('join-modal');
        showLobbyError('Could not open the room. Check your connection and try again.');
    } finally {
        setRoomBusy(false);
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
            <span class="name-tag" id="name-tag-${escapeHTML(userId)}">${escapeHTML(partners[userId]?.username || 'Partner')}</span>
            <div class="dummy-placeholder hidden" id="dummy-${escapeHTML(userId)}">
                <div class="avatar" style="width:64px; height:64px; font-size:2rem; border-radius:50%;">${escapeHTML((partners[userId]?.username || '?').charAt(0).toUpperCase())}</div>
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
initApp().catch(() => {
    showLobbyError('Flow could not start. Refresh this page to try again.');
});
