import supabase from './supabase.js';

let channel = null;
let currentRoomId = null;
let myUserId = null;
let myUsername = null;
let currentHandlers = null;
let currentIsDummyMedia = false;
let connectionGeneration = 0;
let presenceReconcileInterval = null;

export const initSocket = (roomId, username, isDummyMedia, handlers) => {
    currentRoomId = roomId;
    myUsername = username;
    currentHandlers = handlers;
    currentIsDummyMedia = isDummyMedia;
    const user = JSON.parse(localStorage.getItem('flow_user') || 'null');
    myUserId = user?.id || crypto.randomUUID();

    connectChannel();
};

// A Supabase Realtime channel can only join() once per instance — calling
// subscribe() again on the same (now closed/errored) instance throws an
// uncaught "tried to join multiple times" error that silently breaks realtime
// message handling for the rest of the page (presence, signaling, broadcasts).
// So reconnecting means tearing down and building a brand-new channel, not
// re-subscribing the dead one.
const connectChannel = () => {
    const roomId = currentRoomId;
    const handlers = currentHandlers;

    // Guards against the subscribe() status callback firing more than once
    // for a single underlying failure (e.g. CHANNEL_ERROR immediately
    // followed by CLOSED) — without this, each firing independently
    // scheduled its own reconnect, and the resulting duplicate reconnect
    // chains compounded every generation until failures were happening
    // many times a second instead of once every few seconds.
    const myGeneration = ++connectionGeneration;

    if (presenceReconcileInterval) {
        clearInterval(presenceReconcileInterval);
        presenceReconcileInterval = null;
    }

    if (channel) {
        supabase.removeChannel(channel);
        channel = null;
    }

    channel = supabase.channel(`room:${roomId}`, {
        config: {
            presence: { key: myUserId },
            broadcast: { ack: true, self: false }
        }
    });

    const emitRoomState = () => {
        const state = channel.presenceState();
        const participants = {};
        for (const [key, presences] of Object.entries(state)) {
            participants[key] = presences[0];
        }
        handlers.onRoomState({ participants });
    };

    channel.on('presence', { event: 'sync' }, emitRoomState);

    channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
        if (key !== myUserId) {
            handlers.onUserJoined({ userId: key, ...newPresences[0] });
        }
    });

    channel.on('presence', { event: 'leave' }, ({ key }) => {
        if (key !== myUserId) {
            handlers.onUserLeft(key);
        }
    });

    channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
        if (payload?.to === myUserId) {
            handlers.onSignal({ from: payload.from, signal: payload.signal });
        }
    });

    channel.on('broadcast', { event: 'youtube-sync' }, ({ payload }) => {
        handlers.onYouTubeSync?.(payload.url);
    });

    channel.on('broadcast', { event: 'timer-updated' }, ({ payload }) => {
        handlers.onTimerUpdated(payload);
    });

    channel.on('broadcast', { event: 'chat-message' }, ({ payload }) => {
        handlers.onChatMessage(payload);
    });

    channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `room_id=eq.${roomId}` },
        () => fetchTasks(roomId, handlers.onRoomTasksUpdate)
    );

    channel.subscribe(async (status, err) => {
        // Ignore callbacks from a channel instance that's already been
        // superseded by a newer connectChannel() call.
        if (myGeneration !== connectionGeneration) return;

        if (err) console.error(`[socket] channel error on status ${status}:`, err);
        if (status === 'SUBSCRIBED') {
            await channel.track({
                username: myUsername,
                status: 'Online',
                nowPlaying: null,
                isDummyMedia: currentIsDummyMedia
            });
            fetchTasks(roomId, handlers.onRoomTasksUpdate);
            emitRoomState();

            // Defensive self-heal: after a reconnect elsewhere in the room,
            // a client's local presence view can permanently miss a 'join'
            // diff for a participant who genuinely is present — observed
            // directly (matching presence topics, both channels in state
            // "joined", but one client's presenceState() missing the other
            // entirely with no further event ever correcting it). Since a
            // fresh subscribe always receives a complete, authoritative
            // sync, periodically rebuilding the channel from scratch bounds
            // how long such a gap can persist, instead of it lasting for the
            // rest of the session. WebRTC peer connections live in rtc.js
            // independently of this channel, so they're unaffected.
            presenceReconcileInterval = setInterval(() => {
                if (myGeneration !== connectionGeneration) {
                    clearInterval(presenceReconcileInterval);
                    return;
                }
                connectChannel();
            }, 45000);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(`Channel status: ${status}, reconnecting...`);
            setTimeout(() => {
                if (myGeneration === connectionGeneration && currentRoomId === roomId) connectChannel();
            }, 3000);
        }
    });
};

const fetchTasks = async (roomId, callback) => {
    const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });

    if (!error && data) {
        callback({ tasks: data });
    }
};

export const getSocket = () => channel;
export const getMyUserId = () => myUserId;

export const sendSignal = (to, signal) => {
    if (!channel) return;
    channel.send({
        type: 'broadcast',
        event: 'signal',
        payload: { to, from: myUserId, signal }
    });
};

export const updateTimer = (roomId, action, payload) => {
    if (!channel) return;
    channel.send({
        type: 'broadcast',
        event: 'timer-updated',
        payload: { action, ...payload }
    });
};

export const updatePresence = async (roomId, status, nowPlaying) => {
    if (!channel) return;
    const state = channel.presenceState();
    const myState = state[myUserId] ? state[myUserId][0] : {};

    await channel.track({
        ...myState,
        username: myUsername,
        status,
        nowPlaying: nowPlaying !== undefined ? nowPlaying : myState.nowPlaying
    });
};

export const updateCameraState = async (isVideoActive) => {
    if (!channel) return;
    const state = channel.presenceState();
    const myState = state[myUserId] ? state[myUserId][0] : {};

    await channel.track({
        ...myState,
        isDummyMedia: !isVideoActive
    });
};

export const broadcastYouTube = (url) => {
    if (!channel) return;
    channel.send({
        type: 'broadcast',
        event: 'youtube-sync',
        payload: { url }
    });
};
