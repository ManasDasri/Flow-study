const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { transpileModule, ModuleKind } = require('typescript');
const source = transpileModule(readFileSync('src/client/modules/host-state.ts', 'utf8'), { compilerOptions: { module: ModuleKind.ESNext, target: 9 } }).outputText;
const load = () => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('who hosts: the owner, someone standing in, or nobody', async () => {
    const { resolveHost } = await load();
    assert.deepEqual(resolveHost({ created_by: 'me' }, 'me'), { hostId: 'me', hostAway: false, isHost: true, isActing: false });
    assert.deepEqual(resolveHost({ created_by: 'ana' }, 'me'), { hostId: 'ana', hostAway: false, isHost: false, isActing: false });
    // The owner stepped away: whoever stands in shows as host, but is not the host.
    assert.deepEqual(resolveHost({ created_by: 'ana', host_away: true, acting_host: 'me' }, 'me'), { hostId: 'me', hostAway: true, isHost: false, isActing: true });
    assert.deepEqual(resolveHost({ created_by: 'me', host_away: true, acting_host: 'sam' }, 'me'), { hostId: 'sam', hostAway: true, isHost: false, isActing: false }, 'The owner is not host while away');
    assert.deepEqual(resolveHost({ created_by: 'ana', host_away: true, acting_host: null }, 'me'), { hostId: '', hostAway: true, isHost: false, isActing: false });
    // A stand-in recorded without the host being away is ignored.
    assert.equal(resolveHost({ created_by: 'ana', host_away: false, acting_host: 'me' }, 'me').isActing, false);
    // Older rooms, or servers without sql/006, have no host at all.
    assert.deepEqual(resolveHost(null, 'me'), { hostId: '', hostAway: false, isHost: false, isActing: false });
    assert.equal(resolveHost({ created_by: null, host_away: true, acting_host: 'me' }, 'me').isActing, false);
});

test('what changed, in words', async () => {
    const { resolveHost, hostChangeNote } = await load();
    const as = (row, me = 'me') => resolveHost(row, me);
    assert.equal(hostChangeNote(as({ created_by: 'ana' }), as({ created_by: 'ana' }), 'Ana'), null, 'No change, no note');
    assert.deepEqual(hostChangeNote(as({ created_by: 'ana' }), as({ created_by: 'me' }), 'Me'), { note: 'You’re the host now.', toast: 'You’re the host now. You can remove people, and hand the room on when you leave.', becameHost: true });
    assert.equal(hostChangeNote(as({ created_by: 'ana' }), as({ created_by: 'ana', host_away: true }), 'Ana').note, 'The host stepped away. The room stays open.');
    assert.equal(hostChangeNote(as({ created_by: 'ana', host_away: true }), as({ created_by: 'ana', host_away: true, acting_host: 'me' }), 'Me').note, 'You’re the room host for now.');
    assert.equal(hostChangeNote(as({ created_by: 'ana', host_away: true }), as({ created_by: 'ana', host_away: true, acting_host: 'sam' }), 'Sam').note, 'Sam is hosting for now.');
    assert.equal(hostChangeNote(as({ created_by: 'ana', host_away: true, acting_host: 'me' }), as({ created_by: 'ana', host_away: true }), '').note, 'You’re no longer hosting.');
    assert.equal(hostChangeNote(as({ created_by: 'ana', host_away: true, acting_host: 'me' }), as({ created_by: 'ana' }), 'Ana').note, 'Ana is back and hosting again.');
    assert.equal(hostChangeNote(as({ created_by: 'ana' }), as({ created_by: 'sam' }), 'Sam').note, 'Sam is the host now.');
});

test('be right back, in each state', async () => {
    const { awayCopy, welcomeBack } = await load();
    assert.deepEqual([awayCopy(false, true).button, awayCopy(false, false).button, awayCopy(true, true).button], ['Be right back', 'Back next block', 'I’m back']);
    assert.deepEqual([awayCopy(true, true).status, awayCopy(true, false).status], ['Stepped away', 'Back for the next block']);
    assert.equal(welcomeBack(null), null);
    assert.equal(welcomeBack({ mode: 'focus', isRunning: true, timeLeft: 601 }), 'Welcome back. 11 min left in this block.');
    assert.equal(welcomeBack({ mode: 'shortBreak', isRunning: true, timeLeft: 100 }), 'Welcome back. The room is on a break.');
    assert.equal(welcomeBack({ mode: 'focus', isRunning: false, timeLeft: 1500 }), 'Welcome back.');
});
