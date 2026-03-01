import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://cnqasinqnjwrlfrquvbo.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucWFzaW5xbmp3cmxmcnF1dmJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTYxMDAsImV4cCI6MjA4NzE3MjEwMH0.HRou0WQWieOtHXTX_BQlEUcpQR055X-R8un3iMXrNaw';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default supabase;
