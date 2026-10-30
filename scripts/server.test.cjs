const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.GROQ_API_KEY = '';
process.env.TWILIO_ACCOUNT_SID = '';
process.env.TWILIO_AUTH_TOKEN = '';
const app = require('../server');

test('HTTP boundaries and bounded local concurrency', async t => {
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const post = body => fetch(origin + '/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });

    await t.test('HTML, CSS, modules, missing files, and private files', async () => {
        for (const path of ['/', '/login.html', '/styles/login.css', '/js/modules/feedback.js']) assert.equal((await fetch(origin + path)).status, 200, path);
        for (const path of ['/.env', '/sql/schema.sql', '/package.json', '/missing.html']) assert.equal((await fetch(origin + path)).status, 404, path);
    });
    await t.test('invalid payloads return JSON errors', async () => {
        for (const message of [null, 12, {}, [], '', '   ', 'a'.repeat(501)]) {
            const response = await post(JSON.stringify({ message }));
            assert.equal(response.status, 400);
            assert.equal(typeof (await response.json()).text, 'string');
        }
        assert.equal((await post('{')).status, 400);
        assert.equal((await post(JSON.stringify({ message: 'x'.repeat(20000) }))).status, 413);
    });
    await t.test('unconfigured AI returns 503 and bursts are throttled', async () => {
        assert.equal((await post(JSON.stringify({ message: 'Explain photosynthesis' }))).status, 503);
        const responses = await Promise.all(Array.from({ length: 25 }, () => post(JSON.stringify({ message: 'Test' }))));
        assert(responses.some(response => response.status === 429));
        assert(responses.every(response => response.status === 429 || response.status === 503));
    });
    await t.test('TURN without configuration returns an error without a provider call', async () => {
        const response = await fetch(origin + '/api/turn-credentials', { method: 'POST' });
        assert.equal(response.status, 500);
        assert.equal(typeof (await response.json()).error, 'string');
    });
    await t.test('100 simultaneous local static requests complete', async () => {
        const start = performance.now();
        const statuses = await Promise.all(Array.from({ length: 100 }, async (_, i) => (await fetch(origin + (i % 2 ? '/login.html' : '/styles/global.css'))).status));
        assert(statuses.every(status => status === 200));
        console.log('100 concurrent static requests: ' + Math.round(performance.now() - start) + 'ms');
    });
});
