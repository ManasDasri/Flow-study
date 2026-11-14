const { test } = require('node:test');
const assert = require('node:assert/strict');
const { decide } = require('../.github/scripts/take.cjs');
const { review, linkedIssue } = require('../.github/scripts/pr-review.cjs');
const { addedLines, problems } = require('./pr-style.cjs');

const issue = (assignees = [], extra = {}) => ({ number: 7, state: 'open', assignees: assignees.map(login => ({ login })), ...extra });
const plan = 'I would move the timer state into its own module, keep the broadcast in socket.ts, and add a browser test that reloads mid-block and checks the time.';

test('/take assigns only after an approach, and only one person at a time', () => {
    const take = (comments, extra = {}) => decide({ command: 'take', commenter: 'ana', maintainer: false, issue: issue(), comments, ...extra });
    assert.match(take([]).reply, /describe your approach/, 'No plan yet: asked for one');
    assert.equal(take([]).assign, undefined);
    assert.match(take([{ user: 'ana', body: 'me please!' }]).reply, /describe your approach/, 'A one-liner is not a plan');
    assert.match(take([{ user: 'sam', body: plan }]).reply, /describe your approach/, 'Someone else\'s plan does not count');
    assert.match(take([{ user: 'ana', body: '/take ' + plan }]).reply, /describe your approach/, 'A plan must come first, in its own comment');
    assert.equal(take([{ user: 'ana', body: plan }]).assign, 'ana', 'A plan first, then /take: assigned');
    assert.equal(take([], { maintainer: true }).assign, 'ana', 'Maintainers need no plan');
    assert.match(take([{ user: 'ana', body: plan }], { issue: issue(['sam']) }).reply, /already being worked on by @sam/, 'One person at a time');
    assert.match(take([{ user: 'ana', body: plan }], { issue: issue(['ana']) }).reply, /already have this one/);
    assert.match(take([{ user: 'ana', body: plan }], { issue: issue([], { state: 'closed' }) }).reply, /closed/);
    assert.equal(take([{ user: 'ana', body: plan }], { issue: issue([], { pull_request: {} }) }).reply, null, 'Pull requests are ignored');
});

test('/drop gives the issue back', () => {
    assert.equal(decide({ command: 'drop', commenter: 'ana', maintainer: false, issue: issue(['ana']), comments: [] }).unassign, 'ana');
    assert.match(decide({ command: 'drop', commenter: 'ana', maintainer: false, issue: issue(['sam']), comments: [] }).reply, /aren't assigned/);
});

test('the pull request check wants a linked issue assigned to its author', () => {
    const body = (n = 7) => `## What changed and why\n\nFixes the reload bug.\n\nCloses #${n}\n\n## Checks\n\n- [x] npm test passes\n- [x] browser tests pass`;
    const pr = b => ({ body: b });
    assert.equal(linkedIssue('This fixes #12'), 12);
    assert.equal(linkedIssue('related to #12'), null);
    const ok = review({ pr: pr(body()), author: 'ana', maintainer: false, issue: issue(['ana']), additions: 40, deletions: 3 });
    assert.equal(ok.failed, false);
    assert.match(ok.comment, /✅ Links issue #7/);
    assert(review({ pr: pr(body()), author: 'ana', maintainer: false, issue: issue(['sam']), additions: 1, deletions: 0 }).failed, 'Someone else\'s issue fails');
    assert(review({ pr: pr('## What changed and why\n\nStuff.'), author: 'ana', maintainer: false, issue: null, additions: 1, deletions: 0 }).failed, 'No linked issue fails');
    assert(review({ pr: pr(body().replace('Fixes the reload bug.', '<!-- One or two sentences. -->')), author: 'ana', maintainer: false, issue: issue(['ana']), additions: 1, deletions: 0 }).failed, 'An empty description fails');
    assert.equal(review({ pr: pr('## What changed and why\n\nA tidy-up.'), author: 'owner', maintainer: true, issue: null, additions: 1, deletions: 0 }).failed, false, 'Maintainers need no issue');
    assert.match(review({ pr: pr(body()), author: 'ana', maintainer: false, issue: issue(['ana']), additions: 900, deletions: 10 }).comment, /⚠️ Size/, 'A large change is flagged, not failed');
    assert.match(review({ pr: pr(body()), author: 'ana', maintainer: false, issue: issue(['ana']), additions: 1, deletions: 0, reviewer: 'ManasDasri' }).comment, /✅ Review requested from @ManasDasri/, 'The comment says who will review');
});

test('style looks only at added lines, and only for real problems', () => {
    const diff = ['diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1,0 +10,4 @@',
        '+const ok = 1;', '+console.log(ok);   ', '+\tdebugger;', '+console.warn(ok);',
        '+++ b/README.md', '@@ -1,0 +1,1 @@', '+A line break  ',
        '+++ b/scripts/tool.cjs', '@@ -1,0 +1,2 @@', '+console.log(\'scripts may print\');', '+const marker = /<<<<<<< text/;',
        '+++ b/src/b.ts', '@@ -1,0 +1,1 @@', '+<<<<<<< HEAD'].join('\n');
    const lines = addedLines(diff);
    assert.deepEqual(lines.slice(0, 2).map(l => [l.file, l.line]), [['src/a.ts', 10], ['src/a.ts', 11]]);
    const found = problems(lines).map(p => `${p.line}:${p.message.split(' ')[0]}`);
    assert.deepEqual(found, ['11:Trailing', '11:Leftover', '12:Indent', '12:Leftover', '1:Unresolved'], 'console.warn, Markdown line breaks, scripts printing, and a regex about markers are fine');
});
