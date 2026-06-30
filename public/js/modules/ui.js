import { formatFocusTime } from './presence.js';

// DOM Elements
const els = {
    roomName: document.getElementById('room-name'),
    count: document.getElementById('count'),
    timeDisplay: document.getElementById('time-display'),
    timerToggleBtn: document.getElementById('timer-toggle-btn'),
    timerModes: document.querySelectorAll('.mode-btn'),
    progressCircle: document.querySelector('.progress-ring__circle'),
    
    myTaskList: document.getElementById('my-task-list'),
    myTaskProgressText: document.getElementById('my-task-progress-text'),
    myTaskProgressFill: document.getElementById('my-task-progress-fill'),
    
    partnerTaskList: document.getElementById('partner-task-list'),
    partnerTaskProgressText: document.getElementById('partner-task-progress-text'),
    partnerTaskProgressFill: document.getElementById('partner-task-progress-fill'),
    partnerEmptyState: document.getElementById('partner-empty-state'),
    
    partnerPresenceContainer: document.getElementById('partner-presence-container'),
    
    myStatusText: document.getElementById('my-status-text'),
    myCurrentTask: document.getElementById('my-current-task'),
    myFocusTime: document.getElementById('my-focus-time'),
    myCompletedTasks: document.getElementById('my-completed-tasks'),
    myUsername: document.getElementById('my-username'),
    myAvatar: document.getElementById('my-avatar'),
    myNowPlaying: document.getElementById('my-now-playing')
};

export const updateRoomInfo = (roomId, count) => {
    els.roomName.innerHTML = `Room: <span class="highlight">${roomId}</span>`;
    els.count.innerText = count;
};

export const updateTimerUI = (state) => {
    // Update text
    const m = Math.floor(state.timeLeft / 60).toString().padStart(2, '0');
    const s = (state.timeLeft % 60).toString().padStart(2, '0');
    els.timeDisplay.innerText = `${m}:${s}`;

    // Update ring progress
    const radius = els.progressCircle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    const percent = state.timeLeft / state.duration;
    const offset = circumference - percent * circumference;
    
    els.progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
    els.progressCircle.style.strokeDashoffset = offset;

    // Update Button
    els.timerToggleBtn.innerText = state.isRunning ? 'Pause' : 'Start Focus';
    if(state.isRunning) {
        els.timerToggleBtn.classList.add('shadow-glow');
    } else {
        els.timerToggleBtn.classList.remove('shadow-glow');
    }

    // Update Modes
    els.timerModes.forEach(btn => {
        if (btn.dataset.mode === state.mode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
};

export const renderTaskList = (container, tasks, isReadOnly, onToggle, onDelete) => {
    container.innerHTML = '';
    
    if (tasks.length === 0 && !isReadOnly) {
        container.innerHTML = `<li class="text-muted" style="text-align: center; padding: 20px 0;">No tasks yet. Add one above!</li>`;
        return;
    }

    tasks.forEach(task => {
        const li = document.createElement('li');
        li.className = `task-item scale-in ${task.completed ? 'completed' : ''}`;
        
        li.innerHTML = `
            <label class="custom-checkbox">
                <input type="checkbox" ${task.completed ? 'checked' : ''} ${isReadOnly ? 'disabled' : ''}>
                <span class="checkmark"></span>
            </label>
            <div class="task-content">
                <div class="task-title">${escapeHTML(task.title)}</div>
            </div>
            ${!isReadOnly ? `<button class="icon-btn small delete-btn" aria-label="Delete Task"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>` : ''}
        `;

        if (!isReadOnly) {
            const checkbox = li.querySelector('input');
            checkbox.addEventListener('change', () => onToggle(task.id));
            
            const deleteBtn = li.querySelector('.delete-btn');
            deleteBtn.addEventListener('click', () => onDelete(task.id));
        }

        container.appendChild(li);
    });
};

export const updateTaskStatsUI = (stats, progressTextEl, progressFillEl) => {
    const percentage = stats.total === 0 ? 0 : Math.round((stats.completed / stats.total) * 100);
    progressTextEl.innerText = `${percentage}%`;
    progressFillEl.style.width = `${percentage}%`;
    return percentage;
};

export const updateMyPresenceUI = (state, stats, username) => {
    els.myUsername.innerText = username;
    els.myAvatar.innerText = username.charAt(0).toUpperCase();
    
    els.myStatusText.innerText = state.status;
    els.myCurrentTask.innerText = state.currentTask;
    els.myFocusTime.innerText = formatFocusTime(state.focusTime);
    els.myCompletedTasks.innerText = `${stats.completed} / ${stats.total} Tasks`;
    
    if (state.nowPlaying) {
        els.myNowPlaying.innerText = state.nowPlaying;
        els.myNowPlaying.parentElement.classList.remove('hidden');
    } else {
        els.myNowPlaying.parentElement.classList.add('hidden');
    }
    
    const dot = els.myStatusText.previousElementSibling;
    dot.className = `dot ${state.status.includes('Break') ? 'yellow' : 'green'}`;
};

export const renderPartnerPresenceCard = (userId, userData, tasks, stats) => {
    let card = document.getElementById(`presence-${userId}`);
    
    if (!card) {
        card = document.createElement('div');
        card.id = `presence-${userId}`;
        card.className = 'glass-card profile-card mt-4 fade-in';
        els.partnerPresenceContainer.appendChild(card);
    }
    
    const currentTask = tasks && tasks.length > 0 ? (tasks.find(t => !t.completed)?.title || 'All done!') : 'Planning...';
    
    card.innerHTML = `
        <div class="profile-header">
            <div class="avatar" style="background: linear-gradient(135deg, var(--green), #059669)">${userData.username.charAt(0).toUpperCase()}</div>
            <div class="profile-info">
                <h3>${escapeHTML(userData.username)}</h3>
                <div class="status-indicator">
                    <span class="dot green"></span>
                    <span>${userData.presence?.status || '🟢 Online'}</span>
                </div>
            </div>
        </div>
        <div class="presence-details mt-4">
            <div class="detail-row">
                <span class="label">Current Task:</span>
                <span class="value">${escapeHTML(currentTask)}</span>
            </div>
            <div class="detail-row">
                <span class="label">Completed:</span>
                <span class="value">${stats?.completed || 0} / ${stats?.total || 0} Tasks</span>
            </div>
        </div>
    `;
};

export const removePartnerPresenceCard = (userId) => {
    const card = document.getElementById(`presence-${userId}`);
    if (card) {
        card.remove();
    }
};

// Utils
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// Exports for direct access
export const UI = els;
