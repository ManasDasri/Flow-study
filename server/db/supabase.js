// Server-side Supabase client initialization
// Requires @supabase/supabase-js package

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // For backend operations

let supabase = null;

if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase initialized');
} else {
    console.log('⚠️ Supabase credentials missing. Database operations disabled.');
}

module.exports = supabase;
