import supabase from './supabase.js';
import { updatePresence } from './presence.js';
import { notify } from './feedback.js';

let roomTasks = [];
let roomId = null;
let updateUI = null;
let adding = false;
const pending = new Set();

export const initTasks = (id, initialTasks, uiCallback) => {
    roomId = id;
    roomTasks = initialTasks || [];
    updateUI = uiCallback;
    renderTasks();
};

export const setSharedTasks = tasks => {
    if (!Array.isArray(tasks)) return;
    const inFlight = roomTasks.filter(task => pending.has(task.id));
    roomTasks = tasks.filter(task => !pending.has(task.id)).concat(inFlight);
    renderTasks();
    updateCurrentTaskPresence();
};

export const addTask = async title => {
    title = title.trim();
    if (!roomId || adding || !title || title.length > 100) return false;
    adding = true;
    const user = JSON.parse(localStorage.getItem('flow_user'));
    const task = { id: 'temp-' + crypto.randomUUID(), room_id: roomId, title, created_by: user?.id, completed: false, pending: true };
    pending.add(task.id);
    roomTasks.push(task);
    renderTasks();
    try {
        const { data, error } = await supabase.from('tasks').insert({
            room_id: roomId, title, created_by: user?.id, completed: false
        }).select();
        if (error || !data?.[0]) throw new Error('Task was not saved');
        roomTasks = roomTasks.filter(row => row.id !== task.id && row.id !== data[0].id);
        roomTasks.push(data[0]);
        return true;
    } catch {
        roomTasks = roomTasks.filter(row => row.id !== task.id);
        notify('Task could not be saved. Your text is still in the input; try again.', 'error');
        return false;
    } finally {
        adding = false;
        pending.delete(task.id);
        renderTasks();
        updateCurrentTaskPresence();
    }
};

async function updateTask(id, changes) {
    const task = roomTasks.find(row => row.id === id);
    if (!task || pending.has(id)) return;
    const previous = { ...task };
    Object.assign(task, changes(task), { pending: true });
    pending.add(id);
    renderTasks();
    try {
        const { data, error } = await supabase.from('tasks').update(changes(previous)).eq('id', id).select();
        if (error || !data?.length) throw new Error('Task was not updated');
    } catch {
        Object.assign(task, previous);
        notify('Task could not be updated. The previous value has been restored.', 'error');
    } finally {
        task.pending = false;
        pending.delete(id);
        renderTasks();
        updateCurrentTaskPresence();
    }
}

export const toggleTask = id => updateTask(id, task => ({ completed: !task.completed }));
export const assignTask = (id, userId) => updateTask(id, () => ({ assigned_to: userId }));

export const deleteTask = async id => {
    const index = roomTasks.findIndex(row => row.id === id);
    if (index < 0 || pending.has(id)) return;
    const [task] = roomTasks.splice(index, 1);
    pending.add(id);
    renderTasks();
    try {
        const { data, error } = await supabase.from('tasks').delete().eq('id', id).select();
        if (error || !data?.length) throw new Error('Task was not deleted');
    } catch {
        if (!roomTasks.some(row => row.id === id)) roomTasks.splice(Math.min(index, roomTasks.length), 0, task);
        notify('Task could not be deleted. It has been restored.', 'error');
    } finally {
        pending.delete(id);
        renderTasks();
        updateCurrentTaskPresence();
    }
};

export const rerenderTasks = () => renderTasks();
export const getStats = () => ({ total: roomTasks.length, completed: roomTasks.filter(task => task.completed).length });
function renderTasks() { updateUI?.(roomTasks, getStats()); }
function updateCurrentTaskPresence() {
    updatePresence({ currentTask: roomTasks.find(task => !task.completed)?.title || 'Planning…' });
}
