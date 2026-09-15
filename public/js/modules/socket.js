import supabase from './supabase.js';

let channel = null;
let currentRoomId = null;
let myUserId = null;
let myUsername = null;

export const initSocket = (roomId, username, isDummyMedia, handlers) => {
    currentRoomId = roomId;
    myUsername = username;
    const user = JSON.parse(localStorage.getItem('flow_user') || 'null');
    myUserId = user?.id || crypto.randomUUID();

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

    channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const participants = {};
        for (const [key, presences] of Object.entries(state)) {
            participants[key] = presences[0];
        }
        handlers.onRoomState({ participants });
    });

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

    channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            await channel.track({
                username: myUsername,
                status: 'Online',
                nowPlaying: null,
                isDummyMedia
            });
            fetchTasks(roomId, handlers.onRoomTasksUpdate);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(`Channel status: ${status}, retrying...`);
            setTimeout(() => {
                if (channel) channel.subscribe();
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
