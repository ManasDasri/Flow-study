// Start npm start, then run: playwright-cli run-code --filename=scripts/ui-smoke.js
// All account, room, and task requests use an in-browser fixture.
async (page) => {
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const visible = async selector => { await page.locator(selector).waitFor({ state: 'visible' }); };
    const fitsViewport = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page overflows horizontally');
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ body: '', contentType: 'text/javascript' }));
    await page.route('https://www.youtube.com/**', route => route.fulfill({ body: '<body style="background:#14221b;color:#9baa9c;font:12px sans-serif;padding:20px">Background audio preview</body>', contentType: 'text/html' }));
    await page.route('**/js/modules/supabase.js', route => route.fulfill({ contentType: 'text/javascript', body: `
        const user = { id: 'test-user', email: 'alex@example.com' };
        const tables = { profiles: [{ id: user.id, display_name: 'Alex' }], rooms: [], tasks: [], sessions: [] };
        function from(table) {
            let action = 'select', payload, filters = [], single = false;
            const query = {
                select() { return this; }, order() { return this; }, limit() { return this; }, gte() { return this; },
                eq(key, value) { filters.push(row => row[key] === value); return this; },
                maybeSingle() { single = true; return this; },
                insert(value) { action = 'insert'; payload = value; return this; },
                update(value) { action = 'update'; payload = value; return this; },
                upsert(value) { action = 'insert'; payload = value; return this; },
                delete() { action = 'delete'; return this; },
                then(resolve, reject) {
                    let rows = tables[table].filter(row => filters.every(filter => filter(row)));
                    if (action === 'insert') {
                        rows = (Array.isArray(payload) ? payload : [payload]).map(row => ({ id: crypto.randomUUID(), ...row }));
                        tables[table].push(...rows);
                    }
                    if (action === 'update') rows.forEach(row => Object.assign(row, payload));
                    if (action === 'delete') tables[table] = tables[table].filter(row => !rows.includes(row));
                    return Promise.resolve({ data: single ? rows[0] || null : structuredClone(rows), error: null, count: rows.length }).then(resolve, reject);
                }
            };
            return query;
        }
        const channel = {
            on() { return this; }, subscribe(callback) { setTimeout(() => callback('SUBSCRIBED'), 0); return this; },
            async track(value) { this.presence = value; }, async untrack() {}, async send() {},
            presenceState() { return { [user.id]: [this.presence || { username: 'Alex' }] }; }
        };
        export default {
            from, channel: () => channel, removeChannel() {},
            rpc: async () => ({ data: 'test-room', error: null }),
            auth: {
                signInWithPassword: async () => ({ data: { user, session: {} }, error: null }),
                signUp: async () => ({ data: { user, session: {} }, error: null })
            }
        };
    ` }));
    await page.addInitScript(() => {
        if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { throw new Error('Camera disabled for UI test'); };
    });
    await page.goto('http://localhost:3000/login.html');
    await page.evaluate(() => { localStorage.clear(); });
    await page.reload();
    for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await fitsViewport();
        await visible('#login-btn');
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: 'output/playwright/after-login-desktop.png' });
    await page.getByLabel('Your atmosphere').selectOption('midnight');
    await page.reload();
    assert(await page.locator('html').getAttribute('data-theme') === 'midnight', 'Theme should persist');
    await page.getByLabel('Your atmosphere').selectOption('forest');
    await page.getByLabel('Email address').fill('alex@example.com');
    await page.getByLabel('Password', { exact: true }).fill('test-password');
    await page.getByLabel('Password', { exact: true }).press('Enter');
    await page.waitForURL('http://localhost:3000/');
    await visible('#join-modal');
    await page.screenshot({ path: 'output/playwright/after-lobby-desktop.png' });
    await page.getByLabel('Room code', { exact: true }).fill('FOCUS6');
    await page.getByRole('button', { name: 'Join room', exact: true }).click();
    await page.locator('#new-task-input').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.getElementById('new-task-input').disabled);
    assert(await page.locator('#toggle-cam').getAttribute('aria-pressed') === 'false', 'Unavailable camera should display its off state');
    await page.locator('.reactions-menu summary').click();
    await page.getByRole('button', { name: 'Raise hand', exact: true }).click();
    await visible('.hand-raised-badge');
    await page.getByRole('button', { name: 'Raise hand', exact: true }).click();
    await page.locator('.reactions-menu summary').click();
    await page.getByLabel('New shared task').fill('Review chapter 4');
    await page.getByRole('button', { name: 'Add task', exact: true }).click();
    await page.getByRole('button', { name: 'Complete task: Review chapter 4', exact: true }).focus();
    await page.keyboard.press('Space');
    assert(await page.locator('#room-task-progress-text').innerText() === '100%', 'Keyboard task completion should update progress');
    await page.getByRole('button', { name: 'Mark incomplete: Review chapter 4', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('room-task-progress-fill').getBoundingClientRect().width < 1);
    await page.locator('.stage-header h1').click();
    await page.screenshot({ path: 'output/playwright/after-room-desktop.png' });
    await page.getByRole('button', { name: 'Start timer', exact: true }).click();
    await visible('[aria-label="Pause timer"]');
    await page.getByRole('button', { name: 'Pause timer', exact: true }).click();
    await page.getByRole('button', { name: 'Break', exact: true }).click();
    assert(await page.locator('#time-display').innerText() === '05:00', 'Break should show five minutes');
    await page.getByRole('button', { name: 'Focus', exact: true }).click();
    await page.getByRole('button', { name: 'Toggle Focus Mode', exact: true }).click();
    await visible('#timer-toggle-btn');
    await visible('#focus-mode-toggle');
    await page.getByRole('button', { name: 'Toggle Focus Mode', exact: true }).click();
    await page.getByRole('button', { name: 'Timer settings', exact: true }).click();
    await page.getByLabel('Focus (minutes)', { exact: true }).fill('30');
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    assert(await page.locator('#time-display').innerText() === '30:00', 'Timer settings should apply');
    await page.getByRole('tab', { name: 'Tasks', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    assert(await page.getByRole('tab', { name: 'Chat', exact: true }).getAttribute('aria-selected') === 'true', 'Arrow key should activate Chat');
    await page.getByLabel('Message to room').fill('Ready for the next session.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    assert((await page.locator('#chat-messages').innerText()).includes('Ready for the next session.'), 'Chat should render messages');
    await page.getByRole('tab', { name: 'Tasks', exact: true }).click();
    await page.getByRole('button', { name: 'Edit your profile', exact: true }).focus();
    await page.keyboard.press('Enter');
    await visible('#profile-modal');
    await page.getByRole('button', { name: 'Close profile', exact: true }).click();
    for (const width of [1440, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await fitsViewport();
        await visible('#timer-toggle-btn');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'output/playwright/after-room-mobile.png', fullPage: true });
    await page.getByRole('button', { name: 'Delete Task', exact: true }).click();
    assert(await page.locator('.task-item').count() === 0, 'Delete should remove the task');
    await page.getByRole('button', { name: 'Leave', exact: true }).click();
    await visible('#join-modal');
    await fitsViewport();
    await page.screenshot({ path: 'output/playwright/after-lobby-mobile.png', fullPage: true });
    await page.getByRole('button', { name: 'Create a room', exact: true }).click();
    await visible('#app');
    await page.goto('http://localhost:3000/login.html');
    await page.screenshot({ path: 'output/playwright/after-login-mobile.png', fullPage: true });
    assert(failures.length === 0, 'Uncaught browser errors: ' + failures.join('; '));
    console.log('PASS: login, room entry, themes, timer, focus mode, tasks, chat, keyboard controls, and responsive layouts. Backend and media mocked.');
}
