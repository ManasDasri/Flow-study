const rooms = require('./rooms');
const { processChatMessage } = require('../chat');

module.exports = (io) => {
    io.on('connection', (socket) => {
        console.log('New client connected:', socket.id);

        socket.on('join-room', (roomId, userData) => {
            socket.join(roomId);
            rooms.joinRoom(roomId, socket.id, userData);
            
            // Notify others in the room
            socket.to(roomId).emit('user-joined', {
                userId: socket.id,
                userData
            });

            // Send current room state to the newly joined user
            const roomState = rooms.getRoomState(roomId);
            socket.emit('room-state', roomState);
            
            console.log(`User ${socket.id} joined room ${roomId}`);
        });

        // WebRTC Signaling
        socket.on('signal', (data) => {
            // Forward signal to the specific peer
            io.to(data.to).emit('signal', {
                from: socket.id,
                signal: data.signal
            });
        });

        // Timer Events
        socket.on('timer-action', (data) => {
            const { roomId, action, payload } = data;
            const updatedTimer = rooms.updateTimer(roomId, action, payload);
            
            if (updatedTimer) {
                io.to(roomId).emit('timer-updated', updatedTimer);
            }
        });

        // Task Events
        socket.on('task-update', (data) => {
            const { roomId, tasks, stats } = data;
            rooms.updateUserTasks(roomId, socket.id, tasks, stats);
            
            socket.to(roomId).emit('partner-task-update', {
                userId: socket.id,
                tasks,
                stats
            });
        });

        // Presence Events
        socket.on('presence-update', (data) => {
            const { roomId, status, nowPlaying } = data;
            rooms.updateUserPresence(roomId, socket.id, status, nowPlaying);
            
            socket.to(roomId).emit('partner-presence-update', {
                userId: socket.id,
                status,
                nowPlaying
            });
        });

        // Chat Events
        socket.on('chat-message', async (data) => {
            const { roomId, text } = data;
            const username = rooms.getRoomState(roomId).users[socket.id]?.username || 'Unknown';
            
            // Broadcast user message
            io.to(roomId).emit('chat-message', {
                sender: username,
                text,
                timestamp: Date.now()
            });
            
            // Process AI if needed
            const aiResponse = await processChatMessage(text);
            if (aiResponse) {
                setTimeout(() => {
                    io.to(roomId).emit('chat-message', {
                        sender: 'AI Assistant',
                        text: aiResponse,
                        timestamp: Date.now()
                    });
                }, 1000); // Slight delay for realism
            }
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
            const userRooms = rooms.getUserRooms(socket.id);
            
            userRooms.forEach(roomId => {
                rooms.leaveRoom(roomId, socket.id);
                socket.to(roomId).emit('user-left', socket.id);
            });
        });
    });
};
