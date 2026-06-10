import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase configuration is incomplete. ' +
    'Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY in your .env file.'
  );
}

if (supabaseUrl.includes('YOUR_PROJECT_REF') || supabaseAnonKey === 'your_supabase_anon_key_here') {
  throw new Error('Supabase credentials are still placeholders. Copy .env.example to .env and set real values.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
