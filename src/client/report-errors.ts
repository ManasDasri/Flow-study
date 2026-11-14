// Tells Flow about errors in visitors' browsers, so breakage is seen before anyone has to
// email about it. Reports go to Flow's own /api/errors, which writes them to the server
// logs (Vercel → Logs); nothing goes to a third party. A few per page at most, each once.
import { describeError, type ErrorReport } from './modules/error-report';

if (!import.meta.env.DEV) {
    const sent = new Set<string>();
    const send = (report: ErrorReport | null) => {
        if (!report || sent.size >= 5) return;
        const key = report.message + report.source + report.line;
        if (sent.has(key)) return;
        sent.add(key);
        const body = new Blob([JSON.stringify(report)], { type: 'application/json' });
        // A beacon still goes out while the page closes; fetch is the fallback.
        if (!navigator.sendBeacon?.('/api/errors', body)) fetch('/api/errors', { method: 'POST', body, keepalive: true }).catch(() => {});
    };
    addEventListener('error', event => send(describeError({
        kind: 'error', message: event.message, source: event.filename, line: event.lineno, column: event.colno, stack: (event.error as Error | undefined)?.stack
    }, location)));
    addEventListener('unhandledrejection', event => {
        const reason = event.reason as { message?: unknown; stack?: unknown } | undefined;
        send(describeError({ kind: 'rejection', message: reason?.message ?? reason, stack: reason?.stack }, location));
    });
}
