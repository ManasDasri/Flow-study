const activeRooms = new Map();
const userRoomMap = new Map();

function createDefaultRoomState() {
    return {
        users: {},
        timer: {
            mode: 'focus', // 'focus', 'shortBreak', 'longBreak'
            timeLeft: 25 * 60,
            isRunning: false,
            sessionCount: 0
        }
    };
}

module.exports = {
    joinRoom: (roomId, userId, userData) => {
        if (!activeRooms.has(roomId)) {
            activeRooms.set(roomId, createDefaultRoomState());
        }
        
        const room = activeRooms.get(roomId);
        room.users[userId] = {
            ...userData,
            tasks: [],
            stats: { completed: 0, total: 0 },
            presence: {
                status: '🟢 Online',
                nowPlaying: null
            }
        };

        if (!userRoomMap.has(userId)) {
            userRoomMap.set(userId, new Set());
        }
        userRoomMap.get(userId).add(roomId);
    },

    leaveRoom: (roomId, userId) => {
        if (activeRooms.has(roomId)) {
            const room = activeRooms.get(roomId);
            delete room.users[userId];
            
            if (Object.keys(room.users).length === 0) {
                activeRooms.delete(roomId);
            }
        }
        
        if (userRoomMap.has(userId)) {
            userRoomMap.get(userId).delete(roomId);
        }
    },

    getUserRooms: (userId) => {
        return userRoomMap.has(userId) ? Array.from(userRoomMap.get(userId)) : [];
    },

    getRoomState: (roomId) => {
        return activeRooms.get(roomId) || createDefaultRoomState();
    },

    updateTimer: (roomId, action, payload) => {
        if (!activeRooms.has(roomId)) return null;
        
        const room = activeRooms.get(roomId);
        
        switch (action) {
            case 'start':
                room.timer.isRunning = true;
                break;
            case 'pause':
                room.timer.isRunning = false;
                break;
            case 'reset':
                room.timer.isRunning = false;
                room.timer.timeLeft = payload.duration;
                break;
            case 'sync':
                // Client sends regular syncs
                room.timer.timeLeft = payload.timeLeft;
                break;
            case 'mode_change':
                room.timer.mode = payload.mode;
                room.timer.timeLeft = payload.duration;
                room.timer.isRunning = false;
                break;
            case 'session_complete':
                room.timer.sessionCount++;
                break;
        }
        
        return room.timer;
    },

    updateUserTasks: (roomId, userId, tasks, stats) => {
        if (activeRooms.has(roomId) && activeRooms.get(roomId).users[userId]) {
            const user = activeRooms.get(roomId).users[userId];
            user.tasks = tasks;
            user.stats = stats;
        }
    },

    updateUserPresence: (roomId, userId, status, nowPlaying) => {
        if (activeRooms.has(roomId) && activeRooms.get(roomId).users[userId]) {
            const user = activeRooms.get(roomId).users[userId];
            user.presence = { status, nowPlaying };
        }
    }
};
