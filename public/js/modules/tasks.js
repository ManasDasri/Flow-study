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
    
    // Optimistic UI update
    const tempId = 'temp-' + Date.now();
    const newTask = {
        id: tempId,
        room_id: roomId,
        title: title.trim(),
        created_by: user ? user.id : null,
        completed: false
    };
    roomTasks.push(newTask);
    renderTasks();
    updateCurrentTaskPresence();
    
    const { error, data } = await supabase.from('tasks').insert({
        room_id: roomId,
        title: title.trim(),
        created_by: user ? user.id : null,
        completed: false
    }).select();
    
    if (error) {
        console.error("Supabase Error Adding Task:", error.message);
        // Revert
        roomTasks = roomTasks.filter(t => t.id !== tempId);
        renderTasks();
        updateCurrentTaskPresence();
        alert("Database Error: " + error.message + "\\n\\nDid you run the SQL from the README in your Supabase SQL Editor?");
    } else if (data && data[0]) {
        // Replace temp task with real task
        const index = roomTasks.findIndex(t => t.id === tempId);
        if (index !== -1) {
            roomTasks[index] = data[0];
            renderTasks();
        }
    }
};

export const toggleTask = async (taskId) => {
    const taskIndex = roomTasks.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
        // Optimistic UI update
        const originalState = roomTasks[taskIndex].completed;
        roomTasks[taskIndex].completed = !originalState;
        renderTasks();
        updateCurrentTaskPresence();

        const { error, data } = await supabase.from('tasks')
            .update({ completed: !originalState })
            .eq('id', taskId)
            .select();

        if (error) {
            console.error("Supabase Error Toggling Task:", error.message);
            // Revert
            roomTasks[taskIndex].completed = originalState;
            renderTasks();
            updateCurrentTaskPresence();
            alert("Database Error: " + error.message);
        } else if (!data || data.length === 0) {
            // RLS silently blocked the write (no error, no affected rows) — revert
            roomTasks[taskIndex].completed = originalState;
            renderTasks();
            updateCurrentTaskPresence();
            alert("Permission denied! Your Supabase database has strict rules blocking this. Please run the updated SQL in README.md.");
        }
    }
};

export const deleteTask = async (taskId) => {
    // Optimistic UI update
    const previousTasks = [...roomTasks];
    roomTasks = roomTasks.filter(t => t.id !== taskId);
    renderTasks();
    updateCurrentTaskPresence();

    const { error, data } = await supabase.from('tasks')
        .delete()
        .eq('id', taskId)
        .select();

    if (error) {
        console.error("Supabase Error Deleting Task:", error.message);
        // Revert
        roomTasks = previousTasks;
        renderTasks();
        updateCurrentTaskPresence();
        alert("Database Error: " + error.message);
    } else if (!data || data.length === 0) {
        // RLS silently blocked the write (no error, no affected rows) — revert
        roomTasks = previousTasks;
        renderTasks();
        updateCurrentTaskPresence();
        alert("Permission denied! Your Supabase database has strict rules blocking this. Please run the updated SQL in README.md.");
    }
};

export const assignTask = async (taskId, userId) => {
    const taskIndex = roomTasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return;

    // Optimistic UI update
    const previousAssignee = roomTasks[taskIndex].assigned_to;
    roomTasks[taskIndex].assigned_to = userId;
    renderTasks();

    const { error, data } = await supabase.from('tasks')
        .update({ assigned_to: userId })
        .eq('id', taskId)
        .select();

    if (error) {
        console.error("Supabase Error Assigning Task:", error.message);
        roomTasks[taskIndex].assigned_to = previousAssignee;
        renderTasks();
        alert("Database Error: " + error.message);
    } else if (!data || data.length === 0) {
        roomTasks[taskIndex].assigned_to = previousAssignee;
        renderTasks();
        alert("Permission denied! Your Supabase database has strict rules blocking this. Please run the updated SQL in README.md.");
    }
};

// Exposes the current shared task list to re-render against fresh data
// (e.g. after the room's participant list changes) without waiting for
// the tasks themselves to change.
export const rerenderTasks = () => renderTasks();

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
