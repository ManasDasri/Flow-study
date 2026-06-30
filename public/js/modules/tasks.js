import { updateTasks as socketUpdateTasks } from './socket.js';
import { updatePresence } from './presence.js';

let myTasks = [];
let roomId = null;
let updateUI = null;

export const initTasks = (rId, initialTasks, uiCallback) => {
    roomId = rId;
    myTasks = initialTasks || [];
    updateUI = uiCallback;
    broadcastTasks();
    renderTasks();
};

export const addTask = (title) => {
    if (!title.trim()) return;
    
    const newTask = {
        id: Date.now().toString(),
        title: title.trim(),
        completed: false,
        createdAt: Date.now()
    };
    
    myTasks.push(newTask);
    broadcastTasks();
    renderTasks();
    
    // Auto-update presence if this is the first uncompleted task
    updateCurrentTaskPresence();
};

export const toggleTask = (taskId) => {
    const task = myTasks.find(t => t.id === taskId);
    if (task) {
        task.completed = !task.completed;
        broadcastTasks();
        renderTasks();
        updateCurrentTaskPresence();
    }
};

export const deleteTask = (taskId) => {
    myTasks = myTasks.filter(t => t.id !== taskId);
    broadcastTasks();
    renderTasks();
    updateCurrentTaskPresence();
};

export const getStats = () => {
    const total = myTasks.length;
    const completed = myTasks.filter(t => t.completed).length;
    return { total, completed };
};

const broadcastTasks = () => {
    socketUpdateTasks(roomId, myTasks, getStats());
};

const renderTasks = () => {
    if (updateUI) {
        updateUI(myTasks, getStats());
    }
};

const updateCurrentTaskPresence = () => {
    const currentTask = myTasks.find(t => !t.completed);
    if (currentTask) {
        updatePresence({ currentTask: currentTask.title });
    } else {
        updatePresence({ currentTask: 'Planning...' });
    }
};
