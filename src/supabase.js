import { createClient } from '@supabase/supabase-js';

// Supabase configuration
// These should be set via environment variables for security
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://jzplbnzmsfbsmeaobamg.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6cGxibnptc2Zic21lYW9iYW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgyODM5OTMsImV4cCI6MjA3Mzg1OTk5M30.ykL2TdmOdSmrcxbrGMnhd_WymSXlK776n5sn9yXRSOw';

// Validate configuration
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase configuration is missing!');
  console.error('Please add to your .env file:');
  console.error('REACT_APP_SUPABASE_URL=your_url');
  console.error('REACT_APP_SUPABASE_ANON_KEY=your_key');
} else {
  console.log('✅ Supabase configured:', supabaseUrl ? 'URL set' : 'URL missing', supabaseAnonKey ? 'Key set' : 'Key missing');
}

// Create Supabase client
export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

