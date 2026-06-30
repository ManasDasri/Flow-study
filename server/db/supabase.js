// Server-side Supabase client initialization
// Requires @supabase/supabase-js package

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://mrjtkxwenqswbjplmzko.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_KbaspJKanVVEPMzUxMSmXw_nQyzfNyf';

let supabase = null;

if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase initialized');
} else {
    console.log('⚠️ Supabase credentials missing. Database operations disabled.');
}

module.exports = supabase;
