let socket = null;

export const initSocket = (roomId, username, handlers) => {
    socket = io();

    socket.on('connect', () => {
        console.log('Connected to socket server');
        socket.emit('join-room', roomId, { username });
    });

    socket.on('room-state', (state) => {
        handlers.onRoomState(state);
    });

    socket.on('user-joined', (data) => {
        handlers.onUserJoined(data);
    });

    socket.on('user-left', (userId) => {
        handlers.onUserLeft(userId);
    });

    socket.on('signal', (data) => {
        handlers.onSignal(data);
    });

    socket.on('timer-updated', (timerData) => {
        handlers.onTimerUpdated(timerData);
    });

    socket.on('room-tasks-update', (data) => {
        handlers.onRoomTasksUpdate(data);
    });

    socket.on('partner-presence-update', (data) => {
        handlers.onPartnerPresenceUpdate(data);
    });

    socket.on('chat-message', (data) => {
        handlers.onChatMessage(data);
    });
};

export const getSocket = () => socket;

export const sendSignal = (to, signal) => {
    if (socket) socket.emit('signal', { to, signal });
};

export const updateTimer = (roomId, action, payload) => {
    if (socket) socket.emit('timer-action', { roomId, action, payload });
};

export const updateTasks = (roomId, tasks, stats) => {
    if (socket) socket.emit('task-update', { roomId, tasks, stats });
};

export const updatePresence = (roomId, status, nowPlaying) => {
    if (socket) socket.emit('presence-update', { roomId, status, nowPlaying });
};
