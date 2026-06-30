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
    const user = JSON.parse(localStorage.getItem('flow_user'));
    
    import('./socket.js').then(module => {
        module.socket.emit('task-add', {
            roomId: roomId,
            title: title.trim(),
            userId: user ? user.id : null
        });
    });
};

export const toggleTask = (taskId) => {
    const task = roomTasks.find(t => t.id === taskId);
    if (task) {
        import('./socket.js').then(module => {
            module.socket.emit('task-toggle', {
                roomId: roomId,
                taskId: taskId,
                completed: !task.completed
            });
        });
    }
};

export const deleteTask = (taskId) => {
    import('./socket.js').then(module => {
        module.socket.emit('task-delete', {
            roomId: roomId,
            taskId: taskId
        });
    });
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
