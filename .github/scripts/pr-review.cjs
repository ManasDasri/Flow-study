// What the PR review comment checks (rules only; tested in scripts/automation.test.cjs).
// It reads the pull request and its linked issue through the API and never runs code
// from the pull request, which is what makes it safe to run with write access.
const MARKER = '<!-- flow-pr-review -->';
const LARGE = 800;

const linkedIssue = body => {
    const match = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i.exec(body || '');
    return match ? Number(match[1]) : null;
};

function review({ pr, author, maintainer, issue, additions, deletions }) {
    const body = pr.body || '';
    const checks = [];
    const add = (ok, text, required = true) => checks.push({ ok, text, required });
    const number = linkedIssue(body);
    if (maintainer) add(true, 'Maintainer pull request: an issue link is optional.', false);
    else {
        add(!!number, number ? `Links issue #${number}.` : 'Link the issue this fixes in the description, for example `Closes #12`.');
        if (number) add(!!issue && issue.assignees.some(a => a.login === author),
            issue ? (issue.assignees.some(a => a.login === author) ? `#${number} is assigned to @${author}.` : `#${number} isn't assigned to @${author}. Describe your approach on the issue and comment \`/take\` there first.`)
                : `#${number} wasn't found.`);
    }
    const summary = /## What changed and why\s*\n+(?!\s*<!--|\s*##)\S/.test(body);
    add(summary, summary ? 'Explains what changed and why.' : 'Fill in "What changed and why" in the description.');
    const boxes = (body.match(/- \[[ xX]\]/g) || []).length, ticked = (body.match(/- \[[xX]\]/g) || []).length;
    add(boxes > 0 && ticked === boxes, boxes ? `Checklist: ${ticked} of ${boxes} ticked.` : 'Keep the checklist from the pull request template.', false);
    const size = additions + deletions;
    add(size <= LARGE, size <= LARGE ? `Size: +${additions} −${deletions}.` : `Size: +${additions} −${deletions}. Large changes are slow to review; consider splitting this up.`, false);
    const failed = checks.some(c => c.required && !c.ok);
    const lines = checks.map(c => `${c.ok ? '✅' : c.required ? '❌' : '⚠️'} ${c.text}`);
    return {
        failed,
        comment: `${MARKER}\n### Pull request check\n\n${lines.join('\n')}\n\n` +
            (failed ? 'Fix the ❌ items above and this comment will update.' : 'Thanks! A maintainer will review this soon.') +
            '\n\n<sub>Code style is checked separately, in the CI run (the "Style" job).</sub>'
    };
}

module.exports = { review, linkedIssue, MARKER };
