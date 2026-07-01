import { updateTasks as socketUpdateTasks } from './socket.js';
import { updatePresence } from './presence.js';

let roomTasks = [];
let roomId = null;
let updateUI = null;

export const initTasks = (rId, initialTasks, uiCallback) => {
    roomId = rId;
    roomTasks = initialTasks || [];
    updateUI = uiCallback;
    renderTasks();
};

export const setSharedTasks = (tasks) => {
    roomTasks = tasks;
    renderTasks();
    updateCurrentTaskPresence();
};

import supabase from './supabase.js';

export const addTask = async (title) => {
    if (!title.trim()) return;
    const user = JSON.parse(localStorage.getItem('flow_user'));
    
    await supabase.from('tasks').insert({
        room_id: roomId,
        title: title.trim(),
        user_id: user ? user.id : null,
        completed: false
    });
};

export const toggleTask = async (taskId) => {
    const task = roomTasks.find(t => t.id === taskId);
    if (task) {
        await supabase.from('tasks')
            .update({ completed: !task.completed })
            .eq('id', taskId);
    }
};

export const deleteTask = async (taskId) => {
    await supabase.from('tasks')
        .delete()
        .eq('id', taskId);
};

export const getStats = () => {
    const total = roomTasks.length;
    const completed = roomTasks.filter(t => t.completed).length;
    return { total, completed };
};

const renderTasks = () => {
    if (updateUI) {
        updateUI(roomTasks, getStats());
    }
};

const updateCurrentTaskPresence = () => {
    const currentTask = roomTasks.find(t => !t.completed);
    if (currentTask) {
        updatePresence({ currentTask: currentTask.title });
    } else {
        updatePresence({ currentTask: 'Planning...' });
    }
};
