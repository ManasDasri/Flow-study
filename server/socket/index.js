const rooms = require('./rooms');
const { processChatMessage } = require('../chat');

module.exports = (io) => {
    io.on('connection', (socket) => {
        console.log('New client connected:', socket.id);

        socket.on('join-room', async (roomId, userData) => {
            socket.join(roomId);
            
            // Sync tasks from Supabase on join
            const supabase = require('../db/supabase');
            const { data: tasks } = await supabase
                .from('tasks')
                .select('*')
                .eq('room_id', roomId)
                .order('created_at', { ascending: true });
                
            rooms.joinRoom(roomId, socket.id, userData);
            rooms.updateRoomTasks(roomId, tasks || []);
            
            // Send current room state to the newly joined user
            const roomState = rooms.getRoomState(roomId);
            socket.emit('room-state', roomState);
            
            // Notify others in the room
            socket.to(roomId).emit('user-joined', {
                userId: socket.id,
                userData
            });
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

        // Task Events (Database Integrated)
        socket.on('task-add', async (data) => {
            const { roomId, title, userId } = data;
            const supabase = require('../db/supabase');
            
            // Insert into Supabase
            const { error } = await supabase
                .from('tasks')
                .insert([{ room_id: roomId, title: title, created_by: userId }]);
                
            if (!error) {
                // Fetch updated tasks
                const { data: tasks } = await supabase
                    .from('tasks')
                    .select('*')
                    .eq('room_id', roomId)
                    .order('created_at', { ascending: true });
                    
                rooms.updateRoomTasks(roomId, tasks || []);
                io.to(roomId).emit('room-tasks-update', { tasks: tasks || [] });
            }
        });

        socket.on('task-toggle', async (data) => {
            const { roomId, taskId, completed } = data;
            const supabase = require('../db/supabase');
            
            await supabase
                .from('tasks')
                .update({ completed: completed })
                .eq('id', taskId);
                
            const { data: tasks } = await supabase
                .from('tasks')
                .select('*')
                .eq('room_id', roomId)
                .order('created_at', { ascending: true });
                
            rooms.updateRoomTasks(roomId, tasks || []);
            io.to(roomId).emit('room-tasks-update', { tasks: tasks || [] });
        });

        socket.on('task-delete', async (data) => {
            const { roomId, taskId } = data;
            const supabase = require('../db/supabase');
            
            await supabase
                .from('tasks')
                .delete()
                .eq('id', taskId);
                
            const { data: tasks } = await supabase
                .from('tasks')
                .select('*')
                .eq('room_id', roomId)
                .order('created_at', { ascending: true });
                
            rooms.updateRoomTasks(roomId, tasks || []);
            io.to(roomId).emit('room-tasks-update', { tasks: tasks || [] });
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
