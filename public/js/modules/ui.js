import { formatFocusTime } from './presence.js';
import { escapeHTML } from './utils.js';

// DOM Elements
const els = {
    roomName: document.getElementById('room-name'),
    count: document.getElementById('count'),
    timeDisplay: document.getElementById('time-display'),
    timerToggleBtn: document.getElementById('timer-toggle-btn'),
    timerModes: document.querySelectorAll('.mode-btn'),

    partnerPresenceContainer: document.getElementById('partner-presence-container'),

    myStatusText: document.getElementById('my-status-text'),
    myUsername: document.getElementById('my-username'),
    myAvatar: document.getElementById('my-avatar'),
    myFocusTime: document.getElementById('my-focus-time')
};

export const updateRoomInfo = (roomId, count) => {
    // Keep the id="header-room-code" span alive across rewrites — other
    // code (Copy Link) looks it up by id, and a plain replacement span
    // silently breaks that after the first presence sync.
    els.roomName.innerHTML = `Room: <span class="highlight" id="header-room-code">${roomId}</span>`;
    els.count.innerText = count;
};

export const updateTimerUI = (state) => {
    // Update text
    const m = Math.floor(state.timeLeft / 60).toString().padStart(2, '0');
    const s = (state.timeLeft % 60).toString().padStart(2, '0');
    els.timeDisplay.innerText = `${m}:${s}`;

    // Update Button
    els.timerToggleBtn.innerHTML = state.isRunning ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
    if(state.isRunning) {
        els.timerToggleBtn.classList.add('active');
    } else {
        els.timerToggleBtn.classList.remove('active');
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

// Reconciles the task <li> elements in place instead of clearing and
// rebuilding the whole list on every render. addTask alone triggers this
// three times in a row (optimistic add, insert response, realtime echo);
// wiping container.innerHTML each time flashed the list blank and replayed
// every row's entrance animation, not just the new row's.
export const renderTaskList = (container, tasks, isReadOnly, onToggle, onDelete) => {
    const emptyMsg = container.querySelector('.task-empty-msg');

    if (tasks.length === 0 && !isReadOnly) {
        if (!emptyMsg) {
            container.innerHTML = `<li class="task-empty-msg text-muted" style="text-align: center; padding: 20px 0; font-weight:600;">No tasks yet. Add one above!</li>`;
        }
        return;
    }
    if (emptyMsg) emptyMsg.remove();

    const existing = new Map();
    container.querySelectorAll(':scope > .task-item').forEach((li) => existing.set(li.dataset.taskId, li));

    let prevEl = null;
    tasks.forEach((task) => {
        const key = String(task.id);
        let li = existing.get(key);

        if (li) {
            existing.delete(key);
        } else {
            li = document.createElement('li');
            li.className = 'task-item scale-in';
            li.dataset.taskId = key;

            li.innerHTML = `
                <div class="task-checkbox" ${isReadOnly ? '' : 'style="cursor:pointer;"'}></div>
                <div class="task-content" style="flex:1; font-weight:600;">
                    <div class="task-title"></div>
                </div>
                ${!isReadOnly ? `<button class="icon-btn" style="width:28px; height:28px; color:var(--danger);" aria-label="Delete Task"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>` : ''}
            `;

            if (!isReadOnly) {
                li.querySelector('.task-checkbox').addEventListener('click', () => onToggle(task.id));
                li.querySelector('.icon-btn').addEventListener('click', () => onDelete(task.id));
            }
        }

        li.classList.toggle('completed', !!task.completed);

        const checkbox = li.querySelector('.task-checkbox');
        checkbox.innerHTML = task.completed ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>' : '';

        const titleEl = li.querySelector('.task-title');
        const safeTitle = escapeHTML(task.title);
        if (titleEl.innerHTML !== safeTitle) titleEl.innerHTML = safeTitle;

        const wantsPosition = prevEl ? prevEl.nextSibling : container.firstChild;
        if (li !== wantsPosition) {
            container.insertBefore(li, wantsPosition);
        }
        prevEl = li;
    });

    existing.forEach((li) => li.remove());
};

export const updateTaskStatsUI = (stats, progressTextEl, progressFillEl) => {
    const percentage = stats.total === 0 ? 0 : Math.round((stats.completed / stats.total) * 100);
    if(progressTextEl) progressTextEl.innerText = `${percentage}%`;
    if(progressFillEl) progressFillEl.style.width = `${percentage}%`;
    return percentage;
};

export const updateMyPresenceUI = (state, stats, username) => {
    els.myUsername.innerText = username;
    els.myAvatar.innerText = username.charAt(0).toUpperCase();

    els.myStatusText.innerText = state.status;

    const dot = els.myStatusText.previousElementSibling;
    dot.className = `dot ${state.status.includes('Break') ? 'yellow' : 'green'}`;

    if (els.myFocusTime && state.focusTime !== undefined) {
        els.myFocusTime.innerText = `Today: ${state.focusTime}m focused`;
    }
};

export const renderPartnerPresenceCard = (userId, userData) => {
    let card = document.getElementById(`presence-${userId}`);

    if (!card) {
        card = document.createElement('div');
        card.id = `presence-${userId}`;
        card.className = 'brutal-card profile-card fade-in';
        els.partnerPresenceContainer.appendChild(card);
    }

    const safeName = userData.username || 'Partner';
    const partnerStatus = userData.presence?.status || userData.status || 'Online';
    const isBreak = String(partnerStatus).includes('Break');

    card.innerHTML = `
        <div class="profile-header">
            <div class="avatar">${safeName.charAt(0).toUpperCase()}</div>
            <div class="profile-info">
                <h3>${escapeHTML(safeName)}</h3>
                <div class="status-indicator">
                    <span class="dot ${isBreak ? 'yellow' : 'green'}"></span>
                    <span>${escapeHTML(partnerStatus)}</span>
                </div>
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


// Exports for direct access
export const UI = els;
