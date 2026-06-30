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

export const addTask = (title) => {
    if (!title.trim()) return;
    
    const newTask = {
        id: Date.now().toString(),
        title: title.trim(),
        completed: false,
        createdAt: Date.now()
    };
    
    roomTasks.push(newTask);
    broadcastTasks();
    renderTasks();
    
    // Auto-update presence if this is the first uncompleted task
    updateCurrentTaskPresence();
};

export const toggleTask = (taskId) => {
    const task = roomTasks.find(t => t.id === taskId);
    if (task) {
        task.completed = !task.completed;
        broadcastTasks();
        renderTasks();
        updateCurrentTaskPresence();
    }
};

export const deleteTask = (taskId) => {
    roomTasks = roomTasks.filter(t => t.id !== taskId);
    broadcastTasks();
    renderTasks();
    updateCurrentTaskPresence();
};

export const getStats = () => {
    const total = roomTasks.length;
    const completed = roomTasks.filter(t => t.completed).length;
    return { total, completed };
};

const broadcastTasks = () => {
    socketUpdateTasks(roomId, roomTasks);
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
