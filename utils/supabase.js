// File: utils/supabase.js
// Supabase connection for Luster Chat App

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// 🔑 Your Supabase credentials
const supabaseUrl = 'https://blxtldgnssvasuinpyit.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJseHRsZGduc3N2YXN1aW5weWl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwODIxODIsImV4cCI6MjA4MjY1ODE4Mn0.Dv04IOAY76o2ccu5dzwK3fJjzo93BIoK6C2H3uWrlMw'

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ================================================
// 🔥 EXPORTS SECTION - MULTIPLE OPTIONS
// ================================================

// Option 1: Named export (for pages using: import { supabase } from './supabase.js')
export { supabase };

// Option 2: Default export (for pages using: import supabase from './supabase.js')
export default supabase;

// Option 3: Global exposure (for pages using regular <script> tags)
if (typeof window !== 'undefined') {
    window.supabase = supabase;
    console.log('✅ Supabase exposed globally as window.supabase');
}