// Turns a browser error into a small report that is safe to send: the message, where in
// Flow's own code it happened, and which page, with query strings, fragments, and other
// sites' addresses removed, so no room code, token, or personal detail goes along.
// Pure, so it is unit-tested (scripts/utils.test.cjs); report-errors.ts sends it.
export interface ErrorReport { message: string; source: string; line: number; column: number; stack: string; page: string; kind: 'error' | 'rejection'; }

// Not Flow's bugs: browser extensions, cross-origin scripts we can't see into, and a known harmless warning.
const NOISE = /chrome-extension:|moz-extension:|safari(-web)?-extension:|^Script error\.?$|ResizeObserver loop/i;

// Keeps only the path of addresses on this site; anything from elsewhere becomes its host alone.
function scrubUrls(text: string, origin: string) {
    return text.replace(/\b(?:https?|blob):\/\/[^\s)]+/g, url => {
        try {
            const parsed = new URL(url.replace(/^blob:/, ''));
            return parsed.origin === origin ? parsed.pathname + (url.match(/(:\d+){1,2}$/)?.[0] ?? '') : parsed.host;
        } catch { return '[url]'; }
    });
}

export function describeError(input: { message?: unknown; source?: unknown; line?: unknown; column?: unknown; stack?: unknown; kind: 'error' | 'rejection' },
    location: { origin: string; pathname: string }): ErrorReport | null {
    const message = scrubUrls(String(input.message ?? 'Unknown error'), location.origin).slice(0, 300);
    const stack = scrubUrls(typeof input.stack === 'string' ? input.stack : '', location.origin).slice(0, 2000);
    if (NOISE.test(message) || NOISE.test(String(input.source ?? '')) || NOISE.test(stack)) return null;
    const number = (value: unknown) => Number.isInteger(value) && (value as number) >= 0 ? value as number : 0;
    return {
        kind: input.kind,
        message,
        source: scrubUrls(String(input.source ?? ''), location.origin).slice(0, 200),
        line: number(input.line),
        column: number(input.column),
        stack,
        page: location.pathname.slice(0, 100)
    };
}
