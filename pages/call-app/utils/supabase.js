// pages/call-app/utils/supabase.js - FIXED TO USE WORKER
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0'

// ✅ USE WORKER URL - NOT DIRECT MUMBAI!
const SUPABASE_URL = 'https://relaytalk-proxy.lusterchat.workers.dev'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlyYmt3ZnBrc2Z2YmVzcmp4d3NlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNTQ3NTYsImV4cCI6MjA4NjYzMDc1Nn0.a2hWJyMENdxjXPImM13Eq31lbszsr-kyIG08X4JlgWU'

let supabaseInstance = null

export async function initializeSupabase() {
    if (supabaseInstance) return supabaseInstance
    
    console.log('🔄 Initializing CallApp Supabase with WORKER...')
    
    try {
        supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
            }
        })
        
        // Test connection
        const { error } = await supabaseInstance
            .from('profiles')
            .select('count', { count: 'exact', head: true })
        
        if (error) {
            console.warn('⚠️ Supabase connection warning:', error)
        } else {
            console.log('✅ CallApp Supabase connected via WORKER')
        }
        
        return supabaseInstance
    } catch (error) {
        console.error('❌ Failed to initialize CallApp Supabase:', error)
        throw error
    }
}

export function getSupabase() {
    return supabaseInstance
}
