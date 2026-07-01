const supabaseUrl = 'https://mrjtkxwenqswbjplmzko.supabase.co';
const supabaseKey = 'sb_publishable_KbaspJKanVVEPMzUxMSmXw_nQyzfNyf';

let supabase = null;
if (window.supabase) {
    supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
}

export default supabase;
