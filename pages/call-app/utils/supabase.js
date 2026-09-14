// pages/call-app/utils/supabase.js - NEW MUMBAI PROJECT
import { createClient } from './supabase-local.js'

// ✅ Direct connection to new Mumbai project
const SUPABASE_URL = 'https://kponqaktavkrchebmiwr.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtwb25xYWt0YXZrcmNoZWJtaXdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyOTUzMTMsImV4cCI6MjEwNDg3MTMxM30.nkoiFez4G3-CzKvatQ9xZL4FpnZa9Qixcr64Sh8ytDE'

let supabaseInstance = null

export async function initializeSupabase() {
    if (supabaseInstance) return supabaseInstance

    console.log('🔄 Initializing CallApp Supabase (new Mumbai project)...')

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
            console.log('✅ CallApp Supabase connected (new Mumbai project)')
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