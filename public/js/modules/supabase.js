const supabaseUrl = 'https://mrjtkxwenqswbjplmzko.supabase.co';
const supabaseKey = 'sb_publishable_KbaspJKanVVEPMzUxMSmXw_nQyzfNyf';

let supabase = null;
if (window.supabase) {
    supabase = window.supabase.createClient(supabaseUrl, supabaseKey, {
        global: {
            fetch: (input, options = {}) => {
                const signal = options.signal ?? (input instanceof Request ? input.signal : null);
                const timeout = AbortSignal.timeout(15000);
                return fetch(input, { ...options, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
            }
        }
    });
}

export default supabase;
