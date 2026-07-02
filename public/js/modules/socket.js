import supabase from './supabase.js';

let channel = null;
let currentRoomId = null;
let myUserId = null;
let myUsername = null;

export const initSocket = (roomId, username, handlers) => {
    currentRoomId = roomId;
    myUsername = username;
    const user = JSON.parse(localStorage.getItem('flow_user'));
    myUserId = user ? user.id : Math.random().toString(36).substring(7);

    // Create a Supabase Channel for the room
    channel = supabase.channel(`room:${roomId}`, {
        config: {
            presence: {
                key: myUserId,
            },
        },
    });

    // Handle Presence (Users joining/leaving)
    channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const participants = {};
        for (const [key, presences] of Object.entries(state)) {
            // Get the most recent presence state for the user
            participants[key] = presences[0];
        }
        handlers.onRoomState({ participants });
    });

    channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
        if (key !== myUserId) {
            handlers.onUserJoined({ userId: key, ...newPresences[0] });
        }
    });

    channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        if (key !== myUserId) {
            handlers.onUserLeft(key);
        }
    });

    // Handle Broadcasts (Timer, Chat, WebRTC)
    channel.on('broadcast', { event: 'signal' }, (payload) => {
        if (payload.payload.to === myUserId) {
            handlers.onSignal({ from: payload.payload.from, signal: payload.payload.signal });
        }
    });

    channel.on('broadcast', { event: 'timer-updated' }, (payload) => {
        handlers.onTimerUpdated(payload.payload);
    });

    channel.on('broadcast', { event: 'chat-message' }, (payload) => {
        handlers.onChatMessage(payload.payload);
    });
    
    // Subscribe to Postgres Changes for tasks
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `room_id=eq.${roomId}` }, (payload) => {
        // We will fetch the latest tasks when any change occurs
        fetchTasks(roomId, handlers.onRoomTasksUpdate);
    });

    // Subscribe to the channel
    channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            console.log('Connected to Supabase Realtime');
            
            // Track our presence
            await channel.track({
                username: myUsername,
                status: 'Online',
                nowPlaying: null
            });
            
            // Initial task fetch
            fetchTasks(roomId, handlers.onRoomTasksUpdate);
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

export const getSocket = () => channel; // Return channel so other modules can use it if needed
export const getMyUserId = () => myUserId;

export const sendSignal = (to, signal) => {
    if (channel) {
        channel.send({
            type: 'broadcast',
            event: 'signal',
            payload: { to, from: myUserId, signal }
        });
    }
};

export const updateTimer = (roomId, action, payload) => {
    if (channel) {
        channel.send({
            type: 'broadcast',
            event: 'timer-updated',
            payload: { action, ...payload }
        });
    }
};

export const updatePresence = async (roomId, status, nowPlaying) => {
    if (channel) {
        // Get current state to merge
        const state = channel.presenceState();
        const myState = state[myUserId] ? state[myUserId][0] : {};
        
        await channel.track({
            ...myState,
            username: myUsername,
            status: status !== undefined ? status : myState.status,
            nowPlaying: nowPlaying !== undefined ? nowPlaying : myState.nowPlaying
        });
    }
};
