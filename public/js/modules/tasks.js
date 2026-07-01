import supabase from './supabase.js';
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

export const addTask = async (title) => {
    if (!title.trim()) return;
    const user = JSON.parse(localStorage.getItem('flow_user'));
    
    const { error } = await supabase.from('tasks').insert({
        room_id: roomId,
        title: title.trim(),
        created_by: user ? user.id : null,
        completed: false
    });
    
    if (error) {
        console.error("Supabase Error Adding Task:", error.message);
        alert("Database Error: " + error.message + "\\n\\nDid you run the SQL from the README in your Supabase SQL Editor?");
    } else {
        // Optimistically reload tasks for local user if Realtime hasn't kicked in
        const { data } = await supabase.from('tasks').select('*').eq('room_id', roomId).order('created_at', { ascending: true });
        if (data) setSharedTasks(data);
    }
};

export const toggleTask = async (taskId) => {
    const task = roomTasks.find(t => t.id === taskId);
    if (task) {
        await supabase.from('tasks')
            .update({ completed: !task.completed })
            .eq('id', taskId);
            
        // Optimistically reload
        const { data } = await supabase.from('tasks').select('*').eq('room_id', roomId).order('created_at', { ascending: true });
        if (data) setSharedTasks(data);
    }
};

export const deleteTask = async (taskId) => {
    await supabase.from('tasks')
        .delete()
        .eq('id', taskId);
        
    // Optimistically reload
    const { data } = await supabase.from('tasks').select('*').eq('room_id', roomId).order('created_at', { ascending: true });
    if (data) setSharedTasks(data);
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
