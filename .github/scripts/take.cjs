// The rules for /take and /drop on issues, kept apart from GitHub so they can be tested
// (scripts/automation.test.cjs). An issue goes to someone who has first said, in a
// comment of its own, how they would approach it: the owner can then pick between
// plans instead of between the fastest typists.
const MIN_APPROACH_WORDS = 20;
const words = text => (text.trim().match(/\S+/g) || []).length;
const isCommand = text => /^\s*\/(take|drop)\b/i.test(text);

// comments: earlier comments on the issue ({ user, body }), oldest first, without the command itself.
function decide({ command, commenter, maintainer, issue, comments }) {
    if (issue.pull_request) return { reply: null };
    if (issue.state !== 'open') return { reply: 'This issue is closed, so there is nothing to take.' };
    const holders = issue.assignees.map(a => a.login);
    if (command === 'drop') {
        if (!holders.includes(commenter)) return { reply: `You aren't assigned to this issue, @${commenter}.` };
        return { unassign: commenter, reply: `Unassigned. Thanks for letting us know, @${commenter}; the issue is open for someone else.` };
    }
    if (holders.includes(commenter)) return { reply: `You already have this one, @${commenter}.` };
    if (holders.length) return { reply: `This issue is already being worked on by @${holders.join(', @')}. If it goes quiet for a while, ask in a comment.` };
    const plan = comments.find(c => c.user === commenter && !isCommand(c.body) && words(c.body) >= MIN_APPROACH_WORDS);
    if (!plan && !maintainer) {
        return { reply: `Before taking an issue, please describe your approach in a comment here: what you'd change, where, and how you'd test it (a few sentences, at least ${MIN_APPROACH_WORDS} words). Then comment \`/take\` again. This keeps issues with the clearest plan, not just the first reply.` };
    }
    return { assign: commenter, reply: `Assigned to you, @${commenter}. Link this issue in your pull request with \`Closes #${issue.number}\`. If you can't finish it, comment \`/drop\` so someone else can pick it up.` };
}

module.exports = { decide, isCommand, words, MIN_APPROACH_WORDS };
