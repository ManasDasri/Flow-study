// Rough style check for a pull request: only the lines it adds, so older code never fails it.
// Run in CI as `node scripts/pr-style.cjs origin/main`. Problems are reported as GitHub
// annotations on the exact lines.
const { execFileSync } = require('node:child_process');

const RULES = [
    [/[ \t]+$/, 'Trailing whitespace.'],
    [/^\t/, 'Indent with spaces, not tabs.'],
    [/\bconsole\.log\(/, 'Leftover console.log; use console.warn or console.error for real messages, or remove it.'],
    [/^\s*debugger\b/, 'Leftover debugger statement.'],
    [/<<<<<<<|>>>>>>>|^=======$/, 'Unresolved merge conflict marker.']
];
const CHECKED = /\.(ts|js|cjs|mjs|astro|css|sql|json|yml|md|html)$/;

// Parses `git diff -U0` into the lines a change adds.
function addedLines(diff) {
    const lines = [];
    let file = null, line = 0;
    for (const text of diff.split('\n')) {
        if (text.startsWith('+++ ')) file = text.startsWith('+++ b/') ? text.slice(6) : null;
        else if (text.startsWith('@@')) line = Number(/\+(\d+)/.exec(text)[1]);
        else if (file && text.startsWith('+')) lines.push({ file, line: line++, text: text.slice(1) });
    }
    return lines;
}

function problems(lines) {
    return lines.filter(l => CHECKED.test(l.file) && !l.file.startsWith('public/') && !l.file.endsWith('package-lock.json'))
        .flatMap(l => RULES.filter(([pattern]) => pattern.test(l.text))
            // Markdown uses two trailing spaces for a line break.
            .filter(([, message]) => !(l.file.endsWith('.md') && message.startsWith('Trailing')))
            .map(([, message]) => ({ ...l, message })));
}

if (require.main === module) {
    const base = process.argv[2] || 'origin/main';
    const diff = execFileSync('git', ['diff', '-U0', '--no-color', `${base}...HEAD`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const found = problems(addedLines(diff));
    for (const p of found) console.log(`::error file=${p.file},line=${p.line}::${p.message}`);
    console.log(found.length ? `${found.length} style problem(s) in added lines.` : 'Style: no problems in added lines.');
    process.exitCode = found.length ? 1 : 0;
}

module.exports = { addedLines, problems };
